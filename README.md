# VCDC Operations Hub

Digital ride sign-in for The Vespa Club of D.C., Inc., a 501(c)(3) nonprofit.
Replaces the paper ride waiver flow: admin manages members, members carry a
QR wallet pass, ride leaders scan riders (offline-capable), guests sign a
public waiver.

Build brief: `VCDCCLAUDECODEBRIEF.md` in this repo.

Current state:

- **Slice 1** (schema, RLS, admin auth, member CRUD) accepted.
- **Slice 2, Apple Wallet.** Built. Apple Developer enrollment submitted
  2026-08-22 (enrollment ID `S4N43N9YPA`), waiting on approval, then the
  certificate steps in `WALLET-SETUP.md`. The route reports its missing
  variables rather than failing, and the button stays hidden until all five
  are set.
- **Slice 3, Google Wallet.** Built, and configured in production since
  2026-08-22. The save link is generated and signed; a real save on a real
  Android phone has not been confirmed yet.
- **Printable PDF card**, added alongside them. Needs no vendor account, so
  it is what every member can be sent today and what covers iPhone until
  Apple is sorted.
- **Roster**: 95 members imported from the club's 2026 master sheet. See
  [MEMBER-IMPORT.md](MEMBER-IMPORT.md).
- **Slice 4** (ride leader accounts, ride CRUD), **Slice 5** (scan at
  sign-in), **Slice 6** (offline plus installable), and **Slice 8** (public
  waiver) built together as Phase 4. See
  [Ride leader app](#ride-leader-app) below for what a leader actually does
  and [Testing it on a phone](#testing-it-on-a-phone) for the setup path.
  Apple Wallet is deliberately not on the critical path: the PDF card and
  the Google pass carry the identical signed QR and the scanner cannot tell
  the three apart.

All three credentials carry the same signed member QR, so one scan resolves
to one member whichever the rider shows. The setup click-path for the two
wallets is `WALLET-SETUP.md`.

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
   order: `0001_schema.sql`, `0002_rls.sql`, `0003_member_email_optional.sql`,
   then `0004_ride_leader_phase_4.sql`. The last one also publishes the
   starter waiver text as version 1, so there is something to sign from the
   first minute. Replace it at `/admin/waiver`.
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
- `npm run smoke` (20 checks: Apple signing, Google save JWT, and the PDF
  card all built in memory with throwaway keys, plus the roster review
  rules, the bulk-update plan including every rejection path, the mail
  merge CSV, member id validation, offline scan resolution including
  signature forgery, attendance keys, ride status transitions, and waiver
  text rendering including its HTML escaping. No env, no network, no
  database)
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
  every action calls `requireAdmin()` or `requireRideAccess()` first.
- Members never log in; their identity is a QR wallet pass (Slice 2+).
- The QR signing secret never reaches a leader's phone. The offline roster
  ships each member's **precomputed** signature and the phone compares
  rather than computes, so a stolen phone cannot mint a valid card.
- `guest_waivers` holds emergency contacts and signature geometry and is
  never publicly readable. Anon can insert one and read the waiver text;
  that is all.
- `/waiver` is the only unauthenticated write in the app. It can create a
  guest waiver and stamp a waiver date on a member who supplied a matching
  member number and surname. It cannot read the roster or list waivers.

## Ride leader app

`/ride` is the leader's whole world. It is a separate route group from
`/admin` on purpose: a leader who is not an admin lives entirely inside it,
and an admin leading a ride gets the same screens the leaders get rather
than a privileged variant nobody else has tested.

**Adding a leader** is one form at `/admin/leaders`. It creates the Supabase
auth user with `role: ride_leader` in `app_metadata` and the `ride_leaders`
row together, because doing one without the other produces either a login
that shows nothing or a roster entry nobody can sign in as, and both look
like the app is broken. Needs `SUPABASE_SERVICE_ROLE_KEY`; the page says so
plainly if it is missing. Admins do not need adding: `requireRideAccess()`
creates a leader row for them on first visit.

**Running a ride**: create it, open sign-in, scan. Scanning a planned ride
starts it, because an early rider who turns up before the leader has tapped
anything must still be counted. Submitting closes it, and a submitted ride
never reopens: its roster has been reported and a report that can change
underneath itself is not a record.

**What a scan shows**: name, member number, tier, membership expiry, and
waiver status, plus a prompt to collect a missing email or phone while the
rider is standing there. An expired member and a rider with no waiver are
both shown rather than blocked, because turning somebody away is a
conversation, not an error state. An unrecognized code offers a button that
opens the leader's own SMS composer with the waiver link in it; there is no
texting integration and there is not meant to be.

### Working with no signal

The start of a ride is usually a gravel lot with one bar. The design is
online to prepare, offline to execute, online to submit, and it is not
bidirectional sync.

Opening sign-in while there is signal copies the member roster into
IndexedDB. From then on every scan is resolved on the phone, against that
copy, with no network call at all. The order on every scan is: decide
locally, **write to IndexedDB, then** tell the server. An expired access
token, a dead cell, or a backgrounded tab cannot take a rider off the list,
because the list is on the phone and the server holds a copy.

The synced roster carries member number, name, tier, expiry, waiver status,
each member's precomputed QR signature, and one boolean for whether contact
details are missing. It carries **no email addresses and no phone numbers**:
a lost phone must not be a roster leak. That boolean is what keeps the
collect-their-details prompt working offline without any address leaving the
server. Expiry and waiver status go beyond the payload the brief lists,
deliberately: a leader is there to check membership and waivers, and without
those two fields a lapsed member and a current one look identical offline.

Guest codes are the one thing that genuinely cannot be checked offline, since
they are minted by the database rather than signed by an HMAC. They are
accepted optimistically and labelled as unverified, and the server settles
them at submit. That is the friendlier answer in a parking lot, and it is a
decision worth revisiting.

Everything the server cannot resolve is still recorded, with the raw code and
a reason, and shown on the ride page. A submit never silently drops a scan.

The app is installable from `/ride` (manifest plus a service worker) so it
runs full screen off the home screen and survives a reload in a dead spot.
The service worker caches only the ride shell and build output; nothing under
`/api` or `/auth`, and no non-GET request, is cached at all.

## Waiver

`/waiver` is public and always will be: guests never get accounts. It renders
the current text from `waiver_versions` and takes a name, contact details, an
emergency contact, a drawn signature, and a typed name.

- **A guest** gets a `G00001` code and a QR to show the leader, good for a
  year. Screenshot it: the page does not come back, because `guest_waivers`
  is never publicly readable.
- **A member** who ticks the member box and gives a member number matching
  the surname gets the waiver stamped on their membership record instead.
  Their usual member card is then what the leader scans.

Publishing at `/admin/waiver` inserts a new version and never rewrites an
old one. Every signature points at the version number that was on screen when
it was made, so a version whose text could change afterwards would evidence
nothing. Which version a signature binds to is decided on the server, not
posted from the form.

The text currently in the database is **starter boilerplate written to
unblock testing, not text a lawyer has reviewed**, and it says so in its own
body. It is in `src/lib/waiver/starter-text.ts` so it is reviewable in a diff.
Replacing it is one paste at `/admin/waiver`.

Signatures are stored as normalized stroke geometry in the row rather than as
an uploaded image. `signature_path` is kept for a rendered PNG later, but a
waiver that fails to save because an upload timed out is worse than one
stored as coordinates, and the coordinates plus the timestamp, version,
address, and typed name are the part that evidences intent.

## Testing it on a phone

The camera needs HTTPS, so this only really works on the deployed URL, not
on `http://localhost`.

1. Run `0004_ride_leader_phase_4.sql` in the Supabase SQL editor.
2. Confirm `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_APP_URL` are set in
   Vercel, then deploy.
3. Open `/admin/waiver` and check the starter text is live. Replace it when
   the club's real wording exists.
4. Open `/admin/leaders` and add a leader with an email you can read. An
   admin account can skip this and go straight to `/ride`.
5. On the phone, sign in at `/login` with that address and request a link.
   Open the link in the same browser that requested it (a Supabase PKCE
   constraint until custom SMTP lands).
6. At `/ride`, create a ride. Add it to the home screen when the browser
   offers.
7. Open sign-in **once while on wifi**. That copies the roster; the chip row
   at the top says how many members are on the phone.
8. Scan a member card from `/admin/members/{id}/pass` (PDF, or the Google
   pass on an Android phone). Expect a name, a number, an expiry, a waiver
   line, and a rising two-note chime.
9. Scan the same card again: it should say already on the list and add no
   second row.
10. Turn on airplane mode and keep scanning. The chip row should read no
    signal and the riders should keep appearing. Reload the page: the list
    survives.
11. Turn signal back on. The queue sends itself, then tap submit.
12. For the guest path, open `/waiver` on a second phone, sign as a guest,
    and scan the code it gives you.

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
src/app/ride                 ride leader app: list, create, detail, sign-in
src/app/waiver               public waiver, the only unauthenticated write
src/app/card                 member card: /card lookup, /card/{id} personal link
src/app/api/wallet/apple     token-guarded .pkpass download
src/app/api/wallet/google    token-guarded Save to Google Wallet redirect
src/app/api/wallet/pdf       token-guarded printable card download
src/lib/db                   Drizzle schema + client
src/lib/supabase             browser / server / proxy clients
src/lib/auth.ts              getUserRole, requireAdmin, requireRideAccess
src/lib/ride                 ride queries, roster build, status vocabulary
src/lib/scan                 payload parse, online/offline resolve, camera, chimes
src/lib/offline/db.ts        IndexedDB roster + attendance queue
src/lib/waiver               starter text, versions, Markdown subset renderer
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
scripts/make-icons.ts        placeholder PWA icons, run once and committed
public/manifest.webmanifest  installable app metadata
public/sw.js                 service worker: ride shell only, never auth
```
