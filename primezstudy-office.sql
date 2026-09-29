-- PrimezStudy Office Portal migration. Run after primezstudy-upgrade.sql.
create table if not exists public.office_resources (
 id uuid primary key default gen_random_uuid(), title text not null, period text, category text not null check(category in ('sheet','document')),
 file_url text not null, source_type text not null check(source_type in ('file','drive')), uploaded_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.office_polls (
 id uuid primary key default gen_random_uuid(), question text not null, options jsonb not null, is_open boolean not null default true,
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
create table if not exists public.call_requests (
 id uuid primary key default gen_random_uuid(), student_id uuid references auth.users(id) on delete cascade,
 instructor_id uuid references auth.users(id) on delete set null, topic text not null, status text not null default 'requested' check(status in ('requested','accepted','completed','cancelled')),
 created_at timestamptz not null default now(), started_at timestamptz
);
alter table public.office_resources enable row level security; alter table public.office_polls enable row level security; alter table public.call_requests enable row level security;
do $$ declare t text; begin foreach t in array array['office_resources','office_polls','call_requests'] loop execute format('drop policy if exists "PrimezStudy office read %s" on public.%I',t,t); execute format('drop policy if exists "PrimezStudy office write %s" on public.%I',t,t); execute format('create policy "PrimezStudy office read %s" on public.%I for select to authenticated using (true)',t,t); execute format('create policy "PrimezStudy office write %s" on public.%I for all to authenticated using (true) with check (true)',t,t); end loop; end $$;
insert into storage.buckets (id,name,public) values ('office-files','office-files',true) on conflict (id) do nothing;
drop policy if exists "PrimezStudy office files read" on storage.objects; create policy "PrimezStudy office files read" on storage.objects for select using (bucket_id='office-files');
drop policy if exists "PrimezStudy office files write" on storage.objects; create policy "PrimezStudy office files write" on storage.objects for all to authenticated using (bucket_id='office-files') with check (bucket_id='office-files');
do $$ begin alter publication supabase_realtime add table public.office_resources; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.office_polls; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.call_requests; exception when duplicate_object then null; end $$;
