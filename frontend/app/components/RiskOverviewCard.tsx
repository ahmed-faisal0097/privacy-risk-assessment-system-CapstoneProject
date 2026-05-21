import RiskBadge from "@/app/components/RiskBadge";
import type { RiskLevel } from "@/app/results/mockData";

const levelConfig: Record<
  RiskLevel,
  { leftBorderColor: string; iconBg: string; icon: React.ReactNode }
> = {
  High: {
    leftBorderColor: "#DC2626",
    iconBg: "bg-[#FEF2F2]",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#DC2626"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    ),
  },
  Medium: {
    leftBorderColor: "#F59E0B",
    iconBg: "bg-[#FFFBEB]",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#D97706"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    ),
  },
  Low: {
    leftBorderColor: "#10B981",
    iconBg: "bg-[#F0FDF4]",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#059669"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    ),
  },
};

interface RiskOverviewCardProps {
  label: string;
  value: string;
  level: RiskLevel;
}

export default function RiskOverviewCard({
  label,
  value,
  level,
}: RiskOverviewCardProps) {
  const { leftBorderColor, iconBg, icon } = levelConfig[level];
  return (
    <div
      className="flex-1 min-w-0 bg-white border border-[#E2E8F0] rounded-2xl p-6 flex flex-col gap-4 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
      style={{
        borderLeft: `4px solid ${leftBorderColor}`,
        boxShadow: "0 1px 3px rgba(15,23,42,0.04), 0 4px 16px rgba(30,58,138,0.06)",
      }}
    >
      <div className="flex items-start justify-between">
        <div
          className={`${iconBg} w-11 h-11 rounded-xl flex items-center justify-center shrink-0`}
        >
          {icon}
        </div>
        <RiskBadge level={level} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[#0F172A] text-2xl font-bold leading-8 tracking-tight">
          {value}
        </p>
        <p className="text-[#64748B] text-sm leading-5">{label}</p>
      </div>
    </div>
  );
}
