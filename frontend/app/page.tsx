"use client";

import { useState, useRef } from "react";
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

/* ── Progress stages ──────────────────────────────────────────────────────── */
const PROGRESS_STAGES = [
  { at: 300,  progress: 20, status: "Uploading datasets..." },
  { at: 900,  progress: 40, status: "Validating schema..." },
  { at: 1800, progress: 65, status: "Processing attributes..." },
  { at: 3000, progress: 85, status: "Running privacy evaluation..." },
] as const;

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
    <div className="w-full max-w-5xl bg-[#fef2f2] border border-[#fca5a5] rounded-[10px] px-5 py-4">
      <p className="text-[#b91c1c] text-sm font-medium leading-5">{message}</p>
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

  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const bothUploaded = realFile !== null && syntheticFile !== null;

  // Compute overlap in real time for inline validation
  const overlap = selectedQIs.filter((qi) => selectedSAs.includes(qi));
  const hasOverlap = overlap.length > 0;

  /* ── Reset ─────────────────────────────────────────────────────────────── */
  const handleReset = () => {
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
    progressTimers.current.forEach(clearTimeout);
    progressTimers.current = [];
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

    // Start progress simulation
    setProgress(5);
    setProgressStatus("Uploading datasets...");
    setIsSubmitting(true);

    progressTimers.current.forEach(clearTimeout);
    progressTimers.current = PROGRESS_STAGES.map(({ at, progress: p, status }) =>
      setTimeout(() => {
        setProgress(p);
        setProgressStatus(status);
      }, at)
    );

    const form = new FormData();
    form.append("real_file", realFile);
    form.append("synthetic_file", syntheticFile);
    selectedQIs.forEach((qi) => form.append("quasi_identifiers", qi));
    selectedSAs.forEach((sa) => form.append("sensitive_attributes", sa));

    let navigating = false;
    try {
      const res = await fetch(`${API_BASE_URL}/api/upload`, {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok) {
        const msg =
          data?.detail ??
          data?.message ??
          `Server error (${res.status}). Please try again.`;
        setError(typeof msg === "string" ? msg : JSON.stringify(msg));
        return;
      }

      // Refresh summary cards with authoritative backend counts if provided
      if (data?.real_file) {
        const rf = data.real_file;
        setRealSummary((prev) =>
          prev
            ? {
                ...prev,
                rowCount: rf.row_count ?? prev.rowCount,
                columnCount: rf.column_count ?? prev.columnCount,
              }
            : prev
        );
      }
      if (data?.synthetic_file) {
        const sf = data.synthetic_file;
        setSyntheticSummary((prev) =>
          prev
            ? {
                ...prev,
                rowCount: sf.row_count ?? prev.rowCount,
                columnCount: sf.column_count ?? prev.columnCount,
              }
            : prev
        );
      }

      // Animate to 100% then navigate
      progressTimers.current.forEach(clearTimeout);
      progressTimers.current = [];
      setProgress(100);
      setProgressStatus("Preparing results...");

      // Merge local client-side CSV summaries into the payload so the
      // results page can display missing-value % without a backend field.
      sessionStorage.setItem(
        "analysisResult",
        JSON.stringify({
          ...data,
          _localRealSummary: realSummary ?? null,
          _localSyntheticSummary: syntheticSummary ?? null,
        })
      );
      navigating = true;

      progressTimers.current.push(
        setTimeout(() => {
          router.push("/results");
        }, 600)
      );
    } catch {
      setError(
        "Could not reach the backend. Make sure the API server is running and NEXT_PUBLIC_API_BASE_URL is set correctly."
      );
    } finally {
      // Keep the progress section visible while navigating; reset on failure
      if (!navigating) {
        setIsSubmitting(false);
        setProgress(0);
        setProgressStatus("Uploading datasets...");
        progressTimers.current.forEach(clearTimeout);
        progressTimers.current = [];
      }
    }
  };

  const handleQIChange = (v: string[]) => { setSelectedQIs(v); setError(null); };
  const handleSAChange = (v: string[]) => { setSelectedSAs(v); setError(null); };

  return (
    <div className="min-h-screen bg-transparent flex flex-col">
      {/* Header — gradient banner, centered */}
      <header
        className="relative w-full shadow-md overflow-hidden"
        style={{ background: "linear-gradient(135deg, #0d2d78 0%, #155dfc 60%, #1a72f5 100%)" }}
      >
        {/* Subtle radial glow for depth */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 60% 80% at 50% -20%, rgba(255,255,255,0.12) 0%, transparent 70%)",
          }}
        />
        <div className="relative max-w-5xl mx-auto px-6 py-9 flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left">
          {/* Icon */}
          <div
            className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0"
            style={{
              background: "rgba(255,255,255,0.15)",
              boxShadow: "inset 0 1px 1px rgba(255,255,255,0.25), 0 2px 8px rgba(0,0,0,0.15)",
              backdropFilter: "blur(4px)",
            }}
          >
            <ShieldIcon />
          </div>
          {/* Title + subtitle */}
          <div className="flex flex-col gap-1">
            <h1 className="text-white text-2xl font-semibold leading-8 tracking-tight drop-shadow-sm">
              Privacy Risk Assessment System
            </h1>
            <p className="text-blue-200 text-sm leading-5 font-normal">
              Evaluate privacy risks in synthetic healthcare datasets
            </p>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center px-6 py-10 gap-8">
        {/* Upload card */}
        <div className="w-full max-w-5xl bg-white border border-[#e5e7eb] rounded-[14px] card-shadow p-8 flex flex-col gap-6">
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
              <h2 className="text-[#101828] text-lg font-semibold leading-7">
                Dataset Summary
              </h2>

              {/* Real Dataset group */}
              <div className="flex flex-col gap-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#2b7fff]">
                  Real Dataset
                </p>
                <div className="flex flex-col sm:flex-row gap-6">
                  <SummaryCard
                    icon={<RowsIcon />}
                    iconBg="bg-[#dbeafe]"
                    value={realSummary ? realSummary.rowCount.toLocaleString() : "—"}
                    label="Number of Rows"
                  />
                  <SummaryCard
                    icon={<ColumnsIcon />}
                    iconBg="bg-[#cbfbf1]"
                    value={realSummary ? String(realSummary.columnCount) : "—"}
                    label="Number of Columns"
                  />
                  <SummaryCard
                    icon={<MissingIcon />}
                    iconBg="bg-[#ffedd4]"
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
                <p className="text-xs font-semibold uppercase tracking-widest text-[#009689]">
                  Synthetic Dataset
                </p>
                <div className="flex flex-col sm:flex-row gap-6">
                  <SummaryCard
                    icon={<RowsIcon />}
                    iconBg="bg-[#dbeafe]"
                    value={
                      syntheticSummary
                        ? syntheticSummary.rowCount.toLocaleString()
                        : "—"
                    }
                    label="Number of Rows"
                  />
                  <SummaryCard
                    icon={<ColumnsIcon />}
                    iconBg="bg-[#cbfbf1]"
                    value={
                      syntheticSummary
                        ? String(syntheticSummary.columnCount)
                        : "—"
                    }
                    label="Number of Columns"
                  />
                  <SummaryCard
                    icon={<MissingIcon />}
                    iconBg="bg-[#ffedd4]"
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
