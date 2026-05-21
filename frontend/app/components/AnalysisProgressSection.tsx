"use client";

import SegmentedProgressBar from "@/app/components/SegmentedProgressBar";

interface AnalysisProgressSectionProps {
  progress: number;
  statusText: string;
}

export default function AnalysisProgressSection({
  progress,
  statusText,
}: AnalysisProgressSectionProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div
      className="w-full max-w-5xl rounded-2xl overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0F172A 0%, #1E2D50 55%, #0F172A 100%)",
        boxShadow:
          "0 4px 24px rgba(15,23,42,0.3), 0 0 0 1px rgba(30,58,138,0.35)",
      }}
    >
      {/* Top accent line */}
      <div
        className="h-[2px] w-full"
        style={{
          background: "linear-gradient(90deg, #1E3A8A, #2563EB, #0891B2, #2563EB, #1E3A8A)",
        }}
      />

      <div className="p-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "rgba(37,99,235,0.18)",
              border: "1px solid rgba(37,99,235,0.3)",
              boxShadow: "0 0 12px rgba(37,99,235,0.15)",
            }}
          >
            <svg
              className="animate-spin"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#60A5FA"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M12 2a10 10 0 0 1 10 10" opacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          </div>
          <div>
            <h2 className="text-white text-lg font-bold leading-7 tracking-tight">
              Running Analysis
            </h2>
            <p className="text-[#94A3B8] text-sm leading-5">
              Please wait while your datasets are being evaluated
            </p>
          </div>
        </div>

        {/* Progress bar + status */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#CBD5E1] flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#60A5FA] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#60A5FA]" />
              </span>
              {statusText}
            </span>
            <span className="text-sm font-bold text-[#60A5FA] tabular-nums font-mono">
              {clampedProgress}%
            </span>
          </div>

          <SegmentedProgressBar progress={clampedProgress} totalSegments={36} />
        </div>

        {/* Stage indicators */}
        <div className="grid grid-cols-5 gap-2">
          {STAGES.map((stage, i) => {
            const stageProgress = STAGE_THRESHOLDS[i];
            const isDone = clampedProgress >= stageProgress;
            const isActive =
              clampedProgress >= (i === 0 ? 0 : STAGE_THRESHOLDS[i - 1]) &&
              clampedProgress < stageProgress;

            return (
              <div key={stage} className="flex flex-col items-center gap-1.5">
                <div
                  className={[
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500",
                    isDone
                      ? "bg-[#2563EB] text-white"
                      : isActive
                      ? "text-[#93C5FD] ring-2 ring-[#2563EB]/40"
                      : "text-[#475569]",
                  ].join(" ")}
                  style={
                    isDone
                      ? { boxShadow: "0 0 8px rgba(37,99,235,0.5)" }
                      : isActive
                      ? { background: "rgba(30,58,138,0.5)" }
                      : { background: "rgba(30,58,138,0.18)" }
                  }
                >
                  {isDone ? (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path
                        d="M1 4L3.5 6.5L9 1"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                <span
                  className={[
                    "text-[10px] text-center leading-3 font-medium",
                    isDone
                      ? "text-[#60A5FA]"
                      : isActive
                      ? "text-[#CBD5E1]"
                      : "text-[#475569]",
                  ].join(" ")}
                >
                  {stage}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const STAGES = ["Upload", "Validate", "Process", "Evaluate", "Complete"];
const STAGE_THRESHOLDS = [20, 40, 65, 85, 100];
