"use client";

interface ActionButtonsProps {
  /** Called when the user clicks Run Analysis. All validation + API logic lives
   *  in the parent (page.tsx) so it has access to files and selections. */
  onRunAnalysis: () => void;
  onReset: () => void;
  isSubmitting?: boolean;
}

function PlayIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
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
      width="20"
      height="20"
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
}: ActionButtonsProps) {
  return (
    <div className="flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={onRunAnalysis}
        disabled={isSubmitting}
        className={[
          "text-white text-base font-medium leading-6 h-12 px-6 rounded-[10px] flex items-center gap-2 transition-colors",
          isSubmitting
            ? "bg-[#7aabfe] cursor-not-allowed"
            : "bg-[#155dfc] hover:bg-[#1151d6]",
        ].join(" ")}
      >
        <PlayIcon />
        {isSubmitting ? "Running..." : "Run Analysis"}
      </button>

      <button
        type="button"
        onClick={onReset}
        disabled={isSubmitting}
        className="bg-white hover:bg-gray-50 disabled:opacity-50 text-[#364153] text-base font-medium leading-6 h-12 px-6 rounded-[10px] border border-[#d1d5dc] flex items-center gap-2 transition-colors"
      >
        <RefreshIcon />
        Reset
      </button>
    </div>
  );
}
