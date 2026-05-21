"use client";

import MultiSelectDropdown, { type SelectOption } from "@/app/components/MultiSelectDropdown";

interface SensitiveAttributeSelectorProps {
  selected: string[];
  onChange: (updated: string[]) => void;
  conflicting?: string[];
  disabled?: boolean;
}

export const sensitiveAttributeOptions: SelectOption[] = [
  { label: "Primary Diagnosis", value: "diag_1" },
  { label: "Secondary Diagnosis", value: "diag_2" },
  { label: "Tertiary Diagnosis", value: "diag_3" },
  { label: "Number of Medications", value: "num_medications" },
  { label: "Number of Lab Procedures", value: "num_lab_procedures" },
  { label: "Max Glucose Serum", value: "max_glu_serum" },
  { label: "A1C Result", value: "A1Cresult" },
  { label: "Metformin", value: "metformin" },
  { label: "Repaglinide", value: "repaglinide" },
  { label: "Nateglinide", value: "nateglinide" },
  { label: "Chlorpropamide", value: "chlorpropamide" },
  { label: "Glimepiride", value: "glimepiride" },
  { label: "Acetohexamide", value: "acetohexamide" },
  { label: "Glipizide", value: "glipizide" },
  { label: "Glyburide", value: "glyburide" },
  { label: "Tolbutamide", value: "tolbutamide" },
  { label: "Pioglitazone", value: "pioglitazone" },
  { label: "Rosiglitazone", value: "rosiglitazone" },
  { label: "Acarbose", value: "acarbose" },
  { label: "Miglitol", value: "miglitol" },
  { label: "Troglitazone", value: "troglitazone" },
  { label: "Tolazamide", value: "tolazamide" },
  { label: "Examide", value: "examide" },
  { label: "Citoglipton", value: "citoglipton" },
  { label: "Insulin", value: "insulin" },
  { label: "Glyburide-Metformin", value: "glyburide-metformin" },
  { label: "Glipizide-Metformin", value: "glipizide-metformin" },
  { label: "Glimepiride-Pioglitazone", value: "glimepiride-pioglitazone" },
  { label: "Metformin-Rosiglitazone", value: "metformin-rosiglitazone" },
  { label: "Metformin-Pioglitazone", value: "metformin-pioglitazone" },
  { label: "Change in Medications", value: "change" },
  { label: "Diabetes Medication", value: "diabetesMed" },
  { label: "Readmitted", value: "readmitted" },
];

// Matches backend DEFAULT_SAS in backend/app/validation.py
export const DEFAULT_SENSITIVE_ATTRIBUTES = ["diag_1", "num_medications", "num_lab_procedures"];

export default function SensitiveAttributeSelector({
  selected,
  onChange,
  conflicting = [],
  disabled = false,
}: SensitiveAttributeSelectorProps) {
  return (
    <div
      className="w-full max-w-5xl bg-white rounded-2xl p-8 flex flex-col gap-5"
      style={{
        border: "1px solid #E2E8F0",
        borderLeftWidth: "4px",
        borderLeftColor: "#0891B2",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04), 0 4px 16px rgba(8,145,178,0.07)",
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: "#ECFEFF", border: "1px solid #A5F3FC" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0891B2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-[#0F172A] text-lg font-bold leading-7 tracking-tight">
            Select Sensitive Attributes
          </h2>
          <p className="text-[#64748B] text-sm leading-5">
            Choose attributes containing sensitive information that must be protected during analysis
          </p>
        </div>
      </div>

      <MultiSelectDropdown
        options={sensitiveAttributeOptions}
        selected={selected}
        onChange={onChange}
        placeholder="Search and select sensitive attributes..."
        accentColor="teal"
        conflicting={conflicting}
        disabled={disabled}
      />

      {conflicting.length > 0 && (
        <div className="flex items-start gap-2.5 bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-4 py-3">
          <svg
            className="shrink-0 mt-0.5"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#DC2626"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-[#DC2626] text-xs leading-5">
            <span className="font-semibold">Overlap detected:</span>{" "}
            {conflicting.map((v) => {
              const opt = sensitiveAttributeOptions.find((o) => o.value === v);
              return opt?.label ?? v;
            }).join(", ")}{" "}
            {conflicting.length === 1 ? "is" : "are"} also selected as a quasi identifier. Remove the overlap before running the analysis.
          </p>
        </div>
      )}

      <p className="text-[#94A3B8] text-xs leading-4">
        Sensitive attributes will be used to evaluate privacy disclosure risks and must not overlap with quasi-identifiers
      </p>
    </div>
  );
}
