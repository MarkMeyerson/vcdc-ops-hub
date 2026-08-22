# Importing the member roster

The club's roster lives in `VCDC 2026 Member Master Sheet.xlsx`. This
document covers how it gets into the `members` table, what the import
assumes, and what it found wrong in the sheet.

## What the sheet contains

Two columns and nothing else:

| Column | Example |
| --- | --- |
| Name (one field, not split) | `Manuel D. Cruz Machado` |
| Member Number | `25083` |

98 rows. The spreadsheet is 1,011 rows tall, but everything past row 99 is
blank, which is worth knowing before anyone counts rows in Excel and
expects a thousand members.

## The roster is not in this repo

This repository is public. `documents/` is gitignored and must stay that
way: `/card` authenticates a member on their member number plus their last
name, so a published roster is a published set of credentials. Keep the
spreadsheet and the exported CSV local, and treat Supabase as the copy of
record.

## Running it

Export the sheet to `documents/members-2026.csv` with headers `name` and
`member_number`. Then pick a route.

### From the browser, no credentials needed

```bash
npm run import:sql
```

Writes `documents/import-members.sql`: the schema change followed by one
`INSERT` per member, with the data problems below recorded as comments at
the top so the file explains itself. Paste it into the Supabase SQL editor
and run it. This is the path to use when the database password is not to
hand, which is most of the time.

### Straight into the database

```bash
npm run import:members -- --dry-run   # prints every derived row, writes nothing
npm run import:members                # inserts
```

Needs `DATABASE_URL` (or `POSTGRES_URL`) pointing at the Supabase pooled
connection.

Every route is idempotent: rows are inserted by member number and existing
numbers are skipped, so a second run never overwrites a correction an admin
made in the UI afterwards.

## What gets derived, and why

The sheet has a name and a number. The table wants more than that, so:

**Names** split on the first space. First token becomes the given name,
everything after it becomes the surname. That keeps compound surnames
intact: `Giovanni Di Maggio` becomes Giovanni / Di Maggio, `Nancy De
Estrada` becomes Nancy / De Estrada, `Robert Ryan-Silva` stays hyphenated.

Three cleanups run first:

- Honorifics are dropped. `Dr. Juan Villar` becomes Juan Villar, because
  the card prints a name, not a title.
- A middle initial in the middle of a name is dropped. `Manuel D. Cruz
  Machado` becomes Manuel / Cruz Machado. A trailing initial is left alone,
  since that is somebody's surname.
- Names typed entirely in lower case are capitalised. `mark meyerson`
  becomes Mark Meyerson. Names with any deliberate capital are never
  touched, so `McLeod` and `Di Maggio` survive.

**Joined date** comes from the member number. The club encodes the year a
number was issued in its first two digits, so 24001 becomes 2024-01-01 and
26129 becomes 2026-01-01. The day is a placeholder: only the year is real.

**Expiry** is 2026-12-31 for everyone. This is the 2026 sheet and the club
renews on the calendar year.

**Tier** is `regular` for everyone. The sheet does not distinguish, and
lifetime and honorary members have to be set by hand in the admin UI.

**Email** is left blank. The club has never collected addresses for most of
the roster, and `members.email` was changed to nullable
(`supabase/migrations/0003_member_email_optional.sql`) specifically so this
import would not have to invent 98 placeholder addresses that somebody
would later mistake for real ones and mail to. The column is still unique,
so real addresses collected later cannot collide.

## Problems found in the sheet

The import prints these every run. Two need a human decision.

**Member number 24067 is used twice**, by George Petras and by Michelle
Sparacino. The column is unique, so both cannot exist. The import keeps the
first (Petras) and skips Sparacino, and says so. One of them needs a new
number, after which Sparacino can be added in the admin UI or the CSV can
be corrected and the import re-run.

**Thomas Conrad (24036) is listed twice**, identically. The import drops
the second copy. Nothing to decide.

**Jason Estrada appears as 25088 and 26121.** Different numbers, so both
import cleanly and neither is wrong on its face. It is either one person
who was issued a second number on renewal, or two people who share a name.
Worth checking; the same question applies to `Manuel D. Cruz Machado`
(25083) and `Manuel Cruz` (26118).

## Sending members their cards

Once the roster is in, `/admin/members/links` lists every member with a
permanent link to their own card and a **Download CSV** button. The CSV is
the mail merge source: `name`, `first_name`, `last_name`, `member_number`,
`tier`, `expires`, `card_url`. An email template using those exact field
names sits on the same page.

The link is `{app}/card/{member id}` and never changes. What sits behind
it does: today it offers the printable PDF, and when Google Wallet or Apple
Wallet are configured in Vercel their buttons appear on every member's page
at once, with no second email. Anyone holding a link can open that member's
card, so send them individually rather than publishing the list.

Members who lose the email can still get their card at `/card` by entering
their member number and last name.

## Fields the club still wants

Membership tier, start date, and renewal date are the three fields the club
is trying to collect for real. Until then the derived values above stand in.
Each is editable per member at `/admin/members/{id}/edit`, and the plan is
to let members maintain their own record once member accounts exist.
