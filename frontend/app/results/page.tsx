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
  risk_score?: number;
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
 * risk_score from backend is a 0-1 decimal; we convert to 0-100 here.
 */
function getAttrInferenceScores(
  summary?: AttrInferenceSummary
): { sa: string; scorePct: number }[] {
  if (!summary) return [];
  const out: { sa: string; scorePct: number }[] = [];
  for (const [sa, results] of Object.entries(summary)) {
    if (!Array.isArray(results)) continue;
    const scores = results
      .map((r) => (typeof r?.risk_score === "number" ? r.risk_score * 100 : -Infinity))
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
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <h2 className="text-[#101828] text-lg font-semibold leading-7">{children}</h2>
  );
}

// ─── Shared page header ───────────────────────────────────────────────────────
function PageHeader() {
  return (
    <header
      className="relative w-full shadow-md overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0d2d78 0%, #155dfc 60%, #1a72f5 100%)" }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 50% -20%, rgba(255,255,255,0.12) 0%, transparent 70%)",
        }}
      />
      <div className="relative max-w-5xl mx-auto px-6 py-9 flex flex-col sm:flex-row items-center justify-center gap-4 text-center sm:text-left">
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
  );
}

// ─── No-data fallback ─────────────────────────────────────────────────────────
function NoDataFallback() {
  return (
    <div className="min-h-screen bg-transparent flex flex-col">
      <PageHeader />
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-5xl bg-white border border-[#e5e7eb] rounded-[14px] card-shadow p-12 flex flex-col items-center gap-6 text-center">
          <div className="bg-[#ffedd4] w-16 h-16 rounded-full flex items-center justify-center">
            <MissingIcon />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-[#101828] text-xl font-semibold">
              No analysis data found.
            </h2>
            <p className="text-[#4a5565] text-sm max-w-sm">
              Please upload your datasets and run the analysis from the main page first.
            </p>
          </div>
          <Link
            href="/"
            className="bg-[#155dfc] hover:bg-[#1151d6] text-white text-sm font-medium h-10 px-5 rounded-[10px] flex items-center gap-2 transition-colors"
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

  const handleDownloadReport = async (format: "html" | "csv") => {
    if (!resultDir) {
      setDownloadError("Report not available — result directory missing from the analysis response.");
      return;
    }
    setDownloading(true);
    setDownloadError(null);
    try {
      const url = `${API_BASE}/api/report/${format}?result_dir=${encodeURIComponent(resultDir)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `Server error (${res.status})` }));
        setDownloadError(err.detail ?? `Failed to generate report (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = format === "html" ? "privacy_risk_report.html" : "privacy_risk_report_summary.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch {
      setDownloadError("Could not reach the backend to generate the report.");
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
          <div className="bg-white border border-[#e5e7eb] rounded-[14px] card-shadow p-8 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <SectionTitle>Upload Datasets</SectionTitle>
              <p className="text-[#4a5565] text-sm leading-5">
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
              <p className="text-xs font-semibold uppercase tracking-widest text-[#2b7fff]">
                Real Dataset
              </p>
              <div className="flex flex-col sm:flex-row gap-6">
                <SummaryCard icon={<RowsIcon />} iconBg="bg-[#dbeafe]"
                  value={results.datasetSummary.rows} label="Number of Rows" />
                <SummaryCard icon={<ColumnsIcon />} iconBg="bg-[#cbfbf1]"
                  value={results.datasetSummary.columns} label="Number of Columns" />
                <SummaryCard icon={<MissingIcon />} iconBg="bg-[#ffedd4]"
                  value={results.datasetSummary.missingValues} label="Missing Values" />
              </div>
            </div>

            {/* Synthetic dataset */}
            <div className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-[#009689]">
                Synthetic Dataset
              </p>
              <div className="flex flex-col sm:flex-row gap-6">
                <SummaryCard icon={<RowsIcon />} iconBg="bg-[#dbeafe]"
                  value={
                    apiResult.synthetic_file?.row_count != null
                      ? apiResult.synthetic_file.row_count.toLocaleString()
                      : apiResult._localSyntheticSummary?.rowCount != null
                        ? apiResult._localSyntheticSummary.rowCount.toLocaleString()
                        : "—"
                  }
                  label="Number of Rows" />
                <SummaryCard icon={<ColumnsIcon />} iconBg="bg-[#cbfbf1]"
                  value={
                    apiResult.synthetic_file?.column_count != null
                      ? String(apiResult.synthetic_file.column_count)
                      : apiResult._localSyntheticSummary?.columnCount != null
                        ? String(apiResult._localSyntheticSummary.columnCount)
                        : "—"
                  }
                  label="Number of Columns" />
                <SummaryCard icon={<MissingIcon />} iconBg="bg-[#ffedd4]"
                  value={
                    apiResult._localSyntheticSummary?.missingValuePercent != null
                      ? `${apiResult._localSyntheticSummary.missingValuePercent.toFixed(1)}%`
                      : "—"
                  }
                  label="Missing Values" />
              </div>
            </div>
          </div>

          {/* ── Section 3: Analysis Configuration ── */}
          {(apiResult.quasi_identifiers?.length || apiResult.sensitive_attributes?.length) ? (
            <div className="bg-white border border-[#e5e7eb] rounded-[14px] card-shadow p-8 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <SectionTitle>Analysis Configuration</SectionTitle>
                <p className="text-[#4a5565] text-sm leading-5">
                  Columns selected for this analysis run
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-6">
                {apiResult.quasi_identifiers?.length ? (
                  <div className="flex-1 flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#2b7fff]">
                      Quasi Identifiers
                    </p>
                    <p className="text-sm text-[#364153] leading-6">
                      {apiResult.quasi_identifiers.join(", ")}
                    </p>
                  </div>
                ) : null}
                {apiResult.sensitive_attributes?.length ? (
                  <div className="flex-1 flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#009689]">
                      Sensitive Attributes
                    </p>
                    <p className="text-sm text-[#364153] leading-6">
                      {apiResult.sensitive_attributes.join(", ")}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

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
                className="bg-[#155dfc] hover:bg-[#1151d6] text-white text-sm font-medium h-9 px-4 rounded-[10px] flex items-center gap-2 transition-colors"
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
            <div className="bg-white border border-[#e5e7eb] rounded-[14px] card-shadow overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                    {["Rank", "Variable Name", "Risk Score", "Risk Level"].map((h) => (
                      <th key={h} className="text-left text-[#364153] text-xs font-semibold tracking-wide uppercase px-6 py-3">
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
                          row.level === "High" ? "bg-[#fef2f2]" : "bg-white",
                          !isLast ? "border-b border-[#e5e7eb]" : "",
                        ].join(" ")}
                      >
                        <td className="text-[#4a5565] px-6 py-4">{row.rank}</td>
                        <td className="text-[#101828] font-medium px-6 py-4">{row.variable}</td>
                        <td className="text-[#101828] px-6 py-4">{row.score}</td>
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
            <div className="flex items-center justify-center gap-4">
              <button
                type="button"
                disabled
                className="bg-[#d1d5dc] text-white text-base font-medium h-12 px-6 rounded-[10px] flex items-center gap-2 cursor-not-allowed"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
                  fill="white" stroke="none">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Run Analysis
              </button>

              <button
                type="button"
                onClick={() => handleDownloadReport("html")}
                disabled={downloading}
                className="bg-[#009689] hover:bg-[#007a6e] disabled:bg-[#d1d5dc] text-white text-base font-medium h-12 px-6 rounded-[10px] flex items-center gap-2 transition-colors"
              >
                <DownloadIcon />
                {downloading ? "Generating..." : "Download Report"}
              </button>

              <button
                type="button"
                onClick={() => handleDownloadReport("csv")}
                disabled={downloading}
                className="bg-white hover:bg-gray-50 disabled:opacity-50 text-[#009689] text-base font-medium h-12 px-6 rounded-[10px] border border-[#009689] flex items-center gap-2 transition-colors"
              >
                <DownloadIcon />
                {downloading ? "..." : "Download CSV"}
              </button>

              <Link
                href="/"
                className="bg-white hover:bg-gray-50 text-[#364153] text-base font-medium h-12 px-6 rounded-[10px] border border-[#d1d5dc] flex items-center gap-2 transition-colors"
              >
                <RefreshIcon />
                Reset
              </Link>
            </div>

            {downloadError && (
              <div className="w-full max-w-xl bg-[#fef2f2] border border-[#fca5a5] rounded-[10px] px-5 py-3">
                <p className="text-[#b91c1c] text-sm font-medium">{downloadError}</p>
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
