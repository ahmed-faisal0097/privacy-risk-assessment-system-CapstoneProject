"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type AttributeOption = {
  label: string;
  value: string;
};

type AttributeMultiSelectProps = {
  accent: "blue" | "teal";
  options: AttributeOption[];
  selected: string[];
  onChange: (updated: string[]) => void;
  placeholder?: string;
};

const accentClasses = {
  blue: {
    chip: "bg-[#eff6ff] border-[#bedbff] text-[#1c398e]",
    focus: "focus-within:border-[#2b7fff] focus-within:ring-[#8ec5ff]",
    checked: "bg-[#2b7fff] border-[#2b7fff]",
    optionSelected: "bg-[#eff6ff]",
    optionText: "text-[#1c398e]",
  },
  teal: {
    chip: "bg-[#f0fdfa] border-[#96f7e4] text-[#007a6e]",
    focus: "focus-within:border-[#009689] focus-within:ring-[#7df9dd]",
    checked: "bg-[#009689] border-[#009689]",
    optionSelected: "bg-[#f0fdfa]",
    optionText: "text-[#007a6e]",
  },
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-[#6a7282]"
    >
      <polyline points={open ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="10"
      height="8"
      viewBox="0 0 10 8"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1 4L3.5 6.5L9 1"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function AttributeMultiSelect({
  accent,
  options,
  selected,
  onChange,
  placeholder = "Select attributes",
}: AttributeMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const classes = accentClasses[accent];

  const optionsByValue = useMemo(() => {
    return new Map(options.map((option) => [option.value, option]));
  }, [options]);

  const selectedOptions = selected
    .map((value) => optionsByValue.get(value))
    .filter((option): option is AttributeOption => Boolean(option));

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return options;

    return options.filter((option) => {
      return (
        option.label.toLowerCase().includes(normalizedQuery) ||
        option.value.toLowerCase().includes(normalizedQuery)
      );
    });
  }, [options, query]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (open) {
      searchRef.current?.focus();
    } else {
      setQuery("");
    }
  }, [open]);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const remove = (value: string) => {
    onChange(selected.filter((item) => item !== value));
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={[
          "w-full min-h-[58px] rounded-[10px] border border-[#d1d5dc] bg-white px-4 py-2.5 text-left shadow-sm transition",
          "focus:outline-none focus:ring-4",
          classes.focus,
        ].join(" ")}
      >
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            {selectedOptions.length > 0 ? (
              selectedOptions.map((option) => (
                <span
                  key={option.value}
                  className={[
                    "inline-flex h-8 max-w-full items-center gap-2 rounded-[8px] border px-3 text-sm font-medium",
                    classes.chip,
                  ].join(" ")}
                >
                  <span className="truncate">{option.label}</span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`Remove ${option.label}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      remove(option.value);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        event.stopPropagation();
                        remove(option.value);
                      }
                    }}
                    className="rounded p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100"
                  >
                    <XIcon />
                  </span>
                </span>
              ))
            ) : (
              <span className="py-1.5 text-sm text-[#6a7282]">{placeholder}</span>
            )}
          </div>
          <ChevronIcon open={open} />
        </div>
      </button>

      {open && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-[10px] border border-[#e5e7eb] bg-white shadow-xl">
          <div className="flex h-12 items-center gap-3 border-b border-[#e5e7eb] px-4 text-[#9ca3af]">
            <SearchIcon />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search attributes..."
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-[#101828] outline-none placeholder:text-[#9ca3af]"
            />
          </div>

          <div className="max-h-72 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => {
                const checked = selected.includes(option.value);

                return (
                  <label
                    key={option.value}
                    className={[
                      "flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 transition-colors hover:bg-[#f9fafb]",
                      checked ? classes.optionSelected : "bg-white",
                    ].join(" ")}
                  >
                    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(option.value)}
                        className="sr-only"
                      />
                      <span
                        className={[
                          "flex h-4 w-4 items-center justify-center rounded border-2 transition-colors",
                          checked
                            ? classes.checked
                            : "border-[#d1d5dc] bg-white",
                        ].join(" ")}
                      >
                        {checked && <CheckIcon />}
                      </span>
                    </span>

                    <span
                      className={[
                        "min-w-0 flex-1 truncate text-sm font-medium",
                        checked ? classes.optionText : "text-[#364153]",
                      ].join(" ")}
                    >
                      {option.label}
                    </span>

                    <code className="max-w-[45%] truncate rounded-[6px] bg-[#f3f4f6] px-2 py-1 text-xs text-[#6a7282]">
                      {option.value}
                    </code>
                  </label>
                );
              })
            ) : (
              <div className="px-4 py-6 text-sm text-[#6a7282]">
                No matching attributes found.
              </div>
            )}
          </div>

          <div className="flex h-11 items-center justify-between border-t border-[#e5e7eb] px-4 text-xs text-[#6a7282]">
            <span>
              {selectedOptions.length} selected - {filteredOptions.length} shown
            </span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="font-medium text-[#6a7282] hover:text-[#101828]"
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
