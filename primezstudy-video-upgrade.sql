-- PrimezStudy feature upgrade: run after primezstudy-upgrade.sql
alter table public.doubts add column if not exists video_url text;
create table if not exists public.camera_sessions (
  id uuid primary key default gen_random_uuid(), class_id uuid not null references public.classes(id) on delete cascade,
  pairing_code text not null, created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), active boolean not null default true
);
alter table public.camera_sessions enable row level security;
drop policy if exists "PrimezStudy camera sessions read" on public.camera_sessions;
create policy "PrimezStudy camera sessions read" on public.camera_sessions for select to authenticated using (true);
drop policy if exists "PrimezStudy camera sessions write" on public.camera_sessions;
create policy "PrimezStudy camera sessions write" on public.camera_sessions for all to authenticated using (true) with check (true);
insert into storage.buckets (id, name, public) values ('doubt-videos','doubt-videos',true) on conflict (id) do nothing;
drop policy if exists "PrimezStudy doubt video insert" on storage.objects;
create policy "PrimezStudy doubt video insert" on storage.objects for insert to authenticated with check (bucket_id = 'doubt-videos');
drop policy if exists "PrimezStudy doubt video read" on storage.objects;
create policy "PrimezStudy doubt video read" on storage.objects for select using (bucket_id = 'doubt-videos');
drop policy if exists "PrimezStudy doubt video delete" on storage.objects;
create policy "PrimezStudy doubt video delete" on storage.objects for delete to authenticated using (bucket_id = 'doubt-videos');
do $$ begin alter publication supabase_realtime add table public.camera_sessions; exception when duplicate_object then null; end $$;
