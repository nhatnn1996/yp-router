"use client";

import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Card from "@/shared/components/Card";
import { fmt } from "@/app/(dashboard)/dashboard/usage/components/UsageTable";

const PALETTE = [
  "#6366f1", // Indigo
  "#10b981", // Emerald
  "#3b82f6", // Blue
  "#f59e0b", // Amber
  "#ec4899", // Pink
  "#8b5cf6", // Purple
  "#14b8a6", // Teal
  "#f97316", // Orange
];

const fmtTokens = (n) => {
  if (!n) return "0";
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
};

const fmtCost = (n) => `$${(n || 0).toFixed(4)}`;

export default function ModelDistributionCard({ stats = {} }) {
  const [metric, setMetric] = useState("tokens"); // "tokens" | "requests" | "cost"

  // Process top models
  const { topModels, totalMetric, cacheStats } = useMemo(() => {
    const byModel = stats.byModel || {};
    const modelList = Object.entries(byModel).map(([key, data]) => {
      const totalTokens = (data.promptTokens || 0) + (data.completionTokens || 0);
      return {
        name: data.rawModel || key,
        provider: data.provider || "",
        tokens: totalTokens,
        requests: data.requests || 0,
        cost: data.cost || 0,
        cachedTokens: data.cachedTokens || 0,
      };
    });

    // Sort by selected metric
    modelList.sort((a, b) => (b[metric] || 0) - (a[metric] || 0));

    const totalVal = modelList.reduce((acc, m) => acc + (m[metric] || 0), 0);

    // Take top 5, bucket the rest into "Other"
    const top = modelList.slice(0, 5);
    const other = modelList.slice(5);

    const result = top.map((m, idx) => ({
      ...m,
      value: m[metric] || 0,
      color: PALETTE[idx % PALETTE.length],
      percent: totalVal > 0 ? (((m[metric] || 0) / totalVal) * 100).toFixed(1) : 0,
    }));

    if (other.length > 0) {
      const otherVal = other.reduce((acc, m) => acc + (m[metric] || 0), 0);
      if (otherVal > 0) {
        result.push({
          name: "Other Models",
          provider: `${other.length} models`,
          tokens: other.reduce((acc, m) => acc + m.tokens, 0),
          requests: other.reduce((acc, m) => acc + m.requests, 0),
          cost: other.reduce((acc, m) => acc + m.cost, 0),
          value: otherVal,
          color: "#94a3b8",
          percent: totalVal > 0 ? ((otherVal / totalVal) * 100).toFixed(1) : 0,
        });
      }
    }

    // Cache metrics
    const totalPrompt = stats.totalPromptTokens || 0;
    const totalCached = stats.totalCachedTokens || 0;
    const cacheHitRatio = totalPrompt > 0 ? ((totalCached / totalPrompt) * 100).toFixed(1) : "0";

    return {
      topModels: result,
      totalMetric: totalVal,
      cacheStats: {
        totalCached,
        totalPrompt,
        cacheHitRatio,
      },
    };
  }, [stats, metric]);

  const hasData = topModels.length > 0 && totalMetric > 0;

  return (
    <Card className="flex min-w-0 flex-col gap-4 overflow-hidden" padding="md" style={{ minHeight: 480 }}>
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-[20px]">donut_small</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-main">Model & Cache Analytics</h3>
            <p className="text-xs text-text-muted">Usage breakdown and caching efficiency</p>
          </div>
        </div>

        {/* Metric Selector */}
        <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-subtle p-1 self-start sm:self-auto">
          <button
            onClick={() => setMetric("tokens")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${metric === "tokens" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
          >
            Tokens
          </button>
          <button
            onClick={() => setMetric("requests")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${metric === "requests" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
          >
            Requests
          </button>
          <button
            onClick={() => setMetric("cost")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${metric === "cost" ? "bg-primary text-white shadow-sm" : "text-text-muted hover:text-text hover:bg-bg-hover"}`}
          >
            Cost
          </button>
        </div>
      </div>

      {/* Main Grid: Chart + Model Breakdown + Cache Ratio */}
      {!hasData ? (
        <div className="flex-1 flex items-center justify-center text-text-muted text-sm py-12">
          No model usage data recorded for this period.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center flex-1">
          {/* Left: Donut Chart (5 cols) */}
          <div className="md:col-span-5 flex flex-col items-center justify-center relative min-h-[220px]">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={topModels}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={88}
                  paddingAngle={3}
                  dataKey="value"
                  stroke="none"
                >
                  {topModels.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="rounded-lg border border-border bg-surface p-2.5 shadow-xl text-xs font-medium">
                          <div className="font-semibold text-text-main flex items-center gap-1.5 mb-1">
                            <span className="size-2 rounded-full" style={{ backgroundColor: d.color }} />
                            {d.name}
                          </div>
                          <div className="text-text-muted">
                            Share: <span className="text-text-main font-bold">{d.percent}%</span>
                          </div>
                          <div className="text-text-muted">
                            {metric === "tokens" && `Tokens: ${fmtTokens(d.tokens)}`}
                            {metric === "requests" && `Requests: ${fmt(d.requests)}`}
                            {metric === "cost" && `Cost: ${fmtCost(d.cost)}`}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Center Label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xs text-text-muted font-medium uppercase tracking-wider">Top Share</span>
              <span className="text-base font-bold text-text-main">
                {topModels[0]?.percent || 0}%
              </span>
              <span className="text-[10px] text-text-muted truncate max-w-[90px]" title={topModels[0]?.name}>
                {topModels[0]?.name || ""}
              </span>
            </div>
          </div>

          {/* Right: Model Legend & Share Bars (7 cols) */}
          <div className="md:col-span-7 flex flex-col gap-2.5 justify-center">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Top Models Breakdown</span>
            <div className="flex flex-col gap-2">
              {topModels.map((item, idx) => (
                <div key={idx} className="flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <span className="font-mono text-text-main font-medium truncate" title={item.name}>
                        {item.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-medium">
                      <span className="text-text-muted">
                        {metric === "tokens" && fmtTokens(item.tokens)}
                        {metric === "requests" && `${fmt(item.requests)} reqs`}
                        {metric === "cost" && fmtCost(item.cost)}
                      </span>
                      <span className="text-text-main font-semibold min-w-[36px] text-right">
                        {item.percent}%
                      </span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="w-full bg-bg-subtle h-1.5 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(2, item.percent)}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Insights Banner: Prompt Caching & Quick Stats */}
      <div className="mt-auto pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
        {/* Cache Hit Ratio */}
        <div className="flex items-center gap-2.5 rounded-lg bg-bg-subtle/80 p-2 border border-border/50">
          <div className="size-7 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[16px]">bolt</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-text-muted uppercase font-semibold">Cache Hit Rate</span>
            <span className="text-xs font-bold text-emerald-500 font-mono">
              {cacheStats.cacheHitRatio}%
              <span className="text-[10px] font-normal text-text-muted ml-1">
                ({fmtTokens(cacheStats.totalCached)} tok)
              </span>
            </span>
          </div>
        </div>

        {/* Active Requests */}
        <div className="flex items-center gap-2.5 rounded-lg bg-bg-subtle/80 p-2 border border-border/50">
          <div className="size-7 rounded-md bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[16px]">sync</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-text-muted uppercase font-semibold">In-Flight Requests</span>
            <span className="text-xs font-bold text-text-main font-mono">
              {(stats.activeRequests || []).reduce((sum, r) => sum + (r.count || 0), 0)} active
            </span>
          </div>
        </div>

        {/* Total Cost / Volume summary */}
        <div className="flex items-center gap-2.5 rounded-lg bg-bg-subtle/80 p-2 border border-border/50">
          <div className="size-7 rounded-md bg-purple-500/10 text-purple-500 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[16px]">payments</span>
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-text-muted uppercase font-semibold">Total Cost</span>
            <span className="text-xs font-bold text-text-main font-mono">
              {fmtCost(stats.totalCost)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}

ModelDistributionCard.propTypes = {
  stats: PropTypes.object,
};
