-- 0006 — admin scaffold: plans, global AI config, quota skeleton, audit log
-- Применяется вручную в Supabase SQL Editor (идемпотентно).

-- 1. Планы на профиле (admin остаётся env OWNER_TELEGRAM_ID, не в БД)
alter table public.profiles add column if not exists plan text not null default 'free'
  check (plan in ('free','beta','pro','blocked'));
alter table public.profiles add column if not exists plan_until timestamptz;

-- 2. Глобальный AI-конфиг (service_role only, без RLS-политик как meta_cache)
create table if not exists public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;

-- 3. Каркас учёта ИИ (пока только для отображения 18/50 3/10, без блокировки)
create table if not exists public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('autosort','summary')),
  card_id uuid references public.cards(id) on delete set null,
  status text not null default 'reserved' check (status in ('reserved','success','failed')),
  model text,
  prompt_tokens int,
  completion_tokens int,
  cost_usd numeric,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_usage_user_kind_month on public.ai_usage (user_id, kind, created_at);

-- 4. Журнал админ-действий
create table if not exists public.admin_log (
  id uuid primary key default gen_random_uuid(),
  actor_tg bigint not null,
  actor_user_id uuid,
  action text not null,
  target_user_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_log_created on public.admin_log (created_at desc);
alter table public.admin_log enable row level security;
