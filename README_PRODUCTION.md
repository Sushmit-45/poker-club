# Production deployment — Poker Club

The app uses Cloudflare Pages Functions and D1, so the database remains available without the activity requirement of an auto-pausing free database. No database key is ever shipped to the browser.

1. Create a Cloudflare account, then create the database from this repository:

   ```powershell
   npx wrangler login
   npx wrangler d1 create poker-club
   ```

2. Put the database ID printed by the second command into `wrangler.jsonc` in place of `REPLACE_WITH_D1_DATABASE_ID`, then initialise it:

   ```powershell
   npx wrangler d1 migrations apply poker-club --remote
   ```

3. Set Pages secrets. Use a long, unique random value for `SESSION_SECRET` (at least 32 characters) and a password-manager-generated `ADMIN_PASS`:

   ```powershell
   npx wrangler pages secret put ADMIN_USER
   npx wrangler pages secret put ADMIN_PASS
   npx wrangler pages secret put SESSION_SECRET
   ```

4. In Cloudflare Pages, connect this GitHub repository. Build command: `npm run build`; output directory: `dist`. The `functions/` folder is detected automatically. Alternatively run `npm run cf:deploy` after `npm run build`.

5. Open the site, log in, and create a test player/session. The API uses a signed, `HttpOnly`, `Secure`, `SameSite=Strict` session cookie. Store writes require that cookie and a same-origin request; each write includes a revision, so another device cannot silently overwrite newer data.

Do not put secrets in `wrangler.jsonc`, Git, or frontend environment variables. The old Supabase/Vercel API has been removed.
