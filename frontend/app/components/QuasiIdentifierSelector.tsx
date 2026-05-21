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
    <div className="w-full max-w-5xl bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-8 flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-[#101828] text-lg font-semibold leading-7">
          Select Quasi Identifiers
        </h2>
        <p className="text-[#4a5565] text-sm leading-5">
          Choose the attributes that may act as quasi-identifiers for privacy risk evaluation
        </p>
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
        <div className="flex items-start gap-2 bg-[#fef2f2] border border-[#fca5a5] rounded-[8px] px-4 py-3">
          <svg
            className="shrink-0 mt-0.5"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#b91c1c"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-[#b91c1c] text-xs leading-5">
            <span className="font-semibold">Overlap detected:</span>{" "}
            {conflicting.map((v) => {
              const opt = quasiIdentifierOptions.find((o) => o.value === v);
              return opt?.label ?? v;
            }).join(", ")}{" "}
            {conflicting.length === 1 ? "is" : "are"} also selected as a sensitive attribute. Remove the overlap before running the analysis.
          </p>
        </div>
      )}

      <p className="text-[#6a7282] text-xs leading-4">
        Selected attributes will be used to calculate re-identification risk
      </p>
    </div>
  );
}
