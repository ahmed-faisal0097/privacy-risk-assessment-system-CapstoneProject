import AttributeMultiSelect, {
  type AttributeOption,
} from "@/app/components/AttributeMultiSelect";

interface QuasiIdentifierSelectorProps {
  options: AttributeOption[];
  selected: string[];
  onChange: (updated: string[]) => void;
}

export const DEFAULT_QUASI_IDENTIFIERS = ["age", "gender", "race"];

export default function QuasiIdentifierSelector({
  options,
  selected,
  onChange,
}: QuasiIdentifierSelectorProps) {
  return (
    <div className="w-full max-w-5xl bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-8 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-[#101828] text-lg font-semibold leading-7">
          Select Quasi Identifiers
        </h2>
        <p className="text-[#4a5565] text-sm leading-5">
          Choose the attributes that may act as quasi-identifiers for privacy
          risk evaluation
        </p>
      </div>

      <AttributeMultiSelect
        accent="blue"
        options={options}
        selected={selected}
        onChange={onChange}
        placeholder="Select quasi-identifiers"
      />

      <p className="text-[#6a7282] text-xs leading-4">
        Selected attributes will be used to calculate re-identification risk
      </p>
    </div>
  );
}
