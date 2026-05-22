"use client";

import { useRef, useState } from "react";

interface UploadCardProps {
  title: string;
  accent: "blue" | "teal";
  file: File | null;
  onFileSelect: (file: File) => void;
  onRemove: () => void;
}

const accentConfig = {
  blue: {
    iconBg: "bg-[#dbeafe]",
    btnBg: "bg-[#155dfc] hover:bg-[#1151d6]",
    dragActiveBorder: "border-[#155dfc]",
    cardBg: "bg-[#eff6ff]",
    cardBorder: "border-[#bedbff]",
    fileIconBg: "bg-[#155dfc]",
  },
  teal: {
    iconBg: "bg-[#cbfbf1]",
    btnBg: "bg-[#009689] hover:bg-[#007a6e]",
    dragActiveBorder: "border-[#009689]",
    cardBg: "bg-[#f0fdfa]",
    cardBorder: "border-[#96f7e4]",
    fileIconBg: "bg-[#009689]",
  },
};

function UploadIcon({ accent }: { accent: "blue" | "teal" }) {
  const color = accent === "blue" ? "#155dfc" : "#009689";
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

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

function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function BrowseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function formatFileSize(bytes: number): string {
  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
}

export default function UploadCard({
  title,
  accent,
  file,
  onFileSelect,
  onRemove,
}: UploadCardProps) {
  const { iconBg, btnBg, dragActiveBorder, cardBg, cardBorder, fileIconBg } =
    accentConfig[accent];
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (incoming: File | null) => {
    if (incoming) onFileSelect(incoming);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files[0] ?? null);
  };

  return (
    <div className="flex flex-col gap-4 flex-1 min-w-0">
      <h3 className="text-[#101828] text-base font-medium leading-6">{title}</h3>

      {file ? (
        /* ── Uploaded file card ── */
        <div
          className={`${cardBg} ${cardBorder} border rounded-[10px] px-4 h-[74px] flex items-center justify-between`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`${fileIconBg} w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0`}
            >
              <FileIcon />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[#101828] text-sm font-medium leading-5 truncate">
                {file.name}
              </span>
              <span className="text-[#4a5565] text-xs leading-4">
                {formatFileSize(file.size)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onRemove}
            className="text-[#6a7282] hover:text-[#374151] transition-colors p-1.5 rounded-lg hover:bg-black/5 shrink-0"
            aria-label="Remove file"
          >
            <XIcon />
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
        </div>
      ) : (
        /* ── Dropzone ── */
        <div
          className={[
            "bg-[#f9fafb] border-2 border-dashed rounded-[10px] p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors",
            isDragging
              ? `${dragActiveBorder} bg-white`
              : "border-[#d1d5dc] hover:border-[#9ca3af]",
          ].join(" ")}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div
            className={`${iconBg} w-12 h-12 rounded-full flex items-center justify-center shrink-0`}
          >
            <UploadIcon accent={accent} />
          </div>

          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-[#364153] text-sm leading-5">
              Drag and drop CSV file
            </p>
            <p className="text-[#6a7282] text-xs leading-4">or</p>
          </div>

          <button
            type="button"
            className={`${btnBg} text-white text-sm font-medium leading-5 px-4 h-9 rounded-[10px] flex items-center gap-2 transition-colors`}
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            <BrowseIcon />
            Browse File
          </button>

          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
        </div>
      )}
    </div>
  );
}
