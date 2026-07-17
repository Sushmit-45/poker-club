import { isAuthenticated, isSameOrigin } from '../_lib/auth.js';

const emptyStore = { sessions: [], leaderboard: [], dealerHands: [], currentSession: null, players: [] };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function isValidStore(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = ['sessions', 'leaderboard', 'dealerHands', 'players'];
  if (!keys.every(key => Array.isArray(value[key]))) return false;
  return JSON.stringify(value).length <= 2_000_000 && value.sessions.length <= 500 && value.players.length <= 200;
}

export async function onRequest(context) {
  const { request, env } = context;
  if (!env.DB) return json({ error: 'D1 database is not configured' }, 500);
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT value, revision FROM app_state WHERE id = 1').first();
    return json({ value: row ? JSON.parse(row.value) : emptyStore, revision: row?.revision || 0 });
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!isSameOrigin(request) || !(await isAuthenticated(request, env.SESSION_SECRET))) return json({ error: 'Unauthorized' }, 401);
  if ((Number(request.headers.get('Content-Length')) || 0) > 2_100_000) return json({ error: 'Request too large' }, 413);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!Number.isInteger(body.revision) || !isValidStore(body.value)) return json({ error: 'Invalid store payload' }, 400);
  const existing = await env.DB.prepare('SELECT revision FROM app_state WHERE id = 1').first();
  const revision = existing?.revision || 0;
  if (body.revision !== revision) return json({ error: 'This data changed on another device. Reload and try again.', revision }, 409);
  const nextRevision = revision + 1;
  await env.DB.prepare('INSERT INTO app_state (id, value, revision, updated_at) VALUES (1, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET value = excluded.value, revision = excluded.revision, updated_at = CURRENT_TIMESTAMP').bind(JSON.stringify(body.value), nextRevision).run();
  return json({ ok: true, revision: nextRevision });
}
