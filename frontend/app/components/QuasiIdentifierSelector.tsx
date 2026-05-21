"use client";

import MultiSelectDropdown, { type SelectOption } from "@/app/components/MultiSelectDropdown";

interface QuasiIdentifierSelectorProps {
  selected: string[];
  onChange: (updated: string[]) => void;
  conflicting?: string[];
  disabled?: boolean;
}

export const quasiIdentifierOptions: SelectOption[] = [
  { label: "Race / Ethnicity", value: "race" },
  { label: "Gender", value: "gender" },
  { label: "Age", value: "age" },
  { label: "Weight", value: "weight" },
  { label: "Admission Type", value: "admission_type_id" },
  { label: "Discharge Disposition", value: "discharge_disposition_id" },
  { label: "Admission Source", value: "admission_source_id" },
  { label: "Time in Hospital", value: "time_in_hospital" },
  { label: "Payer Code", value: "payer_code" },
  { label: "Medical Specialty", value: "medical_specialty" },
  { label: "Number of Lab Procedures", value: "num_lab_procedures" },
  { label: "Number of Procedures", value: "num_procedures" },
  { label: "Number of Medications", value: "num_medications" },
  { label: "Outpatient Visits", value: "number_outpatient" },
  { label: "Emergency Visits", value: "number_emergency" },
  { label: "Inpatient Visits", value: "number_inpatient" },
  { label: "Number of Diagnoses", value: "number_diagnoses" },
  { label: "Encounter ID", value: "encounter_id" },
  { label: "Patient Number", value: "patient_nbr" },
];

// Matches backend DEFAULT_QIS in backend/app/validation.py
export const DEFAULT_QUASI_IDENTIFIERS = [
  "age",
  "gender",
  "race",
  "admission_type_id",
  "discharge_disposition_id",
  "time_in_hospital",
];

export default function QuasiIdentifierSelector({
  selected,
  onChange,
  conflicting = [],
  disabled = false,
}: QuasiIdentifierSelectorProps) {
  return (
    <div
      className="w-full max-w-5xl bg-white rounded-2xl p-8 flex flex-col gap-5"
      style={{
        borderLeft: "4px solid #1E3A8A",
        border: "1px solid #E2E8F0",
        borderLeftWidth: "4px",
        borderLeftColor: "#1E3A8A",
        boxShadow: "0 1px 3px rgba(15,23,42,0.04), 0 4px 16px rgba(30,58,138,0.07)",
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
          style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1E3A8A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-[#0F172A] text-lg font-bold leading-7 tracking-tight">
            Select Quasi Identifiers
          </h2>
          <p className="text-[#64748B] text-sm leading-5">
            Choose the attributes that may act as quasi-identifiers for privacy risk evaluation
          </p>
        </div>
      </div>

      <MultiSelectDropdown
        options={quasiIdentifierOptions}
        selected={selected}
        onChange={onChange}
        placeholder="Search and select quasi identifiers..."
        accentColor="blue"
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
              const opt = quasiIdentifierOptions.find((o) => o.value === v);
              return opt?.label ?? v;
            }).join(", ")}{" "}
            {conflicting.length === 1 ? "is" : "are"} also selected as a sensitive attribute. Remove the overlap before running the analysis.
          </p>
        </div>
      )}

      <p className="text-[#94A3B8] text-xs leading-4">
        Selected attributes will be used to calculate re-identification risk
      </p>
    </div>
  );
}
