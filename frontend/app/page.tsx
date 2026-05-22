"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import UploadCard from "@/app/components/UploadCard";
import SummaryCard from "@/app/components/SummaryCard";
import ActionButtons from "@/app/components/ActionButtons";
import AnalysisProgressCard, {
  type AnalysisProgressState,
} from "@/app/components/AnalysisProgressCard";
import type { AttributeOption } from "@/app/components/AttributeMultiSelect";
import QuasiIdentifierSelector, {
  DEFAULT_QUASI_IDENTIFIERS,
} from "@/app/components/QuasiIdentifierSelector";
import SensitiveAttributeSelector, {
  DEFAULT_SENSITIVE_ATTRIBUTES,
} from "@/app/components/SensitiveAttributeSelector";

// Backend base URL — set NEXT_PUBLIC_API_BASE_URL in .env.local
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

const KNOWN_ATTRIBUTE_LABELS: Record<string, string> = {
  A1Cresult: "A1C Result",
  admission_source_id: "Admission Source",
  admission_type_id: "Admission Type",
  diabetesMed: "Diabetes Medication",
  diag_1: "Primary Diagnosis",
  diag_2: "Secondary Diagnosis",
  diag_3: "Tertiary Diagnosis",
  discharge_disposition_id: "Discharge Disposition",
  max_glu_serum: "Max Glucose Serum",
  medical_specialty: "Medical Specialty",
  payer_code: "Payer Code",
  race: "Race / Ethnicity",
  readmitted: "Readmitted",
};

function getFirstCsvRecord(text: string): string {
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      return text.slice(0, index);
    }
  }

  return text;
}

function parseCsvHeader(record: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  const cleanRecord = record.replace(/^\uFEFF/, "");

  for (let index = 0; index < cleanRecord.length; index += 1) {
    const char = cleanRecord[index];
    const next = cleanRecord[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current.trim());
  return fields.filter(Boolean);
}

async function readCsvHeaders(file: File): Promise<string[]> {
  const text = await file.slice(0, 64 * 1024).text();
  return parseCsvHeader(getFirstCsvRecord(text));
}

function formatAttributeLabel(value: string): string {
  if (KNOWN_ATTRIBUTE_LABELS[value]) return KNOWN_ATTRIBUTE_LABELS[value];

  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildAttributeOptions(headerGroups: string[][]): AttributeOption[] {
  const seen = new Set<string>();
  const options: AttributeOption[] = [];

  headerGroups.flat().forEach((header) => {
    const value = header.trim();
    const normalizedValue = value.toLowerCase();

    if (!value || seen.has(normalizedValue)) return;

    seen.add(normalizedValue);
    options.push({
      label: formatAttributeLabel(value),
      value,
    });
  });

  return options;
}

type UploadRequestError = {
  status?: number;
  data?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getApiMessage(data: unknown, fallback: string) {
  if (isRecord(data)) {
    const detail = data.detail;
    const message = data.message;

    if (typeof detail === "string") return detail;
    if (typeof message === "string") return message;
    if (detail !== undefined) return JSON.stringify(detail);
  }

  return fallback;
}

function postAnalysisForm({
  form,
  url,
  onUploadProgress,
  onUploadComplete,
}: {
  form: FormData;
  url: string;
  onUploadProgress: (percent: number) => void;
  onUploadComplete: () => void;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onUploadProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.upload.onload = () => {
      onUploadProgress(100);
      onUploadComplete();
    };
    xhr.onerror = () => {
      reject(new Error("Network request failed"));
    };
    xhr.onload = () => {
      const contentType = xhr.getResponseHeader("content-type") ?? "";
      const responseText = xhr.responseText;
      let data: unknown = responseText ? { message: responseText } : {};

      if (contentType.includes("application/json") && responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = { message: responseText };
        }
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }

      const error: UploadRequestError = {
        status: xhr.status,
        data,
      };
      reject(error);
    };

    xhr.send(form);
  });
}

function createJobId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `job-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseProgressPayload(data: unknown): AnalysisProgressState | null {
  if (!isRecord(data)) return null;

  const activeStep = data.activeStep;
  const stepProgress = data.stepProgress;
  const completed = data.completed;

  if (
    typeof activeStep !== "number" ||
    typeof stepProgress !== "number" ||
    typeof completed !== "boolean"
  ) {
    return null;
  }

  return {
    activeStep,
    stepProgress,
    completed,
    status: typeof data.status === "string" ? data.status : undefined,
    message: typeof data.message === "string" ? data.message : undefined,
  };
}

/* ── Icons ── */
function ShieldIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function RowsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="#155dfc" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="#009689" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

function MissingIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/* ── Mock summary cards (shown while backend result not yet loaded) ── */
const SUMMARY = [
  { icon: <RowsIcon />, iconBg: "bg-[#dbeafe]", value: "—", label: "Number of Rows" },
  { icon: <ColumnsIcon />, iconBg: "bg-[#cbfbf1]", value: "—", label: "Number of Columns" },
  { icon: <MissingIcon />, iconBg: "bg-[#ffedd4]", value: "—", label: "Missing Values" },
];

/* ── Error banner ── */
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="w-full max-w-5xl bg-[#fef2f2] border border-[#fca5a5] rounded-[10px] px-5 py-4">
      <p className="text-[#b91c1c] text-sm font-medium leading-5">{message}</p>
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="w-full max-w-5xl bg-[#ecfdf5] border border-[#86efac] rounded-[10px] px-5 py-4">
      <p className="text-[#047857] text-sm font-medium leading-5">{message}</p>
    </div>
  );
}

export default function Home() {
  const router = useRouter();

  const [realFile, setRealFile] = useState<File | null>(null);
  const [syntheticFile, setSyntheticFile] = useState<File | null>(null);
  const [attributeOptions, setAttributeOptions] = useState<AttributeOption[]>([]);
  const [selectedQIs, setSelectedQIs] = useState<string[]>(DEFAULT_QUASI_IDENTIFIERS);
  const [selectedSAs, setSelectedSAs] = useState<string[]>(DEFAULT_SENSITIVE_ATTRIBUTES);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [analysisProgress, setAnalysisProgress] =
    useState<AnalysisProgressState | null>(null);
  const [analysisJobId, setAnalysisJobId] = useState<string | null>(null);

  const bothUploaded = realFile !== null && syntheticFile !== null;

  useEffect(() => {
    let cancelled = false;

    if (!realFile || !syntheticFile) {
      setAttributeOptions([]);
      return;
    }

    Promise.all([readCsvHeaders(realFile), readCsvHeaders(syntheticFile)])
      .then((headerGroups) => {
        if (cancelled) return;
        setAttributeOptions(buildAttributeOptions(headerGroups));
      })
      .catch(() => {
        if (cancelled) return;
        setAttributeOptions([]);
        setError("Could not read the CSV headers from the uploaded datasets.");
      });

    return () => {
      cancelled = true;
    };
  }, [realFile, syntheticFile]);

  useEffect(() => {
    if (attributeOptions.length === 0) return;

    const values = new Set(attributeOptions.map((option) => option.value));
    setSelectedQIs((current) => current.filter((value) => values.has(value)));
    setSelectedSAs((current) => current.filter((value) => values.has(value)));
  }, [attributeOptions]);

  useEffect(() => {
    if (!isSubmitting || !analysisJobId) return;

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/upload/progress/${analysisJobId}`
        );

        if (!response.ok) return;

        const progress = parseProgressPayload(await response.json());
        if (!progress) return;

        setAnalysisProgress((current) => {
          if (!current) return progress;

          const isBrowserUploadAhead =
            current.activeStep === 0 &&
            progress.activeStep === 0 &&
            current.stepProgress > progress.stepProgress;

          return isBrowserUploadAhead
            ? { ...progress, stepProgress: current.stepProgress }
            : progress;
        });
      } catch {
        // Keep the current progress state; the upload request will surface errors.
      }
    }, 500);

    return () => window.clearInterval(interval);
  }, [analysisJobId, isSubmitting]);

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setRealFile(null);
    setSyntheticFile(null);
    setSelectedQIs(DEFAULT_QUASI_IDENTIFIERS);
    setSelectedSAs(DEFAULT_SENSITIVE_ATTRIBUTES);
    setError(null);
    setSuccessMessage(null);
    setAnalysisProgress(null);
    setAnalysisJobId(null);
  };

  // ── Run Analysis ───────────────────────────────────────────────────────────
  const handleRunAnalysis = async () => {
    setError(null);
    setSuccessMessage(null);

    // Client-side validation
    if (!realFile || !syntheticFile) {
      setError("Please upload both datasets before running the analysis.");
      return;
    }
    if (selectedQIs.length === 0) {
      setError("Please select at least one quasi-identifier.");
      return;
    }
    if (selectedSAs.length === 0) {
      setError("Please select at least one sensitive attribute.");
      return;
    }
    const overlappingSelections = selectedQIs.filter((qi) =>
      selectedSAs.includes(qi)
    );
    if (overlappingSelections.length > 0) {
      setError(
        "Quasi-identifiers and sensitive attributes must be different. Please remove overlapping selections before running the analysis."
      );
      return;
    }

    // Build FormData
    const jobId = createJobId();
    const form = new FormData();
    form.append("real_file", realFile);
    form.append("synthetic_file", syntheticFile);
    selectedQIs.forEach((qi) => form.append("quasi_identifiers", qi));
    selectedSAs.forEach((sa) => form.append("sensitive_attributes", sa));
    form.append("job_id", jobId);

    setIsSubmitting(true);
    setAnalysisJobId(jobId);
    setAnalysisProgress({
      activeStep: 0,
      stepProgress: 0,
      completed: false,
      message: "Uploading datasets...",
    });
    try {
      const data = await postAnalysisForm({
        form,
        url: `${API_BASE_URL}/api/upload`,
        onUploadProgress: (percent) => {
          const browserUploadProgress = Math.round(percent * 0.4);
          setAnalysisProgress((current) => {
            if (!current || current.completed || current.activeStep !== 0) {
              return current;
            }

            return {
              ...current,
              stepProgress: Math.max(current.stepProgress, browserUploadProgress),
              message: "Uploading datasets...",
            };
          });
        },
        onUploadComplete: () => {
          setAnalysisProgress((current) => {
            if (!current || current.completed) return current;

            return {
              activeStep: current.activeStep,
              stepProgress:
                current.activeStep === 0
                  ? Math.max(current.stepProgress, 40)
                  : current.stepProgress,
              completed: false,
              message: "Upload sent. Waiting for backend validation.",
            };
          });
        },
      });

      setAnalysisProgress({
        activeStep: 4,
        stepProgress: 100,
        completed: true,
        status: "completed",
        message: "Analysis complete.",
      });

      // Store the full response so the results page can read it
      sessionStorage.setItem("analysisResult", JSON.stringify(data));
      setSuccessMessage(getApiMessage(data, "Files uploaded successfully."));
      await new Promise((resolve) => setTimeout(resolve, 1200));
      router.push("/results");
    } catch (requestError) {
      setAnalysisProgress(null);

      if (requestError instanceof Error) {
        setError(
          "Could not reach the backend. Make sure the API server is running and NEXT_PUBLIC_API_BASE_URL is set correctly."
        );
      } else {
        const uploadError = requestError as UploadRequestError;
        setError(
          getApiMessage(
            uploadError.data,
            `Server error (${uploadError.status ?? "unknown"}). Please try again.`
          )
        );
      }
    } finally {
      setIsSubmitting(false);
      setAnalysisJobId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#f9fafb] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-[#e5e7eb] w-full">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center gap-3">
          <div className="bg-[#155dfc] w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0">
            <ShieldIcon />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[#101828] text-2xl font-semibold leading-8">
              Privacy Risk Assessment System
            </h1>
            <p className="text-[#4a5565] text-sm leading-5">
              Evaluate privacy risks in synthetic healthcare datasets
            </p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-6 py-10 gap-8">
        {/* Upload card */}
        <div className="w-full max-w-5xl bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-8 flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-[#101828] text-lg font-semibold leading-7">
              Upload Datasets
            </h2>
            <p className="text-[#4a5565] text-sm leading-5">
              Upload both real and synthetic datasets to compare privacy risks
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-6">
            <UploadCard
              title="Real Dataset"
              accent="blue"
              file={realFile}
              onFileSelect={(f) => { setRealFile(f); setError(null); setSuccessMessage(null); }}
              onRemove={() => { setRealFile(null); setSuccessMessage(null); }}
            />
            <UploadCard
              title="Synthetic Dataset"
              accent="teal"
              file={syntheticFile}
              onFileSelect={(f) => { setSyntheticFile(f); setError(null); setSuccessMessage(null); }}
              onRemove={() => { setSyntheticFile(null); setSuccessMessage(null); }}
            />
          </div>
        </div>

        {/* Sections visible only after both files are uploaded */}
        {bothUploaded && (
          <>
            {/* Select Quasi Identifiers */}
            <QuasiIdentifierSelector
              options={attributeOptions}
              selected={selectedQIs}
              onChange={(v) => { setSelectedQIs(v); setError(null); setSuccessMessage(null); }}
            />

            {/* Select Sensitive Attributes */}
            <SensitiveAttributeSelector
              options={attributeOptions}
              selected={selectedSAs}
              onChange={(v) => { setSelectedSAs(v); setError(null); setSuccessMessage(null); }}
            />

            {/* Dataset Summary */}
            <div className="w-full max-w-5xl flex flex-col gap-4">
              <h2 className="text-[#101828] text-lg font-semibold leading-7">
                Dataset Summary
              </h2>
              <div className="flex flex-col sm:flex-row gap-6">
                {SUMMARY.map((item) => (
                  <SummaryCard
                    key={item.label}
                    icon={item.icon}
                    iconBg={item.iconBg}
                    value={item.value}
                    label={item.label}
                  />
                ))}
              </div>
            </div>

            {/* Action buttons */}
            <ActionButtons
              onRunAnalysis={handleRunAnalysis}
              onReset={handleReset}
              isSubmitting={isSubmitting}
            />

            {analysisProgress && (
              <AnalysisProgressCard progress={analysisProgress} />
            )}

            {/* Error banner — shown below buttons */}
            {successMessage && <SuccessBanner message={successMessage} />}
            {error && <ErrorBanner message={error} />}
          </>
        )}
      </main>
    </div>
  );
}
