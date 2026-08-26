-- ============================================================
-- PrimezStudy — Supabase schema (WebRTC + Realtime version)
-- Run in Supabase Dashboard → SQL Editor
--
-- WebRTC signaling (offers/answers/ICE) travels over Supabase Realtime
-- BROADCAST channels, not the database — so no extra table is needed for
-- it. This schema is otherwise the same as the HLS version; stream_url is
-- kept only for backward compatibility (always null now) and can be
-- dropped if you don't need it.
-- ============================================================

-- 1. Classes table -------------------------------------------------
create type class_status as enum ('scheduled', 'live', 'ended');

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  instructor text not null,
  description text,
  scheduled_at timestamptz not null,
  duration_minutes int default 60,
  stream_url text,              -- unused in the WebRTC version, kept nullable for compatibility
  recording_url text,           -- public URL of the saved recording, if the instructor chose to record
  notes text,                   -- instructor's live session notes, visible to students in real time
  status class_status not null default 'scheduled',
  created_at timestamptz not null default now()
);

alter table public.classes enable row level security;

-- Any signed-in user can view the class list
create policy "Authenticated users can read classes"
  on public.classes for select
  to authenticated
  using (true);

-- Any signed-in user can create/update/delete classes.
-- Simple single-instructor setup: whoever is logged in can go live.
-- (Tighten this later — e.g. check auth.uid() against an instructors table —
-- once more than one person can sign in.)
create policy "Authenticated users can manage classes"
  on public.classes for all
  to authenticated
  using (true)
  with check (true);

-- If you already ran an earlier version of this schema, the create table
-- above was skipped (table already exists) — add the new column explicitly:
alter table public.classes add column if not exists recording_url text;
alter table public.classes add column if not exists notes text;

-- 1b. Storage bucket for recordings --------------------------------
-- Run this to create a public "recordings" bucket + access policies.
insert into storage.buckets (id, name, public)
values ('recordings', 'recordings', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can upload recordings" on storage.objects;
create policy "Authenticated users can upload recordings"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'recordings');

drop policy if exists "Anyone can view recordings" on storage.objects;
create policy "Anyone can view recordings"
  on storage.objects for select
  using (bucket_id = 'recordings');

-- 2. Realtime (Postgres Changes) --------------------------------
-- Powers the live status badges on dashboard.html / class.html.
alter publication supabase_realtime add table public.classes;

-- 3. Realtime (Broadcast) ----------------------------------------
-- No table/migration needed. Broadcast channels are created on the fly
-- by the client (js/webrtc-signal.js) as "class-signal-<classId>".
-- By default Realtime Broadcast is open to any client using your anon
-- key — fine here since it only carries connection-setup data for an
-- already-auth-gated page, but if you want to lock channel access down
-- to signed-in users only, enable "Private channels" + RLS on
-- realtime.messages in Supabase → Realtime settings.

-- 5. Live chat -----------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  sender_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;

drop policy if exists "Authenticated users can read messages" on public.messages;
create policy "Authenticated users can read messages"
  on public.messages for select to authenticated using (true);

drop policy if exists "Authenticated users can send messages" on public.messages;
create policy "Authenticated users can send messages"
  on public.messages for insert to authenticated with check (true);

do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

-- 6. Live polls ------------------------------------------------------
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  question text not null,
  options jsonb not null,               -- e.g. ["Yes", "No", "Not sure"]
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  voter_id text not null,               -- the voting user's auth uid
  option_index int not null,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_id)
);
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists "Authenticated users can read polls" on public.polls;
create policy "Authenticated users can read polls"
  on public.polls for select to authenticated using (true);
drop policy if exists "Authenticated users can manage polls" on public.polls;
create policy "Authenticated users can manage polls"
  on public.polls for all to authenticated using (true) with check (true);

drop policy if exists "Authenticated users can read votes" on public.poll_votes;
create policy "Authenticated users can read votes"
  on public.poll_votes for select to authenticated using (true);
drop policy if exists "Authenticated users can cast votes" on public.poll_votes;
create policy "Authenticated users can cast votes"
  on public.poll_votes for insert to authenticated with check (true);

do $$ begin
  alter publication supabase_realtime add table public.polls;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null; end $$;

-- 4. Seed one example row
insert into public.classes (title, instructor, description, scheduled_at, duration_minutes, status, stream_url)
values
  ('Welcome Session', 'Your name here', 'Edit or delete this from instructor.html — then create your real class.', now() + interval '1 hour', 60, 'scheduled', null);
