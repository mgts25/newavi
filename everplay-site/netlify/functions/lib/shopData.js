// Shared "what is this cart item id actually worth" lookup, used by
// create-checkout-session.js, the stripe webhook, and the promo code
// validator — so all three always agree on prices/labels straight from the
// site's own content files, never from anything the browser sends.

const verseShop = require('../../../src/_data/verseShop.json');
const pricing = require('../../../src/_data/pricing.json');

function buildItemLookup() {
  const lookup = {};

  (verseShop.packages || []).forEach(function (pkg) {
    if (pkg && pkg.id && pkg.priceCents) {
      lookup[pkg.id] = {
        kind: 'verse',
        label: pkg.totalVerse + ' Verse' + (pkg.bonusAmount > 0 ? ' (incl. +' + pkg.bonusAmount + ' bonus)' : ''),
        verseAmount: pkg.totalVerse,
        priceCents: pkg.priceCents,
      };
    }
  });

  (pricing.tiers || []).forEach(function (tier) {
    if (tier && tier.id && tier.priceCents) {
      lookup[tier.id] = {
        kind: 'tier',
        label: tier.name,
        verseAmount: 0,
        priceCents: tier.priceCents,
      };
    }
  });

  return lookup;
}

module.exports = { buildItemLookup };
