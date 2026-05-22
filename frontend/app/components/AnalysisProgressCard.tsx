"use client";

export type AnalysisProgressState = {
  activeStep: number;
  stepProgress: number;
  completed: boolean;
  status?: string;
  message?: string;
};

const ANALYSIS_STEPS = [
  "Upload & Validation",
  "Uniqueness & Rare Combination Risk",
  "Linkage & Re-identification Risk",
  "Attribute Inference Risk",
  "Complete",
];

function SpinnerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="#bfdbfe"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 1-9 9"
        stroke="#2b7fff"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function getOverallPercent(progress: AnalysisProgressState) {
  if (progress.completed) return 100;

  const completedShare = progress.activeStep / ANALYSIS_STEPS.length;
  const activeShare = progress.stepProgress / 100 / ANALYSIS_STEPS.length;
  return Math.min(99, Math.round((completedShare + activeShare) * 100));
}

function getStatusText(progress: AnalysisProgressState) {
  if (progress.message) return progress.message;
  if (progress.completed) return "Complete";

  const label = ANALYSIS_STEPS[progress.activeStep];

  if (progress.activeStep === 0) return "Uploading and validating datasets...";
  return `Running ${label.toLowerCase()}...`;
}

export default function AnalysisProgressCard({
  progress,
}: {
  progress: AnalysisProgressState;
}) {
  const overallPercent = getOverallPercent(progress);

  return (
    <div className="w-full max-w-5xl bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-8 flex flex-col gap-7">
      <div className="flex items-start gap-4">
        <div className="bg-[#eff6ff] w-12 h-12 rounded-full flex items-center justify-center shrink-0">
          {progress.completed ? (
            <div className="bg-[#155dfc] w-7 h-7 rounded-full flex items-center justify-center">
              <CheckIcon />
            </div>
          ) : (
            <SpinnerIcon />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="text-[#101828] text-xl font-semibold leading-7">
            {progress.completed ? "Analysis Complete" : "Running Analysis"}
          </h2>
          <p className="text-[#4a5565] text-sm leading-5">
            {progress.completed
              ? "Your privacy risk evaluation has finished."
              : "Please wait while your datasets are being evaluated."}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <p className="min-w-0 truncate text-[#364153] text-base font-semibold leading-6">
            {getStatusText(progress)}
          </p>
          <span className="text-[#2b7fff] text-base font-semibold leading-6">
            {overallPercent}%
          </span>
        </div>

        <div className="h-3 w-full overflow-hidden rounded-full bg-[#f3f4f6]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#2b7fff] to-[#009689] transition-all duration-500 ease-out"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        {ANALYSIS_STEPS.map((label, index) => {
          const isComplete = progress.completed || index < progress.activeStep;
          const isActive = !progress.completed && index === progress.activeStep;

          return (
            <div
              key={label}
              className="flex items-center gap-3 sm:flex-col sm:items-center sm:text-center"
            >
              <div
                className={[
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold",
                  isComplete
                    ? "border-[#155dfc] bg-[#155dfc] text-white"
                    : isActive
                      ? "border-[#93c5fd] bg-[#eff6ff] text-[#155dfc]"
                      : "border-[#d1d5dc] bg-white text-[#6a7282]",
                ].join(" ")}
              >
                {isComplete ? <CheckIcon /> : index + 1}
              </div>

              <div className="min-w-0 flex-1 sm:w-full">
                <p
                  className={[
                    "text-sm font-medium leading-5",
                    isComplete || isActive ? "text-[#155dfc]" : "text-[#4a5565]",
                  ].join(" ")}
                >
                  {label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
