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
    iconBg: "bg-[#EFF6FF]",
    btnGradient: {
      background: "linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)",
      boxShadow: "0 2px 8px rgba(30,58,138,0.30)",
    },
    btnHoverClass: "hover:opacity-90",
    dragActiveBorder: "border-[#2563EB]",
    dragActiveBg: "bg-[#EFF6FF]",
    cardBg: "bg-[#EFF6FF]",
    cardBorder: "border-[#BFDBFE]",
    fileIconBg: "bg-[#1E3A8A]",
    titleAccent: "text-[#1E3A8A]",
  },
  teal: {
    iconBg: "bg-[#ECFEFF]",
    btnGradient: {
      background: "linear-gradient(135deg, #0E7490 0%, #0891B2 100%)",
      boxShadow: "0 2px 8px rgba(8,145,178,0.30)",
    },
    btnHoverClass: "hover:opacity-90",
    dragActiveBorder: "border-[#0891B2]",
    dragActiveBg: "bg-[#ECFEFF]",
    cardBg: "bg-[#ECFEFF]",
    cardBorder: "border-[#A5F3FC]",
    fileIconBg: "bg-[#0891B2]",
    titleAccent: "text-[#0891B2]",
  },
};

function UploadIcon({ accent }: { accent: "blue" | "teal" }) {
  const color = accent === "blue" ? "#1E3A8A" : "#0891B2";
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
      width="15"
      height="15"
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
      width="15"
      height="15"
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
  const { iconBg, btnGradient, btnHoverClass, dragActiveBorder, dragActiveBg, cardBg, cardBorder, fileIconBg } =
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
      <h3 className="text-[#0F172A] text-base font-semibold leading-6">{title}</h3>

      {file ? (
        /* ── Uploaded file card ── */
        <div
          className={`${cardBg} ${cardBorder} border rounded-xl px-4 h-[76px] flex items-center justify-between`}
          style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04), 0 2px 8px rgba(30,58,138,0.06)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`${fileIconBg} w-10 h-10 rounded-xl flex items-center justify-center shrink-0`}
            >
              <FileIcon />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[#0F172A] text-sm font-semibold leading-5 truncate">
                {file.name}
              </span>
              <span className="text-[#64748B] text-xs leading-4">
                {formatFileSize(file.size)}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onRemove}
            className="text-[#94A3B8] hover:text-[#475569] transition-colors p-1.5 rounded-lg hover:bg-black/5 shrink-0"
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
            "bg-[#F8FAFC] border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200",
            isDragging
              ? `${dragActiveBorder} ${dragActiveBg}`
              : "border-[#CBD5E1] hover:border-[#94A3B8] hover:bg-white",
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
            <p className="text-[#475569] text-sm font-medium leading-5">
              Drag and drop CSV file
            </p>
            <p className="text-[#94A3B8] text-xs leading-4">or</p>
          </div>

          <button
            type="button"
            className={`text-white text-sm font-semibold leading-5 px-4 h-9 rounded-xl flex items-center gap-2 transition-opacity ${btnHoverClass}`}
            style={btnGradient}
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
