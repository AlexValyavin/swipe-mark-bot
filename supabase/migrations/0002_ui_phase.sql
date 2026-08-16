-- UI-фаза, Шаг 1/3: масштаб интерфейса + асинхронные bulk-задачи
-- Выполнить в Supabase SQL Editor (идемпотентно).

-- 1. Масштаб интерфейса (S/M/L)
alter table public.user_settings
  add column if not exists ui_scale text not null default 'm'
  check (ui_scale in ('s','m','l'));

-- 2. Асинхронные bulk-задачи (автосортировка, Шаг 3)
create table if not exists public.bulk_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'autosort',
  total int not null default 0,
  done int not null default 0,
  failed int not null default 0,
  status text not null default 'running'
    check (status in ('running','done','error','cancelled')),
  created_at timestamptz not null default now()
);
alter table public.bulk_jobs enable row level security;
create policy "bj_all_own" on public.bulk_jobs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());