-- 0009 — AI Search этап 2: RPC для cosine-поиска по embeddings
-- Применяется вручную в Supabase SQL Editor.

create or replace function public.match_cards(
  p_user_id uuid,
  p_query_embedding vector(768),
  p_match_count int default 20
)
returns table (
  id uuid,
  title text,
  similarity float
)
language sql stable as $$
  select c.id,
         c.title,
         1 - (c.embedding <=> p_query_embedding) as similarity
  from public.cards c
  where c.user_id = p_user_id
    and c.embedding is not null
  order by c.embedding <=> p_query_embedding
  limit greatest(p_match_count, 1);
$$;
