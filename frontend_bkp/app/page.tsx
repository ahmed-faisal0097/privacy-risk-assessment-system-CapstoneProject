"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import UploadCard from "@/app/components/UploadCard";
import SummaryCard from "@/app/components/SummaryCard";
import ActionButtons from "@/app/components/ActionButtons";
import QuasiIdentifierSelector, {
  DEFAULT_QUASI_IDENTIFIERS,
} from "@/app/components/QuasiIdentifierSelector";
import SensitiveAttributeSelector, {
  DEFAULT_SENSITIVE_ATTRIBUTES,
} from "@/app/components/SensitiveAttributeSelector";

// Backend base URL — set NEXT_PUBLIC_API_BASE_URL in .env.local
const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

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
  const [selectedQIs, setSelectedQIs] = useState<string[]>(DEFAULT_QUASI_IDENTIFIERS);
  const [selectedSAs, setSelectedSAs] = useState<string[]>(DEFAULT_SENSITIVE_ATTRIBUTES);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bothUploaded = realFile !== null && syntheticFile !== null;

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setRealFile(null);
    setSyntheticFile(null);
    setSelectedQIs(DEFAULT_QUASI_IDENTIFIERS);
    setSelectedSAs(DEFAULT_SENSITIVE_ATTRIBUTES);
    setError(null);
    setSuccessMessage(null);
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
    const form = new FormData();
    form.append("real_file", realFile);
    form.append("synthetic_file", syntheticFile);
    selectedQIs.forEach((qi) => form.append("quasi_identifiers", qi));
    selectedSAs.forEach((sa) => form.append("sensitive_attributes", sa));

    setIsSubmitting(true);
    try {
      // TODO (backend integration): POST to the FastAPI validation endpoint.
      // The response JSON is stored in sessionStorage and read by /results.
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        body: form,
      });

      const contentType = res.headers.get("content-type");
      const data = contentType?.includes("application/json")
        ? await res.json()
        : { message: await res.text() };

      if (!res.ok) {
        // Surface the backend error message if present
        const msg =
          data?.detail ??
          data?.message ??
          `Server error (${res.status}). Please try again.`;
        setError(typeof msg === "string" ? msg : JSON.stringify(msg));
        return;
      }

      // Store the full response so the results page can read it
      sessionStorage.setItem("analysisResult", JSON.stringify(data));
      setSuccessMessage(data?.message ?? "Files uploaded successfully.");
      await new Promise((resolve) => setTimeout(resolve, 900));
      router.push("/results");
    } catch {
      setError(
        "Could not reach the backend. Make sure the API server is running and NEXT_PUBLIC_API_BASE_URL is set correctly."
      );
    } finally {
      setIsSubmitting(false);
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
              selected={selectedQIs}
              onChange={(v) => { setSelectedQIs(v); setError(null); setSuccessMessage(null); }}
            />

            {/* Select Sensitive Attributes */}
            <SensitiveAttributeSelector
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

            {/* Error banner — shown below buttons */}
            {successMessage && <SuccessBanner message={successMessage} />}
            {error && <ErrorBanner message={error} />}
          </>
        )}
      </main>
    </div>
  );
}
