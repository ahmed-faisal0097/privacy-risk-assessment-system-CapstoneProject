"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import type { AnalysisResults } from "@/app/results/mockData";

export interface AttrInferenceChartRow {
  attribute: string;
  baseline: number;
  attack: number;
  gain: number;
  riskScore: number;
  coverage: number;
  explanation: string;
}

export interface KDistChartRow {
  category: string;
  rule: string;
  count: number;
  pct: number;
  barLabel: string;
}

export interface LinkageOutcomeChartRow {
  method: "Exact matching" | "Hamming nearest-neighbour";
  category: string;
  xLabel: string;
  rule: string;
  count: number;
  pct: number;
  barLabel: string;
}

interface ResultsChartsProps {
  variableRiskChart: AnalysisResults["variableRiskChart"];
  ageGroupChart: AnalysisResults["ageGroupChart"];
  attrInferenceChart?: AttrInferenceChartRow[];
  kDistChart?: KDistChartRow[];
  linkageOutcomeChart?: LinkageOutcomeChartRow[];
}

interface TooltipPayloadItem<TPayload = unknown> {
  name?: string;
  value?: number;
  color?: string;
  payload?: TPayload;
}

function formatPct(value?: number, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "-";
  return `${value.toFixed(digits)}%`;
}

function labelPct(value: unknown): string {
  const num = typeof value === "number" ? value : Number(value ?? 0);
  return `${num.toFixed(1)}%`;
}

function kColor(category: string): string {
  if (category === "k = 0") return "#22c55e";
  if (category === "k = 1") return "#f97316";
  if (category === "2 <= k < 5") return "#ca8a04";
  return "#0d9488";
}

function linkageColor(row: LinkageOutcomeChartRow): string {
  if (row.method === "Exact matching") {
    if (row.category.includes("No match")) return "#22c55e";
    if (row.category.includes("Unique")) return "#f97316";
    if (row.category.includes("Small")) return "#ca8a04";
    return "#0d9488";
  }
  if (row.category.includes("Close")) return "#9a2609";
  if (row.category.includes("Moderate")) return "#f97316";
  return "#22c55e";
}

function ChartCard({
  title,
  explanation,
  formula,
  children,
}: {
  title: string;
  explanation?: string;
  formula?: string | string[];
  children: ReactNode;
}) {
  const formulas = formula ? (Array.isArray(formula) ? formula : [formula]) : [];

  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-6 flex flex-col gap-4 min-w-0">
      <div className="flex flex-col gap-1">
        <h3 className="text-[#101828] text-base font-semibold leading-6">{title}</h3>
        {explanation ? <p className="text-[#4a5565] text-xs leading-5">{explanation}</p> : null}
        {formulas.length ? (
          <div className="rounded-[8px] border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-xs text-[#364153]">
            <p className="font-semibold">Calculation</p>
            {formulas.map((line) => (
              <p key={line} className="font-mono mt-1">{line}</p>
            ))}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function ChartLegend({ title, rows }: { title: string; rows: Array<{ label: string; rule: string; color: string }> }) {
  return (
    <div className="rounded-[8px] border border-[#e5e7eb] bg-[#f9fafb] px-3 py-3">
      <p className="text-[#364153] text-xs font-semibold uppercase tracking-wide mb-2">{title}</p>
      <div className="grid grid-cols-1 gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-2 text-xs text-[#4a5565] leading-4">
            <span className="w-3 h-3 rounded-sm mt-0.5 shrink-0" style={{ background: row.color }} />
            <span>
              <span className="font-semibold text-[#101828]">{row.label}:</span> {row.rule}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function wrapAxisLabel(value: string): string[] {
  if (value.length <= 18) return [value];

  const words = value.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > 18 && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function WrappedCategoryTick({
  x = 0,
  y = 0,
  payload,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string };
}) {
  const lines = wrapAxisLabel(String(payload?.value ?? ""));

  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="#6a7282" fontSize={11}>
        {lines.map((line, index) => (
          <tspan key={line} x={0} dy={index === 0 ? 12 : 13}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  );
}

function NoChartData({ message }: { message: string }) {
  return (
    <div className="h-[260px] flex items-center justify-center rounded-[10px] border border-dashed border-[#d1d5dc] bg-[#f9fafb] px-6 text-center">
      <p className="text-[#6a7282] text-sm leading-5">{message}</p>
    </div>
  );
}

function KDistTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem<KDistChartRow>[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[8px] p-3 text-xs shadow-md max-w-[260px]">
      <p className="font-semibold text-[#101828]">{row.category}</p>
      <p className="text-[#4a5565] mt-1">Rule: {row.rule}</p>
      <p className="text-[#101828] mt-2">
        Count: <span className="font-semibold">{row.count.toLocaleString()}</span>
      </p>
      <p className="text-[#101828]">Percentage: <span className="font-semibold">{formatPct(row.pct, 2)}</span></p>
      <p className="text-[#6a7282] mt-2">percentage = category_count / total_synthetic_records x 100</p>
    </div>
  );
}

function LinkageTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem<LinkageOutcomeChartRow>[];
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[8px] p-3 text-xs shadow-md max-w-[280px]">
      <p className="font-semibold text-[#101828]">{row.category}</p>
      <p className="text-[#4a5565] mt-1">{row.method}</p>
      <p className="text-[#4a5565]">Rule: {row.rule}</p>
      <p className="text-[#101828] mt-2">Count: <span className="font-semibold">{row.count.toLocaleString()}</span></p>
      <p className="text-[#101828]">Percentage: <span className="font-semibold">{formatPct(row.pct, 2)}</span></p>
    </div>
  );
}

function AttrTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem<AttrInferenceChartRow>[];
  label?: string;
}) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[8px] p-3 text-xs shadow-md max-w-[300px]">
      <p className="font-semibold text-[#101828] mb-2">{label}</p>
      <p className="text-[#101828]">Attack accuracy: <span className="font-semibold">{formatPct(row.attack)}</span></p>
      <p className="text-[#101828]">Baseline accuracy: <span className="font-semibold">{formatPct(row.baseline)}</span></p>
      <p className="text-[#101828]">Gain: <span className="font-semibold">{formatPct(row.gain)}</span></p>
      <p className="text-[#101828]">Risk score: <span className="font-semibold">{row.gain < 0 ? "No additional inference risk" : formatPct(row.riskScore)}</span></p>
      <p className="text-[#6a7282] mt-2">
        If attack accuracy is higher than baseline accuracy, the selected quasi-identifiers reveal extra information about this sensitive attribute.
      </p>
    </div>
  );
}

export default function ResultsCharts({
  variableRiskChart,
  ageGroupChart,
  attrInferenceChart,
  kDistChart,
  linkageOutcomeChart,
}: ResultsChartsProps) {
  void ageGroupChart;
  void variableRiskChart;

  const hasAttrData = Boolean(attrInferenceChart?.length);
  const hasKDist = Boolean(kDistChart?.length);
  const hasLinkageData = Boolean(linkageOutcomeChart?.length);
  const exactRows = linkageOutcomeChart?.filter((row) => row.method === "Exact matching") ?? [];
  const hammingRows = linkageOutcomeChart?.filter((row) => row.method === "Hamming nearest-neighbour") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <ChartCard
        title="k-Value Distribution"
      >
        {hasKDist ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-5 items-start">
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={kDistChart} margin={{ top: 18, right: 24, bottom: 12, left: 16 }} barCategoryGap="24%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="category" tick={{ fontSize: 12, fill: "#6a7282" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "#6a7282" }} axisLine={false} tickLine={false} />
                <Tooltip content={<KDistTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Bar dataKey="count" name="Synthetic record count" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="barLabel" position="top" style={{ fontSize: 11, fill: "#364153" }} />
                  {kDistChart?.map((entry, index) => (
                    <Cell key={index} fill={kColor(entry.category)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <ChartLegend
              title="k-value legend"
              rows={(kDistChart ?? []).map((row) => ({
                label: row.category,
                rule: row.rule,
                color: kColor(row.category),
              }))}
            />
          </div>
        ) : (
          <NoChartData message="No k-value distribution data was returned for this run." />
        )}
      </ChartCard>

      <ChartCard
        title="Linkage and Re-identification Outcomes"
      >
        {hasLinkageData ? (
          <div className="grid grid-cols-1 gap-6">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-5 items-start">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={exactRows} margin={{ top: 18, right: 24, bottom: 64, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="xLabel"
                    tick={<WrappedCategoryTick />}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#6a7282" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<LinkageTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <Bar dataKey="count" name="Synthetic record count" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="barLabel" position="top" style={{ fontSize: 10, fill: "#364153" }} />
                    {exactRows.map((entry, index) => (
                      <Cell key={index} fill={linkageColor(entry)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <ChartLegend
                title="Exact-match legend"
                rows={exactRows.map((row) => ({
                  label: row.category,
                  rule: row.rule,
                  color: linkageColor(row),
                }))}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-5 items-start">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={hammingRows} margin={{ top: 18, right: 24, bottom: 64, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="xLabel"
                    tick={<WrappedCategoryTick />}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#6a7282" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<LinkageTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                  <Bar dataKey="count" name="Synthetic record count" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="barLabel" position="top" style={{ fontSize: 10, fill: "#364153" }} />
                    {hammingRows.map((entry, index) => (
                      <Cell key={index} fill={linkageColor(entry)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <ChartLegend
                title="Hamming legend"
                rows={hammingRows.map((row) => ({
                  label: row.category,
                  rule: row.rule,
                  color: linkageColor(row),
                }))}
              />
            </div>
          </div>
        ) : (
          <NoChartData message="No linkage outcome category data was returned for this run." />
        )}

      </ChartCard>

      <ChartCard
        title="Attack Accuracy vs Baseline Accuracy"
        explanation="For every sensitive attribute, this compares the attacker's accuracy using selected quasi-identifiers with the baseline of always guessing the most common value."
      >
        {hasAttrData ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-5 items-start">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={attrInferenceChart}
                margin={{ top: 8, right: 20, bottom: 16, left: 0 }}
                barCategoryGap="18%"
                barGap={6}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="attribute" tick={{ fontSize: 11, fill: "#6a7282" }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={{ fontSize: 11, fill: "#6a7282" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value: number) => `${value}%`}
                />
                <Tooltip content={<AttrTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
                <Bar dataKey="baseline" name="Baseline accuracy %" fill="#64748b" radius={[4, 4, 0, 0]} barSize={36}>
                  <LabelList dataKey="baseline" position="top" formatter={labelPct} style={{ fontSize: 10, fill: "#364153" }} />
                </Bar>
                <Bar dataKey="attack" name="Attack accuracy %" fill="#155dfc" radius={[4, 4, 0, 0]} barSize={36}>
                  <LabelList dataKey="attack" position="top" formatter={labelPct} style={{ fontSize: 10, fill: "#364153" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <ChartLegend
              title="Accuracy legend"
              rows={[
                {
                  label: "Attack accuracy",
                  rule: "Prediction accuracy using selected quasi-identifiers.",
                  color: "#155dfc",
                },
                {
                  label: "Baseline accuracy",
                  rule: "Accuracy from always guessing the most common value.",
                  color: "#64748b",
                },
              ]}
            />
          </div>
        ) : (
          <NoChartData message="No attack accuracy and baseline accuracy data was returned for this run." />
        )}
      </ChartCard>
    </div>
  );
}
