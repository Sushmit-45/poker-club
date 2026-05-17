import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured on server. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { global: { headers: { 'x-application-name': 'poker-club' } } });

  if (req.method === 'GET') {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'Missing key' });
    try {
      const { data, error } = await supabase.from('kv_store').select('value').eq('key', key).maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ value: data?.value ?? null });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { key, value } = req.body || {};
      if (!key) return res.status(400).json({ error: 'Missing key' });
      // Upsert into kv_store table. Requires a table with columns (key text primary key, value jsonb).
      const { error } = await supabase.from('kv_store').upsert([{ key, value }]);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end();
}
