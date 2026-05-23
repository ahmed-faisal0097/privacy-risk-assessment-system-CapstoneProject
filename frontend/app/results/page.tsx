"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SummaryCard from "@/app/components/SummaryCard";
import UploadedFilePanel from "@/app/components/UploadedFilePanel";
import RiskOverviewCard from "@/app/components/RiskOverviewCard";
import RiskBadge from "@/app/components/RiskBadge";
import ResultsCharts from "@/app/components/ResultsCharts";
import { mockResults } from "@/app/results/mockData";
import type { AnalysisResults, RiskLevel } from "@/app/results/mockData";

// ─── Typed shapes mirroring the backend response ─────────────────────────────

interface FileInfo {
  dataset_id?: string;
  file_name?: string;
  original_filename?: string;
  stored_filename?: string;
  path?: string;
  size_bytes?: number;
  extension?: string;
  row_count?: number;
  column_count?: number;
  columns?: string[];
}

interface UniquenessResult {
  total_synthetic_records?: number;
  k_zero_count?: number;
  k_one_count?: number;
  k_lt_5_count?: number;
  uniqueness_score_pct?: number;
  rare_combination_score_pct?: number;
  qis_requested?: string[];
  qis_used?: string[];
  sas_used?: string[];
  qid_group_stats?: Record<string, unknown>;
}

interface LinkageResult {
  risk_type?: string;
  total_synthetic_records?: number;
  qis_used?: string[];
  exact_match?: {
    exact_total_synthetic_records?: number;
    exact_no_match_count?: number;
    exact_unique_match_count?: number;
    exact_small_group_match_count?: number;
    exact_ambiguous_match_count?: number;
    exact_match_score_pct?: number;
  };
  hamming_nearest_neighbour?: {
    hamming_total_synthetic_records?: number;
    hamming_high_risk_close_match_count?: number;
    hamming_medium_risk_close_match_count?: number;
    hamming_low_risk_distant_match_count?: number;
    hamming_score_pct?: number;
    hamming_high_threshold?: number;
    hamming_medium_threshold?: number;
  };
  exact_match_score_pct?: number;
  hamming_score_pct?: number;
  overall_linkage_score_pct?: number;
  risk_level?: string;
  risk_summary?: string;
}

interface AttrInferenceRow {
  qid_set?: string;
  known_columns?: string;
  target_column?: string;
  n_real_eval_rows?: number;
  n_qid_groups?: number;
  coverage_rate?: number;
  attack_accuracy_on_covered?: number;
  overall_accuracy_with_baseline_fallback?: number;
  baseline_accuracy?: number;
  gain_over_baseline?: number;
  baseline_label?: string;
  risk_score?: number;       // raw 0-1 product (legacy)
  risk_score_pct?: number;   // explicit 0-100 percentage scale (preferred)
  qualitative_label?: string;
}

type AttrInferenceSA = AttrInferenceRow[] | { error: string };
type AttrInferenceSummary = Record<string, AttrInferenceSA>;

interface RiskEvaluationSummary {
  uniqueness_and_rare_combination?: UniquenessResult;
  linkage_reidentification?: LinkageResult;
  attribute_inference_summary?: AttrInferenceSummary;
}

interface RiskEvaluation {
  real_uuid?: string;
  synthetic_uuid?: string;
  qi_list?: string[];
  sa_list?: string[];
  result_dir?: string;
  files?: {
    syn_flags?: string;
    syn_per_record?: string;
    summary_json?: string;
    qid_group_stats?: string;
    linkage_per_record?: string;
    linkage_summary?: string;
    attribute_inference_files?: Record<string, string>;
  };
  summary?: RiskEvaluationSummary;
}

/** Client-side CSV parse result stored alongside the API response in sessionStorage. */
interface LocalCsvSummary {
  rowCount?: number;
  columnCount?: number;
  missingValueCount?: number;
  missingValuePercent?: number;
}

/** Full shape of the POST /api/upload response (plus local client fields). */
interface ApiResult {
  message?: string;
  status?: string;
  evaluation_id?: string;
  quasi_identifiers?: string[];
  sensitive_attributes?: string[];
  sensitive_attributes_missing?: {
    missing_in_real?: string[];
    missing_in_synthetic?: string[];
  };
  risk_evaluation?: RiskEvaluation;
  real_file?: FileInfo;
  synthetic_file?: FileInfo;
  common_columns?: string[];
  real_only_columns?: string[];
  synthetic_only_columns?: string[];
  /** Client-side fields injected by page.tsx before sessionStorage.setItem */
  _localRealSummary?: LocalCsvSummary | null;
  _localSyntheticSummary?: LocalCsvSummary | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (bytes == null) return "-";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

/** Convert a 0-100 percentage to a 0–10 display string, e.g. "5.2/10". */
function pctToTenScale(pct: number | null | undefined): string {
  if (pct == null) return "—";
  return `${(pct / 10).toFixed(1)}/10`;
}

/** Map backend risk level strings (HIGH/MEDIUM/LOW) to frontend RiskLevel type. */
function backendLevelToRisk(level?: string): RiskLevel | null {
  if (!level) return null;
  const map: Record<string, RiskLevel> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
  return map[level.toUpperCase()] ?? null;
}

/** Derive frontend RiskLevel from a raw 0-100 percentage using the project thresholds. */
function riskLevelFromPct(pct: number): RiskLevel {
  if (pct >= 20) return "High";
  if (pct >= 10) return "Medium";
  return "Low";
}

/**
 * Extract per-SA max risk scores from the attribute inference summary.
 * Prefers the explicit risk_score_pct field (0-100 scale).
 * Falls back to risk_score * 100 for older backend responses.
 */
function getAttrInferenceScores(
  summary?: AttrInferenceSummary
): { sa: string; scorePct: number }[] {
  if (!summary) return [];
  const out: { sa: string; scorePct: number }[] = [];
  for (const [sa, results] of Object.entries(summary)) {
    if (!Array.isArray(results)) continue;
    const scores = results
      .map((r) => {
        if (typeof r?.risk_score_pct === "number") return r.risk_score_pct;
        if (typeof r?.risk_score === "number") return r.risk_score * 100;
        return -Infinity;
      })
      .filter(isFinite);
    if (scores.length > 0) {
      out.push({ sa, scorePct: Math.max(...scores) });
    }
  }
  return out;
}

// ─── Helper: map raw API result → display-ready AnalysisResults ──────────────
function buildResults(api: ApiResult): AnalysisResults {
  const realFile = api.real_file;
  const syntheticFile = api.synthetic_file;
  const evalSummary = api.risk_evaluation?.summary;

  // ── Extract scores from each risk category ────────────────────────────────
  const uniq = evalSummary?.uniqueness_and_rare_combination;
  const uniqPct = uniq?.uniqueness_score_pct ?? null;
  const rarePct = uniq?.rare_combination_score_pct ?? null;

  const linkage = evalSummary?.linkage_reidentification;
  const linkagePct = linkage?.overall_linkage_score_pct ?? null;
  const linkageLevel =
    backendLevelToRisk(linkage?.risk_level) ??
    (linkagePct !== null ? riskLevelFromPct(linkagePct) : null);

  const attrScores = getAttrInferenceScores(evalSummary?.attribute_inference_summary);
  const attrAvgPct =
    attrScores.length > 0
      ? attrScores.reduce((s, x) => s + x.scorePct, 0) / attrScores.length
      : null;

  const allPcts = [uniqPct, rarePct, linkagePct, attrAvgPct].filter(
    (p): p is number => p !== null
  );
  const overallPct = allPcts.length > 0 ? Math.max(...allPcts) : null;

  // ── Risk overview cards ────────────────────────────────────────────────────
  const riskOverview: AnalysisResults["riskOverview"] = [
    {
      label: "Overall Risk Level",
      value: pctToTenScale(overallPct),
      level: overallPct !== null ? riskLevelFromPct(overallPct) : mockResults.riskOverview[0].level,
    },
    {
      label: "Uniqueness Risk",
      value: pctToTenScale(uniqPct),
      level: uniqPct !== null ? riskLevelFromPct(uniqPct) : mockResults.riskOverview[1].level,
    },
    {
      label: "Linkage Risk",
      value: pctToTenScale(linkagePct),
      level: linkageLevel ?? mockResults.riskOverview[2].level,
    },
    {
      label: "Attribute Inference Risk",
      value: pctToTenScale(attrAvgPct),
      level: attrAvgPct !== null ? riskLevelFromPct(attrAvgPct) : mockResults.riskOverview[3].level,
    },
  ];

  // ── Variable risk chart: per-SA attribute inference scores (0-10 scale) ───
  const variableRiskChart: AnalysisResults["variableRiskChart"] =
    attrScores.length > 0
      ? [...attrScores]
          .sort((a, b) => a.scorePct - b.scorePct)
          .map(({ sa, scorePct }) => ({
            variable: sa,
            score: Math.round((scorePct / 10) * 10) / 10, // to 1 d.p. on 0-10 scale
          }))
      : mockResults.variableRiskChart;

  // ── Variable risk ranking ──────────────────────────────────────────────────
  const variableRiskRanking: AnalysisResults["variableRiskRanking"] =
    attrScores.length > 0
      ? [...attrScores]
          .sort((a, b) => b.scorePct - a.scorePct)
          .map(({ sa, scorePct }, idx) => ({
            rank: idx + 1,
            variable: sa,
            score: Math.round((scorePct / 10) * 10) / 10,
            level: riskLevelFromPct(scorePct),
          }))
      : mockResults.variableRiskRanking;

  // ── Missing values from local client-side parse (not available in backend) ─
  const realMissingPct = api._localRealSummary?.missingValuePercent;
  const missingDisplay =
    realMissingPct != null
      ? `${realMissingPct.toFixed(1)}%`
      : mockResults.datasetSummary.missingValues;

  return {
    uploadedDatasets: {
      real: {
        name: realFile?.original_filename ?? mockResults.uploadedDatasets.real.name,
        size:
          formatBytes(realFile?.size_bytes) !== "-"
            ? formatBytes(realFile?.size_bytes)
            : mockResults.uploadedDatasets.real.size,
      },
      synthetic: {
        name: syntheticFile?.original_filename ?? mockResults.uploadedDatasets.synthetic.name,
        size:
          formatBytes(syntheticFile?.size_bytes) !== "-"
            ? formatBytes(syntheticFile?.size_bytes)
            : mockResults.uploadedDatasets.synthetic.size,
      },
    },
    datasetSummary: {
      rows:
        realFile?.row_count != null
          ? realFile.row_count.toLocaleString()
          : mockResults.datasetSummary.rows,
      columns:
        realFile?.column_count != null
          ? String(realFile.column_count)
          : mockResults.datasetSummary.columns,
      missingValues: missingDisplay,
    },
    riskOverview,
    variableRiskChart,
    ageGroupChart: mockResults.ageGroupChart, // no backend equivalent yet
    variableRiskRanking,
  };
}

// ─── Shared icons ─────────────────────────────────────────────────────────────
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

function PlayIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
      fill="white" stroke="none">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-3.46" />
    </svg>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[#0F172A] text-lg font-bold leading-7 tracking-tight">{children}</h2>
  );
}

// ─── Shared page header ───────────────────────────────────────────────────────
function PageHeader() {
  return (
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
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Platform Logo"
          className="w-20 h-20 object-contain"
          style={{ mixBlendMode: "screen" }}
        />
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
        <h1 className="text-white text-[28px] font-bold leading-tight tracking-tight">
          Privacy Risk Assessment System
        </h1>
      </div>
    </header>
  );
}

// ─── No-data fallback ─────────────────────────────────────────────────────────
function NoDataFallback() {
  return (
    <div className="min-h-screen bg-transparent flex flex-col">
      <PageHeader />
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div
          className="w-full max-w-5xl bg-white border border-[#E2E8F0] rounded-2xl p-12 flex flex-col items-center gap-6 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04), 0 4px 16px rgba(30,58,138,0.07)" }}
        >
          <div className="bg-[#FFFBEB] w-16 h-16 rounded-full flex items-center justify-center">
            <MissingIcon />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-[#0F172A] text-xl font-bold tracking-tight">
              No analysis data found.
            </h2>
            <p className="text-[#64748B] text-sm max-w-sm">
              Please upload your datasets and run the analysis from the main page first.
            </p>
          </div>
          <Link
            href="/"
            className="text-white text-sm font-semibold h-10 px-5 rounded-xl flex items-center gap-2 transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)",
              boxShadow: "0 4px 14px rgba(30,58,138,0.30)",
            }}
          >
            ← Back to Upload
          </Link>
        </div>
      </main>
    </div>
  );
}

// ─── Results page ─────────────────────────────────────────────────────────────
export default function ResultsPage() {
  const router = useRouter();

  // null = loading, false = not found, object = loaded
  const [apiResult, setApiResult] = useState<ApiResult | null | false>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    // Read the backend response stored by the landing page after a successful upload.
    // TODO: alternatively fetch from backend directly if a session/token is available.
    const raw = sessionStorage.getItem("analysisResult");
    if (!raw) {
      setApiResult(false);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as ApiResult;
      console.log("analysisResult:", parsed);
      setApiResult(parsed);
    } catch {
      setApiResult(false);
    }
  }, []);

  // Still loading from sessionStorage — render nothing to avoid flash
  if (apiResult === null) return null;

  // No data found
  if (apiResult === false) return <NoDataFallback />;

  // Map API response to the display shape (with mock fallbacks for missing fields)
  const results = buildResults(apiResult);

  const resultDir = apiResult.risk_evaluation?.result_dir;
  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");

  const handleDownloadReport = async (format: "html" | "csv" | "pdf") => {
    if (!resultDir) {
      setDownloadError("Report not available — result directory missing from the analysis response.");
      return;
    }
    setDownloading(true);
    setDownloadError(null);

    // This flag is set to true the moment the blob bytes are fully received.
    // The catch block only shows an error if the blob was NOT yet received —
    // meaning it's a genuine backend / network failure.
    // Anything that throws AFTER blobReceived = true is a browser-side DOM
    // quirk (Chromium PDF viewer, revokeObjectURL timing, etc.) and must be
    // silently swallowed so the user never sees a false "backend" error.
    let blobReceived = false;

    try {
      const url = `${API_BASE}/api/report/${format}?result_dir=${encodeURIComponent(resultDir)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `Server error (${res.status})` }));
        setDownloadError(err.detail ?? `Failed to generate report (${res.status})`);
        return;
      }

      const blob = await res.blob();
      blobReceived = true; // ← mark HERE, before any DOM work

      // Trigger browser save-dialog. Any exception from this point on is a
      // browser-side issue and must NOT be surfaced as a backend error.
      const objectUrl = URL.createObjectURL(blob);
      const filename =
        format === "html" ? "privacy_risk_report.html"
        : format === "csv" ? "privacy_risk_report_summary.csv"
        : "privacy-risk-report.pdf";
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Delay revocation — PDFs need more time because Chromium may hand the
      // blob to its internal viewer before starting the actual file-system write.
      setTimeout(
        () => { try { URL.revokeObjectURL(objectUrl); } catch { /* ignore */ } },
        format === "pdf" ? 2000 : 300,
      );

    } catch {
      // Only tell the user about a genuine backend / network failure.
      if (!blobReceived) {
        setDownloadError("Could not reach the backend to generate the report.");
      }
      // If blobReceived is true something threw during the DOM operations —
      // the file was already delivered, so stay silent.
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col">
      <PageHeader />

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col items-center px-6 py-10 gap-8">
        <div className="w-full max-w-5xl flex flex-col gap-8">

          {/* ── Section 1: Uploaded Datasets ── */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl card-shadow p-8 flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <SectionTitle>Upload Datasets</SectionTitle>
              <p className="text-[#64748B] text-sm leading-5">
                Upload both real and synthetic datasets to compare privacy risks
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-6">
              <UploadedFilePanel
                title="Real Dataset"
                fileName={results.uploadedDatasets.real.name}
                fileSize={results.uploadedDatasets.real.size}
                accent="blue"
              />
              <UploadedFilePanel
                title="Synthetic Dataset"
                fileName={results.uploadedDatasets.synthetic.name}
                fileSize={results.uploadedDatasets.synthetic.size}
                accent="teal"
              />
            </div>
          </div>

          {/* ── Section 2: Dataset Summary ── */}
          <div className="flex flex-col gap-5">
            <SectionTitle>Dataset Summary</SectionTitle>

            {/* Real dataset */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#1D4ED8]">
                Real Dataset
              </p>
              <div className="flex flex-col sm:flex-row gap-6">
                <SummaryCard icon={<RowsIcon />} iconBg="bg-[#EFF6FF]"
                  value={results.datasetSummary.rows} label="Number of Rows" />
                <SummaryCard icon={<ColumnsIcon />} iconBg="bg-[#ECFEFF]"
                  value={results.datasetSummary.columns} label="Number of Columns" />
                <SummaryCard icon={<MissingIcon />} iconBg="bg-[#FFFBEB]"
                  value={results.datasetSummary.missingValues} label="Missing Values" />
              </div>
            </div>

            {/* Synthetic dataset */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#0891B2]">
                Synthetic Dataset
              </p>
              <div className="flex flex-col sm:flex-row gap-6">
                <SummaryCard icon={<RowsIcon />} iconBg="bg-[#EFF6FF]"
                  value={
                    apiResult.synthetic_file?.row_count != null
                      ? apiResult.synthetic_file.row_count.toLocaleString()
                      : apiResult._localSyntheticSummary?.rowCount != null
                        ? apiResult._localSyntheticSummary.rowCount.toLocaleString()
                        : "—"
                  }
                  label="Number of Rows" />
                <SummaryCard icon={<ColumnsIcon />} iconBg="bg-[#ECFEFF]"
                  value={
                    apiResult.synthetic_file?.column_count != null
                      ? String(apiResult.synthetic_file.column_count)
                      : apiResult._localSyntheticSummary?.columnCount != null
                        ? String(apiResult._localSyntheticSummary.columnCount)
                        : "—"
                  }
                  label="Number of Columns" />
                <SummaryCard icon={<MissingIcon />} iconBg="bg-[#FFFBEB]"
                  value={
                    apiResult._localSyntheticSummary?.missingValuePercent != null
                      ? `${apiResult._localSyntheticSummary.missingValuePercent.toFixed(1)}%`
                      : "—"
                  }
                  label="Missing Values" />
              </div>
            </div>
          </div>

          {/* ── Section 3: Analysis Configuration + Uniqueness + Inference ── */}
          {(apiResult.quasi_identifiers?.length || apiResult.sensitive_attributes?.length) ? (() => {
            const uniq = apiResult.risk_evaluation?.summary?.uniqueness_and_rare_combination;
            const inferenceSummary = apiResult.risk_evaluation?.summary?.attribute_inference_summary;

            /* Build one display row per sensitive attribute */
            const inferenceRows: {
              sa: string;
              coverage: string;
              attackAccuracy: string;
              baselineAccuracy: string;
              gainOverBaseline: string;
              riskLevel: RiskLevel;
            }[] = [];

            if (inferenceSummary) {
              for (const [sa, rows] of Object.entries(inferenceSummary)) {
                if (!Array.isArray(rows) || rows.length === 0) continue;
                /* Pick the row with the highest risk score (worst-case) */
                const best = rows.reduce((prev, cur) => {
                  const ps = typeof prev.risk_score_pct === "number" ? prev.risk_score_pct
                    : typeof prev.risk_score === "number" ? prev.risk_score * 100 : 0;
                  const cs = typeof cur.risk_score_pct === "number" ? cur.risk_score_pct
                    : typeof cur.risk_score === "number" ? cur.risk_score * 100 : 0;
                  return cs > ps ? cur : prev;
                });

                const fmtPct = (v?: number) =>
                  v == null ? "—" : `${(v <= 1 ? v * 100 : v).toFixed(1)}%`;

                const gain = best.gain_over_baseline;
                const gainStr = gain == null ? "—"
                  : `${gain >= 0 ? "+" : ""}${(gain <= 1 && gain >= -1 ? gain * 100 : gain).toFixed(1)}%`;

                const label = best.qualitative_label ?? "";
                const riskLevel: RiskLevel =
                  backendLevelToRisk(label) ??
                  riskLevelFromPct(
                    typeof best.risk_score_pct === "number" ? best.risk_score_pct
                      : typeof best.risk_score === "number" ? best.risk_score * 100 : 0
                  );

                inferenceRows.push({
                  sa,
                  coverage: fmtPct(best.coverage_rate),
                  attackAccuracy: fmtPct(best.attack_accuracy_on_covered),
                  baselineAccuracy: fmtPct(best.baseline_accuracy),
                  gainOverBaseline: gainStr,
                  riskLevel,
                });
              }
            }

            return (
              <div
                className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden"
                style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04), 0 4px 16px rgba(30,58,138,0.07)" }}
              >
                {/* ── Part A: QI / SA column list ── */}
                <div className="p-8 flex flex-col gap-5">
                  <div className="flex flex-col gap-1">
                    <SectionTitle>Analysis Configuration</SectionTitle>
                    <p className="text-[#64748B] text-sm leading-5">
                      Columns selected for this analysis run
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-8">
                    {apiResult.quasi_identifiers?.length ? (
                      <div className="flex-1 flex flex-col gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#1D4ED8]">
                          Quasi Identifiers
                        </p>
                        <p className="text-sm text-[#475569] leading-6">
                          {apiResult.quasi_identifiers.join(", ")}
                        </p>
                      </div>
                    ) : null}
                    {apiResult.sensitive_attributes?.length ? (
                      <div className="flex-1 flex flex-col gap-2">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#0891B2]">
                          Sensitive Attributes
                        </p>
                        <p className="text-sm text-[#475569] leading-6">
                          {apiResult.sensitive_attributes.join(", ")}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                {/* ── Part B: Uniqueness & Rare-Combination Results ── */}
                {uniq ? (
                  <>
                    <div className="h-px bg-[#F1F5F9]" />
                    <div className="p-8 flex flex-col gap-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#475569]">
                        Uniqueness &amp; Rare-Combination Results
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                        {[
                          {
                            label: "Uniqueness Score",
                            value: `${(uniq.uniqueness_score_pct ?? 0).toFixed(2)}%`,
                          },
                          {
                            label: "Rare Combination Score",
                            value: `${(uniq.rare_combination_score_pct ?? 0).toFixed(2)}%`,
                          },
                          {
                            label: "Unique Records (k=1)",
                            value: (uniq.k_one_count ?? 0).toLocaleString(),
                          },
                          {
                            label: "Total Synthetic Records",
                            value: (uniq.total_synthetic_records ?? 0).toLocaleString(),
                          },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex flex-col gap-1">
                            <p className="text-xs text-[#94A3B8] leading-4">{label}</p>
                            <p className="text-[22px] font-bold text-[#0F172A] leading-8 tracking-tight tabular-nums">
                              {value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                ) : null}

                {/* ── Part C: Attribute Inference Results table ── */}
                {inferenceRows.length > 0 ? (
                  <>
                    <div className="h-px bg-[#F1F5F9]" />
                    <div className="flex flex-col gap-4 p-8">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#475569]">
                        Attribute Inference Results (Per Sensitive Attribute)
                      </p>
                      <div className="rounded-xl border border-[#E2E8F0] overflow-hidden">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                              {["Sensitive Attribute", "Coverage", "Attack Accuracy", "Baseline Accuracy", "Gain over Baseline", "Risk Level"].map((h) => (
                                <th
                                  key={h}
                                  className="text-left text-[#475569] text-[10px] font-bold tracking-wider uppercase px-5 py-3"
                                >
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {inferenceRows.map((row, idx) => (
                              <tr
                                key={row.sa}
                                className={[
                                  idx < inferenceRows.length - 1 ? "border-b border-[#F1F5F9]" : "",
                                  "hover:bg-[#F8FAFC] transition-colors duration-100",
                                ].join(" ")}
                              >
                                <td className="px-5 py-3.5 text-[#0F172A] font-semibold">{row.sa}</td>
                                <td className="px-5 py-3.5 text-[#475569] tabular-nums">{row.coverage}</td>
                                <td className="px-5 py-3.5 text-[#475569] tabular-nums">{row.attackAccuracy}</td>
                                <td className="px-5 py-3.5 text-[#475569] tabular-nums">{row.baselineAccuracy}</td>
                                <td className="px-5 py-3.5 text-[#475569] tabular-nums font-medium">{row.gainOverBaseline}</td>
                                <td className="px-5 py-3.5">
                                  <RiskBadge level={row.riskLevel} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            );
          })() : null}

          {/* ── Section 4: Privacy Risk Overview ── */}
          <div className="flex flex-col gap-4">
            <SectionTitle>Privacy Risk Overview</SectionTitle>
            <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {results.riskOverview.map((item) => (
                <RiskOverviewCard
                  key={item.label}
                  label={item.label}
                  value={item.value}
                  level={item.level}
                />
              ))}
            </div>
          </div>

          {/* ── Section 5: Risk Analysis charts ── */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <SectionTitle>Risk Analysis</SectionTitle>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="text-white text-sm font-semibold h-9 px-4 rounded-xl flex items-center gap-2 transition-all duration-200 hover:-translate-y-0.5"
                style={{
                  background: "linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)",
                  boxShadow: "0 2px 8px rgba(30,58,138,0.30)",
                }}
              >
                <PlayIcon />
                Run Again
              </button>
            </div>
            {/* TODO: replace mock chart data with real backend fields when available */}
            <ResultsCharts
              variableRiskChart={results.variableRiskChart}
              ageGroupChart={results.ageGroupChart}
            />
          </div>

          {/* ── Section 6: Variable Risk Ranking ── */}
          <div className="flex flex-col gap-4">
            <SectionTitle>Variable Risk Ranking</SectionTitle>
            <div
              className="bg-white border border-[#E2E8F0] rounded-2xl overflow-hidden"
              style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04), 0 4px 16px rgba(30,58,138,0.07)" }}
            >
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0]">
                    {["Rank", "Variable Name", "Risk Score", "Risk Level"].map((h) => (
                      <th key={h} className="text-left text-[#475569] text-xs font-semibold tracking-wider uppercase px-6 py-3.5">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* TODO: replace with backend variable_risk_ranking once available */}
                  {results.variableRiskRanking.map((row, idx) => {
                    const isLast = idx === results.variableRiskRanking.length - 1;
                    return (
                      <tr
                        key={row.rank}
                        className={[
                          row.level === "High" ? "bg-[#FEF2F2]" : "bg-white hover:bg-[#F8FAFC]",
                          !isLast ? "border-b border-[#F1F5F9]" : "",
                          "transition-colors duration-100",
                        ].join(" ")}
                      >
                        <td className="text-[#94A3B8] font-mono px-6 py-4">{row.rank}</td>
                        <td className="text-[#0F172A] font-semibold px-6 py-4">{row.variable}</td>
                        <td className="text-[#475569] px-6 py-4">{row.score}</td>
                        <td className="px-6 py-4">
                          <RiskBadge level={row.level as RiskLevel} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Section 7: Bottom Action Buttons ── */}
          <div className="flex flex-col items-center gap-3 pb-4">
            <div className="flex flex-wrap items-center justify-center gap-3">
              {/* Run Analysis (disabled on results page) */}
              <button
                type="button"
                disabled
                className="opacity-40 cursor-not-allowed text-white text-base font-semibold h-12 px-6 rounded-xl flex items-center gap-2"
                style={{
                  background: "linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)",
                  boxShadow: "0 4px 14px rgba(30,58,138,0.25)",
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24"
                  fill="white" stroke="none">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Run Analysis
              </button>

              {/* Download HTML — healthcare cyan gradient */}
              <button
                type="button"
                onClick={() => handleDownloadReport("html")}
                disabled={downloading}
                className="text-white text-base font-semibold h-12 px-6 rounded-xl flex items-center gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                style={{
                  background: "linear-gradient(135deg, #0E7490 0%, #0891B2 100%)",
                  boxShadow: "0 4px 14px rgba(8,145,178,0.30), inset 0 1px 0 rgba(255,255,255,0.12)",
                }}
              >
                <DownloadIcon />
                {downloading ? "Generating..." : "Download HTML"}
              </button>

              {/* Download CSV — emerald→cyan gradient */}
              <button
                type="button"
                onClick={() => handleDownloadReport("csv")}
                disabled={downloading}
                className="text-white text-base font-semibold h-12 px-6 rounded-xl flex items-center gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                style={{
                  background: "linear-gradient(135deg, #059669 0%, #0891B2 100%)",
                  boxShadow: "0 4px 14px rgba(5,150,105,0.28), inset 0 1px 0 rgba(255,255,255,0.12)",
                }}
              >
                <DownloadIcon />
                {downloading ? "..." : "Download CSV"}
              </button>

              {/* Download PDF — indigo→blue gradient */}
              <button
                type="button"
                onClick={() => handleDownloadReport("pdf")}
                disabled={downloading}
                className="text-white text-base font-semibold h-12 px-6 rounded-xl flex items-center gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                style={{
                  background: "linear-gradient(135deg, #4338CA 0%, #2563EB 100%)",
                  boxShadow: "0 4px 14px rgba(67,56,202,0.30), inset 0 1px 0 rgba(255,255,255,0.12)",
                }}
              >
                <DownloadIcon />
                {downloading ? "..." : "Download PDF"}
              </button>

              {/* Reset — slate gradient */}
              <Link
                href="/"
                className="text-white text-base font-medium h-12 px-6 rounded-xl flex items-center gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90"
                style={{
                  background: "linear-gradient(135deg, #334155 0%, #475569 100%)",
                  boxShadow: "0 4px 14px rgba(51,65,85,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <RefreshIcon />
                Reset
              </Link>
            </div>

            {downloadError && (
              <div className="w-full max-w-xl bg-[#FEF2F2] border border-[#FECACA] rounded-xl px-5 py-3 flex items-start gap-2.5">
                <svg className="shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-[#DC2626] text-sm font-medium">{downloadError}</p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
