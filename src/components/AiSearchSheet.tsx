"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, ExternalLink, Loader2, Sparkles } from "lucide-react";
import type { Bookmark } from "@/app/api/bookmarks/route";
import { useI18n } from "@/components/I18nProvider";
import { SourceBadge } from "@/components/SourceBadge";
import { MaterialSheet } from "@/components/MaterialSheet";
import { thumbFor, typeEmoji } from "@/lib/format";

type SearchResponse = {
  q?: string;
  results?: Bookmark[];
  total?: number;
  answer?: string | null;
  quotaExhausted?: boolean;
  blocked?: boolean;
  error?: string;
};

export function AiSearchSheet({
  q,
  onClose,
  onOpen,
}: {
  q: string;
  onClose: () => void;
  onOpen: (b: Bookmark) => void;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [detail, setDetail] = useState<Bookmark | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/search/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q, ask: true }),
        });
        const json = await res.json();
        if (!cancelled) setData(json as SearchResponse);
      } catch {
        if (!cancelled) setData({ error: t("aisearch.error") });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const results = data?.results ?? [];

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-surface sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <span className="flex min-w-0 items-center gap-2">
              <Sparkles className="size-4 shrink-0 text-accent" />
              <span className="truncate text-sm font-semibold text-text">{q}</span>
            </span>
            <button
              onClick={onClose}
              aria-label={t("common.close")}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-bg text-muted"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto hide-scrollbar">
            {/* Loading */}
            {loading && (
              <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
                <Loader2 className="size-6 animate-spin text-accent" />
                <p className="text-sm text-muted">{t("aisearch.thinking")}</p>
              </div>
            )}

            {!loading && (
              <div className="flex flex-col gap-4 p-5">
                {/* Ошибка / blocked */}
                {data?.blocked ? (
                  <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{t("aisearch.blocked")}</p>
                ) : data?.error ? (
                  <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">{data.error}</p>
                ) : null}

                {/* LLM ответ */}
                {data?.answer && (
                  <div className="rounded-2xl bg-bg p-4">
                    <p className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-accent">
                      <Sparkles className="size-3" /> {t("aisearch.answer")}
                    </p>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-text">{data.answer}</p>
                  </div>
                )}
                {data?.quotaExhausted && (
                  <p className="rounded-xl bg-amber-500/10 px-4 py-2.5 text-xs text-amber-400">
                    {t("aisearch.quotaExhausted")} {t("autosort.quotaResets")}
                  </p>
                )}

                {/* Результаты */}
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {t("aisearch.results", { count: results.length })}
                </p>
                {results.length === 0 && !data?.error ? (
                  <p className="text-sm text-muted">{t("library.empty.search")}</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {results.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setDetail(b)}
                        className="flex items-center gap-3 rounded-xl bg-bg p-3 text-left transition-colors hover:bg-line"
                      >
                        <div className="relative size-12 shrink-0 overflow-hidden rounded-lg bg-surface">
                          {thumbFor(b) ? (
                            <img
                              src={thumbFor(b) as string}
                              alt=""
                              className="absolute inset-0 size-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = "none"; }}
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-lg">
                              {typeEmoji(b)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-medium leading-snug text-text">{b.title}</p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                            <SourceBadge bookmark={b} />
                            {(b.aiSummary || b.description) && (
                              <span className="truncate">{(b.aiSummary || b.description)?.slice(0, 60)}</span>
                            )}
                          </div>
                        </div>
                        <ExternalLink
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetail(null);
                            onOpen(b);
                          }}
                          className="size-4 shrink-0 text-accent"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Детальный просмотр результата поверх */}
      {detail && (
        <MaterialSheet
          bookmark={detail}
          onClose={() => setDetail(null)}
          onOpen={(b) => {
            setDetail(null);
            onOpen(b);
          }}
        />
      )}
    </>
  );
}
