"use client";

import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import { Skeleton } from "@/shared/components/Loading";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

const TYPE_META = [
  { key: "chat", label: "chat", color: "text-blue-500 font-medium" },
  { key: "stt", label: "stt", color: "text-purple-500 font-semibold" },
  { key: "tts", label: "tts", color: "text-pink-500 font-semibold" },
  { key: "image", label: "img", color: "text-amber-500 font-semibold" },
  { key: "video", label: "vid", color: "text-rose-500 font-semibold" },
  { key: "embedding", label: "emb", color: "text-teal-500 font-semibold" },
  { key: "search", label: "search", color: "text-cyan-500 font-semibold" },
  { key: "fetch", label: "fetch", color: "text-indigo-500 font-semibold" },
];

export default function OverviewCards({ stats = {}, loading = false }) {
  if (loading) {
    return (
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i} className="flex min-w-0 flex-col gap-2 px-4 py-3">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-20" />
            {i === 4 && <Skeleton className="h-2.5 w-32 mt-0.5" />}
          </Card>
        ))}
      </div>
    );
  }

  const activeTypes = stats.byType
    ? TYPE_META.filter((m) => (stats.byType[m.key] || 0) > 0).map((m) => ({
        ...m,
        count: stats.byType[m.key],
      }))
    : [];

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:gap-4">
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3 justify-between">
        <div>
          <span className="text-text-muted text-xs uppercase font-semibold tracking-wider">Total Requests</span>
          <div className="truncate text-2xl font-bold">{fmt(stats.totalRequests)}</div>
        </div>
        {activeTypes.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-mono leading-none pt-0.5">
            {activeTypes.map((t, idx) => (
              <span key={t.key} className={t.color} title={`${fmt(t.count)} ${t.key.toUpperCase()} requests`}>
                {idx > 0 && <span className="text-text-muted/50 mr-1.5">·</span>}
                {fmt(t.count)} {t.label}
              </span>
            ))}
          </div>
        )}
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <span className="text-text-muted text-xs uppercase font-semibold tracking-wider">Total Input Tokens</span>
        <span className="truncate text-2xl font-bold text-primary">{fmt(stats.totalPromptTokens)}</span>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <span className="text-text-muted text-xs uppercase font-semibold tracking-wider">Cached Tokens</span>
        <span className="truncate text-2xl font-bold text-info">{fmt(stats.totalCachedTokens)}</span>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <span className="text-text-muted text-xs uppercase font-semibold tracking-wider">Output Tokens</span>
        <span className="truncate text-2xl font-bold text-success">{fmt(stats.totalCompletionTokens)}</span>
      </Card>
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <span className="text-text-muted text-xs uppercase font-semibold tracking-wider">Est. Cost</span>
        <span className="truncate text-2xl font-bold text-warning">~{fmtCost(stats.totalCost)}</span>
        <span className="text-[10px] text-text-muted">Estimated, not actual billing</span>
      </Card>
    </div>
  );
}

OverviewCards.propTypes = {
  stats: PropTypes.object,
  loading: PropTypes.bool,
};
