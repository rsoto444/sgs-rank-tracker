"use client";
import { useState } from "react";

export default function CopyBox({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <code className="block min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg border border-line bg-bg p-3 text-xs">{text}</code>
      <button
        type="button"
        className="btn-ghost shrink-0"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
