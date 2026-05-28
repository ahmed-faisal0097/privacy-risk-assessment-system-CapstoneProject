"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SummaryCard from "@/app/components/SummaryCard";
import UploadedFilePanel from "@/app/components/UploadedFilePanel";
import RiskOverviewCard from "@/app/components/RiskOverviewCard";
import ResultsCharts from "@/app/components/ResultsCharts";
import type {
  AttrInferenceChartRow,
  KDistChartRow,
  LinkageOutcomeChartRow,
} from "@/app/components/ResultsCharts";
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
  missing_values?: number;
  missing_value_pct?: number;
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

interface LinkageSummary {
  total_synthetic_records?: number;
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
}

interface RiskEvaluationSummary {
  uniqueness_and_rare_combination?: UniquenessSummary;
  linkage_reidentification?: LinkageSummary;
  attribute_inference_summary?: Record<string, AttrInferenceRow[] | { error: string }>;
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
  summary?: RiskEvaluationSummary;
  uniqueness_and_rare_combination?: UniquenessSummary;
  linkage_reidentification?: LinkageSummary;
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

function formatMissingValues(file?: FileInfo): string {
  if (!file) return "-";
  if (file.missing_value_pct != null) {
    return `${file.missing_value_pct.toFixed(2)}%`;
  }
  if (file.missing_values != null) {
    return file.missing_values.toLocaleString();
  }
  return "-";
}

function pctLevel(pct: number, highThreshold: number, mediumThreshold: number): RiskLevel {
  if (pct >= highThreshold) return "High";
  if (pct >= mediumThreshold) return "Medium";
  return "Low";
}

function pctCard(
  pct: number | undefined,
  label: string,
  highThreshold: number,
  mediumThreshold: number
): { label: string; value: string; level: RiskLevel } {
  const value = pct ?? 0;
  return {
    label,
    value: `${value.toFixed(2)}%`,
    level: pctLevel(value, highThreshold, mediumThreshold),
  };
}

function normalizeDecimal(value: number | undefined): number {
  if (value == null || Number.isNaN(value)) return 0;
  return value > 1 ? value / 100 : value;
}

function pctFromCount(count: number, total: number): number {
  if (!total) return 0;
  return parseFloat(((count / total) * 100).toFixed(2));
}

function formatPct(value: number | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value.toFixed(digits)}%`;
}

function countPctLabel(count: number, pct: number): string {
  return `${count.toLocaleString()} (${pct.toFixed(1)}%)`;
}

function getUniquenessSummary(re?: RiskEvaluation): UniquenessSummary | undefined {
  return re?.summary?.uniqueness_and_rare_combination ?? re?.uniqueness_and_rare_combination;
}

function getLinkageSummary(re?: RiskEvaluation): LinkageSummary | undefined {
  return re?.summary?.linkage_reidentification ?? re?.linkage_reidentification;
}

function getAttrSummary(
  re?: RiskEvaluation
): Record<string, AttrInferenceRow[] | { error: string }> | undefined {
  return re?.summary?.attribute_inference_summary ?? re?.attribute_inference_summary;
}

function getMaxAttrRiskPct(
  attrSummary?: Record<string, AttrInferenceRow[] | { error: string }>
): number {
  let maxRisk = 0;

  if (!attrSummary) return maxRisk;

  for (const val of Object.values(attrSummary)) {
    if (!Array.isArray(val) || val.length === 0) continue;
    for (const row of val) {
      const raw = normalizeDecimal(
        row.risk_score ?? (row.coverage_rate ?? 0) * (row.gain_over_baseline ?? 0)
      );
      maxRisk = Math.max(maxRisk, raw);
    }
  }

  return maxRisk * 100;
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
    const baseline = normalizeDecimal(r.baseline_accuracy) * 100;
    const attack = normalizeDecimal(
      r.overall_accuracy_with_baseline_fallback ?? r.attack_accuracy_on_covered
    ) * 100;
    const gain = r.gain_over_baseline != null
      ? normalizeDecimal(r.gain_over_baseline) * 100
      : attack - baseline;
    const riskScore = Math.max(0, gain);
    rows.push({
      attribute: sa,
      baseline: parseFloat(baseline.toFixed(1)),
      attack: parseFloat(attack.toFixed(1)),
      gain: parseFloat(gain.toFixed(1)),
      riskScore: parseFloat(riskScore.toFixed(1)),
      coverage: parseFloat((normalizeDecimal(r.coverage_rate) * 100).toFixed(1)),
      explanation:
        gain > 0
          ? "Attack accuracy is higher than baseline, so this attribute has additional inference risk."
          : gain === 0
          ? "Attack accuracy is the same as baseline, so no extra information is gained."
          : "Attack accuracy is lower than baseline, so this does not increase inference risk.",
    });
  }
  return rows.sort((a, b) => b.gain - a.gain);
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
  const kTwoToFour = Math.max(0, kLt5 - kZero - kOne);
  const kFiveOrMore = Math.max(0, total - kLt5);

  return [
    {
      category: "k = 0",
      rule: "No matching real records",
      count: kZero,
      pct: pctFromCount(kZero, total),
      barLabel: countPctLabel(kZero, pctFromCount(kZero, total)),
    },
    {
      category: "k = 1",
      rule: "Synthetic record matches exactly one real record",
      count: kOne,
      pct: pctFromCount(kOne, total),
      barLabel: countPctLabel(kOne, pctFromCount(kOne, total)),
    },
    {
      category: "2 <= k < 5",
      rule: "Synthetic record matches 2 to 4 real records",
      count: kTwoToFour,
      pct: pctFromCount(kTwoToFour, total),
      barLabel: countPctLabel(kTwoToFour, pctFromCount(kTwoToFour, total)),
    },
    {
      category: "k >= 5",
      rule: "Synthetic record matches 5 or more real records",
      count: kFiveOrMore,
      pct: pctFromCount(kFiveOrMore, total),
      barLabel: countPctLabel(kFiveOrMore, pctFromCount(kFiveOrMore, total)),
    },
  ];
}

function buildLinkageOutcomeChart(summary?: LinkageSummary): LinkageOutcomeChartRow[] {
  if (!summary) return [];

  const exact = summary.exact_match;
  const hamming = summary.hamming_nearest_neighbour;
  const exactTotal = exact?.exact_total_synthetic_records ?? summary.total_synthetic_records ?? 0;
  const hammingTotal = hamming?.hamming_total_synthetic_records ?? summary.total_synthetic_records ?? 0;
  const highThreshold = hamming?.hamming_high_threshold ?? 0.1;
  const mediumThreshold = hamming?.hamming_medium_threshold ?? 0.3;
  const rows: LinkageOutcomeChartRow[] = [];

  if (exactTotal || exact) {
    const noMatch = exact?.exact_no_match_count ?? 0;
    const unique = exact?.exact_unique_match_count ?? 0;
    const small = exact?.exact_small_group_match_count ?? 0;
    const ambiguous = exact?.exact_ambiguous_match_count ?? 0;
    rows.push(
      {
        method: "Exact matching",
        category: "No match",
        xLabel: "No match",
        rule: "0 matching real records",
        count: noMatch,
        pct: pctFromCount(noMatch, exactTotal),
        barLabel: countPctLabel(noMatch, pctFromCount(noMatch, exactTotal)),
      },
      {
        method: "Exact matching",
        category: "Unique",
        xLabel: "Unique",
        rule: "Exactly 1 matching real record",
        count: unique,
        pct: pctFromCount(unique, exactTotal),
        barLabel: countPctLabel(unique, pctFromCount(unique, exactTotal)),
      },
      {
        method: "Exact matching",
        category: "Small group",
        xLabel: "Small group",
        rule: "2 to 5 matching real records",
        count: small,
        pct: pctFromCount(small, exactTotal),
        barLabel: countPctLabel(small, pctFromCount(small, exactTotal)),
      },
      {
        method: "Exact matching",
        category: "Ambiguous group",
        xLabel: "Ambiguous group",
        rule: "More than 5 matching real records",
        count: ambiguous,
        pct: pctFromCount(ambiguous, exactTotal),
        barLabel: countPctLabel(ambiguous, pctFromCount(ambiguous, exactTotal)),
      }
    );
  }

  if (hammingTotal || hamming) {
    const close = hamming?.hamming_high_risk_close_match_count ?? 0;
    const moderate = hamming?.hamming_medium_risk_close_match_count ?? 0;
    const distant = hamming?.hamming_low_risk_distant_match_count ?? 0;
    rows.push(
      {
        method: "Hamming nearest-neighbour",
        category: "Close",
        xLabel: "Close",
        rule: `Hamming distance <= ${highThreshold}`,
        count: close,
        pct: pctFromCount(close, hammingTotal),
        barLabel: countPctLabel(close, pctFromCount(close, hammingTotal)),
      },
      {
        method: "Hamming nearest-neighbour",
        category: "Moderate",
        xLabel: "Moderate",
        rule: `${highThreshold} < Hamming distance <= ${mediumThreshold}`,
        count: moderate,
        pct: pctFromCount(moderate, hammingTotal),
        barLabel: countPctLabel(moderate, pctFromCount(moderate, hammingTotal)),
      },
      {
        method: "Hamming nearest-neighbour",
        category: "Distant",
        xLabel: "Distant",
        rule: `Hamming distance > ${mediumThreshold}`,
        count: distant,
        pct: pctFromCount(distant, hammingTotal),
        barLabel: countPctLabel(distant, pctFromCount(distant, hammingTotal)),
      }
    );
  }

  return rows;
}

/**
 * Build variable risk chart - one bar per SA.
 * Risk Score = max(0, Gain Over Baseline).
 */
function buildVariableRiskChart(
  attrSummary?: Record<string, AttrInferenceRow[] | { error: string }>
): AnalysisResults["variableRiskChart"] {
  if (!attrSummary) return [];

  const entries: AnalysisResults["variableRiskChart"] = [];
  for (const [sa, val] of Object.entries(attrSummary)) {
    if (!Array.isArray(val) || val.length === 0) continue;
    const r = val[0];
    const baseline = normalizeDecimal(r.baseline_accuracy) * 100;
    const attack = normalizeDecimal(
      r.overall_accuracy_with_baseline_fallback ?? r.attack_accuracy_on_covered
    ) * 100;
    const gain = r.gain_over_baseline != null
      ? normalizeDecimal(r.gain_over_baseline) * 100
      : attack - baseline;
    const riskScore = Math.max(0, gain);
    entries.push({
      variable: sa,
      score: parseFloat(riskScore.toFixed(1)),
      attackAccuracy: parseFloat(attack.toFixed(1)),
      baselineAccuracy: parseFloat(baseline.toFixed(1)),
      gainOverBaseline: parseFloat(gain.toFixed(1)),
      riskScore: parseFloat(riskScore.toFixed(1)),
      explanation:
        gain > 0
          ? "Attack accuracy is higher than baseline, so this attribute has additional inference risk."
          : gain === 0
          ? "Attack accuracy is the same as baseline, so no extra information is gained."
          : "Attack accuracy is lower than baseline, so this does not increase inference risk.",
    });
  }

  if (entries.length === 0) return [];
  return entries.sort((a, b) => (b.gainOverBaseline ?? 0) - (a.gainOverBaseline ?? 0));
}

/**
 * Build variable risk ranking table from attribute inference results.
 */
function buildAttrRanking(
  attrSummary?: Record<string, AttrInferenceRow[] | { error: string }>
): AnalysisResults["variableRiskRanking"] {
  if (!attrSummary) return [];

  const rows: AnalysisResults["variableRiskRanking"] = [];
  for (const [sa, val] of Object.entries(attrSummary)) {
    if (!Array.isArray(val) || val.length === 0) continue;
    const r = val[0];
    const baseline = normalizeDecimal(r.baseline_accuracy) * 100;
    const attack = normalizeDecimal(
      r.overall_accuracy_with_baseline_fallback ?? r.attack_accuracy_on_covered
    ) * 100;
    const gain = r.gain_over_baseline != null
      ? normalizeDecimal(r.gain_over_baseline) * 100
      : attack - baseline;
    const riskScore = Math.max(0, gain);
    rows.push({
      rank: 0,
      variable: sa,
      score: parseFloat(riskScore.toFixed(1)),
      level: pctLevel(riskScore, 20, 10),
      attackAccuracy: parseFloat(attack.toFixed(1)),
      baselineAccuracy: parseFloat(baseline.toFixed(1)),
      gainOverBaseline: parseFloat(gain.toFixed(1)),
      riskScore: parseFloat(riskScore.toFixed(1)),
      explanation:
        gain > 0
          ? "Attack accuracy is higher than baseline, so this attribute has additional inference risk."
          : gain === 0
          ? "Attack accuracy is the same as baseline, so no extra information is gained."
          : "Attack accuracy is lower than baseline, so this does not increase inference risk.",
    });
  }

  if (rows.length === 0) return [];
  rows.sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Maps the full API response to the display shape used by the results page.
 */
function buildResults(api: ApiResult): AnalysisResults {
  const realFile = api.real_file;
  const syntheticFile = api.synthetic_file;
  const re = api.risk_evaluation;
  const uniquenessSummary = getUniquenessSummary(re);
  const linkageSummary = getLinkageSummary(re);
  const attrSummary = getAttrSummary(re);

  const uploadedDatasets: AnalysisResults["uploadedDatasets"] = {
    real: {
      name: realFile?.file_name ?? realFile?.original_filename ?? "-",
      size: formatBytes(realFile?.size_bytes),
    },
    synthetic: {
      name: syntheticFile?.file_name ?? syntheticFile?.original_filename ?? "-",
      size: formatBytes(syntheticFile?.size_bytes),
    },
  };

  const datasetSummary: AnalysisResults["datasetSummary"] = {
    rows: realFile?.row_count != null
      ? realFile.row_count.toLocaleString()
      : "-",
    columns: realFile?.column_count != null
      ? String(realFile.column_count)
      : "-",
    missingValues: formatMissingValues(realFile),
  };

  const riskOverview: AnalysisResults["riskOverview"] = [
    pctCard(uniquenessSummary?.uniqueness_score_pct, "Uniqueness Score", 20, 10),
    pctCard(uniquenessSummary?.rare_combination_score_pct, "Rare Combination Score", 20, 10),
    pctCard(
      linkageSummary?.exact_match_score_pct,
      "Linkage & Re-identification Exact Match Score",
      30,
      10
    ),
    pctCard(
      linkageSummary?.hamming_score_pct,
      "Linkage & Re-identification Hamming Score",
      30,
      10
    ),
    pctCard(getMaxAttrRiskPct(attrSummary), "Attribute Inference Risk", 20, 10),
  ];

  return {
    uploadedDatasets,
    datasetSummary,
    riskOverview,
    variableRiskChart: buildVariableRiskChart(attrSummary),
    ageGroupChart: [],
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
  const uniquenessSummary = getUniquenessSummary(re);
  const linkageSummary = getLinkageSummary(re);
  const attrSummary = getAttrSummary(re);

  // Build the two new real chart datasets
  const attrInferenceChart = buildAttrInferenceChart(attrSummary);
  const kDistChart = buildKDistChart(uniquenessSummary);
  const linkageOutcomeChart = buildLinkageOutcomeChart(linkageSummary);

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
            <div className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-6 sm:p-8 flex flex-col gap-8">
              <div className="flex flex-col gap-2">
                <SectionTitle>Analysis Configuration</SectionTitle>
                <p className="text-[#4a5565] text-sm leading-5">Columns selected for this analysis run</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {apiResult.quasi_identifiers?.length ? (
                  <div className="rounded-[12px] border border-[#dbeafe] bg-[#eff6ff] p-4 flex flex-col gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#155dfc]">Quasi-identifiers</p>
                    <div className="flex flex-wrap gap-2">
                      {apiResult.quasi_identifiers.map((column) => (
                        <span key={column} className="rounded-[8px] bg-white border border-[#bfdbfe] px-2.5 py-1 text-xs text-[#1e3a8a]">
                          {column}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {apiResult.sensitive_attributes?.length ? (
                  <div className="rounded-[12px] border border-[#ccfbf1] bg-[#f0fdfa] p-4 flex flex-col gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#007a6e]">Sensitive attributes</p>
                    <div className="flex flex-wrap gap-2">
                      {apiResult.sensitive_attributes.map((column) => (
                        <span key={column} className="rounded-[8px] bg-white border border-[#99f6e4] px-2.5 py-1 text-xs text-[#115e59]">
                          {column}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Real uniqueness metrics panel */}
              {uniquenessSummary && (() => {
                const s = uniquenessSummary;
                return (
                  <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fbfcfd] p-5 flex flex-col gap-4">
                    <p className="text-sm font-semibold text-[#101828]">
                      Uniqueness &amp; Rare-Combination Results
                    </p>
                    <p className="text-sm text-[#4a5565] leading-6">
                     For each synthetic record, the number of real records sharing the same quasi-identifier values is counted. This count is referred to as <code>k</code>. A record with <code>k=1</code> maps to exactly one real individual, which represents a direct re-identification risk. Records with <code>k&lt;5</code> are classified as rare. The uniqueness score is the percentage of synthetic records where <code>k=1</code>.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3">
                        <p className="text-[#4a5565] text-xs">Uniqueness Score</p>
                        <p className="font-semibold text-[#101828]">{s.uniqueness_score_pct?.toFixed(2) ?? "—"}%</p>
                      </div>
                      <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3">
                        <p className="text-[#4a5565] text-xs">Rare Combination Score</p>
                        <p className="font-semibold text-[#101828]">{s.rare_combination_score_pct?.toFixed(2) ?? "—"}%</p>
                      </div>
                      <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3">
                        <p className="text-[#4a5565] text-xs">Unique Records (k = 1)</p>
                        <p className="font-semibold text-[#101828]">{s.k_one_count?.toLocaleString() ?? "—"}</p>
                      </div>
                      <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3">
                        <p className="text-[#4a5565] text-xs">Total Synthetic Records</p>
                        <p className="font-semibold text-[#101828]">{s.total_synthetic_records?.toLocaleString() ?? "—"}</p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {linkageSummary && (
                <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fbfcfd] p-5 flex flex-col gap-4">
                  <p className="text-sm font-semibold text-[#101828]">
                    Linkage &amp; Re-identification Results
                  </p>
                  <div className="flex flex-col gap-2 text-sm text-[#4a5565] leading-6">
                    <p>Two separate linkage methods are used.</p>
                    <p>
                      <strong>Exact-match linkage</strong> checks whether a synthetic record has an
                      identical match in the real dataset across all selected QI columns. A unique
                      exact match means only one real person shares those values.
                    </p>
                    <p>
                      <strong>Hamming nearest-neighbour linkage</strong> finds the closest real record
                      to each synthetic record using Hamming distance across QI columns. A distance of
                      0.0 is identical; 1.0 is completely different.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3">
                      <p className="text-[#4a5565] text-xs">Exact Match Score</p>
                      <p className="font-semibold text-[#101828]">{linkageSummary.exact_match_score_pct?.toFixed(2) ?? "—"}%</p>
                    </div>
                    <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3">
                      <p className="text-[#4a5565] text-xs">Hamming Score</p>
                      <p className="font-semibold text-[#101828]">{linkageSummary.hamming_score_pct?.toFixed(2) ?? "—"}%</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Attribute inference summary panel */}
              {attrInferenceChart.length > 0 && (
                <div className="rounded-[12px] border border-[#e5e7eb] bg-[#fbfcfd] p-5 flex flex-col gap-4">
                  <p className="text-sm font-semibold text-[#101828]">
                    Attribute Inference Results
                  </p>
                  <p className="text-sm text-[#4a5565] leading-6">
                    A majority-label attack is simulated for each sensitive attribute. The attacker uses the selected QI columns to look up the most common value of that sensitive attribute in the real dataset for each QI combination, then predicts that value for synthetic records. The gain over baseline measures how much better this attack performs compared to always predicting the single most common overall value. A high gain indicates that the QI columns reveal information about the sensitive attribute. Results are shown separately for each sensitive attribute.
                  </p>
                  <p className="text-sm text-[#4a5565] leading-6">
                    <strong>Attack accuracy</strong> is the share of synthetic records where the QI-based majority-label prediction matches the true sensitive value. <strong>Baseline accuracy</strong> is the share of records correctly predicted by always guessing the single most common overall sensitive value.
                  </p>
                  <div className="rounded-[10px] border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#364153]">
                    <div>
                      <span className="font-semibold">Gain Over Baseline:</span>{" "}
                      <span className="font-mono">Attack Accuracy - Baseline Accuracy</span>
                    </div>
                    <div className="mt-1">
                      <span className="font-semibold">Risk Score:</span>{" "}
                      <span className="font-mono">max(0, Gain Over Baseline)</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-[10px] border border-[#e5e7eb] bg-white">
                    <table className="w-full min-w-[720px] text-sm border-collapse">
                      <thead>
                        <tr className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                          {["Sensitive Attribute", "Coverage", "Attack Accuracy", "Baseline Accuracy", "Gain over Baseline", "Risk Score"].map(h => (
                            <th key={h} className="text-left text-[#364153] text-xs font-semibold uppercase tracking-wide px-4 py-3">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {attrInferenceChart.map((r, i) => (
                          <tr key={i} className="border-b border-[#f3f4f6]">
                            <td className="px-4 py-3 font-medium text-[#101828]">{r.attribute}</td>
                            <td className="px-4 py-3 text-[#4a5565]">{r.coverage.toFixed(1)}%</td>
                            <td className="px-4 py-3 text-[#4a5565]">{r.attack.toFixed(1)}%</td>
                            <td className="px-4 py-3 text-[#4a5565]">{r.baseline.toFixed(1)}%</td>
                            <td className="px-4 py-3 text-[#4a5565]">{r.gain > 0 ? "+" : ""}{r.gain.toFixed(1)}%</td>
                            <td className="px-4 py-3 text-[#4a5565]">{r.gain < 0 ? "No additional inference risk" : `${r.riskScore.toFixed(1)}%`}</td>
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
            <div className="flex flex-col sm:grid sm:grid-cols-2 lg:grid-cols-5 gap-6">
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
              linkageOutcomeChart={linkageOutcomeChart}
            />
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
