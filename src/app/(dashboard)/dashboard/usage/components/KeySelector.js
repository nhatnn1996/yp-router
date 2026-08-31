"use client";

import { useMemo } from "react";
import PropTypes from "prop-types";
import useSWR from "swr";
import { fetcher, SWR_CONFIG } from "@/shared/utils/fetcher";
import { cn } from "@/shared/utils/cn";

function maskApiKey(key) {
  if (!key || typeof key !== "string") return "";
  if (key.length <= 10) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

export default function KeySelector({ value = "", onChange, className }) {
  const { data: keysData, isLoading } = useSWR("/api/keys", fetcher, SWR_CONFIG);
  const keys = keysData?.keys || [];

  const selectedKeyObj = useMemo(() => {
    if (!value || value === "local-no-key") return null;
    return keys.find((k) => k.key === value || k.id === value);
  }, [keys, value]);

  const hasFilter = Boolean(value);

  return (
    <div className={cn("relative flex items-center gap-1.5", className)}>
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs shadow-[var(--shadow-soft)]">
        <span className="material-symbols-outlined text-[16px] text-primary shrink-0">
          vpn_key
        </span>
        <select
          id="usage-key-selector"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isLoading && keys.length === 0}
          className="bg-transparent text-xs font-semibold text-text focus:outline-none cursor-pointer pr-1 py-0.5"
          style={{ colorScheme: "auto" }}
        >
          <option value="">All Keys ({keys.length})</option>
          <option value="local-no-key">Local (No API Key)</option>
          {keys.map((k) => (
            <option key={k.id || k.key} value={k.key}>
              {k.name} ({maskApiKey(k.key)})
            </option>
          ))}
        </select>

        {hasFilter && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-text-muted hover:text-danger p-0.5 rounded transition-colors ml-0.5"
            title="Clear key filter"
          >
            <span className="material-symbols-outlined text-[14px] block">close</span>
          </button>
        )}
      </div>

      {hasFilter && (
        <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
          {value === "local-no-key" ? "Local Only" : selectedKeyObj?.name || maskApiKey(value)}
        </span>
      )}
    </div>
  );
}

KeySelector.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  className: PropTypes.string,
};
