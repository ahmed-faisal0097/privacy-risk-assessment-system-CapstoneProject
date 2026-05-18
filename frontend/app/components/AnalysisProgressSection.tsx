"use client";

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
    <div className="w-full max-w-5xl bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-8">
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          {/* Animated spinner */}
          <div className="shrink-0 w-9 h-9 rounded-full bg-[#eff6ff] flex items-center justify-center">
            <svg
              className="animate-spin text-[#2b7fff]"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M12 2a10 10 0 0 1 10 10" opacity="0.25" />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          </div>
          <div>
            <h2 className="text-[#101828] text-lg font-semibold leading-7">
              Running Analysis
            </h2>
            <p className="text-[#4a5565] text-sm leading-5">
              Please wait while your datasets are being evaluated
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#364153] flex items-center gap-2">
              {/* Pulsing dot */}
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#2b7fff] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#2b7fff]" />
              </span>
              {statusText}
            </span>
            <span className="text-sm font-semibold text-[#2b7fff] tabular-nums">
              {clampedProgress}%
            </span>
          </div>

          {/* Track */}
          <div className="w-full h-2.5 bg-[#f3f4f6] rounded-full overflow-hidden">
            {/* Fill */}
            <div
              style={{
                width: `${clampedProgress}%`,
                background: "linear-gradient(90deg, #2b7fff 0%, #155dfc 50%, #009689 100%)",
                transition: "width 0.7s ease-out",
              }}
              className="h-full rounded-full"
            />
          </div>
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
                    "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-500",
                    isDone
                      ? "bg-[#155dfc] text-white"
                      : isActive
                      ? "bg-[#eff6ff] text-[#2b7fff] ring-2 ring-[#2b7fff]/30"
                      : "bg-[#f3f4f6] text-[#9ca3af]",
                  ].join(" ")}
                >
                  {isDone ? (
                    <svg width="12" height="10" viewBox="0 0 10 8" fill="none">
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
                      ? "text-[#155dfc]"
                      : isActive
                      ? "text-[#364153]"
                      : "text-[#9ca3af]",
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
