# VCDC Operations Hub

Digital ride sign-in for The Vespa Club of D.C., Inc., a 501(c)(3) nonprofit.
Replaces the paper ride waiver flow: admin manages members, members carry a
QR wallet pass, ride leaders scan riders (offline-capable), guests sign a
public waiver.

Build brief: `VCDCCLAUDECODEBRIEF.md` in this repo. Current state: Slice 1
(schema, RLS, admin auth, member CRUD).

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

## Rotating QR_SIGNING_SECRET (Slice 5+)

Not yet in use. When QR signing lands: generate a new value with
`openssl rand -hex 32`, update it in Vercel, redeploy, and re-issue member
passes (pass QR payloads embed a signature keyed by this secret, so old
passes stop validating after rotation).

## Project layout

```
src/proxy.ts                 session refresh + route gating (Next 16 middleware)
src/app/login                magic link request
src/app/auth/confirm         token-hash verifyOtp callback
src/app/(admin)/admin        admin area (role: admin)
src/lib/db                   Drizzle schema + client
src/lib/supabase             browser / server / proxy clients
src/lib/auth.ts              getUserRole + requireAdmin
src/lib/env.ts               fail-fast env validation
supabase/migrations          schema + RLS, run in order
scripts/seed.ts              admin bootstrap + sample data
```
