-- PrimezStudy XP + Leaderboard upgrade
-- Run after the main PrimezStudy schema in Supabase SQL Editor.
-- Safe to run more than once.

create extension if not exists pgcrypto;

-- 1. Profiles and role access ------------------------------------------------
alter table if exists public.profiles add column if not exists role text not null default 'student';
alter table if exists public.profiles add column if not exists avatar_url text;
alter table if exists public.profiles add column if not exists xp_override integer not null default 0;
alter table if exists public.profiles add column if not exists streak_days integer not null default 0;
alter table if exists public.profiles add column if not exists last_activity_date date;

alter table if exists public.profiles drop constraint if exists profiles_role_check;
alter table if exists public.profiles add constraint profiles_role_check check (role in ('student','instructor','admin'));

-- Keep role management server/admin controlled. Students can read profiles and edit only their own safe fields.
drop policy if exists "Anyone can read profiles" on public.profiles;
create policy "Anyone can read profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- 2. Explicit XP events -----------------------------------------------------
create table if not exists public.xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  points integer not null check (points > 0),
  reason text not null,
  reference_type text,
  reference_id text,
  created_at timestamptz not null default now()
);
alter table public.xp_events enable row level security;
drop policy if exists "Users can read XP events" on public.xp_events;
create policy "Users can read XP events" on public.xp_events for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can add own XP events" on public.xp_events;
create policy "Users can add own XP events" on public.xp_events for insert to authenticated with check (auth.uid() = user_id);
create index if not exists xp_events_user_created_idx on public.xp_events(user_id, created_at desc);

-- 3. Attendance and streak source ------------------------------------------
create table if not exists public.class_attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  minutes_attended integer not null default 0 check (minutes_attended >= 0),
  unique(user_id, class_id)
);
alter table public.class_attendance enable row level security;
drop policy if exists "Users can read own attendance" on public.class_attendance;
create policy "Users can read own attendance" on public.class_attendance for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can write own attendance" on public.class_attendance;
create policy "Users can write own attendance" on public.class_attendance for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own attendance" on public.class_attendance;
create policy "Users can update own attendance" on public.class_attendance for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists attendance_user_idx on public.class_attendance(user_id, joined_at desc);

-- 4. Streak updater ---------------------------------------------------------
create or replace function public.update_profile_streak()
returns trigger language plpgsql security invoker as $$
begin
  update public.profiles
  set streak_days = case
    when last_activity_date = current_date then streak_days
    when last_activity_date = current_date - 1 then streak_days + 1
    else 1
  end,
  last_activity_date = current_date,
  updated_at = now()
  where id = new.user_id;
  return new;
end;
$$;
drop trigger if exists attendance_streak_trigger on public.class_attendance;
create trigger attendance_streak_trigger after insert or update on public.class_attendance for each row execute function public.update_profile_streak();
drop trigger if exists progress_streak_trigger on public.lecture_progress;
create trigger progress_streak_trigger after insert or update on public.lecture_progress for each row execute function public.update_profile_streak();

-- 5. Ranked leaderboard -----------------------------------------------------
-- XP rules: 2 per complete lecture minute, explicit XP events, 1 per poll vote,
-- 5 per attended class, plus optional admin xp_override.
drop view if exists public.leaderboard;
create view public.leaderboard as
with watch as (
  select user_id, (coalesce(sum(floor(seconds_watched / 60.0)),0)::integer * 2) as watch_points
  from public.lecture_progress group by user_id
), events as (
  select user_id, coalesce(sum(points),0)::integer as event_points
  from public.xp_events group by user_id
), votes as (
  select voter_id::uuid as user_id, count(*)::integer as poll_points
  from public.poll_votes
  where voter_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  group by voter_id
), attendance as (
  select user_id, (count(*) * 5 + coalesce(sum(floor(minutes_attended / 15.0)),0))::integer as attendance_points
  from public.class_attendance group by user_id
)
select
  row_number() over(order by (coalesce(w.watch_points,0)+coalesce(e.event_points,0)+coalesce(v.poll_points,0)+coalesce(a.attendance_points,0)+coalesce(p.xp_override,0)) desc, coalesce(p.display_name,'Learner'))::integer as rank,
  p.id as user_id,
  coalesce(nullif(p.display_name,''),'Learner') as name,
  coalesce(w.watch_points,0)::integer as watch_points,
  coalesce(e.event_points,0)::integer as event_points,
  coalesce(v.poll_points,0)::integer as poll_points,
  coalesce(a.attendance_points,0)::integer as attendance_points,
  coalesce(p.xp_override,0)::integer as xp_override,
  coalesce(w.watch_points,0)+coalesce(e.event_points,0)+coalesce(v.poll_points,0)+coalesce(a.attendance_points,0)+coalesce(p.xp_override,0) as points,
  coalesce(p.streak_days,0)::integer as streak_days,
  p.role
from public.profiles p
left join watch w on w.user_id=p.id
left join events e on e.user_id=p.id
left join votes v on v.user_id=p.id
left join attendance a on a.user_id=p.id
order by points desc, name asc;

grant select on public.leaderboard to authenticated;

-- Useful summary view for dashboards.
drop view if exists public.student_xp_summary;
create view public.student_xp_summary as select * from public.leaderboard where role='student';
grant select on public.student_xp_summary to authenticated;

-- 6. Realtime for native/web refresh ---------------------------------------
do $$ begin alter publication supabase_realtime add table public.xp_events; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.class_attendance; exception when duplicate_object then null; end $$;

-- 7. Helpful indexes --------------------------------------------------------
create index if not exists lecture_progress_user_idx on public.lecture_progress(user_id);
create index if not exists poll_votes_voter_idx on public.poll_votes(voter_id);

-- Verification queries (optional):
-- select * from public.leaderboard limit 20;
-- select * from public.student_xp_summary limit 20;
-- select role, count(*) from public.profiles group by role;
