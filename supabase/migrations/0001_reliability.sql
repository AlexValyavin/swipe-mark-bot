-- Фаза R, Шаг 0: диагностика + заготовки под медиа-кэш и парсеры
-- Выполнить в Supabase SQL Editor (идемпотентно).

-- 1. Статус обработки метаданных карточки
alter table public.cards
  add column if not exists meta_status text not null default 'pending'
  check (meta_status in ('pending','processing','done','failed'));
alter table public.cards add column if not exists meta_error text;

-- 2. Кэш медиа в Supabase Storage (заготовка под Шаг 1)
alter table public.attachments add column if not exists storage_url text;

-- 3. Кэш результатов парсинга ссылок (заготовка под Шаг 2)
create table if not exists public.meta_cache (
  url_hash text primary key,          -- sha256(canonical_url)
  url text not null,
  provider text,
  data jsonb not null,                -- {title, description, image_url, duration_seconds, author}
  created_at timestamptz not null default now()
);
create index if not exists idx_meta_cache_created on public.meta_cache (created_at);

-- Общий кэш: доступен только service_role (пользовательских политик нет).
alter table public.meta_cache enable row level security;
