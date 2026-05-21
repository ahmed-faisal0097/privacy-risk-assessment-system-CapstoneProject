interface SummaryCardProps {
  icon: React.ReactNode;
  iconBg: string;
  value: string;
  label: string;
}

export default function SummaryCard({
  icon,
  iconBg,
  value,
  label,
}: SummaryCardProps) {
  return (
    <div
      className="flex-1 min-w-0 bg-white border border-[#E2E8F0] rounded-2xl p-6 flex flex-col gap-4 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 group cursor-default"
      style={{
        boxShadow: "0 1px 3px rgba(15,23,42,0.04), 0 4px 16px rgba(30,58,138,0.06)",
      }}
    >
      <div
        className={`${iconBg} w-11 h-11 rounded-xl flex items-center justify-center shrink-0`}
      >
        {icon}
      </div>
      <div className="flex flex-col gap-0.5">
        <p className="text-[#0F172A] text-[30px] font-bold leading-9 tracking-tight">
          {value}
        </p>
        <p className="text-[#64748B] text-sm leading-5">{label}</p>
      </div>
    </div>
  );
}
