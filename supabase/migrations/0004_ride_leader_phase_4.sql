-- VCDC Operations Hub: Phase 4, the ride leader app.
--
-- Four things, all of them in service of one leader standing in a parking
-- lot with a phone:
--
--   1. Waiver text exists. Nothing could be signed before this, so nothing
--      could be checked, so "does this rider have a waiver" had no answer.
--   2. Members carry a waiver status of their own. The original schema only
--      recorded waivers for guests, but a leader checking the group cannot
--      check half of it.
--   3. A signature is recorded in-row as stroke geometry rather than as a
--      Storage object. Storage stays the better home for a rendered PNG and
--      signature_path is kept for it, but a waiver that fails to save
--      because an upload timed out is worse than one stored as coordinates,
--      and the coordinates plus the timestamp, version, address, and typed
--      name are the part that actually evidences intent.
--   4. Attendance can hold a scan that has not been resolved to a person.
--      A leader offline for two hours must be able to submit everything
--      they scanned, including the one code the server later rejects. The
--      row lands with the raw code and a reason, visible to the leader,
--      rather than being dropped on the floor during submit.

-- ---------- 1. Waiver text ----------

-- Version 1, inserted only if nothing has ever been published, so re-running
-- this migration cannot create a duplicate starter version or shadow the
-- club's real text once it is loaded.
--
-- This is interim boilerplate, not reviewed text. The matching copy lives in
-- src/lib/waiver/starter-text.ts, where it is reviewable in a diff; the
-- database is the source of truth once either one is published.
insert into waiver_versions (body_markdown)
select $waiver$# Vespa Club of Washington DC
## Release of Liability, Waiver of Claims, and Assumption of Risk

**Interim text.** This wording is a working placeholder so ride sign-in can
be tested. It has not been reviewed by counsel for the club. Replace it with
the club-approved waiver before relying on it.

Read this document carefully. It affects your legal rights. By signing you
agree to be bound by all of it.

### 1. What I am signing up for

I am asking to take part in activities organized by or associated with the
Vespa Club of Washington DC ("the Club"), including group rides, rallies,
meetups, and travel to and from them ("the Activities").

### 2. I understand the risks

Riding a motor scooter or motorcycle on public roads is dangerous. I
understand that the Activities carry risks that cannot be removed, including
but not limited to: collision with vehicles, pedestrians, animals, or fixed
objects; road surface hazards such as gravel, potholes, tracks, and painted
markings; weather; mechanical failure; the conduct of other participants;
the conduct of drivers who are not part of the Activities; and delayed or
unavailable medical assistance.

I understand these risks may cause property damage, minor injury, serious
injury, permanent disability, or death. I choose to take part anyway, of my
own free will, and I accept all of these risks, known and unknown.

### 3. I am responsible for myself and my machine

I confirm that:

- I hold a valid license for the vehicle I am riding, and it is properly
  registered and insured as the law requires.
- My vehicle is in safe operating condition.
- I will wear the safety gear the law requires, and I understand the Club
  recommends a helmet and protective clothing on every ride.
- I will obey all traffic laws. I understand a group ride is not an escort,
  gives me no special right of way, and does not permit me to run signals,
  speed, or ride outside the law to stay with the group.
- I will not take part while impaired by alcohol, drugs, or medication.
- I am physically fit to take part, and I am not aware of any medical
  condition that would make it unsafe for me to do so.
- I ride at my own pace and make my own decisions. I will leave the group
  rather than ride beyond my ability or comfort.

### 4. Release of claims

In exchange for being allowed to take part, I release and agree not to sue
the Club, its officers, directors, members, ride leaders, volunteers,
sponsors, and anyone else acting on its behalf ("the Released Parties") for
any claim, loss, injury, death, or damage arising out of the Activities,
including any claim based on the ordinary negligence of the Released
Parties.

I also agree to defend and indemnify the Released Parties against any claim
brought by anyone else arising out of my own conduct during the Activities.

This release does not apply to conduct that the law does not allow to be
released, including gross negligence or intentional misconduct.

### 5. Ride leaders are volunteers

I understand that ride leaders are unpaid volunteers, not professional
guides or instructors. A ride leader choosing a route, setting a pace, or
signaling a hazard is a courtesy, not a guarantee of safety, and I remain
responsible for my own riding at all times.

### 6. Medical care

If I am injured and cannot consent for myself, I authorize the Club to
arrange emergency medical care on my behalf, and I accept responsibility for
its cost. I have listed an emergency contact below and confirm that person
can be reached at the number I gave.

### 7. Photographs

The Club may take photographs and video during the Activities and may use
them to promote the Club, without payment to me. If I do not want this, I
will say so in writing to a ride leader or Club officer, and the Club will
make a reasonable effort to honor that.

### 8. Personal information

The Club collects my name, contact details, and emergency contact so it can
run the ride and reach someone if something happens. It does not sell this
information. Ride leaders can see a rider's name, member number, membership
status, and waiver status at sign-in.

### 9. Minors

If the person taking part is under 18, a parent or legal guardian must sign.
By signing as a parent or guardian I agree to everything above on behalf of
the minor and on my own behalf.

### 10. The rest

This agreement is governed by the law of the District of Columbia. If any
part of it is found unenforceable, the rest still applies. This is the
entire agreement between me and the Club about the Activities, and it
replaces anything said or written before it.

### 11. Electronic signature

I agree that signing this form on a screen has the same legal effect as
signing it on paper. I understand the Club will record the date and time I
signed, the version of this text I was shown, and the network address and
browser I signed from.

**I have read this document. I understand it. I sign it freely.**
$waiver$
where not exists (select 1 from waiver_versions);

-- ---------- 2. Member waiver status ----------

-- Nullable on purpose: the 95 imported members have not signed anything in
-- this system, and pretending otherwise would show a leader a green check
-- for a waiver that does not exist.
alter table members add column if not exists waiver_signed_at timestamptz;
alter table members add column if not exists waiver_version integer
  references waiver_versions(version);

-- ---------- 3. Signature record ----------

alter table guest_waivers alter column signature_path drop not null;
alter table guest_waivers add column if not exists signature_strokes jsonb;
alter table guest_waivers add column if not exists signature_name text;
alter table guest_waivers add column if not exists guardian_name text;
alter table guest_waivers add column if not exists photo_consent boolean
  not null default true;

-- A waiver with neither a drawn signature nor a typed name is not signed.
alter table guest_waivers drop constraint if exists guest_waivers_signed;
alter table guest_waivers add constraint guest_waivers_signed check (
  signature_path is not null
  or signature_strokes is not null
  or signature_name is not null
);

create index if not exists guest_waivers_expires_at_idx
  on guest_waivers (expires_at);

-- ---------- 4. Attendance that cannot lose a scan ----------

alter table ride_attendance add column if not exists raw_code text;
alter table ride_attendance add column if not exists unresolved_reason text;

-- Was: exactly one of member_id or guest_waiver_id. Now: exactly one of
-- them, OR neither, provided the raw code is kept so a human can work out
-- afterwards who the leader was standing in front of.
alter table ride_attendance drop constraint if exists one_identity;
alter table ride_attendance add constraint one_identity check (
  (member_id is not null and guest_waiver_id is null) or
  (member_id is null and guest_waiver_id is not null) or
  (member_id is null and guest_waiver_id is null and raw_code is not null)
);

-- The unique (ride_id, member_id) and unique (ride_id, guest_waiver_id)
-- pairs from 0001 do not constrain unresolved rows, because NULLs never
-- collide in a unique index. Duplicate raw codes on one ride would, so
-- they are deduplicated explicitly.
create unique index if not exists ride_attendance_ride_raw_code_idx
  on ride_attendance (ride_id, raw_code)
  where raw_code is not null;

-- ---------- 5. Row level security ----------

-- Ride leaders correct a member's email or phone at sign-in. That write goes
-- through a server action on the Drizzle connection, which is not subject to
-- RLS, but the policy is stated anyway so the database agrees with the app
-- about who is allowed to do what.
drop policy if exists leader_update_member_contact on members;
create policy leader_update_member_contact on members
  for update using (public.is_ride_leader()) with check (public.is_ride_leader());

-- The public waiver form needs to confirm a member number belongs to the
-- name typed next to it. It must never be able to list the roster, so this
-- lookup stays on the server side only. No anon policy is added here on
-- purpose: anon still cannot read members at all.
