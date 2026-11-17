// Creates a Stripe Checkout Session for items in the shared cart (used by
// both the Shop and Pricing pages). Prices are NEVER trusted from the
// browser — every item is re-priced here against this site's own data
// files (verseShop.json / pricing.json), so a tampered client request can
// never change what gets charged.

const Stripe = require('stripe');
const verseShop = require('../../src/_data/verseShop.json');
const pricing = require('../../src/_data/pricing.json');

// ----- Require a real, signed-in account before anyone can start checkout -----
// This is a server-side check, not just a UI nicety — anyone could otherwise
// call this endpoint directly (skipping the site entirely) and start a real
// Stripe charge with no account at all. We verify the Firebase ID token the
// browser sends ourselves, against Firebase's own public signing keys, so no
// extra secret or Firebase Admin credential needs to live in Netlify at all.
//
// `jose` v6 ships as an ES Module only (no CommonJS build), so it can't be
// loaded with a plain `require('jose')` — Netlify's function runtime throws
// `ERR_REQUIRE_ESM` the moment this file is loaded, which took down every
// checkout attempt, signed in or not. Loading it with a dynamic `import()`
// instead works fine from a CommonJS file like this one, so we fetch it
// once (cached in this module-level promise) the first time it's needed.
let _josePromise = null;
function getJose() {
  if (!_josePromise) {
    _josePromise = import('jose');
  }
  return _josePromise;
}

const FIREBASE_PROJECT_ID = 'multiverse-games-b275f';
let _firebaseJwksPromise = null;
function getFirebaseJwks() {
  if (!_firebaseJwksPromise) {
    _firebaseJwksPromise = getJose().then(({ createRemoteJWKSet }) =>
      createRemoteJWKSet(
        new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
      )
    );
  }
  return _firebaseJwksPromise;
}

async function requireSignedInUser(event) {
  const authHeader = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const match = /^Bearer (.+)$/.exec(authHeader);
  if (!match) {
    return { error: 'Please sign in to complete your purchase.' };
  }

  try {
    const { jwtVerify } = await getJose();
    const jwks = await getFirebaseJwks();
    const { payload } = await jwtVerify(match[1], jwks, {
      issuer: 'https://securetoken.google.com/' + FIREBASE_PROJECT_ID,
      audience: FIREBASE_PROJECT_ID,
    });
    if (!payload || !payload.sub) {
      return { error: 'Please sign in to complete your purchase.' };
    }
    return { user: payload };
  } catch (err) {
    console.error('Checkout blocked — invalid or expired sign-in token:', err && err.message);
    return { error: 'Your session has expired — please sign in again.' };
  }
}

// Build a lookup of "known cart item name" -> "real price in cents",
// straight from the site's own content files.
function buildValidItems() {
  const valid = {};

  (verseShop.packages || []).forEach(function (pkg) {
    if (pkg && pkg.priceCents) {
      valid[pkg.totalVerse + ' Verse'] = pkg.priceCents;
    }
  });

  (pricing.tiers || []).forEach(function (tier) {
    if (tier && tier.priceCents) {
      valid[tier.name] = tier.priceCents;
    }
  });

  return valid;
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Log (never the real value) whether the key is visible to this function at
  // all, and a harmless prefix/length so a bad paste is easy to spot — this
  // is the fast 500 that happens before ever calling Stripe, and it had no
  // logging at all before, which is why earlier failures showed "No log".
  var keyPresent = !!process.env.STRIPE_SECRET_KEY;
  var keyPrefix = keyPresent ? process.env.STRIPE_SECRET_KEY.slice(0, 7) : null;
  var keyLength = keyPresent ? process.env.STRIPE_SECRET_KEY.length : 0;
  console.log('STRIPE_SECRET_KEY check — present:', keyPresent, 'prefix:', keyPrefix, 'length:', keyLength);

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY is missing from this function\'s environment.');
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Payments are not configured yet. Set STRIPE_SECRET_KEY in Netlify environment variables.' }),
    };
  }

  const authResult = await requireSignedInUser(event);
  if (authResult.error) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: authResult.error }),
    };
  }
  const signedInUser = authResult.user;

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request body' }),
    };
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Cart is empty' }),
    };
  }

  const validItems = buildValidItems();
  const lineItems = [];

  for (const item of items) {
    const name = item && item.name;
    const realPriceCents = name ? validItems[name] : undefined;

    if (!realPriceCents) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Unknown or unavailable item: ' + name }),
      };
    }

    const qty = Math.max(1, Math.min(99, parseInt(item.qty, 10) || 1));

    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: { name: name },
        unit_amount: realPriceCents,
      },
      quantity: qty,
    });
  }

  const siteUrl = process.env.URL || 'https://multiversegames.net';
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // `payment_method_types` was retired by Stripe — which payment
      // methods are offered (card, etc.) is now controlled from the
      // Stripe Dashboard under Settings > Payment methods instead of here.
      //
      // Managed Payments (Stripe acting as merchant of record, handling tax
      // collection across jurisdictions) is on by default on this account,
      // which requires a tax code on every product. We don't want that for
      // simple digital-goods checkout, so it's switched off per-session.
      managed_payments: { enabled: false },
      line_items: lineItems,
      // Pre-fill with the signed-in account's verified email, now that we
      // know who's actually checking out.
      customer_email: signedInUser.email || undefined,
      success_url: siteUrl + '/shop/?payment=success',
      cancel_url: siteUrl + '/shop/?payment=cancelled',
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    // Always log the real reason to the function's own logs so it shows up
    // in Netlify's Observability/Functions view — without this, a failure
    // here is completely silent and impossible to diagnose from the logs.
    console.error('Stripe checkout session creation failed:', err && err.message, err && err.type, err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: (err && err.message) || 'Could not start checkout' }),
    };
  }
};
