-- VCDC Operations Hub: Row Level Security.
-- The anon key ships to the browser, so RLS is mandatory on every table.
-- Role lives in auth.users.raw_app_meta_data (lands in the JWT and users
-- cannot edit it, unlike user_metadata). Set it with, for example:
--   update auth.users
--   set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'::jsonb
--   where email = 'you@example.com';

create or replace function public.jwt_role()
returns text language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select public.jwt_role() = 'admin'
$$;

create or replace function public.is_ride_leader()
returns boolean language sql stable as $$
  select public.jwt_role() = 'ride_leader'
$$;

alter table members enable row level security;
alter table ride_leaders enable row level security;
alter table waiver_versions enable row level security;
alter table guest_waivers enable row level security;
alter table rides enable row level security;
alter table ride_attendance enable row level security;
alter table app_settings enable row level security;

-- Admin: full access everywhere.
create policy admin_all_members on members
  for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_ride_leaders on ride_leaders
  for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_waiver_versions on waiver_versions
  for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_guest_waivers on guest_waivers
  for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_rides on rides
  for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_ride_attendance on ride_attendance
  for all using (public.is_admin()) with check (public.is_admin());
create policy admin_all_app_settings on app_settings
  for all using (public.is_admin()) with check (public.is_admin());

-- Ride leaders: read the member roster (needed for offline scan sync).
create policy leader_read_members on members
  for select using (public.is_ride_leader());

-- Ride leaders: see their own leader row (user_id linkage happens at login).
create policy leader_read_self on ride_leaders
  for select using (public.is_ride_leader() and user_id = auth.uid());

-- Ride leaders: full access to rides they lead, nothing else.
create policy leader_own_rides on rides
  for all using (
    public.is_ride_leader()
    and ride_leader_id in (select id from ride_leaders where user_id = auth.uid())
  ) with check (
    public.is_ride_leader()
    and ride_leader_id in (select id from ride_leaders where user_id = auth.uid())
  );

-- Ride leaders: attendance rows for their own rides.
create policy leader_own_attendance on ride_attendance
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

-- Guest waivers hold emergency contacts and signature images.
-- Readable ONLY by admin (above) and authenticated ride leaders.
create policy leader_read_guest_waivers on guest_waivers
  for select using (public.is_ride_leader());

-- The public waiver form (anon) may insert a signed waiver and must be able
-- to read the current waiver text. Anon can NEVER read guest_waivers.
create policy anon_insert_guest_waivers on guest_waivers
  for insert to anon with check (true);
create policy read_waiver_versions on waiver_versions
  for select using (true);
