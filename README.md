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

## Roster review

`/admin` counts what needs a person and `/admin/members/review` lists it,
grouped by what is wrong. The rules live in one place,
[src/lib/member-health.ts](src/lib/member-health.ts), as pure functions over
the roster, and they split into three kinds:

- **Problems**: the record is wrong, not thin. Dates that contradict each
  other, a tier that says never-lapses against a date that says next month,
  a member number that does not follow the club's YYnnn scheme (which is how
  leftover test rows surface), and one name under two numbers.
- **Missing information**: no email, no phone, or a join date that came from
  the member number rather than from a record. Expected, since the roster was
  imported from a two-column sheet.
- **Renewals**: expired, and expiring within 60 days.

Counts are of people, not findings: a member with three gaps is one member to
chase. Every row links to that member's edit form, because that is where all
of it is fixed.

## Bulk update from a spreadsheet

The everyday path is the admin UI, one member at a time.
`/admin/members/import` exists for the catch-up: the roster arrived as a
two-column sheet, so most members are missing the same few fields and
collecting them is spreadsheet work. Download the roster pre-filled, fill
the gaps, upload it back.

Two rules make it safe to hand to somebody who is not a developer, and
both are pinned by smoke tests:

- **A blank cell leaves that value alone**, never clears it. Filling in
  twenty addresses must not wipe the other seventy-six.
- **Nothing is written from a parse.** The upload produces a plan, the plan
  is shown field by field, and a second deliberate action applies it. Any
  error in any row rejects the whole file, because a half-applied
  spreadsheet is worse than a rejected one.

The uploaded text is what carries between the two steps, not the plan, so
there is one code path from a file to a change and the browser cannot hand
back an edited plan that skips validation. Dates read as either
`2026-12-31` or `12/31/2026`, since Excel rewrites them on save.

## Member cards

Members have no accounts and most have no email on file, so there are two
ways in and neither involves a password.

**A permanent personal link**, `/card/{member id}`, is what the club emails
out. `/admin/members/links` lists every member's link and exports the CSV to
mail merge from. The URL never changes, but the download links on the page
are minted per render and expire in 30 days: the club can send it once and
leave it in old inboxes forever while the files behind it stay short-lived
and signed. It is also why the link improves on its own. Configure Google or
Apple Wallet in Vercel and that button appears on every member's page at
once, with no second email. Anyone holding a link can open that member's
card, so it goes out individually rather than getting published.

**A self-serve lookup** at `/card` covers anyone who lost the email: member
number plus last name returns the same PDF. That pair is the only thing a
member can prove, and it is already printed on the card they carry. The form
never says which half was wrong, so it cannot be walked to enumerate the
roster.

Admins generate all three credential formats per member at
`/admin/members/{id}/pass`. Importing the club roster is covered in
[MEMBER-IMPORT.md](MEMBER-IMPORT.md).

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
src/app/card                 member card: /card lookup, /card/{id} personal link
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
src/lib/member-links.ts      per-member card URL + mail merge CSV
src/lib/member-health.ts     roster checks behind the dashboard + review
src/lib/member-import.ts     bulk update template + upload plan
src/lib/csv.ts               RFC 4180 parse and write, one definition
supabase/migrations          schema + RLS, run in order
scripts/seed.ts              admin bootstrap + sample data
scripts/import-members.ts    roster import (npm run import:members / import:sql)
scripts/smoke.ts             in-memory card pipeline test (npm run smoke)
scripts/google-wallet-class.ts  Google class create (npm run google:class)
```
