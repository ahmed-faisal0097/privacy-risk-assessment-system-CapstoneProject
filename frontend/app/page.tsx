"use client";

import { useState, useRef, useEffect } from "react";
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
import AnalysisProgressSection from "@/app/components/AnalysisProgressSection";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

/* ── Icons ────────────────────────────────────────────────────────────────── */
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
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
      fill="none" stroke="#1E3A8A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="3" y1="9" x2="21" y2="9" />
      <line x1="3" y1="15" x2="21" y2="15" />
    </svg>
  );
}

function ColumnsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
      fill="none" stroke="#0891B2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  );
}

function MissingIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
      fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/* ── CSV summary ──────────────────────────────────────────────────────────── */
interface CsvSummary {
  rowCount: number;
  columnCount: number;
  missingValueCount: number;
  missingValuePercent: number;
}

/**
 * Parses a CSV file and returns row count, column count, and missing value
 * statistics. Treats empty strings, "?", "null", and "na" as missing cells.
 * Handles the diabetic dataset convention where "?" denotes unknown values.
 */
async function parseCsvSummary(file: File): Promise<CsvSummary> {
  const text = await file.text();

  const firstNewline = text.indexOf("\n");
  if (firstNewline === -1) {
    return { rowCount: 0, columnCount: 0, missingValueCount: 0, missingValuePercent: 0 };
  }

  const headerLine = text.substring(0, firstNewline).trim();
  // Count columns by splitting header on commas (quoted commas are rare in
  // dataset headers, so a simple split is reliable here)
  const columnCount = headerLine.split(",").length;

  const body = text.substring(firstNewline + 1);
  const dataLines = body.split("\n").filter((l) => l.trim() !== "");
  const rowCount = dataLines.length;

  let missingValueCount = 0;
  for (const line of dataLines) {
    const cells = line.split(",");
    for (const cell of cells) {
      const v = cell.trim().replace(/^"|"$/g, "").toLowerCase();
      if (v === "" || v === "?" || v === "null" || v === "na" || v === "n/a") {
        missingValueCount++;
      }
    }
  }

  const totalCells = rowCount * columnCount;
  const missingValuePercent =
    totalCells > 0 ? (missingValueCount / totalCells) * 100 : 0;

  return { rowCount, columnCount, missingValueCount, missingValuePercent };
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="w-full max-w-5xl bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-5 py-4 flex items-start gap-3">
      <svg className="shrink-0 mt-0.5" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p className="text-[#DC2626] text-sm font-medium leading-5">{message}</p>
    </div>
  );
}

export default function Home() {
  const router = useRouter();

  const [realFile, setRealFile] = useState<File | null>(null);
  const [syntheticFile, setSyntheticFile] = useState<File | null>(null);
  const [realSummary, setRealSummary] = useState<CsvSummary | null>(null);
  const [syntheticSummary, setSyntheticSummary] = useState<CsvSummary | null>(null);
  const [selectedQIs, setSelectedQIs] = useState<string[]>(DEFAULT_QUASI_IDENTIFIERS);
  const [selectedSAs, setSelectedSAs] = useState<string[]>(DEFAULT_SENSITIVE_ATTRIBUTES);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState("Uploading datasets...");

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const bothUploaded = realFile !== null && syntheticFile !== null;

  // Compute overlap in real time for inline validation
  const overlap = selectedQIs.filter((qi) => selectedSAs.includes(qi));
  const hasOverlap = overlap.length > 0;

  /* ── Polling helpers ────────────────────────────────────────────────────── */
  const stopPolling = () => {
    if (pollingIntervalRef.current !== null) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  // Clean up any active poll on unmount
  useEffect(() => () => stopPolling(), []);

  /* ── Reset ─────────────────────────────────────────────────────────────── */
  const handleReset = () => {
    stopPolling();
    setRealFile(null);
    setSyntheticFile(null);
    setRealSummary(null);
    setSyntheticSummary(null);
    setSelectedQIs(DEFAULT_QUASI_IDENTIFIERS);
    setSelectedSAs(DEFAULT_SENSITIVE_ATTRIBUTES);
    setError(null);
    setIsSubmitting(false);
    setProgress(0);
    setProgressStatus("Uploading datasets...");
  };

  /* ── Run Analysis ───────────────────────────────────────────────────────── */
  const handleRunAnalysis = async () => {
    setError(null);

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
    if (hasOverlap) {
      setError(
        "Quasi-identifiers and sensitive attributes must not overlap. Remove conflicting selections highlighted in red."
      );
      return;
    }

    setProgress(5);
    setProgressStatus("Uploading files...");
    setIsSubmitting(true);

    const form = new FormData();
    form.append("real_file", realFile);
    form.append("synthetic_file", syntheticFile);
    selectedQIs.forEach((qi) => form.append("quasi_identifiers", qi));
    selectedSAs.forEach((sa) => form.append("sensitive_attributes", sa));

    try {
      // ── Step 1: POST to /api/upload — returns job_id immediately ────────
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        const msg =
          data?.detail ?? data?.message ?? `Server error (${res.status}). Please try again.`;
        setError(typeof msg === "string" ? msg : JSON.stringify(msg));
        setIsSubmitting(false);
        setProgress(0);
        setProgressStatus("Uploading datasets...");
        return;
      }

      const jobId: string = data.job_id;
      if (!jobId) {
        setError("Backend did not return a job ID. Please try again.");
        setIsSubmitting(false);
        setProgress(0);
        setProgressStatus("Uploading datasets...");
        return;
      }

      setProgressStatus(data.message ?? "Analysis started...");

      // Capture local CSV summaries now — the setInterval closure would
      // otherwise read stale state if the user somehow changes files.
      const capturedRealSummary = realSummary;
      const capturedSyntheticSummary = syntheticSummary;

      // ── Step 2: poll GET /api/progress/{jobId} every 1 second ───────────
      pollingIntervalRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`${API_BASE_URL}/api/progress/${jobId}`);

          if (!pollRes.ok) {
            stopPolling();
            setError(`Progress check failed (${pollRes.status}). Please try again.`);
            setIsSubmitting(false);
            setProgress(0);
            setProgressStatus("Uploading datasets...");
            return;
          }

          const poll = await pollRes.json();

          // Mirror backend progress + message into UI
          setProgress(poll.progress ?? 0);
          setProgressStatus(poll.message ?? "Processing...");

          if (poll.status === "completed") {
            stopPolling();

            const result = poll.result;

            // Refresh summary cards with authoritative backend row/column counts
            if (result?.real_file) {
              const rf = result.real_file;
              setRealSummary((prev) =>
                prev
                  ? { ...prev, rowCount: rf.row_count ?? prev.rowCount, columnCount: rf.column_count ?? prev.columnCount }
                  : prev
              );
            }
            if (result?.synthetic_file) {
              const sf = result.synthetic_file;
              setSyntheticSummary((prev) =>
                prev
                  ? { ...prev, rowCount: sf.row_count ?? prev.rowCount, columnCount: sf.column_count ?? prev.columnCount }
                  : prev
              );
            }

            setProgress(100);
            setProgressStatus("Analysis complete!");

            // Merge local missing-value summaries into the payload so the
            // results page can display them without a dedicated backend field.
            sessionStorage.setItem(
              "analysisResult",
              JSON.stringify({
                ...result,
                _localRealSummary: capturedRealSummary,
                _localSyntheticSummary: capturedSyntheticSummary,
              })
            );

            setTimeout(() => router.push("/results"), 600);

          } else if (poll.status === "failed") {
            stopPolling();
            setError(poll.error ?? "Analysis failed. Please try again.");
            setIsSubmitting(false);
            setProgress(0);
            setProgressStatus("Uploading datasets...");
          }
        } catch {
          stopPolling();
          setError("Lost connection to the backend while checking progress. Please try again.");
          setIsSubmitting(false);
          setProgress(0);
          setProgressStatus("Uploading datasets...");
        }
      }, 1000);

    } catch {
      setError(
        "Could not reach the backend. Make sure the API server is running and NEXT_PUBLIC_API_BASE_URL is set correctly."
      );
      setIsSubmitting(false);
      setProgress(0);
      setProgressStatus("Uploading datasets...");
    }
  };

  const handleQIChange = (v: string[]) => { setSelectedQIs(v); setError(null); };
  const handleSAChange = (v: string[]) => { setSelectedSAs(v); setError(null); };

  return (
    <div className="min-h-screen bg-transparent flex flex-col">
      {/* Header — enterprise healthcare gradient banner */}
      <header
        className="relative w-full overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0F1F47 0%, #1E3A8A 45%, #1D4ED8 80%, #0891B2 100%)",
          boxShadow: "0 4px 24px rgba(15,23,42,0.25)",
        }}
      >
        {/* Analytical dot-grid texture */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(255,255,255,0.18) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            opacity: 0.35,
          }}
        />
        {/* Top glow halo */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 50% -10%, rgba(147,197,253,0.22) 0%, transparent 65%)",
          }}
        />
        <div className="relative max-w-5xl mx-auto px-6 py-10 flex flex-col items-center text-center gap-4">
          {/* Glassmorphism icon container */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
            style={{
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.20)",
              boxShadow:
                "inset 0 1px 1px rgba(255,255,255,0.20), 0 4px 16px rgba(0,0,0,0.20)",
              backdropFilter: "blur(8px)",
            }}
          >
            <ShieldIcon />
          </div>
          {/* Platform badge */}
          <div
            className="text-[10px] font-semibold tracking-[0.12em] uppercase px-3 py-1 rounded-full"
            style={{
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "rgba(186,230,253,0.90)",
              backdropFilter: "blur(4px)",
            }}
          >
            Healthcare Privacy Intelligence Platform
          </div>
          {/* Title */}
          <h1 className="text-white text-[28px] font-bold leading-tight tracking-tight">
            Privacy Risk Assessment System
          </h1>
          {/* Subtitle */}
          <p className="text-sky-200/80 text-sm leading-6 max-w-md font-normal">
            Enterprise-grade evaluation of privacy risks in synthetic healthcare datasets
          </p>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-6 py-10 gap-8">
        {/* Upload card */}
        <div className="w-full max-w-5xl bg-white border border-[#E2E8F0] rounded-2xl card-shadow p-8 flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[#0F172A] text-lg font-bold leading-7 tracking-tight">
              Upload Datasets
            </h2>
            <p className="text-[#64748B] text-sm leading-5">
              Upload both real and synthetic datasets to compare privacy risks
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-6">
            <UploadCard
              title="Real Dataset"
              accent="blue"
              file={realFile}
              onFileSelect={(f) => {
                setRealFile(f);
                setError(null);
                parseCsvSummary(f).then(setRealSummary);
              }}
              onRemove={() => { setRealFile(null); setRealSummary(null); }}
            />
            <UploadCard
              title="Synthetic Dataset"
              accent="teal"
              file={syntheticFile}
              onFileSelect={(f) => {
                setSyntheticFile(f);
                setError(null);
                parseCsvSummary(f).then(setSyntheticSummary);
              }}
              onRemove={() => { setSyntheticFile(null); setSyntheticSummary(null); }}
            />
          </div>
        </div>

        {bothUploaded && (
          <>
            {/* Select Quasi Identifiers */}
            <QuasiIdentifierSelector
              selected={selectedQIs}
              onChange={handleQIChange}
              conflicting={overlap}
              disabled={isSubmitting}
            />

            {/* Select Sensitive Attributes */}
            <SensitiveAttributeSelector
              selected={selectedSAs}
              onChange={handleSAChange}
              conflicting={overlap}
              disabled={isSubmitting}
            />

            {/* Dataset Summary */}
            <div className="w-full max-w-5xl flex flex-col gap-5">
              <h2 className="text-[#0F172A] text-lg font-bold leading-7 tracking-tight">
                Dataset Summary
              </h2>

              {/* Real Dataset group */}
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#1D4ED8]">
                  Real Dataset
                </p>
                <div className="flex flex-col sm:flex-row gap-6">
                  <SummaryCard
                    icon={<RowsIcon />}
                    iconBg="bg-[#EFF6FF]"
                    value={realSummary ? realSummary.rowCount.toLocaleString() : "—"}
                    label="Number of Rows"
                  />
                  <SummaryCard
                    icon={<ColumnsIcon />}
                    iconBg="bg-[#ECFEFF]"
                    value={realSummary ? String(realSummary.columnCount) : "—"}
                    label="Number of Columns"
                  />
                  <SummaryCard
                    icon={<MissingIcon />}
                    iconBg="bg-[#FFFBEB]"
                    value={
                      realSummary
                        ? `${realSummary.missingValuePercent.toFixed(1)}%`
                        : "—"
                    }
                    label="Missing Values"
                  />
                </div>
              </div>

              {/* Synthetic Dataset group */}
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#0891B2]">
                  Synthetic Dataset
                </p>
                <div className="flex flex-col sm:flex-row gap-6">
                  <SummaryCard
                    icon={<RowsIcon />}
                    iconBg="bg-[#EFF6FF]"
                    value={
                      syntheticSummary
                        ? syntheticSummary.rowCount.toLocaleString()
                        : "—"
                    }
                    label="Number of Rows"
                  />
                  <SummaryCard
                    icon={<ColumnsIcon />}
                    iconBg="bg-[#ECFEFF]"
                    value={
                      syntheticSummary
                        ? String(syntheticSummary.columnCount)
                        : "—"
                    }
                    label="Number of Columns"
                  />
                  <SummaryCard
                    icon={<MissingIcon />}
                    iconBg="bg-[#FFFBEB]"
                    value={
                      syntheticSummary
                        ? `${syntheticSummary.missingValuePercent.toFixed(1)}%`
                        : "—"
                    }
                    label="Missing Values"
                  />
                </div>
              </div>
            </div>

            {/* Action buttons OR progress section */}
            {isSubmitting ? (
              <AnalysisProgressSection
                progress={progress}
                statusText={progressStatus}
              />
            ) : (
              <ActionButtons
                onRunAnalysis={handleRunAnalysis}
                onReset={handleReset}
                isSubmitting={false}
                runDisabled={hasOverlap}
              />
            )}

            {/* Error banner */}
            {error && <ErrorBanner message={error} />}
          </>
        )}
      </main>
    </div>
  );
}
