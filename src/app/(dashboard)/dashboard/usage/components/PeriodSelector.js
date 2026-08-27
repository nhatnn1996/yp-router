"use client";

import { useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { cn } from "@/shared/utils/cn";

const PRESET_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "24h", label: "24h" },
  { value: "7d", label: "7D" },
  { value: "14d", label: "14D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];

const CUSTOM_QUICK_PRESETS = [10, 14, 45, 60, 90, 120, 180, 365];

export default function PeriodSelector({ value = "today", onChange, className }) {
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customDaysInput, setCustomDaysInput] = useState("14");
  const popoverRef = useRef(null);

  // Check if current value is custom (not in standard preset list)
  const isPreset = PRESET_OPTIONS.some((opt) => opt.value === value);
  const customDaysMatch = typeof value === "string" ? value.match(/^(\d+)d$/) : null;
  const customDayCount = customDaysMatch ? customDaysMatch[1] : null;

  useEffect(() => {
    const handleOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setShowCustomModal(false);
      }
    };
    if (showCustomModal) {
      document.addEventListener("mousedown", handleOutside);
    }
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showCustomModal]);

  const handleApplyCustom = (days) => {
    const num = parseInt(days || customDaysInput, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= 3650) {
      onChange(`${num}d`);
      setShowCustomModal(false);
    }
  };

  return (
    <div className={cn("relative flex flex-wrap items-center gap-1.5", className)} ref={popoverRef}>
      {/* Preset Buttons */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-subtle/80 p-1 shadow-[var(--shadow-soft)]">
        {PRESET_OPTIONS.map((opt) => {
          const isActive = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-semibold transition-all select-none",
                isActive
                  ? "bg-primary text-white shadow-sm font-bold"
                  : "text-text-muted hover:bg-bg-hover hover:text-text"
              )}
            >
              {opt.label}
            </button>
          );
        })}

        {/* Custom Day Active Pill (if selected) */}
        {!isPreset && customDayCount && (
          <div className="flex items-center gap-1 bg-primary text-white text-xs font-bold px-2.5 py-1 rounded-md shadow-sm">
            <span className="material-symbols-outlined text-[14px]">calendar_month</span>
            <span>{customDayCount}D</span>
            <button
              type="button"
              onClick={() => onChange("7d")}
              className="ml-0.5 hover:bg-white/20 rounded-full p-0.5 transition-colors"
              title="Reset to preset"
            >
              <span className="material-symbols-outlined text-[12px] block">close</span>
            </button>
          </div>
        )}
      </div>

      {/* Custom Button Trigger */}
      <button
        type="button"
        onClick={() => setShowCustomModal((prev) => !prev)}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold transition-all shadow-[var(--shadow-soft)]",
          showCustomModal || (!isPreset && customDayCount)
            ? "border-primary/40 bg-primary/5 text-primary"
            : "bg-surface text-text hover:border-primary/30 hover:bg-bg-hover"
        )}
        title="Filter by custom number of days"
      >
        <span className="material-symbols-outlined text-[16px] text-primary">edit_calendar</span>
        <span>Custom Days</span>
      </button>

      {/* Custom Days Popover */}
      {showCustomModal && (
        <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-border bg-surface p-4 shadow-[var(--shadow-elevated)] slide-in-down">
          <div className="flex items-center justify-between border-b border-border pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-primary">date_range</span>
              <span className="text-xs font-bold text-text uppercase tracking-wider">Custom Time Range</span>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomModal(false)}
              className="text-text-muted hover:text-text p-1 rounded-md hover:bg-bg-hover transition-colors"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleApplyCustom();
            }}
            className="flex flex-col gap-3"
          >
            <div>
              <label htmlFor="custom-days-input" className="block text-xs font-medium text-text-muted mb-1.5">
                Number of past days:
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="custom-days-input"
                  type="number"
                  min="1"
                  max="3650"
                  value={customDaysInput}
                  onChange={(e) => setCustomDaysInput(e.target.value)}
                  placeholder="e.g. 45"
                  className="h-9 flex-1 rounded-lg border border-border bg-bg-subtle px-3 text-xs font-mono font-bold text-text focus:border-primary focus:bg-surface focus:outline-none focus:ring-1 focus:ring-primary"
                  autoFocus
                />
                <button
                  type="submit"
                  className="h-9 px-3.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-hover transition-colors shadow-sm"
                >
                  Apply
                </button>
              </div>
            </div>

            {/* Quick Suggestions */}
            <div>
              <span className="block text-[11px] font-semibold text-text-muted mb-1.5">Quick picks:</span>
              <div className="flex flex-wrap gap-1.5">
                {CUSTOM_QUICK_PRESETS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setCustomDaysInput(String(d));
                      handleApplyCustom(d);
                    }}
                    className={cn(
                      "text-[11px] font-mono px-2 py-1 rounded-md border transition-all",
                      value === `${d}d`
                        ? "border-primary bg-primary/10 text-primary font-bold"
                        : "border-border bg-bg-subtle text-text-muted hover:text-text hover:border-text-muted/40"
                    )}
                  >
                    {d}D
                  </button>
                ))}
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

PeriodSelector.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  className: PropTypes.string,
};
