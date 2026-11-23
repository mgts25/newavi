// Promo code validation — shared by the cart's live "Apply" preview
// (apply-promo-code.js) and the real checkout (create-checkout-session.js),
// so a code that gets rejected in the cart can never somehow still go
// through at checkout, or vice versa.
//
// Codes themselves are admin-managed content (src/_data/promoCodes.json,
// editable from the CMS) — never trust anything about a code from the
// browser except which one the player typed.

const promoCodes = require('../../../src/_data/promoCodes.json');
const { buildItemLookup } = require('./shopData');

function normalizeCode(raw) {
  return (raw || '').toString().trim().toUpperCase();
}

function findPromoDefinition(code) {
  const normalized = normalizeCode(code);
  if (!normalized) return null;
  return (
    (promoCodes.codes || []).find(function (c) {
      return c && normalizeCode(c.code) === normalized;
    }) || null
  );
}

function isExpired(promo) {
  if (!promo.expiresAt) return false;
  const exp = new Date(promo.expiresAt).getTime();
  if (isNaN(exp)) return false;
  return Date.now() > exp;
}

// cartItems: [{ id, qty }]. usedCount: the code's current redemption count,
// or null/undefined to skip the max-uses check entirely (used by the cart's
// live preview, which has no Firestore access — the real enforcement point
// is create-checkout-session.js, right before a charge actually happens).
function validatePromo(code, cartItems, usedCount) {
  const promo = findPromoDefinition(code);
  if (!promo) {
    return { ok: false, error: 'That promo code was not found.' };
  }
  if (!promo.active) {
    return { ok: false, error: 'That promo code is no longer active.' };
  }
  if (isExpired(promo)) {
    return { ok: false, error: 'That promo code has expired.' };
  }
  if (promo.maxUses && usedCount !== undefined && usedCount !== null && usedCount >= promo.maxUses) {
    return { ok: false, error: 'That promo code has reached its usage limit.' };
  }

  const lookup = buildItemLookup();
  const appliesTo = promo.appliesTo || 'both';

  let eligibleCents = 0;
  (cartItems || []).forEach(function (ci) {
    const entry = ci && ci.id ? lookup[ci.id] : undefined;
    if (!entry) return;
    var matches =
      appliesTo === 'both' ||
      (appliesTo === 'verse' && entry.kind === 'verse') ||
      (appliesTo === 'tiers' && entry.kind === 'tier');
    if (!matches) return;
    var qty = Math.max(1, Math.min(99, parseInt(ci.qty, 10) || 1));
    eligibleCents += entry.priceCents * qty;
  });

  if (eligibleCents === 0) {
    return { ok: false, error: "This code doesn't apply to anything in your cart." };
  }

  var discountCents = 0;
  var bonusVerse = 0;
  var value = Number(promo.value) || 0;

  if (promo.type === 'percent_off') {
    discountCents = Math.round(eligibleCents * (Math.max(0, Math.min(100, value)) / 100));
  } else if (promo.type === 'amount_off') {
    discountCents = Math.max(0, Math.min(eligibleCents, Math.round(value)));
  } else if (promo.type === 'bonus_verse') {
    bonusVerse = Math.max(0, Math.round(value));
  }

  return {
    ok: true,
    promo: promo,
    code: normalizeCode(promo.code),
    type: promo.type,
    discountCents: discountCents,
    bonusVerse: bonusVerse,
  };
}

module.exports = { normalizeCode, findPromoDefinition, isExpired, validatePromo };
