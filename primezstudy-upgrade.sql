-- PrimezStudy safe upgrade migration
-- Run once in Supabase Dashboard → SQL Editor.
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS.

create extension if not exists pgcrypto;

do $$ begin
  create type public.class_status as enum ('scheduled', 'live', 'ended');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  updated_at timestamptz not null default now()
);
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(), title text not null, instructor text not null,
  description text, scheduled_at timestamptz not null, duration_minutes int default 60,
  stream_url text, recording_url text, notes text, status public.class_status not null default 'scheduled',
  created_at timestamptz not null default now()
);
alter table public.classes add column if not exists recording_url text;
alter table public.classes add column if not exists notes text;
create table if not exists public.lectures (
  id uuid primary key default gen_random_uuid(), title text not null, description text,
  video_url text not null, uploaded_by text, duration_seconds int, created_at timestamptz not null default now()
);
create table if not exists public.lecture_progress (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  lecture_id uuid not null references public.lectures(id) on delete cascade, seconds_watched int not null default 0,
  updated_at timestamptz not null default now(), unique(user_id, lecture_id)
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(), class_id uuid not null references public.classes(id) on delete cascade,
  sender_name text not null, body text not null, created_at timestamptz not null default now()
);
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(), class_id uuid not null references public.classes(id) on delete cascade,
  question text not null, options jsonb not null, is_open boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(), poll_id uuid not null references public.polls(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade, option_index int not null,
  created_at timestamptz not null default now(), unique(poll_id, voter_id)
);
create table if not exists public.doubts (
  id uuid primary key default gen_random_uuid(), class_id uuid not null references public.classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, student_name text not null,
  question text not null, answer text, status text not null default 'open' check(status in ('open','answered')),
  created_at timestamptz not null default now(), answered_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.lectures enable row level security;
alter table public.lecture_progress enable row level security;
alter table public.messages enable row level security;
alter table public.polls enable row level security;
alter table public.poll_votes enable row level security;
alter table public.doubts enable row level security;

-- Recreate permissive authenticated policies for the supplied single-instructor setup.
do $$ declare t text; begin
  foreach t in array array['profiles','classes','lectures','lecture_progress','messages','polls','poll_votes','doubts'] loop
    execute format('drop policy if exists "PrimezStudy authenticated read %s" on public.%I', t, t);
    execute format('drop policy if exists "PrimezStudy authenticated write %s" on public.%I', t, t);
    execute format('create policy "PrimezStudy authenticated read %s" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "PrimezStudy authenticated write %s" on public.%I for all to authenticated using (true) with check (true)', t, t);
  end loop;
end $$;

insert into storage.buckets (id, name, public) values ('lecture-videos','lecture-videos',true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('recordings','recordings',true) on conflict (id) do nothing;

drop policy if exists "PrimezStudy authenticated storage insert" on storage.objects;
create policy "PrimezStudy authenticated storage insert" on storage.objects for insert to authenticated with check (bucket_id in ('lecture-videos','recordings'));
drop policy if exists "PrimezStudy public storage read" on storage.objects;
create policy "PrimezStudy public storage read" on storage.objects for select using (bucket_id in ('lecture-videos','recordings'));
drop policy if exists "PrimezStudy authenticated storage delete" on storage.objects;
create policy "PrimezStudy authenticated storage delete" on storage.objects for delete to authenticated using (bucket_id in ('lecture-videos','recordings'));

-- Keep XP deterministic: two points per full recorded minute + one point per chat message.
create or replace view public.leaderboard as
with chat as (select sender_name as name, count(*)::int as chat_points from public.messages group by sender_name),
watch as (select coalesce(p.display_name, 'Learner') as name, coalesce(sum(floor(lp.seconds_watched / 60.0)),0)::int * 2 as watch_points from public.lecture_progress lp left join public.profiles p on p.id = lp.user_id group by coalesce(p.display_name, 'Learner'))
select coalesce(chat.name, watch.name) as name, coalesce(watch.watch_points,0) as watch_points, coalesce(chat.chat_points,0) as chat_points, coalesce(watch.watch_points,0) + coalesce(chat.chat_points,0) as points
from chat full outer join watch on chat.name = watch.name;
grant select on public.leaderboard to authenticated;

-- Realtime is optional on an already-configured project; duplicate additions are ignored.
do $$ begin alter publication supabase_realtime add table public.classes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.lectures; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.polls; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.poll_votes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.doubts; exception when duplicate_object then null; end $$;
