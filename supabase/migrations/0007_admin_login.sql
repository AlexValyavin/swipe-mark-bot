-- 0007 — QR-вход в админку (admin_ prefix, отдельная таблица, без user_id)
-- Применяется вручную в Supabase SQL Editor.

create table if not exists public.admin_login_codes (
  code text primary key, -- admin_ + 8 из alphabet
  telegram_id bigint,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.admin_login_codes enable row level security;
-- service_role only, без политик (как meta_cache/app_config)
