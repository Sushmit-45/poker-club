export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ADMIN_USER = process.env.ADMIN_USER;
  const ADMIN_PASS = process.env.ADMIN_PASS;

  if (!ADMIN_USER || !ADMIN_PASS) {
    return res.status(500).json({ error: 'Admin credentials are not configured on the server.' });
  }

  const { user, pass } = req.body || {};
  if (!user || !pass) {
    return res.status(400).json({ error: 'Missing user or password.' });
  }

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    return res.status(200).json({ ok: true });
  }

  return res.status(401).json({ error: 'Invalid user or password.' });
}
