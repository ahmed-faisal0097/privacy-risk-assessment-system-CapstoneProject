import type { RiskLevel } from "@/app/results/mockData";

const badgeConfig: Record<RiskLevel, { bg: string; text: string }> = {
  High: { bg: "bg-[#ffe2e2]", text: "text-[#c10007]" },
  Medium: { bg: "bg-[#ffedd4]", text: "text-[#ca3500]" },
  Low: { bg: "bg-[#dcfce7]", text: "text-[#008236]" },
};

interface RiskBadgeProps {
  level: RiskLevel;
}

export default function RiskBadge({ level }: RiskBadgeProps) {
  const { bg, text } = badgeConfig[level];
  return (
    <span
      className={`${bg} ${text} text-xs font-medium px-2.5 py-1 rounded-lg inline-block`}
    >
      {level}
    </span>
  );
}
