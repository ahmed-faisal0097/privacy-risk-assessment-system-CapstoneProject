import AttributeMultiSelect, {
  type AttributeOption,
} from "@/app/components/AttributeMultiSelect";

interface SensitiveAttributeSelectorProps {
  options: AttributeOption[];
  selected: string[];
  onChange: (updated: string[]) => void;
}

export const DEFAULT_SENSITIVE_ATTRIBUTES = [
  "diag_1",
  "diag_2",
  "readmitted",
];

export default function SensitiveAttributeSelector({
  options,
  selected,
  onChange,
}: SensitiveAttributeSelectorProps) {
  return (
    <div className="w-full max-w-5xl bg-white border border-[#e5e7eb] rounded-[14px] shadow-sm p-8 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-[#101828] text-lg font-semibold leading-7">
          Select Sensitive Attributes
        </h2>
        <p className="text-[#4a5565] text-sm leading-5">
          Choose attributes containing sensitive information that must be
          protected during analysis
        </p>
      </div>

      <AttributeMultiSelect
        accent="teal"
        options={options}
        selected={selected}
        onChange={onChange}
        placeholder="Select sensitive attributes"
      />

      <p className="text-[#6a7282] text-xs leading-4">
        Sensitive attributes will be used to evaluate privacy disclosure risks
        and must not overlap with quasi-identifiers.
      </p>
    </div>
  );
}
