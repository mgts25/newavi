// Creates a Stripe Checkout Session for items in the shared cart (used by
// both the Shop and Pricing pages). Prices are NEVER trusted from the
// browser — every item is re-priced here against this site's own data
// files (verseShop.json / pricing.json), so a tampered client request can
// never change what gets charged.

const Stripe = require('stripe');
const verseShop = require('../../src/_data/verseShop.json');
const pricing = require('../../src/_data/pricing.json');

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
      line_items: lineItems,
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
