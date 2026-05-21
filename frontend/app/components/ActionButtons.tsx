"use client";

interface ActionButtonsProps {
  /** Called when the user clicks Run Analysis. All validation + API logic lives
   *  in the parent (page.tsx) so it has access to files and selections. */
  onRunAnalysis: () => void;
  onReset: () => void;
  isSubmitting?: boolean;
  /** Disables the Run Analysis button without changing the label (e.g. overlap error) */
  runDisabled?: boolean;
}

function PlayIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="white"
      stroke="none"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 .49-3.46" />
    </svg>
  );
}

export default function ActionButtons({
  onRunAnalysis,
  onReset,
  isSubmitting = false,
  runDisabled = false,
}: ActionButtonsProps) {
  const btnDisabled = isSubmitting || runDisabled;
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={onRunAnalysis}
        disabled={btnDisabled}
        className={[
          "text-white text-base font-semibold h-12 px-7 rounded-xl flex items-center gap-2.5 transition-all duration-200",
          btnDisabled ? "opacity-50 cursor-not-allowed" : "hover:-translate-y-0.5",
        ].join(" ")}
        style={
          btnDisabled
            ? { background: "#1E3A8A" }
            : {
                background: "linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)",
                boxShadow:
                  "0 4px 14px rgba(30,58,138,0.35), inset 0 1px 0 rgba(255,255,255,0.12)",
              }
        }
      >
        <PlayIcon />
        {isSubmitting ? "Running..." : "Run Analysis"}
      </button>

      <button
        type="button"
        onClick={onReset}
        disabled={isSubmitting}
        className="disabled:opacity-50 text-white text-base font-medium h-12 px-6 rounded-xl flex items-center gap-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 disabled:hover:translate-y-0"
        style={{
          background: "linear-gradient(135deg, #334155 0%, #475569 100%)",
          boxShadow: "0 4px 14px rgba(51,65,85,0.25), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <RefreshIcon />
        Reset
      </button>
    </div>
  );
}
