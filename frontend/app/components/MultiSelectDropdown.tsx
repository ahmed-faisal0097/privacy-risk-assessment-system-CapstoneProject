"use client";

import { useState, useRef, useEffect } from "react";

export type SelectOption = {
  label: string;
  value: string;
};

interface MultiSelectDropdownProps {
  options: SelectOption[];
  selected: string[];
  onChange: (updated: string[]) => void;
  placeholder?: string;
  accentColor?: "blue" | "teal";
  conflicting?: string[];
  disabled?: boolean;
}

const ACCENT = {
  blue: {
    chip: "bg-[#EFF6FF] text-[#1E3A8A] border-[#BFDBFE]",
    chipConflict: "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]",
    checkBg: "bg-[#2563EB]",
    optionSelected: "bg-[#EFF6FF] text-[#1E3A8A]",
    optionHover: "hover:bg-[#F0F6FF]",
    openBorder: "border-[#2563EB]",
    focusRing: "ring-[#2563EB]/20",
  },
  teal: {
    chip: "bg-[#ECFEFF] text-[#0E7490] border-[#A5F3FC]",
    chipConflict: "bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]",
    checkBg: "bg-[#0891B2]",
    optionSelected: "bg-[#ECFEFF] text-[#0E7490]",
    optionHover: "hover:bg-[#F0FEFF]",
    openBorder: "border-[#0891B2]",
    focusRing: "ring-[#0891B2]/20",
  },
} as const;

export default function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder = "Select attributes...",
  accentColor = "blue",
  conflicting = [],
  disabled = false,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const a = ACCENT[accentColor];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const remove = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((v) => v !== value));
  };

  const filteredOptions = options.filter(
    (opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      opt.value.toLowerCase().includes(search.toLowerCase())
  );

  const selectedOptions = options.filter((opt) => selected.includes(opt.value));

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger */}
      <div
        onClick={() => !disabled && setOpen((prev) => !prev)}
        className={[
          "min-h-[46px] w-full rounded-xl border-2 bg-white px-3 py-2 transition-all duration-150",
          disabled
            ? "opacity-60 cursor-not-allowed border-[#E2E8F0]"
            : "cursor-pointer",
          !disabled && open
            ? `${a.openBorder} ring-4 ${a.focusRing}`
            : !disabled
            ? "border-[#CBD5E1] hover:border-[#94A3B8]"
            : "",
        ].join(" ")}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 flex flex-wrap gap-1.5 min-h-[24px]">
            {selectedOptions.length === 0 ? (
              <span className="text-[#9ca3af] text-sm leading-6 select-none">
                {placeholder}
              </span>
            ) : (
              selectedOptions.map((opt) => {
                const isConflict = conflicting.includes(opt.value);
                return (
                  <span
                    key={opt.value}
                    className={[
                      "inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md border select-none",
                      isConflict ? a.chipConflict : a.chip,
                    ].join(" ")}
                  >
                    {opt.label}
                    {!disabled && (
                      <button
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => remove(opt.value, e)}
                        className="opacity-50 hover:opacity-100 transition-opacity ml-0.5 shrink-0"
                        aria-label={`Remove ${opt.label}`}
                      >
                        <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                          <path
                            d="M8 2L2 8M2 2l6 6"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    )}
                  </span>
                );
              })
            )}
          </div>
          {/* Chevron */}
          <div className="shrink-0 mt-1 text-[#9ca3af]">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </div>

      {/* Dropdown panel */}
      {open && !disabled && (
        <div className="absolute z-50 top-full mt-1.5 w-full bg-white border border-[#E2E8F0] rounded-xl shadow-xl overflow-hidden"
          style={{ boxShadow: "0 8px 32px rgba(15,23,42,0.12), 0 2px 8px rgba(30,58,138,0.07)" }}
        >
          {/* Search */}
          <div className="px-3 py-2.5 border-b border-[#E2E8F0] bg-[#F8FAFC]">
            <div className="flex items-center gap-2">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#9ca3af"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search attributes..."
                className="flex-1 text-sm text-[#101828] placeholder-[#9ca3af] outline-none bg-transparent"
                onClick={(e) => e.stopPropagation()}
              />
              {search && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setSearch(""); }}
                  className="text-[#9ca3af] hover:text-[#6a7282]"
                >
                  <svg width="12" height="12" viewBox="0 0 10 10" fill="none">
                    <path d="M8 2L2 8M2 2l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Options */}
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <p className="text-sm text-[#9ca3af] text-center py-5">
                No attributes found
              </p>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = selected.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggle(opt.value)}
                    className={[
                      "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors",
                      isSelected ? a.optionSelected : `text-[#364153] ${a.optionHover}`,
                    ].join(" ")}
                  >
                    {/* Checkbox indicator */}
                    <div
                      className={[
                        "w-4 h-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors",
                        isSelected
                          ? `${a.checkBg} border-transparent`
                          : "bg-white border-[#CBD5E1]",
                      ].join(" ")}
                    >
                      {isSelected && (
                        <svg width="8" height="6" viewBox="0 0 10 8" fill="none">
                          <path
                            d="M1 4L3.5 6.5L9 1"
                            stroke="white"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <span className="font-medium flex-1">{opt.label}</span>
                    <span className="text-[10px] font-mono text-[#9ca3af] bg-[#f3f4f6] px-1.5 py-0.5 rounded shrink-0">
                      {opt.value}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 border-t border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
            <span className="text-xs text-[#6a7282]">
              {selected.length} selected · {filteredOptions.length} shown
            </span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onChange([]); }}
                className="text-xs text-[#9ca3af] hover:text-[#b91c1c] transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
