-- VCDC Operations Hub: initial schema.
-- Source of truth: VCDCCLAUDECODEBRIEF.md Section 4.
-- Run in the Supabase SQL editor (or supabase db push) on a FRESH project.

-- Members. Signatures live in the club's renewal records, not here.
-- member_number is admin-assigned (existing GoDaddy numbers can be entered
-- as-is); the UI suggests max + 1. There is deliberately no sequence.
-- "Active" is never stored: compute expires_at >= current_date in queries.
create table members (
  id uuid primary key default gen_random_uuid(),
  member_number integer unique not null,
  first_name text not null,
  last_name text not null,
  email text unique not null,
  phone text,
  membership_tier text not null default 'regular'
    check (membership_tier in ('regular','lifetime','honorary')),
  joined_at date not null,
  expires_at date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ride leaders. Not all are members, so member_id is nullable.
-- user_id populates on first successful login.
create table ride_leaders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text unique not null,
  full_name text not null,
  member_id uuid references members(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Versioned waiver text so admin edits do not invalidate signed history.
create table waiver_versions (
  version integer primary key generated always as identity,
  body_markdown text not null,
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- Guest waivers. Declared before attendance, which references it.
create table guest_waivers (
  id uuid primary key default gen_random_uuid(),
  guest_number integer generated always as identity,   -- displayed G00001
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  emergency_contact_name text,
  emergency_contact_phone text,
  signature_path text not null,        -- Supabase Storage path, NOT base64 in-row
  waiver_text_version integer not null references waiver_versions(version),
  signed_at timestamptz not null default now(),
  signed_ip inet,
  user_agent text,
  qr_token text unique not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table rides (
  id uuid primary key default gen_random_uuid(),
  ride_leader_id uuid not null references ride_leaders(id),
  ride_date date not null,
  route_name text not null,
  start_location text,
  notes text,
  status text not null default 'planned'
    check (status in ('planned','active','submitted')),
  submitted_at timestamptz,
  created_at timestamptz not null default now()
);

-- Exactly one of member_id or guest_waiver_id is set.
create table ride_attendance (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references rides(id) on delete cascade,
  member_id uuid references members(id),
  guest_waiver_id uuid references guest_waivers(id),
  scanned_at timestamptz not null,
  scanned_offline boolean not null default false,
  constraint one_identity check (
    (member_id is not null and guest_waiver_id is null) or
    (member_id is null and guest_waiver_id is not null)
  ),
  unique (ride_id, member_id),
  unique (ride_id, guest_waiver_id)
);

-- Singleton settings row (id is always true).
create table app_settings (
  id boolean primary key default true check (id),
  roster_recipient_emails text[] not null default '{}',
  updated_at timestamptz not null default now()
);

insert into app_settings (id) values (true);

create index on members (member_number);
create index on members (expires_at);
create index on ride_attendance (ride_id);
create index on guest_waivers (qr_token);
create index on rides (ride_leader_id, ride_date desc);

-- Keep members.updated_at honest on every update.
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger members_updated_at
  before update on members
  for each row execute function set_updated_at();
