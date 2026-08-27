"use client";

import { useState, useMemo, useCallback } from "react";
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
import { AI_PROVIDERS, getProviderByAlias } from "@/shared/constants/providers";

function getCachedTokens(tokens) {
  return tokens?.cached_tokens || tokens?.cache_read_input_tokens || 0;
}

function getCacheCreationTokens(tokens) {
  return tokens?.cache_creation_input_tokens || 0;
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

function CodeBlock({ title, icon, content, defaultOpen = false, rawJson = null }) {
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
    <div className="rounded-xl border border-border bg-surface overflow-hidden transition-all shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between px-4 py-3 bg-bg-subtle/50 border-b border-border">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 text-left text-sm font-semibold text-text hover:text-primary transition-colors flex-1"
        >
          <span
            className={cn(
              "material-symbols-outlined text-[18px] text-text-muted transition-transform duration-200",
              isOpen ? "rotate-90" : ""
            )}
          >
            chevron_right
          </span>
          {icon && <span className="material-symbols-outlined text-[18px] text-primary">{icon}</span>}
          <span>{title}</span>
          {lineCount > 0 && (
            <span className="text-[11px] font-mono font-normal text-text-muted bg-surface-2 px-1.5 py-0.5 rounded border border-border">
              {lineCount} lines
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => copy(rawJson ? JSON.stringify(rawJson, null, 2) : formattedContent, title)}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-primary px-2 py-1 rounded-md hover:bg-bg-hover transition-colors font-medium"
        >
          <span className="material-symbols-outlined text-[14px]">
            {copied === title ? "check" : "content_copy"}
          </span>
          {copied === title ? "Copied" : "Copy"}
        </button>
      </div>

      {isOpen && (
        <div className="p-4 bg-bg overflow-x-auto">
          <pre className="font-mono text-xs text-text leading-relaxed select-all max-h-[380px] overflow-y-auto custom-scrollbar">
            {formattedContent || <span className="text-text-muted italic">[Empty Payload]</span>}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function RequestDetailsTab() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [providerFilter, setProviderFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // SWR: Providers list
  const { data: providersData } = useSWR("/api/usage/providers", fetcher, SWR_CONFIG);
  const { data: nodesData } = useSWR("/api/provider-nodes", fetcher, SWR_CONFIG);

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
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    return params.toString();
  }, [page, pageSize, providerFilter, startDate, endDate]);

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

  // Filter by model client-side for immediate feedback
  const filteredDetails = useMemo(() => {
    if (!modelFilter.trim()) return rawDetails;
    const q = modelFilter.toLowerCase().trim();
    return rawDetails.filter(
      (d) =>
        (d.model && d.model.toLowerCase().includes(q)) ||
        (d.id && d.id.toLowerCase().includes(q)) ||
        (d.provider && d.provider.toLowerCase().includes(q))
    );
  }, [rawDetails, modelFilter]);

  const handleViewDetail = (detail) => {
    setSelectedDetail(detail);
    setIsDrawerOpen(true);
  };

  const handleClearFilters = () => {
    setProviderFilter("");
    setModelFilter("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const hasActiveFilters = Boolean(providerFilter || modelFilter || startDate || endDate);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* Filter Bar */}
      <Card className="p-4 bg-surface border border-border shadow-[var(--shadow-soft)]">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">filter_list</span>
              <span className="text-sm font-semibold text-text">Filter Requests</span>
              {hasActiveFilters && (
                <span className="text-[11px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                  Active
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => mutate()}
                disabled={isValidating}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text px-2.5 py-1 rounded-lg hover:bg-bg-hover transition-colors font-medium border border-border/60"
                title="Refresh data"
              >
                <span className={cn("material-symbols-outlined text-[14px]", isValidating ? "animate-spin text-primary" : "")}>
                  refresh
                </span>
                <span>{isValidating ? "Updating..." : "Refresh"}</span>
              </button>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="text-xs text-danger hover:underline font-medium px-2 py-1"
                >
                  Reset all
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
            {/* Quick Search */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-text-muted pointer-events-none">
                search
              </span>
              <input
                type="text"
                value={modelFilter}
                onChange={(e) => setModelFilter(e.target.value)}
                placeholder="Search Model / Request ID..."
                className="h-9 w-full rounded-lg border border-border bg-bg-subtle pl-9 pr-3 text-xs text-text placeholder:text-text-muted focus:border-primary focus:bg-surface focus:outline-none focus:ring-1 focus:ring-primary transition-all font-mono"
              />
            </div>

            {/* Provider Filter */}
            <div>
              <select
                id="provider-filter"
                value={providerFilter}
                onChange={(e) => {
                  setProviderFilter(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-full rounded-lg border border-border bg-bg-subtle px-3 text-xs text-text focus:border-primary focus:bg-surface focus:outline-none focus:ring-1 focus:ring-primary transition-all cursor-pointer font-medium"
                style={{ colorScheme: "auto" }}
              >
                <option value="">All Providers ({providersData?.providers?.length || 0})</option>
                {(providersData?.providers || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || providerNameMap[p.id] || p.id}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date */}
            <div>
              <input
                type="datetime-local"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                placeholder="Start Date"
                className="h-9 w-full rounded-lg border border-border bg-bg-subtle px-3 text-xs text-text focus:border-primary focus:bg-surface focus:outline-none focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            {/* End Date */}
            <div>
              <input
                type="datetime-local"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                placeholder="End Date"
                className="h-9 w-full rounded-lg border border-border bg-bg-subtle px-3 text-xs text-text focus:border-primary focus:bg-surface focus:outline-none focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Table Card */}
      <Card className="overflow-hidden border border-border bg-surface p-0 shadow-[var(--shadow-soft)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border bg-bg-subtle/60">
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">Timestamp</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">Model</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">Provider</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-muted text-right">Input</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-muted text-right">Cached</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-muted text-right">Output</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">Latency</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-muted text-center">Status</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-text-muted text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && !detailsData ? (
                [...Array(6)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3.5"><Skeleton className="h-3.5 w-32" /></td>
                    <td className="px-4 py-3.5"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-4 py-3.5"><Skeleton className="h-4 w-24" /></td>
                    <td className="px-4 py-3.5 text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></td>
                    <td className="px-4 py-3.5 text-right"><Skeleton className="h-3.5 w-14 ml-auto" /></td>
                    <td className="px-4 py-3.5 text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></td>
                    <td className="px-4 py-3.5"><Skeleton className="h-3.5 w-20" /></td>
                    <td className="px-4 py-3.5 text-center"><Skeleton className="h-4 w-12 mx-auto rounded-full" /></td>
                    <td className="px-4 py-3.5 text-right"><Skeleton className="h-7 w-16 ml-auto rounded-lg" /></td>
                  </tr>
                ))
              ) : filteredDetails.length === 0 ? (
                <tr>
                  <td colSpan="9" className="py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-text-muted">
                      <span className="material-symbols-outlined text-[36px] text-text-muted/60">
                        manage_search
                      </span>
                      <p className="text-sm font-semibold text-text">No request records found</p>
                      <p className="text-xs max-w-sm">
                        {hasActiveFilters
                          ? "Try resetting the filters or selecting a wider date range."
                          : "Requests made to YOUPASS Gateway will appear here with complete input/output payloads."}
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
                  const totalLatency = detail.latency?.total || 0;
                  const ttft = detail.latency?.ttft || 0;

                  return (
                    <tr
                      key={`${detail.id}-${idx}`}
                      className="hover:bg-bg-hover/60 transition-colors group"
                    >
                      {/* Timestamp */}
                      <td className="px-4 py-3 text-xs text-text whitespace-nowrap">
                        <div className="font-medium">{new Date(detail.timestamp).toLocaleDateString()}</div>
                        <div className="text-[10px] text-text-muted font-mono">{new Date(detail.timestamp).toLocaleTimeString()}</div>
                      </td>

                      {/* Model */}
                      <td className="px-4 py-3 text-xs max-w-[240px]">
                        <span className="font-mono text-[11px] font-medium text-text-main bg-bg-subtle px-2 py-0.5 rounded border border-border inline-block truncate max-w-full">
                          {detail.model || "unknown"}
                        </span>
                      </td>

                      {/* Provider */}
                      <td className="px-4 py-3 text-xs">
                        <Badge variant="neutral" size="sm">
                          {providerNameMap[detail.provider] || detail.provider}
                        </Badge>
                      </td>

                      {/* Input Tokens */}
                      <td className="px-4 py-3 text-xs text-right font-mono text-primary font-medium">
                        {formatTokens(promptTokens)}
                      </td>

                      {/* Cached Tokens */}
                      <td className="px-4 py-3 text-xs text-right font-mono">
                        {cachedTokens > 0 ? (
                          <span className="text-info font-medium">
                            {formatTokens(cachedTokens)}
                          </span>
                        ) : (
                          <span className="text-text-muted opacity-40">—</span>
                        )}
                      </td>

                      {/* Output Tokens */}
                      <td className="px-4 py-3 text-xs text-right font-mono text-success font-medium">
                        {formatTokens(completionTokens)}
                      </td>

                      {/* Latency */}
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-text text-[11px] font-medium">{formatLatency(totalLatency)}</span>
                          {ttft > 0 && (
                            <span className="text-[10px] font-mono text-text-muted" title={`Time to first token: ${ttft}ms`}>
                              (ttft: {ttft}ms)
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border",
                            isSuccess
                              ? "bg-success/10 text-success border-success/20"
                              : "bg-danger/10 text-danger border-danger/20"
                          )}
                        >
                          <span className={cn("size-1.5 rounded-full", isSuccess ? "bg-success" : "bg-danger")} />
                          {isSuccess ? "200 OK" : detail.status || "Error"}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewDetail(detail)}
                          className="text-xs h-7 px-2.5 hover:border-primary hover:text-primary"
                        >
                          <span className="material-symbols-outlined text-[14px]">visibility</span>
                          <span>Detail</span>
                        </Button>
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
          <div className="border-t border-border bg-bg-subtle/30 px-4 py-3">
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

      {/* Drawer: Detailed Payload Inspector */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title="Request Payload Inspector"
        width="xl"
      >
        {selectedDetail && (
          <div className="flex flex-col gap-6">
            {/* Top Summary Banner */}
            <div className="rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      selectedDetail.status === "success" || selectedDetail.status === 200 || !selectedDetail.status
                        ? "bg-success"
                        : "bg-danger"
                    )}
                  />
                  <span className="font-mono text-xs font-semibold text-text">{selectedDetail.id}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="neutral" size="sm">
                    {providerNameMap[selectedDetail.provider] || selectedDetail.provider}
                  </Badge>
                  <span className="font-mono text-xs bg-bg-subtle px-2 py-0.5 rounded border border-border text-text font-medium">
                    {selectedDetail.model}
                  </span>
                </div>
              </div>

              {/* KPI Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase font-semibold text-text-muted tracking-wider">Total Duration</span>
                  <span className="font-mono text-base font-bold text-text">
                    {formatLatency(selectedDetail.latency?.total)}
                  </span>
                  {selectedDetail.latency?.ttft > 0 && (
                    <span className="text-[10px] font-mono text-text-muted">TTFT: {selectedDetail.latency.ttft}ms</span>
                  )}
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase font-semibold text-text-muted tracking-wider">Input Tokens</span>
                  <span className="font-mono text-base font-bold text-primary">
                    {formatTokens(getInputTokens(selectedDetail.tokens))}
                  </span>
                  {getCachedTokens(selectedDetail.tokens) > 0 && (
                    <span className="text-[10px] font-mono text-info">
                      Cached: {formatTokens(getCachedTokens(selectedDetail.tokens))}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase font-semibold text-text-muted tracking-wider">Output Tokens</span>
                  <span className="font-mono text-base font-bold text-success">
                    {formatTokens(selectedDetail.tokens?.completion_tokens || 0)}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] uppercase font-semibold text-text-muted tracking-wider">Timestamp</span>
                  <span className="text-xs font-medium text-text leading-snug">
                    {new Date(selectedDetail.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* PXPIPE Optimization block if available */}
            {selectedDetail.pxpipe && (
              <div className="rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]">
                <div className="flex items-center justify-between mb-3 border-b border-border pb-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-primary">image</span>
                    <span className="font-semibold text-sm text-text">PXPIPE Image Compression</span>
                  </div>
                  <span
                    className={cn(
                      "text-[11px] font-semibold px-2 py-0.5 rounded-full border",
                      selectedDetail.pxpipe.applied
                        ? "bg-success/10 text-success border-success/20"
                        : "bg-warning/10 text-warning border-warning/20"
                    )}
                  >
                    {selectedDetail.pxpipe.applied ? "Optimized" : "Bypassed"}
                  </span>
                </div>
                {selectedDetail.pxpipe.applied ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <span className="text-text-muted block text-[11px]">Before Compression</span>
                      <span className="font-mono font-bold text-text">
                        {formatTokens(selectedDetail.pxpipe.tokensBeforeEst)} tokens
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[11px]">After Compression</span>
                      <span className="font-mono font-bold text-primary">
                        {formatTokens(selectedDetail.pxpipe.tokensAfterEst)} tokens
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[11px]">Saved</span>
                      <span className="font-mono font-bold text-success">
                        {selectedDetail.pxpipe.savedPct || 0}%
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted block text-[11px]">Images / Latency</span>
                      <span className="font-mono text-text">
                        {selectedDetail.pxpipe.imageCount || 0} img ({selectedDetail.pxpipe.durationMs || 0}ms)
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">
                    Reason: <span className="font-mono text-text">{selectedDetail.pxpipe.reason}</span>
                    {selectedDetail.pxpipe.detail ? ` — ${selectedDetail.pxpipe.detail}` : ""}
                  </p>
                )}
              </div>
            )}

            {/* Payloads Inspector Tabs/Collapsibles */}
            <div className="flex flex-col gap-4">
              <CodeBlock
                title="1. Client Request (Input Body)"
                icon="input"
                content={selectedDetail.request}
                rawJson={selectedDetail.request}
                defaultOpen={true}
              />

              {selectedDetail.providerRequest && (
                <CodeBlock
                  title="2. Provider Request (Translated Protocol)"
                  icon="translate"
                  content={selectedDetail.providerRequest}
                  rawJson={selectedDetail.providerRequest}
                />
              )}

              {selectedDetail.providerResponse && (
                <CodeBlock
                  title="3. Provider Response (Raw Upstream)"
                  icon="data_object"
                  content={selectedDetail.providerResponse}
                  rawJson={selectedDetail.providerResponse}
                />
              )}

              {selectedDetail.response?.thinking && (
                <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 shadow-[var(--shadow-soft)]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-[18px] text-warning">psychology</span>
                    <span className="font-semibold text-sm text-text">Model Thinking Process</span>
                  </div>
                  <pre className="max-h-[260px] overflow-auto font-mono text-xs text-text leading-relaxed p-3 bg-bg rounded-lg border border-border select-all custom-scrollbar">
                    {selectedDetail.response.thinking}
                  </pre>
                </div>
              )}

              <CodeBlock
                title="4. Client Response (Final Streamed Content)"
                icon="output"
                content={selectedDetail.response?.content || selectedDetail.response || "[No content returned]"}
                rawJson={selectedDetail.response}
                defaultOpen={true}
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
