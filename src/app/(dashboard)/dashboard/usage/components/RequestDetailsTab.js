"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { fetcher, SWR_CONFIG } from "@/shared/utils/fetcher";
import Card from "@/shared/components/Card";
import Button from "@/shared/components/Button";
import Badge from "@/shared/components/Badge";
import Drawer from "@/shared/components/Drawer";
import Pagination from "@/shared/components/Pagination";
import { Skeleton } from "@/shared/components/Loading";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { cn } from "@/shared/utils/cn";
import { AI_PROVIDERS } from "@/shared/constants/providers";

function getCachedTokens(tokens) {
  return tokens?.cached_tokens || tokens?.cache_read_input_tokens || 0;
}

function getInputTokens(tokens) {
  const prompt = tokens?.prompt_tokens || tokens?.input_tokens || 0;
  const cache = getCachedTokens(tokens);
  return prompt < cache ? cache : prompt;
}

function formatTokens(n) {
  if (n == null || Number.isNaN(n)) return "0";
  return new Intl.NumberFormat().format(n);
}

function formatLatency(ms) {
  if (ms == null || ms === 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function maskApiKey(key) {
  if (!key || typeof key !== "string") return "";
  if (key.length <= 12) return key;
  return `${key.slice(0, 7)}...${key.slice(-4)}`;
}

function formatRelativeTime(dateString) {
  if (!dateString) return "—";
  const now = Date.now();
  const diff = Math.max(0, now - new Date(dateString).getTime());
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function CodeBlock({ title, icon, content, defaultOpen = false, rawJson = null, badge = null }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const { copied, copy } = useCopyToClipboard();

  const formattedContent = useMemo(() => {
    if (typeof content === "object") {
      try {
        return JSON.stringify(content, null, 2);
      } catch {
        return String(content);
      }
    }
    return content || "";
  }, [content]);

  const lineCount = useMemo(() => {
    if (!formattedContent) return 0;
    return formattedContent.split("\n").length;
  }, [formattedContent]);

  return (
    <div className="rounded-xl border border-border/80 bg-surface overflow-hidden shadow-[var(--shadow-soft)] transition-all">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 bg-bg-subtle/40 hover:bg-bg-hover transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-[16px] text-primary shrink-0">{icon}</span>
          <span className="text-xs font-semibold text-text tracking-tight">{title}</span>
          {badge && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              {badge}
            </span>
          )}
          {lineCount > 0 && (
            <span className="text-[10px] font-mono text-text-muted bg-bg px-1.5 py-0.5 rounded border border-border">
              {lineCount} lines
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isOpen && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                copy(rawJson ? JSON.stringify(rawJson, null, 2) : formattedContent);
              }}
              className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text px-2 py-0.5 rounded bg-surface hover:bg-bg-hover border border-border transition-colors font-medium"
              title="Copy payload"
            >
              <span className="material-symbols-outlined text-[13px]">
                {copied ? "check" : "content_copy"}
              </span>
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          )}
          <span className="material-symbols-outlined text-[18px] text-text-muted transition-transform">
            {isOpen ? "expand_less" : "expand_more"}
          </span>
        </div>
      </button>

      {isOpen && (
        <div className="p-3.5 bg-bg border-t border-border/80 overflow-x-auto">
          <pre className="font-mono text-xs text-text leading-relaxed select-all max-h-[380px] overflow-y-auto custom-scrollbar">
            {formattedContent || <span className="text-text-muted italic">[Empty Payload]</span>}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function RequestDetailsTab() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [providerFilter, setProviderFilter] = useState("");
  const [apiKeyFilter, setApiKeyFilter] = useState(() => searchParams.get("key") || searchParams.get("apiKey") || "");
  const [statusFilter, setStatusFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const { copied: copiedId, copy: copyId } = useCopyToClipboard();

  useEffect(() => {
    const k = searchParams.get("key") || searchParams.get("apiKey") || "";
    if (k !== apiKeyFilter) {
      setApiKeyFilter(k);
    }
  }, [searchParams]);

  // SWR: Providers list & API keys
  const { data: providersData } = useSWR("/api/usage/providers", fetcher, SWR_CONFIG);
  const { data: nodesData } = useSWR("/api/provider-nodes", fetcher, SWR_CONFIG);
  const { data: keysData } = useSWR("/api/keys", fetcher, SWR_CONFIG);

  const keys = keysData?.keys || [];

  const keyNameMap = useMemo(() => {
    const map = {};
    for (const k of keys) {
      if (k.key && k.name) map[k.key] = k.name;
    }
    return map;
  }, [keys]);

  const providerNameMap = useMemo(() => {
    const map = {};
    for (const [id, cfg] of Object.entries(AI_PROVIDERS)) {
      map[id] = cfg.name || id;
    }
    for (const node of nodesData?.nodes || []) {
      if (node.id && node.name) map[node.id] = node.name;
    }
    return map;
  }, [nodesData]);

  // Build query string for request-details
  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: page.toString(),
      pageSize: pageSize.toString(),
    });
    if (providerFilter) params.set("provider", providerFilter);
    if (apiKeyFilter) params.set("apiKey", apiKeyFilter);
    if (statusFilter) params.set("status", statusFilter);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return params.toString();
  }, [page, pageSize, providerFilter, apiKeyFilter, statusFilter, startDate, endDate]);

  // SWR: Request Details with instant memory caching
  const {
    data: detailsData,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(`/api/usage/request-details?${queryString}`, fetcher, {
    ...SWR_CONFIG,
    refreshInterval: 10000,
  });

  const rawDetails = detailsData?.details || [];
  const pagination = detailsData?.pagination || { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 };

  // Filter by model/ID/API Key client-side for instant responsive typing
  const filteredDetails = useMemo(() => {
    if (!modelFilter.trim()) return rawDetails;
    const q = modelFilter.toLowerCase().trim();
    return rawDetails.filter(
      (d) =>
        (d.model && d.model.toLowerCase().includes(q)) ||
        (d.id && d.id.toLowerCase().includes(q)) ||
        (d.provider && d.provider.toLowerCase().includes(q)) ||
        (d.apiKey && d.apiKey.toLowerCase().includes(q)) ||
        (d.apiKey && keyNameMap[d.apiKey]?.toLowerCase().includes(q))
    );
  }, [rawDetails, modelFilter, keyNameMap]);

  // Summary Metrics calculated from loaded items for Cloudflare-style header stats
  const metrics = useMemo(() => {
    const list = rawDetails;
    const count = pagination.totalItems || list.length;
    let totalPrompt = 0;
    let totalCompletion = 0;
    let totalLatency = 0;
    let successCount = 0;

    for (const d of list) {
      const p = getInputTokens(d.tokens);
      const c = d.tokens?.completion_tokens || 0;
      totalPrompt += p;
      totalCompletion += c;
      totalLatency += d.latency?.total || 0;
      const ok = d.status === "success" || d.status === 200 || !d.status;
      if (ok) successCount++;
    }

    const avgLatency = list.length ? Math.round(totalLatency / list.length) : 0;
    const successRate = list.length ? Math.round((successCount / list.length) * 100) : 100;

    return {
      count,
      totalPrompt,
      totalCompletion,
      totalTokens: totalPrompt + totalCompletion,
      avgLatency,
      successRate,
    };
  }, [rawDetails, pagination.totalItems]);

  const handleViewDetail = (detail) => {
    setSelectedDetail(detail);
    setIsDrawerOpen(true);
  };

  const handleKeyFilterChange = (val) => {
    setApiKeyFilter(val);
    setPage(1);
    const params = new URLSearchParams(searchParams);
    if (val) {
      params.set("key", val);
    } else {
      params.delete("key");
      params.delete("apiKey");
    }
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  const handleClearFilters = () => {
    setProviderFilter("");
    setApiKeyFilter("");
    setStatusFilter("");
    setModelFilter("");
    setStartDate("");
    setEndDate("");
    setPage(1);
    const params = new URLSearchParams(searchParams);
    params.delete("key");
    params.delete("apiKey");
    router.push(`/dashboard/usage?${params.toString()}`, { scroll: false });
  };

  const selectedKeyName = useMemo(() => {
    if (!apiKeyFilter) return null;
    if (apiKeyFilter === "local-no-key") return "Local Only";
    const found = keys.find((k) => k.key === apiKeyFilter);
    return found ? `${found.name} (${maskApiKey(found.key)})` : maskApiKey(apiKeyFilter);
  }, [apiKeyFilter, keys]);

  const hasActiveFilters = Boolean(providerFilter || apiKeyFilter || statusFilter || modelFilter || startDate || endDate);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* ─── Cloudflare Style Top Telemetry Strip ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border/80 bg-surface px-4 py-3 shadow-[var(--shadow-soft)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Requests</span>
            <span className="material-symbols-outlined text-[18px] text-primary/70">sync_alt</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-text">{formatTokens(metrics.count)}</span>
            {hasActiveFilters && (
              <span className="text-[10px] text-primary font-medium bg-primary/10 px-1.5 py-0.5 rounded">
                filtered
              </span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-surface px-4 py-3 shadow-[var(--shadow-soft)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Success Rate</span>
            <span className="material-symbols-outlined text-[18px] text-success/70">check_circle</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={cn("text-xl font-bold font-mono", metrics.successRate >= 98 ? "text-success" : "text-warning")}>
              {metrics.successRate}%
            </span>
            <span className="text-[11px] text-text-muted font-normal">healthy</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-surface px-4 py-3 shadow-[var(--shadow-soft)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Avg Duration</span>
            <span className="material-symbols-outlined text-[18px] text-info/70">timer</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-bold font-mono text-text">{formatLatency(metrics.avgLatency)}</span>
          </div>
        </div>

        <div className="rounded-xl border border-border/80 bg-surface px-4 py-3 shadow-[var(--shadow-soft)] flex flex-col justify-between">
          <div className="flex items-center justify-between text-text-muted">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Volume</span>
            <span className="material-symbols-outlined text-[18px] text-purple-500/70">token</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold font-mono text-text">{formatTokens(metrics.totalTokens)}</span>
            <span className="text-[10px] font-mono text-text-muted">
              ({formatTokens(metrics.totalPrompt)} in / {formatTokens(metrics.totalCompletion)} out)
            </span>
          </div>
        </div>
      </div>

      {/* ─── Cloudflare Style Filter Toolbar ─── */}
      <div className="rounded-xl border border-border/80 bg-surface p-3.5 shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3">
          {/* Main Controls Row */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
            {/* Quick Search */}
            <div className="relative flex-1 min-w-[220px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-text-muted pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                placeholder="Search model, request ID, or key..."
                className="h-9 w-full rounded-lg border border-border/80 bg-bg-subtle/50 pl-9 pr-8 text-xs text-text placeholder:text-text-muted/70 focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
              />
              {modelFilter && (
                <button
                  type="button"
                  onClick={() => setModelFilter("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text p-0.5 rounded"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              )}
            </div>

            {/* Filter Dropdowns */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex items-center gap-2">
              {/* API Key Selector */}
              <div className="relative min-w-[170px]">
                <select
                  id="api-key-filter"
                  value={apiKeyFilter}
                  onChange={(e) => handleKeyFilterChange(e.target.value)}
                  className={cn(
                    "h-9 w-full appearance-none rounded-lg border px-3 pr-8 text-xs font-medium focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer",
                    apiKeyFilter
                      ? "border-primary/50 bg-primary/5 text-primary font-semibold"
                      : "border-border/80 bg-bg-subtle/50 text-text"
                  )}
                  style={{ colorScheme: "auto" }}
                >
                  <option value="">All API Keys ({keys.length})</option>
                  <option value="local-no-key">Local (No API Key)</option>
                  {keys.map((k) => (
                    <option key={k.id || k.key} value={k.key}>
                      {k.name} ({maskApiKey(k.key)})
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-text-muted pointer-events-none">
                  expand_more
                </span>
              </div>

              {/* Provider Selector */}
              <div className="relative min-w-[150px]">
                <select
                  id="provider-filter"
                  value={providerFilter}
                  onChange={(e) => {
                    setProviderFilter(e.target.value);
                    setPage(1);
                  }}
                  className={cn(
                    "h-9 w-full appearance-none rounded-lg border px-3 pr-8 text-xs font-medium focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer",
                    providerFilter
                      ? "border-primary/50 bg-primary/5 text-primary font-semibold"
                      : "border-border/80 bg-bg-subtle/50 text-text"
                  )}
                  style={{ colorScheme: "auto" }}
                >
                  <option value="">All Providers ({providersData?.providers?.length || 0})</option>
                  {(providersData?.providers || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || providerNameMap[p.id] || p.id}
                    </option>
                  ))}
                </select>
                <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-text-muted pointer-events-none">
                  expand_more
                </span>
              </div>

              {/* Status Selector */}
              <div className="relative min-w-[120px]">
                <select
                  id="status-filter"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className={cn(
                    "h-9 w-full appearance-none rounded-lg border px-3 pr-8 text-xs font-medium focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer",
                    statusFilter
                      ? "border-primary/50 bg-primary/5 text-primary font-semibold"
                      : "border-border/80 bg-bg-subtle/50 text-text"
                  )}
                  style={{ colorScheme: "auto" }}
                >
                  <option value="">All Statuses</option>
                  <option value="success">200 OK</option>
                  <option value="error">Errors</option>
                </select>
                <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-[16px] text-text-muted pointer-events-none">
                  expand_more
                </span>
              </div>
            </div>

            {/* Actions: Refresh & Reset */}
            <div className="flex items-center gap-2 ml-auto shrink-0">
              <button
                type="button"
                onClick={() => mutate()}
                disabled={isValidating}
                className="h-9 inline-flex items-center gap-1.5 px-3 rounded-lg border border-border/80 bg-bg-subtle/50 hover:bg-bg-hover hover:border-border text-xs font-medium text-text transition-all"
                title="Refresh requests feed"
              >
                <span className={cn("material-symbols-outlined text-[15px]", isValidating ? "animate-spin text-primary" : "text-text-muted")}>
                  refresh
                </span>
                <span className="hidden sm:inline">{isValidating ? "Updating..." : "Live"}</span>
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </button>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="h-9 px-2.5 rounded-lg border border-danger/30 bg-danger/5 hover:bg-danger/10 text-danger text-xs font-medium transition-all"
                  title="Clear all active filters"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Active Filter Chips Strip */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/60 text-xs">
              <span className="text-[11px] font-semibold text-text-muted uppercase tracking-wider mr-1">Active filters:</span>
              
              {apiKeyFilter && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full text-xs font-medium">
                  <span className="material-symbols-outlined text-[13px]">vpn_key</span>
                  <span>{selectedKeyName}</span>
                  <button
                    type="button"
                    onClick={() => handleKeyFilterChange("")}
                    className="hover:text-danger ml-0.5"
                  >
                    ×
                  </button>
                </span>
              )}

              {providerFilter && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full text-xs font-medium">
                  <span>Provider: {providerNameMap[providerFilter] || providerFilter}</span>
                  <button
                    type="button"
                    onClick={() => setProviderFilter("")}
                    className="hover:text-danger ml-0.5"
                  >
                    ×
                  </button>
                </span>
              )}

              {statusFilter && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full text-xs font-medium">
                  <span>Status: {statusFilter === "success" ? "200 OK" : "Errors"}</span>
                  <button
                    type="button"
                    onClick={() => setStatusFilter("")}
                    className="hover:text-danger ml-0.5"
                  >
                    ×
                  </button>
                </span>
              )}

              {modelFilter && (
                <span className="inline-flex items-center gap-1.5 bg-bg-subtle text-text border border-border px-2 py-0.5 rounded-full text-xs font-medium">
                  <span>Query: &ldquo;{modelFilter}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => setModelFilter("")}
                    className="hover:text-danger ml-0.5"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ─── Cloudflare Style Data Table ─── */}
      <Card className="overflow-hidden border border-border/80 bg-surface p-0 shadow-[var(--shadow-soft)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border/80 bg-bg-subtle/50">
                <th className="w-24 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Status</th>
                <th className="w-40 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Timestamp</th>
                <th className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Model & Key</th>
                <th className="w-32 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">Provider</th>
                <th className="w-40 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Tokens (In / Out)</th>
                <th className="w-28 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted text-right">Duration</th>
                <th className="w-20 px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-text-muted text-center">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading && !detailsData ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-16 rounded-full" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-3.5 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-44" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-3.5 w-24 ml-auto" /></td>
                    <td className="px-4 py-3 text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></td>
                    <td className="px-4 py-3 text-center"><Skeleton className="h-6 w-12 mx-auto rounded" /></td>
                  </tr>
                ))
              ) : filteredDetails.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-text-muted">
                      <div className="size-12 rounded-full bg-bg-subtle flex items-center justify-center border border-border/80 mb-1">
                        <span className="material-symbols-outlined text-[24px] text-text-muted">
                          query_stats
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-text">No request records found</p>
                      <p className="text-xs max-w-sm text-text-muted">
                        {hasActiveFilters
                          ? "No requests matched your active filter criteria. Try resetting filters."
                          : "Requests routed through YOUPASS Gateway will stream live with full trace logs."}
                      </p>
                      {hasActiveFilters && (
                        <Button variant="outline" size="sm" onClick={handleClearFilters} className="mt-2 text-xs">
                          Clear Filters
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                filteredDetails.map((detail, idx) => {
                  const isSuccess = detail.status === "success" || detail.status === 200 || !detail.status;
                  const promptTokens = getInputTokens(detail.tokens);
                  const cachedTokens = getCachedTokens(detail.tokens);
                  const completionTokens = detail.tokens?.completion_tokens || 0;
                  const totalTokens = promptTokens + completionTokens;
                  const totalLatency = detail.latency?.total || 0;
                  const ttft = detail.latency?.ttft || 0;

                  return (
                    <tr
                      key={`${detail.id}-${idx}`}
                      onClick={() => handleViewDetail(detail)}
                      className="hover:bg-bg-hover/60 transition-colors group cursor-pointer"
                    >
                      {/* Status */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                            isSuccess
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full", isSuccess ? "bg-emerald-500" : "bg-rose-500")} />
                          {isSuccess ? "200 OK" : detail.status || "500 Error"}
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <div className="font-medium text-text">{formatRelativeTime(detail.timestamp)}</div>
                        <div className="text-[10px] text-text-muted font-mono">
                          {new Date(detail.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </div>
                      </td>

                      {/* Model & API Key */}
                      <td className="px-4 py-3 text-xs max-w-[280px]">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-xs font-semibold text-text truncate group-hover:text-primary transition-colors" title={detail.model}>
                            {detail.model || "unknown-model"}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {detail.apiKey ? (
                              <span className="text-[10px] text-text-muted font-mono flex items-center gap-1 bg-bg-subtle/80 px-1.5 py-0.5 rounded border border-border/60 max-w-full truncate" title={detail.apiKey}>
                                <span className="material-symbols-outlined text-[11px] text-primary shrink-0">vpn_key</span>
                                <span className="truncate">{keyNameMap[detail.apiKey] || maskApiKey(detail.apiKey)}</span>
                              </span>
                            ) : (
                              <span className="text-[10px] text-text-muted/60 italic font-mono">Local (No Key)</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Provider */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <Badge variant="neutral" size="sm" className="font-mono text-[11px]">
                          {providerNameMap[detail.provider] || detail.provider || "gateway"}
                        </Badge>
                      </td>

                      {/* Tokens Breakdown */}
                      <td className="px-4 py-3 text-xs text-right whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold text-text">
                          {formatTokens(totalTokens)}
                        </div>
                        <div className="text-[10px] font-mono text-text-muted flex items-center justify-end gap-1">
                          <span className="text-primary">{formatTokens(promptTokens)} in</span>
                          <span>/</span>
                          <span className="text-emerald-500">{formatTokens(completionTokens)} out</span>
                          {cachedTokens > 0 && (
                            <span className="text-info" title={`Cached tokens: ${cachedTokens}`}>({formatTokens(cachedTokens)}c)</span>
                          )}
                        </div>
                      </td>

                      {/* Latency */}
                      <td className="px-4 py-3 text-xs text-right whitespace-nowrap">
                        <div className="font-mono text-xs font-semibold text-text">
                          {formatLatency(totalLatency)}
                        </div>
                        {ttft > 0 && (
                          <div className="text-[10px] font-mono text-text-muted">
                            ttft {formatLatency(ttft)}
                          </div>
                        )}
                      </td>

                      {/* Action / Inspect */}
                      <td className="px-4 py-3 text-center">
                        <span className="material-symbols-outlined text-[18px] text-text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all">
                          chevron_right
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pagination.totalItems > 0 && (
          <div className="border-t border-border/80 bg-bg-subtle/30 px-4 py-2.5">
            <Pagination
              currentPage={pagination.page}
              pageSize={pagination.pageSize}
              totalItems={pagination.totalItems}
              onPageChange={(p) => setPage(p)}
              onPageSizeChange={(s) => {
                setPageSize(s);
                setPage(1);
              }}
            />
          </div>
        )}
      </Card>

      {/* ─── Cloudflare Style Drawer: Request Payload Inspector ─── */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Request Payload Inspector"
        width="xl"
      >
        {selectedDetail && (
          <div className="flex flex-col gap-5">
            {/* Top Summary Banner */}
            <div className="rounded-xl border border-border/80 bg-surface p-4 shadow-[var(--shadow-soft)]">
              {/* Header Status & ID */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      "size-2 rounded-full",
                      selectedDetail.status === "success" || selectedDetail.status === 200 || !selectedDetail.status
                        ? "bg-emerald-500"
                        : "bg-rose-500"
                    )}
                  />
                  <span className="font-mono text-xs font-bold text-text truncate max-w-[280px]">
                    {selectedDetail.id}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyId(selectedDetail.id)}
                    className="text-text-muted hover:text-text p-1 rounded"
                    title="Copy Request ID"
                  >
                    <span className="material-symbols-outlined text-[13px]">
                      {copiedId ? "check" : "content_copy"}
                    </span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="neutral" size="sm" className="font-mono text-[10px]">
                    {providerNameMap[selectedDetail.provider] || selectedDetail.provider}
                  </Badge>
                  <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20 font-semibold">
                    {selectedDetail.model}
                  </span>
                  {selectedDetail.apiKey ? (
                    <span className="font-mono text-xs bg-bg-subtle text-text px-2 py-0.5 rounded border border-border font-medium flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px] text-primary">vpn_key</span>
                      {keyNameMap[selectedDetail.apiKey] || maskApiKey(selectedDetail.apiKey)}
                    </span>
                  ) : (
                    <span className="font-mono text-xs bg-bg-subtle text-text-muted px-2 py-0.5 rounded border border-border">
                      Local
                    </span>
                  )}
                </div>
              </div>

              {/* KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                <div>
                  <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Duration</span>
                  <span className="font-mono text-sm font-bold text-text">
                    {formatLatency(selectedDetail.latency?.total)}
                  </span>
                  {selectedDetail.latency?.ttft > 0 && (
                    <span className="text-[10px] font-mono text-text-muted block">
                      TTFT: {selectedDetail.latency.ttft}ms
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Input Tokens</span>
                  <span className="font-mono text-sm font-bold text-primary">
                    {formatTokens(getInputTokens(selectedDetail.tokens))}
                  </span>
                  {getCachedTokens(selectedDetail.tokens) > 0 && (
                    <span className="text-[10px] font-mono text-info block">
                      Cached: {formatTokens(getCachedTokens(selectedDetail.tokens))}
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Output Tokens</span>
                  <span className="font-mono text-sm font-bold text-emerald-500">
                    {formatTokens(selectedDetail.tokens?.completion_tokens || 0)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-text-muted tracking-wider block">Timestamp</span>
                  <span className="text-xs font-medium text-text leading-snug block">
                    {new Date(selectedDetail.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* PXPIPE Block if present */}
            {selectedDetail.pxpipe && (
              <div className="rounded-xl border border-border/80 bg-surface p-3.5 shadow-[var(--shadow-soft)]">
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary">auto_fix_high</span>
                    <span className="font-semibold text-xs text-text">PXPIPE Vision Compression</span>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                      selectedDetail.pxpipe.applied
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                        : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                    )}
                  >
                    {selectedDetail.pxpipe.applied ? "Optimized" : "Bypassed"}
                  </span>
                </div>
                {selectedDetail.pxpipe.applied ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-text-muted block text-[10px]">Original</span>
                      <span className="font-mono font-bold text-text">{formatTokens(selectedDetail.pxpipe.tokensBeforeEst)} t</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px]">Compressed</span>
                      <span className="font-mono font-bold text-primary">{formatTokens(selectedDetail.pxpipe.tokensAfterEst)} t</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px]">Saved</span>
                      <span className="font-mono font-bold text-emerald-500">{selectedDetail.pxpipe.savedPct || 0}%</span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[10px]">Duration</span>
                      <span className="font-mono text-text">{selectedDetail.pxpipe.durationMs || 0}ms</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted font-mono">{selectedDetail.pxpipe.reason}</p>
                )}
              </div>
            )}

            {/* Payloads Inspector Collapsibles */}
            <div className="flex flex-col gap-3">
              <CodeBlock
                title="Client Request (Messages & Parameters)"
                icon="input"
                content={selectedDetail.request}
                rawJson={selectedDetail.request}
                defaultOpen={true}
                badge="Client Input"
              />

              {selectedDetail.providerRequest && (
                <CodeBlock
                  title="Upstream Protocol Request"
                  icon="sync_alt"
                  content={selectedDetail.providerRequest}
                  rawJson={selectedDetail.providerRequest}
                  badge="To Provider"
                />
              )}

              {selectedDetail.response?.thinking && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 shadow-[var(--shadow-soft)]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[16px] text-amber-500">psychology</span>
                    <span className="font-semibold text-xs text-text">Model Thinking / Reasoning Chain</span>
                  </div>
                  <pre className="max-h-[260px] overflow-auto font-mono text-xs text-text leading-relaxed p-3 bg-bg rounded-lg border border-border select-all custom-scrollbar whitespace-pre-wrap">
                    {selectedDetail.response.thinking}
                  </pre>
                </div>
              )}

              {selectedDetail.providerResponse && (
                <CodeBlock
                  title="Raw Upstream Provider Response"
                  icon="data_object"
                  content={selectedDetail.providerResponse}
                  rawJson={selectedDetail.providerResponse}
                  badge="From Provider"
                />
              )}

              <CodeBlock
                title="Final Streamed Client Response"
                icon="output"
                content={selectedDetail.response?.content || selectedDetail.response || "[No content returned]"}
                rawJson={selectedDetail.response}
                defaultOpen={true}
                badge="Client Output"
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
