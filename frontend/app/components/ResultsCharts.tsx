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
} from "recharts";
import type { AnalysisResults } from "@/app/results/mockData";

function barColor(score: number): string {
  if (score >= 7) return "#ef4444";
  if (score >= 4.5) return "#f97316";
  return "#22c55e";
}

interface ResultsChartsProps {
  variableRiskChart: AnalysisResults["variableRiskChart"];
  ageGroupChart: AnalysisResults["ageGroupChart"];
}

export default function ResultsCharts({
  variableRiskChart,
  ageGroupChart,
}: ResultsChartsProps) {
  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* Chart 1 — Horizontal: Risk Score by Variable */}
      <div className="flex-1 bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-6 flex flex-col gap-4">
        <h3 className="text-[#101828] text-base font-semibold leading-6">
          Risk Score by Variable
        </h3>
        <ResponsiveContainer width="100%" height={300}>
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
              formatter={(v) => [typeof v === "number" ? v.toFixed(1) : v, "Risk Score"]}
            />
            <Bar dataKey="score" radius={[0, 4, 4, 0]} barSize={18}>
              {variableRiskChart.map((entry, i) => (
                <Cell key={i} fill={barColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Chart 2 — Vertical: Risk by Age Group */}
      <div className="flex-1 bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-6 flex flex-col gap-4">
        <h3 className="text-[#101828] text-base font-semibold leading-6">
          Risk by Age Group
        </h3>
        <ResponsiveContainer width="100%" height={300}>
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
              formatter={(v) => [typeof v === "number" ? v.toFixed(1) : v, "Risk Score"]}
            />
            <Bar dataKey="score" fill="#155dfc" radius={[4, 4, 0, 0]} barSize={48}>
              {ageGroupChart.map((entry, i) => (
                <Cell key={i} fill={barColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
