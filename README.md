# VCDC Operations Hub

Digital ride sign-in for The Vespa Club of D.C., Inc., a 501(c)(3) nonprofit.
Replaces the paper ride waiver flow: admin manages members, members carry a
QR wallet pass, ride leaders scan riders (offline-capable), guests sign a
public waiver.

Build brief: `VCDCCLAUDECODEBRIEF.md` in this repo. Current state: Slice 1
(schema, RLS, admin auth, member CRUD) accepted. Slice 2 (Apple Wallet) is
built and parked on Apple Developer credentials. Slice 3 (Google Wallet) is
built and needs a Google issuer ID, which is free. A printable PDF card was
added alongside them: it needs no vendor account at all, so it is the card
the club can send today, and it covers iPhone members while Apple is
pending. All three carry the same signed member QR, so one scan resolves to
one member whichever the rider shows. The setup click-path for each is
`WALLET-SETUP.md`.

## Stack

Next.js 16 (App Router, strict TypeScript), Supabase (Postgres, Auth,
Storage), Drizzle ORM, Tailwind 4, Vercel, Resend (later slice).

Note: this project uses Next.js 16 conventions. Middleware lives in
`src/proxy.ts` (not `middleware.ts`), `cookies()` is async, and dynamic
route `params` are Promises.

## Local setup

1. `npm install`
2. `cp .env.example .env.local` and fill in the Slice 1 variables.
3. Create a fresh Supabase project (do not reuse another project).
4. In the Supabase SQL editor, run the files in `supabase/migrations/` in
   order: `0001_schema.sql`, then `0002_rls.sql`.
5. Auth URL configuration. Set Authentication -> URL Configuration ->
   Site URL to your app URL (http://localhost:3000 in dev), and add
   `<app URL>/auth/callback` to the redirect allow-list.

   Email templates: Supabase's built-in email service no longer allows
   template editing without custom SMTP, so out of the box the DEFAULT
   Magic Link template is used and handled by `/auth/callback` (PKCE code
   exchange). Caveat: the link must be opened in the same browser that
   requested it. When custom SMTP is configured (Slice 7, Resend), switch
   the Magic Link template to the token-hash route, which works from any
   browser or device:

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/admin
   ```
6. Bootstrap the admin: `npm run seed` creates (or promotes) the auth user
   for `ADMIN_EMAIL` with the admin role, plus sample members, ride leaders,
   and two historical rides. To promote a user manually instead:

   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
   where email = 'you@example.com';
   ```

7. `npm run dev`, open http://localhost:3000, request a magic link.

## Checks

CI runs these on every pull request and push to main; run them locally
before pushing:

- `npm run lint`
- `npm run typecheck`
- `npm run smoke` (Apple signing, Google save JWT, and PDF card all built
  in memory with throwaway keys, no env or network needed)
- `npm run build`

Environment variables are validated where they are used: server modules
that need a variable throw a clear error naming it (or degrade with an
explanatory notice, like the wallet routes before Apple credentials
exist). The seed script refuses to add sample data to a non-empty members
table unless run with `--force`.

## Roles and security

- Roles live in `auth.users.raw_app_meta_data` (`admin` or `ride_leader`),
  which lands in the JWT and cannot be edited by the user. Never use
  `user_metadata` for authorization.
- RLS is enabled on every table (`0002_rls.sql`). The browser only ever
  holds the anon key.
- Server actions use Drizzle over `DATABASE_URL`, which bypasses RLS, so
  every action calls `requireAdmin()` first.
- Members never log in; their identity is a QR wallet pass (Slice 2+).

## Deploy (Vercel)

1. Import the repo into Vercel.
2. Set every variable from `.env.example` that Slice 1 requires.
3. Set the Supabase Site URL to the production URL, and add it to the
   Auth redirect allow-list.

## Rotating QR_SIGNING_SECRET

In use since Slice 2. It signs the QR payload on every membership card
(Apple, Google, and PDF alike) and the expiring download links. To rotate: generate a new value with
`openssl rand -hex 32`, update it in Vercel, redeploy, and re-issue member
passes (pass QR payloads embed a signature keyed by this secret, so old
passes stop validating after rotation, and outstanding download links die
immediately).

## Project layout

```
src/proxy.ts                 session refresh + route gating (Next 16 middleware)
src/app/login                magic link request (+ admin password fallback)
src/app/auth/confirm         token-hash verifyOtp callback
src/app/(admin)/admin        admin area (role: admin)
src/app/api/wallet/apple     token-guarded .pkpass download
src/app/api/wallet/google    token-guarded Save to Google Wallet redirect
src/app/api/wallet/pdf       token-guarded printable card download
src/lib/db                   Drizzle schema + client
src/lib/supabase             browser / server / proxy clients
src/lib/auth.ts              getUserRole + requireAdmin
src/lib/qr                   member QR payload build + verify
src/lib/wallet               Apple pass, Google pass, download tokens, icons
src/lib/pdf                  printable membership card
src/lib/display.ts           shared labels, date formatting, app origin
supabase/migrations          schema + RLS, run in order
scripts/seed.ts              admin bootstrap + sample data
scripts/smoke.ts             in-memory card pipeline test (npm run smoke)
scripts/google-wallet-class.ts  Google class create (npm run google:class)
```
