// Fulfillment for Verse (and other cart) purchases.
//
// Stripe calls THIS endpoint directly — never the browser — the moment a
// checkout session finishes, with a payload signed using
// STRIPE_WEBHOOK_SECRET so we can trust it without re-authenticating anyone.
// From here we:
//
//   1. Credit the purchased Verse to the buyer's Firestore balance, at
//      users/{firebaseUid}.verseBalance — the same Firebase project every
//      MULTIVERSE game already signs players into, so any game can read
//      that balance straight from Firestore with that same login. This is
//      the "API that injects Verse into the games": there's no separate
//      per-game endpoint to call, the games just read this shared value.
//   2. Email the buyer an itemized receipt via Mailgun.
//
// Stripe retries a webhook delivery that doesn't return 2xx quickly, and can
// occasionally redeliver the same event even after a success — so nothing
// here touches a balance or sends an email until it has first "claimed" the
// checkout session in Firestore. A second delivery of the same event finds
// the claim already taken and stops immediately.

const Stripe = require('stripe');
const admin = require('firebase-admin');
const verseShop = require('../../src/_data/verseShop.json');
const pricing = require('../../src/_data/pricing.json');

let _app = null;
function getFirebaseApp() {
  if (_app) return _app;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set.');
  }

  // Accept either the service account JSON pasted as-is into Netlify, or a
  // base64-encoded copy of it (handy if multi-line/quote formatting gets
  // mangled when pasting a private_key field into Netlify's UI).
  let jsonText = raw.trim();
  if (!jsonText.startsWith('{')) {
    jsonText = Buffer.from(jsonText, 'base64').toString('utf8');
  }

  const serviceAccount = JSON.parse(jsonText);
  _app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  return _app;
}

// Same trusted data files used by create-checkout-session.js — resolves a
// cart item id back into what it actually is: how much Verse it's worth (if
// any) and what to show on the receipt.
function buildItemLookup() {
  const lookup = {};

  (verseShop.packages || []).forEach(function (pkg) {
    if (pkg && pkg.id) {
      lookup[pkg.id] = {
        kind: 'verse',
        label: pkg.totalVerse + ' Verse' + (pkg.bonusAmount > 0 ? ' (incl. +' + pkg.bonusAmount + ' bonus)' : ''),
        verseAmount: pkg.totalVerse,
        priceCents: pkg.priceCents,
      };
    }
  });

  (pricing.tiers || []).forEach(function (tier) {
    if (tier && tier.id) {
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

function formatDollars(cents) {
  return '$' + (cents / 100).toFixed(2);
}

async function sendReceiptEmail(toEmail, breakdown, totalCents, newVerseBalance, sessionId) {
  if (!process.env.MAILGUN_API_KEY || !process.env.MAILGUN_DOMAIN) {
    console.warn('Mailgun is not configured (MAILGUN_API_KEY / MAILGUN_DOMAIN) — skipping receipt email.');
    return;
  }
  if (!toEmail) {
    console.warn('Checkout session ' + sessionId + ' has no email on file — skipping receipt email.');
    return;
  }

  const rows = breakdown.map(function (l) {
    return l.qty + ' x ' + l.label + ' — ' + formatDollars(l.priceCents * l.qty);
  });

  const textBody =
    'Thanks for your purchase!\n\n' +
    rows.join('\n') + '\n\n' +
    'Total paid: ' + formatDollars(totalCents) + '\n' +
    (newVerseBalance !== null ? 'Your Verse balance is now: ' + newVerseBalance + '\n' : '') +
    '\nOrder reference: ' + sessionId + '\n\n' +
    '— MULTIVERSE';

  const htmlRows = breakdown.map(function (l) {
    return (
      '<tr>' +
      '<td style="padding:6px 0;border-bottom:1px solid #eee;">' + l.qty + ' &times; ' + l.label + '</td>' +
      '<td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;">' + formatDollars(l.priceCents * l.qty) + '</td>' +
      '</tr>'
    );
  });

  const htmlBody =
    '<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;color:#191c1d;">' +
    '<h2 style="margin-bottom:4px;">Thanks for your purchase!</h2>' +
    '<p style="color:#666;margin-top:0;font-size:13px;">Order reference: ' + sessionId + '</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">' +
    htmlRows.join('') +
    '<tr><td style="padding:10px 0;font-weight:bold;">Total paid</td>' +
    '<td style="padding:10px 0;font-weight:bold;text-align:right;">' + formatDollars(totalCents) + '</td></tr>' +
    '</table>' +
    (newVerseBalance !== null ? '<p style="font-size:14px;">Your Verse balance is now <strong>' + newVerseBalance + '</strong>.</p>' : '') +
    '<p style="color:#999;font-size:12px;margin-top:24px;">— MULTIVERSE</p>' +
    '</div>';

  const base = process.env.MAILGUN_BASE_URL || 'https://api.mailgun.net';
  const from = process.env.MAILGUN_FROM || ('MULTIVERSE <no-reply@' + process.env.MAILGUN_DOMAIN + '>');

  const form = new URLSearchParams();
  form.set('from', from);
  form.set('to', toEmail);
  form.set('subject', 'Your MULTIVERSE purchase receipt');
  form.set('text', textBody);
  form.set('html', htmlBody);

  const resp = await fetch(base + '/v3/' + process.env.MAILGUN_DOMAIN + '/messages', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from('api:' + process.env.MAILGUN_API_KEY).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(function () {
      return '';
    });
    console.error('Mailgun send failed:', resp.status, errText);
  }
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('Stripe webhook is missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET in this function\'s environment.');
    return { statusCode: 500, body: 'Webhook not configured' };
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = (event.headers && (event.headers['stripe-signature'] || event.headers['Stripe-Signature'])) || '';
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body;

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err && err.message);
    return { statusCode: 400, body: 'Invalid signature' };
  }

  if (stripeEvent.type !== 'checkout.session.completed') {
    // Ack anything we're not handling so Stripe stops retrying it — this
    // endpoint only needs to react to completed checkouts.
    return { statusCode: 200, body: 'ignored' };
  }

  const session = stripeEvent.data.object;
  const uid = session.metadata && session.metadata.firebaseUid;

  let cartItems = [];
  try {
    cartItems = JSON.parse((session.metadata && session.metadata.cartItems) || '[]');
  } catch (err) {
    console.error('Could not parse cartItems metadata on session', session.id, err && err.message);
  }

  if (!uid || !Array.isArray(cartItems) || cartItems.length === 0) {
    console.error('Checkout session', session.id, 'completed with no usable fulfillment metadata — nothing to credit.');
    return { statusCode: 200, body: 'no metadata, nothing to fulfill' };
  }

  let db;
  try {
    getFirebaseApp();
    db = admin.firestore();
  } catch (err) {
    console.error('Firebase Admin is not configured — cannot credit Verse:', err && err.message);
    // 500 so Stripe retries once FIREBASE_SERVICE_ACCOUNT_JSON is actually set.
    return { statusCode: 500, body: 'Firebase not configured' };
  }

  // Idempotency lock. `.create()` fails if the document already exists,
  // which is exactly the "claim this session once" behavior we want.
  const lockRef = db.collection('processedCheckouts').doc(session.id);
  try {
    await lockRef.create({
      uid: uid,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    if (err && (err.code === 6 || /ALREADY_EXISTS/i.test(err.message || ''))) {
      return { statusCode: 200, body: 'already processed' };
    }
    console.error('Could not claim checkout session lock for', session.id, ':', err && err.message);
    return { statusCode: 500, body: 'lock failed' };
  }

  const lookup = buildItemLookup();
  const breakdown = [];
  let verseCredit = 0;
  let totalCents = 0;

  cartItems.forEach(function (ci) {
    const entry = ci && ci.id ? lookup[ci.id] : undefined;
    if (!entry) return; // unknown/stale id — skip rather than fail the whole webhook
    const qty = Math.max(1, Math.min(99, parseInt(ci.qty, 10) || 1));
    breakdown.push({ label: entry.label, qty: qty, priceCents: entry.priceCents });
    totalCents += entry.priceCents * qty;
    if (entry.kind === 'verse') {
      verseCredit += entry.verseAmount * qty;
    }
  });

  let newBalance = null;
  if (verseCredit > 0) {
    const userRef = db.collection('users').doc(uid);
    await userRef.set(
      { verseBalance: admin.firestore.FieldValue.increment(verseCredit) },
      { merge: true }
    );
    await userRef.collection('purchases').doc(session.id).set({
      verseCredited: verseCredit,
      totalCents: totalCents,
      items: breakdown,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const fresh = await userRef.get();
    newBalance = (fresh.exists && fresh.data().verseBalance) || verseCredit;
  }

  const email = (session.customer_details && session.customer_details.email) || session.customer_email;
  try {
    await sendReceiptEmail(email, breakdown, totalCents, newBalance, session.id);
  } catch (err) {
    // Verse is already credited at this point — a failed email shouldn't
    // make Stripe think the whole webhook failed and retry it (which would
    // just hit the lock we already claimed and exit early anyway, but no
    // reason to report failure for something that already succeeded).
    console.error('Receipt email failed to send for session', session.id, ':', err && err.message);
  }

  return { statusCode: 200, body: 'ok' };
};
