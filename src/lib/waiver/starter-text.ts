// Starter waiver text.
//
// This is boilerplate written to unblock testing, NOT text a lawyer has
// reviewed. It is deliberately plain, deliberately conservative, and
// deliberately marked as interim inside its own body so nobody mistakes a
// test signature for a vetted legal record.
//
// The database is the source of truth: version 1 is inserted by
// supabase/migrations/0004_ride_leader_phase_4.sql with this exact text.
// This constant exists so the admin waiver page can offer "load the starter
// text" on a database where nothing was ever published, and so the wording
// is reviewable in the diff rather than only inside a migration.
//
// Replacing it is one paste into /admin/waiver. Publishing a new version
// never rewrites an old one: signatures keep pointing at the version that
// was on screen when they were made.

export const STARTER_WAIVER_VERSION_NOTE =
  'Interim text. Replace it with the club-approved waiver at /admin/waiver before any ride that matters legally.'

export const STARTER_WAIVER_MARKDOWN = `# Vespa Club of Washington DC
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
`
