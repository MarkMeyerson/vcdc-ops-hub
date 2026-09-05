-- VCDC Operations Hub: ride comments, the in-app replacement for the
-- Notion "Ride Leader Feedback" database.
--
-- Two entry points write the same table, distinguished by `kind`:
--   'note'   an optional aside a leader leaves during check-in
--   'finish' the required "what went well / any issues" comment collected
--            when a ride is submitted
--
-- A leader's own comments are theirs to read alongside the ride; an admin
-- reads everyone's, same shape as ride_attendance in migration 0002/0004.

create table if not exists ride_comments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(id) on delete cascade,
  ride_leader_id uuid not null references ride_leaders(id),
  comment text not null,
  kind text not null default 'note' check (kind in ('note', 'finish')),
  created_at timestamptz not null default now()
);

create index if not exists ride_comments_ride_id_idx on ride_comments(ride_id);

alter table ride_comments enable row level security;

create policy admin_all_ride_comments on ride_comments
  for all using (public.is_admin()) with check (public.is_admin());

create policy leader_own_ride_comments on ride_comments
  for all using (
    public.is_ride_leader()
    and ride_id in (
      select r.id from rides r
      join ride_leaders rl on rl.id = r.ride_leader_id
      where rl.user_id = auth.uid()
    )
  ) with check (
    public.is_ride_leader()
    and ride_id in (
      select r.id from rides r
      join ride_leaders rl on rl.id = r.ride_leader_id
      where rl.user_id = auth.uid()
    )
  );
