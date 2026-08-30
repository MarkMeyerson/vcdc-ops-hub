-- VCDC Operations Hub: app-wide feedback.
--
-- ride_comments (migration 0005) is scoped to a ride: a note during
-- check-in or the required comment at submit. This table is the other
-- half of the Phase 5 feedback scoping — a leader hitting a snag on any
-- screen, ride or no ride, taps one button and it's captured with the page
-- they were on. Nothing here requires a ride to exist.

create table if not exists app_feedback (
  id uuid primary key default gen_random_uuid(),
  ride_leader_id uuid not null references ride_leaders(id),
  path text not null,
  message text not null,
  type text not null default 'other'
    check (type in ('bug', 'confusing', 'idea', 'question', 'other')),
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists app_feedback_created_at_idx on app_feedback(created_at);

alter table app_feedback enable row level security;

create policy admin_all_app_feedback on app_feedback
  for all using (public.is_admin()) with check (public.is_admin());

-- A leader can leave feedback and see their own past submissions, same
-- shape as leader_read_self on ride_leaders.
create policy leader_own_app_feedback on app_feedback
  for all using (
    public.is_ride_leader()
    and ride_leader_id in (select id from ride_leaders where user_id = auth.uid())
  ) with check (
    public.is_ride_leader()
    and ride_leader_id in (select id from ride_leaders where user_id = auth.uid())
  );
