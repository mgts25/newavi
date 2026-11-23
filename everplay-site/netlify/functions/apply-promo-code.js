// Live preview for the cart's promo code "Apply" button — lets a player see
// the discount (or bonus Verse) a code gives them before they commit to
// checkout. This is a convenience check only: the code is re-validated for
// real, from scratch, inside create-checkout-session.js right before any
// charge happens, so nothing here needs to be trusted at payment time.

const { validatePromo } = require('./lib/promo');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const code = payload.code;
  const items = Array.isArray(payload.items) ? payload.items : [];

  if (!code) {
    return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Enter a promo code.' }) };
  }
  if (items.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ valid: false, error: 'Your cart is empty.' }) };
  }

  // null usedCount = skip the max-uses check here; the real enforcement
  // point is create-checkout-session.js, which does have Firestore access.
  const result = validatePromo(code, items, null);

  if (!result.ok) {
    return { statusCode: 200, body: JSON.stringify({ valid: false, error: result.error }) };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      valid: true,
      code: result.code,
      type: result.type,
      discountCents: result.discountCents,
      bonusVerse: result.bonusVerse,
    }),
  };
};
