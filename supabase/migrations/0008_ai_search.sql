-- 0008 — AI Search этап 1: FTS-фундамент + pgvector индекс + kind='search' в квоте
-- Применяется вручную в Supabase SQL Editor (идемпотентно).
-- Требует расширения vector (уже включены при инициализации: vector/pg_trgm/pgcrypto).

-- 1. FTS: генерируемая tsvector колонка по title + text + ai_summary (русский язык)
alter table public.cards add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('russian',
      coalesce(title,'') || ' ' ||
      coalesce(text,'') || ' ' ||
      coalesce(ai_summary,'') || ' ' ||
      coalesce((
        select string_agg(cl.og_title || ' ' || coalesce(cl.og_description,''), ' ')
        from public.card_links cl where cl.card_id = public.cards.id
      ), '')
    )
  ) stored;

create index if not exists idx_cards_fts on public.cards using gin (search_vector);

-- 2. pgvector: HNSW индекс для cosine-поиска (лучше IVFFlat на малых данных)
create index if not exists idx_cards_embedding_hnsw
  on public.cards using hnsw (embedding vector_cosine_ops);

-- 3. Квота: новый тип операции 'search' (AI-вопросы, free 20/мес)
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check
  check (kind in ('autosort','summary','search'));
