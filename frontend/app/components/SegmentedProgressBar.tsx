"use client";

interface SegmentedProgressBarProps {
  /** 0–100 progress value driven by backend polling */
  progress: number;
  /** Total number of block segments to render */
  totalSegments?: number;
}

/**
 * Medical-monitor–style segmented progress bar.
 * Dark outer container with glowing border, deep-blue filled blocks.
 * All progress is backend-driven — no front-end simulation.
 */
export default function SegmentedProgressBar({
  progress,
  totalSegments = 36,
}: SegmentedProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, progress));
  const filled = Math.round((clamped / 100) * totalSegments);

  return (
    <div
      className="w-full rounded-full bg-[#0F172A]"
      style={{
        border: "2px solid #1E3A8A",
        boxShadow:
          "0 0 0 3px rgba(30,58,138,0.18), 0 0 20px rgba(30,58,138,0.22), inset 0 1px 4px rgba(0,0,0,0.4)",
        padding: "4px 5px",
      }}
    >
      <div className="flex gap-[2px] items-stretch">
        {Array.from({ length: totalSegments }).map((_, i) => (
          <div
            key={i}
            className="flex-1 h-[15px] rounded-[2px]"
            style={{
              backgroundColor:
                i < filled
                  ? /* filled — bright medical blue */ "#2563EB"
                  : /* empty — very subtle dark trace */ "rgba(30,58,138,0.18)",
              boxShadow: i < filled ? "0 0 4px rgba(37,99,235,0.5)" : "none",
              transition: "background-color 0.3s ease, box-shadow 0.3s ease",
            }}
          />
        ))}
      </div>
    </div>
  );
}
