import { createSession, isAuthenticated, secretsMatch } from '../_lib/auth.js';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'GET') return json({ authenticated: await isAuthenticated(request, env.SESSION_SECRET) });
  if (request.method === 'DELETE') return json({ ok: true }, 200, { 'Set-Cookie': 'poker_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST, DELETE' });
  if ((Number(request.headers.get('Content-Length')) || 0) > 1024) return json({ error: 'Request too large' }, 413);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (typeof body.user !== 'string' || typeof body.pass !== 'string' || body.user.length > 80 || body.pass.length > 256) return json({ error: 'Invalid credentials' }, 400);
  if (!env.ADMIN_USER || !env.ADMIN_PASS || !env.SESSION_SECRET) return json({ error: 'Server auth is not configured' }, 500);
  const [userOK, passOK] = await Promise.all([secretsMatch(body.user, env.ADMIN_USER), secretsMatch(body.pass, env.ADMIN_PASS)]);
  if (!userOK || !passOK) return json({ error: 'Invalid credentials' }, 401);
  const session = await createSession(env.SESSION_SECRET);
  return json({ ok: true }, 200, { 'Set-Cookie': `poker_session=${session}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200` });
}
