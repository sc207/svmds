/* Verify a Google Identity Services ID token (the `credential` the GIS button
   hands the browser). No client secret — the server only checks the token's
   signature, audience and issuer against GOOGLE_CLIENT_ID. (BACKEND_PLAN.md §5) */
const { OAuth2Client } = require('google-auth-library');
const config = require('../config');

let client = null;
function getClient() {
  if (!client) client = new OAuth2Client(config.googleClientId);
  return client;
}

const GOOGLE_ISS = ['accounts.google.com', 'https://accounts.google.com'];

/**
 * @param {string} credential  Google ID token (JWT) from google.accounts.id
 * @returns {Promise<{sub,email,emailVerified,name,picture}>}
 * @throws  Error('...') on any validation failure
 */
async function verifyGoogleToken(credential) {
  if (!config.googleClientId) {
    throw new Error('GOOGLE_CLIENT_ID is not configured on the server');
  }
  if (!credential || typeof credential !== 'string') {
    throw new Error('Missing Google credential');
  }

  let ticket;
  try {
    ticket = await getClient().verifyIdToken({
      idToken: credential,
      audience: config.googleClientId,
    });
  } catch (e) {
    throw new Error('Google token verification failed');
  }

  const p = ticket.getPayload() || {};
  if (!GOOGLE_ISS.includes(p.iss)) throw new Error('Unexpected token issuer');
  if (p.aud !== config.googleClientId) throw new Error('Token audience mismatch');
  if (!p.email) throw new Error('Google token carried no email');
  if (p.email_verified !== true) throw new Error('Google email is not verified');

  return {
    sub: p.sub,
    email: String(p.email).toLowerCase().trim(),
    emailVerified: true,
    name: p.name || '',
    picture: p.picture || '',
  };
}

module.exports = { verifyGoogleToken };
