Production deploy checklist — Poker Club

1) Supabase
- Create a Supabase project (https://app.supabase.com).
- In the SQL editor, run:

```
create table kv_store (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);
```

- Copy the `Project URL` and the `Service Role` key (Settings → API).

2) Vercel environment variables
- In your Vercel project settings set these variables (Environment: Production):
  - `SUPABASE_URL` — your Supabase project URL
  - `SUPABASE_SERVICE_KEY` — your Supabase service role key (server-only)
  - `SUPABASE_KV_KEY` — optional. Default is `poker_app_v3`. Use to lock which key the API accepts.

3) Deploy
- Push to GitHub (already connected); Vercel will build and deploy automatically.

4) Verify
- Open the app in two different browsers/devices and create sessions/players — they should persist and sync via Supabase.

5) Optional hardening
- Add input validation on `api/store.js` for stricter schemas.
- Use Supabase Row Level Security with authenticated users if you want per-user stores.
- Add monitoring/alerts for API errors.
