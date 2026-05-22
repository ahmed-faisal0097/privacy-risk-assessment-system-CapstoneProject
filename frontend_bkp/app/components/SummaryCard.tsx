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
    <div className="flex-1 min-w-0 bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-6 flex flex-col gap-3">
      <div
        className={`${iconBg} w-12 h-12 rounded-[10px] flex items-center justify-center shrink-0`}
      >
        {icon}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[#101828] text-[30px] font-semibold leading-9">
          {value}
        </p>
        <p className="text-[#4a5565] text-sm leading-5">{label}</p>
      </div>
    </div>
  );
}
