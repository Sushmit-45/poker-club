Supabase setup for global store

1) Create a table in your Supabase project (SQL editor):

```
create table kv_store (
  key text primary key,
  value jsonb,
  updated_at timestamptz default now()
);
```

2) In Vercel, set the following Environment Variables (Project Settings → Environment Variables):
- `SUPABASE_URL` → your Supabase project URL
- `SUPABASE_SERVICE_KEY` → Service Role key (use carefully; keeps server-side only)

3) Deploy to Vercel. The app will call the serverless endpoint `/api/store` to read/write JSON state.

Notes:
- The client still keeps a local copy in `localStorage` for instant UX and offline usage.
- You can remove `localStorage` fallback later if you want server-only state.
