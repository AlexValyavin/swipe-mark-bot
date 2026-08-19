-- Фаза локализации: язык интерфейса (ru/en).
-- Выполнить в Supabase SQL Editor (идемпотентно).

alter table public.user_settings
  add column if not exists lang text not null default 'ru';

-- Ограничение на допустимые значения (обновить при добавлении новых языков)
alter table public.user_settings
  drop constraint if exists user_settings_lang_check;

alter table public.user_settings
  add constraint user_settings_lang_check check (lang in ('ru', 'en'));