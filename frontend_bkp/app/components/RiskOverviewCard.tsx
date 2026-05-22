import RiskBadge from "@/app/components/RiskBadge";
import type { RiskLevel } from "@/app/results/mockData";

const levelConfig: Record<
  RiskLevel,
  { cardBorder: string; iconBg: string; icon: React.ReactNode }
> = {
  High: {
    cardBorder: "border-[#ffc9c9]",
    iconBg: "bg-[#ffe2e2]",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#c10007"
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
    cardBorder: "border-[#ffd6a8]",
    iconBg: "bg-[#ffedd4]",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#ca3500"
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
    cardBorder: "border-[#b9f8cf]",
    iconBg: "bg-[#dcfce7]",
    icon: (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#008236"
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
  const { cardBorder, iconBg, icon } = levelConfig[level];
  return (
    <div
      className={`flex-1 min-w-0 bg-white ${cardBorder} border rounded-[14px] shadow-sm p-6 flex flex-col gap-4`}
    >
      <div className="flex items-start justify-between">
        <div className={`${iconBg} w-12 h-12 rounded-[10px] flex items-center justify-center shrink-0`}>
          {icon}
        </div>
        <RiskBadge level={level} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[#101828] text-2xl font-semibold leading-8">{value}</p>
        <p className="text-[#4a5565] text-sm leading-5">{label}</p>
      </div>
    </div>
  );
}
