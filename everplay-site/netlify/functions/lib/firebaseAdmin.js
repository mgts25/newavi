// Shared lazy Firebase Admin init — used by anything server-side that needs
// to read/write Firestore (the checkout promo-usage check, and the Stripe
// webhook's fulfillment). Cached at module scope so a warm Netlify function
// instance doesn't re-parse the service account / re-init the app on every
// invocation.

const admin = require('firebase-admin');

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

module.exports = { admin, getFirebaseApp };
