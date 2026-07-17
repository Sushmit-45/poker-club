const encoder = new TextEncoder();

function bytesToBase64Url(bytes) {
  let text = '';
  bytes.forEach(byte => { text += String.fromCharCode(byte); });
  return btoa(text).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function base64UrlToBytes(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '==='.slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a[i] ^ b[i];
  return result === 0;
}

export async function secretsMatch(a, b) {
  const [aHash, bHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);
  return equal(new Uint8Array(aHash), new Uint8Array(bHash));
}

export async function createSession(secret) {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify({ exp: Date.now() + 1000 * 60 * 60 * 12 })));
  return `${payload}.${bytesToBase64Url(await hmac(payload, secret))}`;
}

export async function isAuthenticated(request, secret) {
  if (!secret) return false;
  const cookie = request.headers.get('Cookie') || '';
  const token = cookie.split(';').map(x => x.trim()).find(x => x.startsWith('poker_session='))?.slice(14);
  if (!token || !token.includes('.')) return false;
  const [payload, signature] = token.split('.');
  if (!equal(await hmac(payload, secret), base64UrlToBytes(signature))) return false;
  try { return JSON.parse(new TextDecoder().decode(base64UrlToBytes(payload))).exp > Date.now(); } catch { return false; }
}

export function isSameOrigin(request) {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}
