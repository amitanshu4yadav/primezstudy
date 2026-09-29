-- PrimezStudy batches + enrollments + Razorpay test-mode payments
-- Run after schema.sql / primezstudy-upgrade.sql in Supabase SQL Editor.
-- Safe to re-run.

create extension if not exists pgcrypto;

create table if not exists public.batches (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  description text,
  instructor text not null,
  cover_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  price_inr integer not null default 0 check (price_inr >= 0),
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.batch_enrollments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','pending','cancelled')),
  payment_id text,
  order_id text,
  enrolled_at timestamptz not null default now(),
  unique(batch_id, user_id)
);

create table if not exists public.batch_payments (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.batches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_payment_id text,
  provider_order_id text,
  amount_inr integer not null check (amount_inr > 0),
  status text not null default 'created' check (status in ('created','authorized','captured','failed','verification_pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.batches enable row level security;
alter table public.batch_enrollments enable row level security;
alter table public.batch_payments enable row level security;

drop policy if exists "Published batches are visible" on public.batches;
create policy "Published batches are visible" on public.batches for select to authenticated using (is_published = true or created_by = auth.uid());
drop policy if exists "Staff can manage batches" on public.batches;
create policy "Staff can manage batches" on public.batches for all to authenticated using (true) with check (true);

drop policy if exists "Users can read own enrollments" on public.batch_enrollments;
create policy "Users can read own enrollments" on public.batch_enrollments for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users can enroll themselves" on public.batch_enrollments;
create policy "Users can enroll themselves" on public.batch_enrollments for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users can update own enrollment" on public.batch_enrollments;
create policy "Users can update own enrollment" on public.batch_enrollments for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Staff can manage enrollments" on public.batch_enrollments;
create policy "Staff can manage enrollments" on public.batch_enrollments for all to authenticated using (true) with check (true);

drop policy if exists "Users can read own payments" on public.batch_payments;
create policy "Users can read own payments" on public.batch_payments for select to authenticated using (user_id = auth.uid());
drop policy if exists "Users can create own payments" on public.batch_payments;
create policy "Users can create own payments" on public.batch_payments for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Users can update own payments" on public.batch_payments;
create policy "Users can update own payments" on public.batch_payments for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Staff can manage payments" on public.batch_payments;
create policy "Staff can manage payments" on public.batch_payments for all to authenticated using (true) with check (true);

create index if not exists batches_published_idx on public.batches(is_published, starts_at);
create index if not exists batch_enrollments_user_idx on public.batch_enrollments(user_id, status);
create index if not exists batch_payments_user_idx on public.batch_payments(user_id, created_at desc);

create or replace function public.touch_batch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
drop trigger if exists batches_touch_updated_at on public.batches;
create trigger batches_touch_updated_at before update on public.batches for each row execute function public.touch_batch_updated_at();
drop trigger if exists batch_payments_touch_updated_at on public.batch_payments;
create trigger batch_payments_touch_updated_at before update on public.batch_payments for each row execute function public.touch_batch_updated_at();
