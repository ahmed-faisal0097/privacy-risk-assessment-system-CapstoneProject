"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SummaryCard from "@/app/components/SummaryCard";
import UploadedFilePanel from "@/app/components/UploadedFilePanel";
import RiskOverviewCard from "@/app/components/RiskOverviewCard";
import RiskBadge from "@/app/components/RiskBadge";
import ResultsCharts from "@/app/components/ResultsCharts";
import type { AttrInferenceChartRow, KDistChartRow } from "@/app/components/ResultsCharts";
import { mockResults } from "@/app/results/mockData";
import type { AnalysisResults, RiskLevel } from "@/app/results/mockData";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileInfo {
  file_uuid?: string;
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

interface UniquenessSummary {
  uniqueness_score_pct?: number;
  rare_combination_score_pct?: number;
  total_synthetic_records?: number;
  k_zero_count?: number;
  k_one_count?: number;
  k_lt_5_count?: number;
  qis_used?: string[];
  sas_used?: string[];
  qid_group_stats?: {
    n_rows?: number;
    n_groups?: number;
    min_group_size?: number;
    median_group_size?: number;
    max_group_size?: number;
    unique_rows?: number;
    unique_row_rate?: number;
    rows_in_groups_lt_5?: number;
    rows_in_groups_lt_5_rate?: number;
  };
}

// One item returned by attribute_inference_evaluation per QID set
interface AttrInferenceRow {
  qid_set?: string;
  target_column?: string;
  coverage_rate?: number;
  attack_accuracy_on_covered?: number;
  overall_accuracy_with_baseline_fallback?: number;
  baseline_accuracy?: number;
  gain_over_baseline?: number;
  risk_score?: number;
  qualitative_label?: string;
  baseline_label?: string;
  n_real_eval_rows?: number;
  n_qid_groups?: number;
  [key: string]: unknown;
}

interface RiskEvaluation {
  real_uuid?: string;
  synthetic_uuid?: string;
  qi_list?: string[];
  sa_list?: string[];
  result_dir?: string;
  files?: Record<string, string>;
  summary?: UniquenessSummary;
  attribute_inference_summary?: Record<string, AttrInferenceRow[] | { error: string }>;
}

interface ApiResult {
  message?: string;
  real_file?: FileInfo;
  synthetic_file?: FileInfo;
  quasi_identifiers?: string[];
  sensitive_attributes?: string[];
  risk_evaluation?: RiskEvaluation;
  risk_overview?: AnalysisResults["riskOverview"];
  variable_risk_chart?: AnalysisResults["variableRiskChart"];
  age_group_chart?: AnalysisResults["ageGroupChart"];
  variable_risk_ranking?: AnalysisResults["variableRiskRanking"];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes?: number): string {
  if (bytes == null) return "-";
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(2)} MB`;
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function scoreToCard(
  pct: number,
  label: string
): { label: string; value: string; level: RiskLevel } {
  let level: RiskLevel;
  let display: number;
  if (pct >= 20) {
    level = "High";
    display = Math.min(10, 7 + ((pct - 20) / 80) * 3);
  } else if (pct >= 10) {
    level = "Medium";
    display = 4 + ((pct - 10) / 10) * 2;
  } else {
    level = "Low";
    display = 1 + (pct / 10) * 2;
  }
  return { label, value: `${display.toFixed(1)}/10`, level };
}

/**
 * Build the attribute inference chart data from the backend summary.
 * One row per sensitive attribute showing baseline vs attack accuracy.
 */
function buildAttrInferenceChart(
  attrSummary?: Record<string, AttrInferenceRow[] | { error: string }>
): AttrInferenceChartRow[] {
  if (!attrSummary) return [];
  const rows: AttrInferenceChartRow[] = [];

  for (const [sa, val] of Object.entries(attrSummary)) {
    if (!Array.isArray(val) || val.length === 0) continue;
    // Use the first (and usually only) row per SA — one QID set was passed
    const r = val[0];
    rows.push({
      attribute: sa,
      baseline: parseFloat(((r.baseline_accuracy ?? 0) * 100).toFixed(1)),
      attack: parseFloat(((r.attack_accuracy_on_covered ?? 0) * 100).toFixed(1)),
      gain: parseFloat(((r.gain_over_baseline ?? 0) * 100).toFixed(1)),
      coverage: parseFloat(((r.coverage_rate ?? 0) * 100).toFixed(1)),
      qualitative_label: r.qualitative_label ?? "Low",
    });
  }
  return rows;
}

/**
 * Build the k-value distribution chart from the uniqueness summary.
 * Four categories: k=0, k=1, k<5, k≥5.
 */
function buildKDistChart(summary?: UniquenessSummary): KDistChartRow[] {
  if (!summary) return [];
  const total = summary.total_synthetic_records ?? 0;
  if (total === 0) return [];

  const kZero = summary.k_zero_count ?? 0;
  const kOne  = summary.k_one_count ?? 0;
  const kLt5  = summary.k_lt_5_count ?? 0;
  const kSafe = total - kLt5;

  return [
    {
      category: "k=0 (no match)",
      count: kZero,
      pct: parseFloat(((kZero / total) * 100).toFixed(2)),
    },
    {
      category: "k=1 (unique)",
      count: kOne,
      pct: parseFloat(((kOne / total) * 100).toFixed(2)),
    },
    {
      category: "k<5 (rare)",
      count: kLt5,
      pct: parseFloat(((kLt5 / total) * 100).toFixed(2)),
    },
    {
      category: "k≥5 (safe)",
      count: kSafe,
      pct: parseFloat(((kSafe / total) * 100).toFixed(2)),
    },
  ];
}

/**
 * Build variable risk chart — one bar per SA, scored 0–10.
 * Uses risk_score (coverage × gain) from attribute inference results.
 */
function buildVariableRiskChart(
  attrSummary?: Record<string, AttrInferenceRow[] | { error: string }>
): AnalysisResults["variableRiskChart"] {
  if (!attrSummary) return mockResults.variableRiskChart;

  const entries: { variable: string; score: number }[] = [];
  for (const [sa, val] of Object.entries(attrSummary)) {
    if (!Array.isArray(val) || val.length === 0) continue;
    const r = val[0];
    const raw = r.risk_score ?? (r.coverage_rate ?? 0) * (r.gain_over_baseline ?? 0);
    // risk_score is 0–1; scale to 0–10
    entries.push({ variable: sa, score: parseFloat((raw * 10).toFixed(2)) });
  }

  if (entries.length === 0) return mockResults.variableRiskChart;
  return entries.sort((a, b) => a.score - b.score);
}

/**
 * Build variable risk ranking table from attribute inference results.
 */
function buildAttrRanking(
  attrSummary?: Record<string, AttrInferenceRow[] | { error: string }>
): AnalysisResults["variableRiskRanking"] {
  if (!attrSummary) return mockResults.variableRiskRanking;

  const rows: { variable: string; score: number; level: RiskLevel }[] = [];
  for (const [sa, val] of Object.entries(attrSummary)) {
    if (!Array.isArray(val) || val.length === 0) continue;
    const r = val[0];
    const raw = r.risk_score ?? (r.coverage_rate ?? 0) * (r.gain_over_baseline ?? 0);
    const pct = raw * 100;
    const level: RiskLevel =
      r.qualitative_label === "High"
        ? "High"
        : r.qualitative_label === "Moderate"
        ? "Medium"
        : "Low";
    rows.push({ variable: sa, score: parseFloat(raw.toFixed(4)), level });
  }

  if (rows.length === 0) return mockResults.variableRiskRanking;
  rows.sort((a, b) => b.score - a.score);
  return rows.map((r, i) => ({ rank: i + 1, ...r }));
}

/**
 * Maps the full API response to the display shape used by the results page.
 */
function buildResults(api: ApiResult): AnalysisResults {
  const realFile = api.real_file;
  const syntheticFile = api.synthetic_file;
  const re = api.risk_evaluation;
  const summary = re?.summary;
  const attrSummary = re?.attribute_inference_summary;

  const uploadedDatasets: AnalysisResults["uploadedDatasets"] = {
    real: {
      name: realFile?.file_name ?? realFile?.original_filename ?? mockResults.uploadedDatasets.real.name,
      size: formatBytes(realFile?.size_bytes) !== "-"
        ? formatBytes(realFile?.size_bytes)
        : mockResults.uploadedDatasets.real.size,
    },
    synthetic: {
      name: syntheticFile?.file_name ?? syntheticFile?.original_filename ?? mockResults.uploadedDatasets.synthetic.name,
      size: formatBytes(syntheticFile?.size_bytes) !== "-"
        ? formatBytes(syntheticFile?.size_bytes)
        : mockResults.uploadedDatasets.synthetic.size,
    },
  };

  const datasetSummary: AnalysisResults["datasetSummary"] = {
    rows: realFile?.row_count != null
      ? realFile.row_count.toLocaleString()
      : mockResults.datasetSummary.rows,
    columns: realFile?.column_count != null
      ? String(realFile.column_count)
      : mockResults.datasetSummary.columns,
    missingValues: mockResults.datasetSummary.missingValues,
  };

  // Risk overview cards
  let riskOverview: AnalysisResults["riskOverview"];
  const uniqPct = summary?.uniqueness_score_pct;
  const rarePct = summary?.rare_combination_score_pct;

  if (uniqPct != null && rarePct != null) {
    const overallPct = (uniqPct + rarePct) / 2;

    // Attribute inference overall score — max risk_score across all SAs × 100
    let attrPct = 0;
    if (attrSummary) {
      for (const val of Object.values(attrSummary)) {
        if (!Array.isArray(val) || val.length === 0) continue;
        const rs = val[0].risk_score ?? 0;
        if (rs * 100 > attrPct) attrPct = rs * 100;
      }
    }

    riskOverview = [
      scoreToCard(overallPct, "Overall Risk Level"),
      scoreToCard(uniqPct, "Uniqueness Risk"),
      scoreToCard(rarePct, "Rare Combination Risk"),
      attrPct > 0
        ? scoreToCard(attrPct, "Attribute Inference Risk")
        : (mockResults.riskOverview.find(r => r.label === "Attribute Inference Risk") ?? {
            label: "Attribute Inference Risk", value: "—", level: "Low" as RiskLevel,
          }),
    ];
  } else {
    riskOverview = mockResults.riskOverview;
  }

  return {
    uploadedDatasets,
    datasetSummary,
    riskOverview,
    variableRiskChart: buildVariableRiskChart(attrSummary),
    ageGroupChart: mockResults.ageGroupChart,
    variableRiskRanking: buildAttrRanking(attrSummary),
  };
}

// ─── Icons ────────────────────────────────────────────────────────────────────

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
  return <h2 className="text-[#101828] text-lg font-semibold leading-7">{children}</h2>;
}
function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="w-full bg-[#ecfdf5] border border-[#86efac] rounded-[10px] px-5 py-4">
      <p className="text-[#047857] text-sm font-medium leading-5">{message}</p>
    </div>
  );
}
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="w-full bg-[#fef2f2] border border-[#fca5a5] rounded-[10px] px-5 py-4">
      <p className="text-[#b91c1c] text-sm font-medium leading-5">{message}</p>
    </div>
  );
}

function NoDataFallback() {
  return (
    <div className="min-h-screen bg-[#f9fafb] flex flex-col">
      <header className="bg-white border-b border-[#e5e7eb] w-full">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center gap-3">
          <div className="bg-[#155dfc] w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0">
            <ShieldIcon />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[#101828] text-2xl font-semibold leading-8">Privacy Risk Assessment System</h1>
            <p className="text-[#4a5565] text-sm leading-5">Evaluate privacy risks in synthetic healthcare datasets</p>
          </div>
        </div>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="w-full max-w-5xl bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-12 flex flex-col items-center gap-6 text-center">
          <div className="bg-[#ffedd4] w-16 h-16 rounded-full flex items-center justify-center">
            <MissingIcon />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-[#101828] text-xl font-semibold">No analysis data found.</h2>
            <p className="text-[#4a5565] text-sm max-w-sm">
              Please upload your datasets and run the analysis from the main page first.
            </p>
          </div>
          <Link href="/"
            className="bg-[#155dfc] hover:bg-[#1151d6] text-white text-sm font-medium h-10 px-5 rounded-[10px] flex items-center gap-2 transition-colors">
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
  const [apiResult, setApiResult] = useState<ApiResult | null | false>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("analysisResult");
    if (!raw) { setApiResult(false); return; }
    try {
      const parsed = JSON.parse(raw) as ApiResult;
      console.log("analysisResult:", parsed);
      setApiResult(parsed);
    } catch { setApiResult(false); }
  }, []);

  const handleDownloadReport = async () => {
    setDownloadError(null);
    setIsDownloading(true);
    try {
      const resultDir = (apiResult as ApiResult)?.risk_evaluation?.result_dir;
      const url = resultDir
        ? `${API_BASE_URL}/api/report/html?result_dir=${encodeURIComponent(resultDir)}`
        : `${API_BASE_URL}/api/report/html`;

      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Unknown error" }));
        setDownloadError(err?.detail ?? `Failed to generate report (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = "privacy_risk_report.html";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch {
      setDownloadError("Could not reach the backend. Make sure the API server is running.");
    } finally {
      setIsDownloading(false);
    }
  };

  if (apiResult === null) return null;
  if (apiResult === false) return <NoDataFallback />;

  const results = buildResults(apiResult);
  const re = apiResult.risk_evaluation;

  // Build the two new real chart datasets
  const attrInferenceChart = buildAttrInferenceChart(re?.attribute_inference_summary);
  const kDistChart = buildKDistChart(re?.summary);

  return (
    <div className="min-h-screen bg-[#f9fafb] flex flex-col">

      <header className="bg-white border-b border-[#e5e7eb] w-full">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center gap-3">
          <div className="bg-[#155dfc] w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0">
            <ShieldIcon />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[#101828] text-2xl font-semibold leading-8">Privacy Risk Assessment System</h1>
            <p className="text-[#4a5565] text-sm leading-5">Evaluate privacy risks in synthetic healthcare datasets</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-6 py-10 gap-8">
        <div className="w-full max-w-5xl flex flex-col gap-8">

          {apiResult.message && <SuccessBanner message={apiResult.message} />}
          {downloadError && <ErrorBanner message={downloadError} />}

          {/* Section 1: Uploaded Datasets */}
          <div className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-8 flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <SectionTitle>Upload Datasets</SectionTitle>
              <p className="text-[#4a5565] text-sm leading-5">Upload both real and synthetic datasets to compare privacy risks</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-6">
              <UploadedFilePanel title="Real Dataset"
                fileName={results.uploadedDatasets.real.name}
                fileSize={results.uploadedDatasets.real.size} accent="blue" />
              <UploadedFilePanel title="Synthetic Dataset"
                fileName={results.uploadedDatasets.synthetic.name}
                fileSize={results.uploadedDatasets.synthetic.size} accent="teal" />
            </div>
          </div>

          {/* Section 2: Dataset Summary */}
          <div className="flex flex-col gap-4">
            <SectionTitle>Dataset Summary</SectionTitle>
            <div className="flex flex-col sm:flex-row gap-6">
              <SummaryCard icon={<RowsIcon />} iconBg="bg-[#dbeafe]"
                value={results.datasetSummary.rows} label="Number of Rows" />
              <SummaryCard icon={<ColumnsIcon />} iconBg="bg-[#cbfbf1]"
                value={results.datasetSummary.columns} label="Number of Columns" />
              <SummaryCard icon={<MissingIcon />} iconBg="bg-[#ffedd4]"
                value={results.datasetSummary.missingValues} label="Missing Values" />
            </div>
          </div>

          {/* Section 3: Analysis Configuration + real uniqueness numbers */}
          {(apiResult.quasi_identifiers?.length || apiResult.sensitive_attributes?.length) && (
            <div className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-8 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <SectionTitle>Analysis Configuration</SectionTitle>
                <p className="text-[#4a5565] text-sm leading-5">Columns selected for this analysis run</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-6">
                {apiResult.quasi_identifiers?.length ? (
                  <div className="flex-1 flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#2b7fff]">Quasi Identifiers</p>
                    <p className="text-sm text-[#364153] leading-6">{apiResult.quasi_identifiers.join(", ")}</p>
                  </div>
                ) : null}
                {apiResult.sensitive_attributes?.length ? (
                  <div className="flex-1 flex flex-col gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#009689]">Sensitive Attributes</p>
                    <p className="text-sm text-[#364153] leading-6">{apiResult.sensitive_attributes.join(", ")}</p>
                  </div>
                ) : null}
              </div>

              {/* Real uniqueness metrics panel */}
              {re?.summary && (() => {
                const s = re.summary!;
                return (
                  <div className="border-t border-[#e5e7eb] pt-4 flex flex-col gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#364153]">
                      Uniqueness &amp; Rare-Combination Results
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-[#4a5565] text-xs">Uniqueness Score</p>
                        <p className="font-semibold text-[#101828]">{s.uniqueness_score_pct?.toFixed(2) ?? "—"}%</p>
                      </div>
                      <div>
                        <p className="text-[#4a5565] text-xs">Rare Combination Score</p>
                        <p className="font-semibold text-[#101828]">{s.rare_combination_score_pct?.toFixed(2) ?? "—"}%</p>
                      </div>
                      <div>
                        <p className="text-[#4a5565] text-xs">Unique Records (k=1)</p>
                        <p className="font-semibold text-[#101828]">{s.k_one_count?.toLocaleString() ?? "—"}</p>
                      </div>
                      <div>
                        <p className="text-[#4a5565] text-xs">Total Synthetic Records</p>
                        <p className="font-semibold text-[#101828]">{s.total_synthetic_records?.toLocaleString() ?? "—"}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Attribute inference summary panel */}
              {attrInferenceChart.length > 0 && (
                <div className="border-t border-[#e5e7eb] pt-4 flex flex-col gap-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#364153]">
                    Attribute Inference Results (per sensitive attribute)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-[#e5e7eb]">
                          {["Sensitive Attribute", "Coverage", "Attack Accuracy", "Baseline Accuracy", "Gain over Baseline", "Risk Level"].map(h => (
                            <th key={h} className="text-left text-[#364153] font-semibold uppercase tracking-wide py-2 pr-4">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {attrInferenceChart.map((r, i) => (
                          <tr key={i} className="border-b border-[#f3f4f6]">
                            <td className="py-2 pr-4 font-medium text-[#101828]">{r.attribute}</td>
                            <td className="py-2 pr-4 text-[#4a5565]">{r.coverage.toFixed(1)}%</td>
                            <td className="py-2 pr-4 text-[#4a5565]">{r.attack.toFixed(1)}%</td>
                            <td className="py-2 pr-4 text-[#4a5565]">{r.baseline.toFixed(1)}%</td>
                            <td className="py-2 pr-4 text-[#4a5565]">{r.gain > 0 ? "+" : ""}{r.gain.toFixed(1)}%</td>
                            <td className="py-2 pr-4">
                              <span className={[
                                "px-2 py-0.5 rounded-full text-xs font-semibold",
                                r.qualitative_label === "High"
                                  ? "bg-red-100 text-red-700"
                                  : r.qualitative_label === "Moderate"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-green-100 text-green-700",
                              ].join(" ")}>
                                {r.qualitative_label}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 4: Privacy Risk Overview */}
          <div className="flex flex-col gap-4">
            <SectionTitle>Privacy Risk Overview</SectionTitle>
            <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {results.riskOverview.map((item) => (
                <RiskOverviewCard key={item.label} label={item.label} value={item.value} level={item.level} />
              ))}
            </div>
          </div>

          {/* Section 5: Risk Analysis charts */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <SectionTitle>Risk Analysis</SectionTitle>
              <button type="button" onClick={() => router.push("/")}
                className="bg-[#155dfc] hover:bg-[#1151d6] text-white text-sm font-medium h-9 px-4 rounded-[10px] flex items-center gap-2 transition-colors">
                <PlayIcon /> Run Again
              </button>
            </div>
            {/*
              Pass real chart data to ResultsCharts.
              attrInferenceChart: real attribute inference accuracy data
              kDistChart: real k-value distribution from uniqueness algorithm
            */}
            <ResultsCharts
              variableRiskChart={results.variableRiskChart}
              ageGroupChart={results.ageGroupChart}
              attrInferenceChart={attrInferenceChart}
              kDistChart={kDistChart}
            />
          </div>

          {/* Section 6: Variable Risk Ranking */}
          <div className="flex flex-col gap-4">
            <SectionTitle>Variable Risk Ranking</SectionTitle>
            <div className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm overflow-hidden">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                    {["Rank", "Variable Name", "Risk Score", "Risk Level"].map((h) => (
                      <th key={h} className="text-left text-[#364153] text-xs font-semibold tracking-wide uppercase px-6 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.variableRiskRanking.map((row, idx) => {
                    const isLast = idx === results.variableRiskRanking.length - 1;
                    return (
                      <tr key={row.rank} className={[
                        row.level === "High" ? "bg-[#fef2f2]" : "bg-white",
                        !isLast ? "border-b border-[#e5e7eb]" : "",
                      ].join(" ")}>
                        <td className="text-[#4a5565] px-6 py-4">{row.rank}</td>
                        <td className="text-[#101828] font-medium px-6 py-4">{row.variable}</td>
                        <td className="text-[#101828] px-6 py-4">{row.score}</td>
                        <td className="px-6 py-4"><RiskBadge level={row.level as RiskLevel} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 7: Action Buttons */}
          <div className="flex items-center justify-center gap-4 pb-4">
            <button type="button" disabled
              className="bg-[#d1d5dc] text-white text-base font-medium h-12 px-6 rounded-[10px] flex items-center gap-2 cursor-not-allowed">
              <PlayIcon /> Run Analysis
            </button>
            <button type="button" onClick={handleDownloadReport} disabled={isDownloading}
              className={[
                "text-white text-base font-medium h-12 px-6 rounded-[10px] flex items-center gap-2 transition-colors",
                isDownloading ? "bg-[#007a6e] cursor-wait" : "bg-[#009689] hover:bg-[#007a6e] cursor-pointer",
              ].join(" ")}>
              <DownloadIcon />
              {isDownloading ? "Generating…" : "Download Report"}
            </button>
            <Link href="/"
              className="bg-white hover:bg-gray-50 text-[#364153] text-base font-medium h-12 px-6 rounded-[10px] border border-[#d1d5dc] flex items-center gap-2 transition-colors">
              <RefreshIcon /> Reset
            </Link>
          </div>

        </div>
      </main>
    </div>
  );
}