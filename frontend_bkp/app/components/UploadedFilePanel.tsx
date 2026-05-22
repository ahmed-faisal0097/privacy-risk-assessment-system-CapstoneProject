/**
 * Read-only uploaded file card used on the Results page.
 * Unlike UploadCard, this has no remove or file-input functionality.
 */

function FileIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

const accentConfig = {
  blue: {
    cardBg: "bg-[#eff6ff]",
    cardBorder: "border-[#bedbff]",
    fileIconBg: "bg-[#155dfc]",
  },
  teal: {
    cardBg: "bg-[#f0fdfa]",
    cardBorder: "border-[#96f7e4]",
    fileIconBg: "bg-[#009689]",
  },
};

interface UploadedFilePanelProps {
  title: string;
  fileName: string;
  fileSize: string;
  accent: "blue" | "teal";
}

export default function UploadedFilePanel({
  title,
  fileName,
  fileSize,
  accent,
}: UploadedFilePanelProps) {
  const { cardBg, cardBorder, fileIconBg } = accentConfig[accent];
  return (
    <div className="flex flex-col gap-4 flex-1 min-w-0">
      <h3 className="text-[#101828] text-base font-medium leading-6">{title}</h3>
      <div
        className={`${cardBg} ${cardBorder} border rounded-[10px] px-4 h-[74px] flex items-center gap-3`}
      >
        <div
          className={`${fileIconBg} w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0`}
        >
          <FileIcon />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[#101828] text-sm font-medium leading-5 truncate">
            {fileName}
          </span>
          <span className="text-[#4a5565] text-xs leading-4">{fileSize}</span>
        </div>
      </div>
    </div>
  );
}
