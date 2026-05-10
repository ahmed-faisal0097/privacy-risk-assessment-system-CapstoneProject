"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import type { AnalysisResults } from "@/app/results/mockData";

// ── Colour helpers ────────────────────────────────────────────────────────────

function barColor(score: number): string {
  if (score >= 7) return "#ef4444";
  if (score >= 4.5) return "#f97316";
  return "#22c55e";
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AttrInferenceChartRow {
  attribute: string;
  baseline: number;
  attack: number;
  gain: number;
  coverage: number;
  qualitative_label: string;
}

export interface KDistChartRow {
  category: string;
  count: number;
  pct: number;
}

interface ResultsChartsProps {
  variableRiskChart: AnalysisResults["variableRiskChart"];
  ageGroupChart: AnalysisResults["ageGroupChart"];
  attrInferenceChart?: AttrInferenceChartRow[];
  kDistChart?: KDistChartRow[];
}

// ── Custom tooltip for attribute inference chart ──────────────────────────────

interface TooltipPayloadItem {
  name: string;
  value: number;
  color: string;
}

function AttrTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[8px] p-3 text-xs shadow-md">
      <p className="font-semibold text-[#101828] mb-2">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-semibold">{p.value.toFixed(1)}%</span>
        </p>
      ))}
    </div>
  );
}

// ── Custom tooltip for k-distribution chart ───────────────────────────────────

function KDistTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="bg-white border border-[#e5e7eb] rounded-[8px] p-3 text-xs shadow-md">
      <p className="font-semibold text-[#101828] mb-1">{label}</p>
      <p style={{ color: item.color }}>
        Records: <span className="font-semibold">{item.value.toLocaleString()}</span>
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ResultsCharts({
  variableRiskChart,
  ageGroupChart,
  attrInferenceChart,
  kDistChart,
}: ResultsChartsProps) {
  const hasRealAttrData = attrInferenceChart && attrInferenceChart.length > 0;
  const hasKDist = kDistChart && kDistChart.length > 0;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Row 1: Variable risk + Attribute Inference / Age Group ── */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Chart 1 — Horizontal bar: Attribute Inference Risk by Sensitive Column */}
        <div className="flex-1 bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-6 flex flex-col gap-4">
          <h3 className="text-[#101828] text-base font-semibold leading-6">
            Attribute Inference Risk by Sensitive Column
          </h3>
          <p className="text-[#4a5565] text-xs leading-5">
            Risk score per sensitive attribute (0–10 scale). Higher = more exposure.
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              layout="vertical"
              data={variableRiskChart}
              margin={{ top: 0, right: 16, bottom: 0, left: 110 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
              <XAxis
                type="number"
                domain={[0, 10]}
                ticks={[0, 3, 6, 10]}
                tick={{ fontSize: 12, fill: "#6a7282" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="variable"
                tick={{ fontSize: 12, fill: "#6a7282" }}
                axisLine={false}
                tickLine={false}
                width={105}
              />
              <Tooltip
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
                contentStyle={{
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  fontSize: 12,
                }}
                formatter={(value) => {
                  const num = typeof value === "number" ? value : 0;
                  return [num.toFixed(2), "Risk Score"] as [string, string];
                }}
              />
              <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={22}>
                {variableRiskChart.map((entry, i) => (
                  <Cell key={i} fill={barColor(entry.score)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Chart 2 — Attack vs Baseline (real) or Age Group (mock fallback) */}
        <div className="flex-1 bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-6 flex flex-col gap-4">
          {hasRealAttrData ? (
            <>
              <h3 className="text-[#101828] text-base font-semibold leading-6">
                Attribute Inference: Attack vs Baseline
              </h3>
              <p className="text-[#4a5565] text-xs leading-5">
                Compares attacker accuracy (using QI knowledge) against the
                baseline (always guessing the most common value). A larger gap
                means higher attribute inference risk.
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={attrInferenceChart}
                  margin={{ top: 0, right: 16, bottom: 16, left: 0 }}
                  barCategoryGap="30%"
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="attribute"
                    tick={{ fontSize: 11, fill: "#6a7282" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 25, 50, 75, 100]}
                    tick={{ fontSize: 11, fill: "#6a7282" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip
                    content={<AttrTooltip />}
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    formatter={(value) =>
                      value === "baseline"
                        ? "Baseline (always guess most common)"
                        : "Attack (using QI knowledge)"
                    }
                  />
                  <Bar
                    dataKey="baseline"
                    name="baseline"
                    fill="#d1d5dc"
                    radius={[4, 4, 0, 0]}
                    barSize={28}
                  />
                  <Bar
                    dataKey="attack"
                    name="attack"
                    radius={[4, 4, 0, 0]}
                    barSize={28}
                  >
                    {attrInferenceChart!.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          entry.qualitative_label === "High"
                            ? "#ef4444"
                            : entry.qualitative_label === "Moderate"
                            ? "#f97316"
                            : "#22c55e"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          ) : (
            /* Fallback: original age group chart */
            <>
              <h3 className="text-[#101828] text-base font-semibold leading-6">
                Risk by Age Group
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart
                  data={ageGroupChart}
                  margin={{ top: 0, right: 16, bottom: 16, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis
                    dataKey="group"
                    tick={{ fontSize: 12, fill: "#6a7282" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 10]}
                    ticks={[0, 3, 6, 10]}
                    tick={{ fontSize: 12, fill: "#6a7282" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: "rgba(0,0,0,0.04)" }}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid #e5e7eb",
                      fontSize: 12,
                    }}
                    formatter={(value) => {
                      const num = typeof value === "number" ? value : 0;
                      return [num.toFixed(1), "Risk Score"] as [string, string];
                    }}
                  />
                  <Bar dataKey="score" radius={[4, 4, 0, 0]} barSize={48}>
                    {ageGroupChart.map((entry, i) => (
                      <Cell key={i} fill={barColor(entry.score)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      </div>

      {/* ── Row 2: k-value distribution ── */}
      {hasKDist && (
        <div className="bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-6 flex flex-col gap-4">
          <h3 className="text-[#101828] text-base font-semibold leading-6">
            Synthetic Record k-Value Distribution
          </h3>
          <p className="text-[#4a5565] text-xs leading-5">
            For each synthetic record, k = number of real patients sharing the
            same quasi-identifier combination. Lower k means higher
            re-identification risk.
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={kDistChart}
              margin={{ top: 0, right: 32, bottom: 16, left: 16 }}
              barCategoryGap="25%"
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 12, fill: "#6a7282" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: "#6a7282" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                }
              />
              <Tooltip
                content={<KDistTooltip />}
                cursor={{ fill: "rgba(0,0,0,0.04)" }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {kDistChart!.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      entry.category.includes("k=0")
                        ? "#ef4444"
                        : entry.category.includes("k=1")
                        ? "#f97316"
                        : entry.category.includes("k<5")
                        ? "#eab308"
                        : "#22c55e"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-[#4a5565]">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#ef4444" }} />
              k=0 — no real match
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#f97316" }} />
              k=1 — unique (maps to exactly one real person)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#eab308" }} />
              k&lt;5 — rare (fewer than 5 real matches)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#22c55e" }} />
              k≥5 — safe (sufficient real coverage)
            </span>
          </div>
        </div>
      )}

    </div>
  );
}