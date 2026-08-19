-- Продуктовая фаза, Шаг 4: онбординг.
-- Выполнить в Supabase SQL Editor (идемпотентно).

-- Флаг «онбординг пройден» (первое открытие Mini App)
alter table public.user_settings
  add column if not exists onboarded boolean not null default false;