# Wallet setup

Exact click-paths for getting real membership cards into members' hands.
Written for a future maintainer who is not Mark.

There are three ways to carry the same card:

| Way | What it needs | Cost |
|---|---|---|
| Printable card (PDF) | `QR_SIGNING_SECRET` only | none |
| Google Wallet | a Google account and an issuer ID | none |
| Apple Wallet | Apple Developer Program membership | 99 USD a year |

All three carry the same signed QR payload, so a ride leader scan resolves
to the same member whichever one a rider shows. A member can hold more than
one at once, and the printable card works on every phone, which makes it the
fallback whenever a wallet is unavailable.

**The one thing to remember: Apple pass certificates expire every 365
days.** The certificate created in 2026 dies in mid-2027. When it does, new
passes stop generating (existing passes already in people's Wallets keep
working). The fix is repeating the Apple certificate steps below with a
fresh certificate. Put a calendar reminder one month before expiry.

Nothing else here expires on a clock. Google service account keys do not
rotate yearly, and the printable card has nothing to renew at all.

## What the app already does

All of the code is in place and deployed. The admin Members list has a Pass
link per member, showing a pass preview, the member's signed QR, and one
download QR per way of carrying the card. Each download endpoint returns a
clear error naming any missing configuration until the steps below are
done, then starts working with no code change.

## Step 1: generate QR_SIGNING_SECRET (all three need this)

In any terminal:

```
openssl rand -hex 32
```

Add the output in Vercel: project vcdc-ops-hub, Settings, Environment
Variables, name `QR_SIGNING_SECRET`, scope Production and Preview.
Rotating this value later invalidates every issued card QR and outstanding
download link (see README).

## The printable card

No account, no vendor, no cost. As soon as Step 1 is done and the app is
redeployed, every member has a card at
`/admin/members/{id}/pass`.

To send one: open the member's Pass page, click "Open the card here to save
or email it" under Printable card, and attach the PDF to an email. The page
also shows a QR that opens the same card on a phone, which is the quicker
path when the member is standing in front of you.

The card is a 4 by 6 inch page: it fills a phone screen when opened from an
email and prints on a home printer without scaling. Slice 7 will send it
automatically on member create and renew.

## Google Wallet

Free. No developer program, no annual renewal. Roughly twenty minutes.

The account that does this owns the issuer, but ownership is not a trap:
the issuer has its own user list, so a club Google account can be added as
an Admin later with nothing to migrate and no passes to re-issue.

### Who owns this, and handing it to the club later

Set up on 2026-08-19 under `sherpatechai@gmail.com`, with the Google
payments profile under SherpaTech.AI (profile ID 0841-7838-2204). This was
deliberate: it gets members a working Android pass now instead of waiting on
a club-owned Google account. The public-facing details are the club's, not
SherpaTech's: public business name `vespaclubofdc.org`, merchant category
Charitable and Social Service Organizations, support links on the club
domain. Merchant ID BCR2DN6D3KCMZ7T2.

**The Merchant ID is not the Issuer ID.** The merchant ID above identifies
the Google Pay account. The Wallet issuer ID is a separate 19-digit number
that appears only after Wallet API access is granted. Only that number goes
in `GOOGLE_WALLET_ISSUER_ID`.

When the club takes this over, three things move separately:

1. **The issuer account.** Clean handoff. Add a club Google account under
   Users with the Admin role and it has full control. Nothing migrates and
   no member passes are re-issued.
2. **The payments profile.** A separate Google object tied to the
   SherpaTech.AI identity. Confirm the transfer path with Google before
   assuming it moves; the fallback is a new profile on a club account.
3. **The service account** (G2). Lives in a Google Cloud project under the
   same login. Moving it means a new service account in a club-owned
   project, repeating G3, then swapping
   `GOOGLE_WALLET_SERVICE_ACCOUNT_B64` in Vercel. Passes already saved to
   members' wallets are unaffected.

None of this blocks anything today. Do it whenever the club has its own
Google account ready.

### G1: request Google Wallet API access

1. Go to [pay.google.com/business/console](https://pay.google.com/business/console)
   and sign in with the Google account that will own this.
2. Choose Google Wallet API, then request access. Fill in the business
   details: The Vespa Club of D.C., Inc., and `vespaclubofdc.org` as the
   website.
3. You get an Issuer ID immediately, a 19-digit number that looks like
   `3388000000023174313`. Production approval follows separately, usually
   within a few business days.

Vercel env var: `GOOGLE_WALLET_ISSUER_ID` = that number.

Until production approval lands, the issuer is in demo mode: passes save
only for Google accounts listed as test accounts in the console, and they
carry a notice on the back. Add your own Google account there and you can
validate the whole flow on your phone while waiting.

### G2: create a service account

The issuer ID says who the passes belong to. The service account is what
signs them.

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and
   create a project, name it `vcdc-wallet`.
2. APIs and Services, Library, search "Google Wallet API", Enable.
3. IAM and Admin, Service Accounts, Create service account. Name it
   `vcdc-wallet-passes`.

   **Grant it no roles.** The console offers a Permissions step with a role
   picker. Leave it empty and continue. This account does not need Owner,
   Editor, or any other project role: its Wallet permission comes entirely
   from being added to the issuer's Users list in G3. Granting Owner here
   would give a key that lives in an environment variable full control of
   the Google Cloud project.

   The account in use since 2026-08-19 is
   `vcdc-wallet-passes@vcdc-wallet-2.iam.gserviceaccount.com`, in project
   `vcdc-wallet-2`, created under `sherpatechai@gmail.com` with **no
   organization**. That address is what G3 asks for.
4. Open the service account, Keys tab, Add key, Create new key, JSON. A
   `.json` file downloads. This is a private key: treat it like a password
   and do not commit it.

Encode it as one line. On Windows PowerShell:

```
[Convert]::ToBase64String([IO.File]::ReadAllBytes("vcdc-wallet-xxxx.json"))
```

On a Mac or Linux:

```
base64 -i vcdc-wallet-xxxx.json | tr -d '\n'
```

Vercel env var: `GOOGLE_WALLET_SERVICE_ACCOUNT_B64` = that output.

### If key creation is blocked by an organization policy

Hit on 2026-08-19 in `sherpatechai-org`. The Keys tab refuses with
"Service account key creation is disabled", naming the policy
`iam.disableServiceAccountKeyCreation`. Google now enforces this by default
on new organizations.

**A key is genuinely required here.** Google's suggested alternative,
Workload Identity Federation, issues short-lived access tokens and never
exposes a private key. The Save to Google Wallet link is a JWT signed with
the service account's own private key, so there is no keyless path for
distributing passes. Do not spend time trying to avoid the key.

Override the policy for this one project, leaving the org-wide default in
place everywhere else:

1. Grant your account Organization Policy Administrator
   (`roles/orgpolicy.policyAdmin`) at the organization level, under IAM and
   Admin, IAM.
2. Go to IAM and Admin, Organization Policies, with the project picker set
   to `vcdc-wallet` rather than the organization.
3. Find `iam.disableServiceAccountKeyCreation`, Manage policy.
4. Override parent's policy, add a rule, enforcement Off, Save.
5. Wait a few minutes for propagation, then create the JSON key.

**What we actually did, and would do again.** We took the second route: a
Google account with no organization attached, where the policy simply does
not apply. The first project (`vcdc-wallet`, under `sherpatechai-org`) was
abandoned and can be deleted. Creating a fresh project took about five
minutes and touched no security settings, which beat granting an org admin
role and editing an organization policy. Prefer this route unless the
project must live inside the organization for some other reason.

Watch the project chip at the top of the Cloud console when you do this.
It is easy to create the new project and then keep working in the old one,
which fails in exactly the same confusing way.

Whichever route: the key exists only in Vercel and in `.env.local`. It is
never committed, and it should be deleted from the service account when the
club takes ownership and issues its own.

### G3: authorize the service account on the issuer

This is the step people miss, and skipping it produces a 403 that explains
nothing.

1. Back in the Google Pay and Wallet Console, open Users.
2. Invite a user, paste the service account email (it looks like
   `vcdc-wallet-passes@vcdc-wallet.iam.gserviceaccount.com`, and it is in
   the JSON file as `client_email`).
3. Give it the Developer role. Admin also works.

### G4: choose a class ID and create the class

Every member pass points at one shared class. The ID must start with the
issuer ID:

```
GOOGLE_WALLET_CLASS_ID=3388000000023174313.vcdc-member
```

Put all three Google variables in `.env.local`, then run:

```
npm run google:class
```

It creates the class, or updates it if it already exists, so it is safe to
run again. If it fails, the error from Google is printed in full.

### G5: deploy and test

1. Set all three Google variables in Vercel, scope Production, alongside
   `QR_SIGNING_SECRET` and `NEXT_PUBLIC_APP_URL`.
2. Redeploy so the new variables load.
3. Open any member's Pass page, scan the Add to Android QR with an Android
   phone, and Google Wallet should offer Save to Wallet.
4. The saved pass should show: Vespa Club of D.C., VCDC MEMBER, the
   member's name, member number, tier, expiry, and the QR.

## Apple Wallet

Parked while the club works through Apple Developer Program enrollment.
Everything below is ready to run the moment the credentials exist. Send
members the printable card in the meantime.

### Prerequisites

- An Apple Developer Program membership, 99 USD per year, at
  [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll).
  Approval can take a day or two.

  **Choose individual or organization deliberately, because it cannot be
  changed later.** An individual membership cannot be converted to an
  organization one. Enrolling the club afterward means a second enrollment,
  a new Team ID, and re-issuing every member pass, since a pass is signed
  against one specific team. Enrolling as The Vespa Club of D.C., Inc.
  requires a D-U-N-S number, which is free but can take up to two weeks to
  obtain. If the club should own this eventually, start the D-U-N-S request
  first and avoid the redo.
- A Mac with Keychain Access (any Mac, nothing installed on it matters
  afterward).

### A1: find your Team ID

[developer.apple.com/account](https://developer.apple.com/account), scroll
to Membership details. The Team ID is a 10-character code like `A1BC23DEF4`.

Vercel env var: `APPLE_TEAM_ID`.

### A2: create a Pass Type ID

1. developer.apple.com/account, Certificates, Identifiers and Profiles,
   Identifiers.
2. Click the plus button, choose Pass Type IDs, Continue.
3. Description: `VCDC Membership`. Identifier: `pass.org.vespaclubofdc.member`
   (reverse-DNS of the club domain; any `pass.`-prefixed string works but
   this one is self-explanatory).
4. Register.

Vercel env var: `APPLE_PASS_TYPE_ID` = the identifier string exactly, e.g.
`pass.org.vespaclubofdc.member`.

### A3: create and export the signing certificate

1. On the Mac: open Keychain Access, menu Keychain Access, Certificate
   Assistant, Request a Certificate From a Certificate Authority.
2. User email: your email. Common Name: `VCDC Pass Signing`. CA Email:
   leave empty. Choose "Saved to disk". Save the `.certSigningRequest`.
3. Back on developer.apple.com: Certificates, plus button, scroll to
   Services, choose Pass Type ID Certificate, Continue.
4. Select the Pass Type ID from A2, upload the `.certSigningRequest`,
   Continue, Download. You get `pass.cer`.
5. Double-click `pass.cer` so it lands in Keychain Access (login keychain).
6. In Keychain Access, find it under My Certificates (it shows as
   "Pass Type ID: pass.org.vespaclubofdc.member"), expand the arrow to
   confirm the private key sits underneath, then right-click the
   certificate row and Export. Format: Personal Information Exchange
   (.p12). Set a password when prompted and keep it.

Vercel env vars:

```
base64 -i Certificates.p12 | tr -d '\n'
```

- `APPLE_PASS_CERT_P12_B64` = that output
- `APPLE_PASS_CERT_PASSWORD` = the export password

### A4: the Apple WWDR intermediate certificate

Download "Worldwide Developer Relations - G4" from
[www.apple.com/certificateauthority](https://www.apple.com/certificateauthority/).
The file is `AppleWWDRCAG4.cer`. No account needed.

```
base64 -i AppleWWDRCAG4.cer | tr -d '\n'
```

Vercel env var: `APPLE_WWDR_CERT_B64` = that output. The app accepts the
`.cer` (DER) directly; no PEM conversion needed.

### A5: deploy and test

1. Confirm all six variables exist in Vercel, scope Production:
   `QR_SIGNING_SECRET`, `APPLE_TEAM_ID`, `APPLE_PASS_TYPE_ID`,
   `APPLE_PASS_CERT_P12_B64`, `APPLE_PASS_CERT_PASSWORD`,
   `APPLE_WWDR_CERT_B64`.
2. Redeploy (Deployments, latest, Redeploy) so the new variables load.
3. Open any member's Pass page in the admin, scan the "Add to iPhone" QR
   with the iPhone camera, and Safari should offer Add to Wallet.
4. The pass should show: VCDC MEMBER header, the member's name, member
   number, tier, expiry date, and the QR with the member number beneath it.

If the download shows a JSON error instead, it lists exactly which
variables the server cannot see. Typos in variable names are the usual
suspect.

### Known placeholder

The pass icon is currently a solid sky blue square generated in code. The
club badge's fine cog teeth and lettering would be illegible at Apple's
29 point icon size, so a simplified mark (scooter and sunburst, no cog
ring or text) needs to be produced. When it exists, add the PNGs to the
model in `src/lib/wallet/apple.ts` (`icon.png` 29x29, `icon@2x.png` 58x58,
`icon@3x.png` 87x87, and optionally `logo.png` for the top-left corner,
max 160x50 points at 1x).

### Renewal (yearly, this WILL come due mid-2027)

1. Repeat A3 (new CSR, new certificate, new .p12 export).
2. Replace `APPLE_PASS_CERT_P12_B64` and `APPLE_PASS_CERT_PASSWORD` in
   Vercel. Redeploy.
3. Existing passes in members' Wallets are unaffected. Only the ability to
   generate new passes was down while the certificate was expired.
