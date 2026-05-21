import type { RiskLevel } from "@/app/results/mockData";

const badgeConfig: Record<RiskLevel, { bg: string; text: string; dot: string; border: string }> = {
  High: {
    bg: "bg-[#FEF2F2]",
    text: "text-[#DC2626]",
    dot: "bg-[#DC2626]",
    border: "border-[#FECACA]",
  },
  Medium: {
    bg: "bg-[#FFFBEB]",
    text: "text-[#D97706]",
    dot: "bg-[#F59E0B]",
    border: "border-[#FDE68A]",
  },
  Low: {
    bg: "bg-[#F0FDF4]",
    text: "text-[#059669]",
    dot: "bg-[#10B981]",
    border: "border-[#A7F3D0]",
  },
};

interface RiskBadgeProps {
  level: RiskLevel;
}

export default function RiskBadge({ level }: RiskBadgeProps) {
  const { bg, text, dot, border } = badgeConfig[level];
  return (
    <span
      className={`${bg} ${text} ${border} border text-xs font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 shrink-0`}
    >
      <span className={`${dot} w-1.5 h-1.5 rounded-full shrink-0`} />
      {level} Risk
    </span>
  );
}
