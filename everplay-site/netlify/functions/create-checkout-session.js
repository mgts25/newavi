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

  if (!process.env.STRIPE_SECRET_KEY) {
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
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: siteUrl + '/shop/?payment=success',
      cancel_url: siteUrl + '/shop/?payment=cancelled',
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Could not start checkout' }),
    };
  }
};
