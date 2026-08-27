"use client";

import PropTypes from "prop-types";
import Card from "@/shared/components/Card";
import { Skeleton } from "@/shared/components/Loading";

const fmt = (n) => new Intl.NumberFormat().format(n || 0);
const fmtCost = (n) => `$${(n || 0).toFixed(2)}`;

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

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 sm:gap-4">
      <Card className="flex min-w-0 flex-col gap-1 px-4 py-3">
        <span className="text-text-muted text-xs uppercase font-semibold tracking-wider">Total Requests</span>
        <span className="truncate text-2xl font-bold">{fmt(stats.totalRequests)}</span>
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
