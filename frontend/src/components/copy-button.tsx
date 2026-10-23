"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  /** Localized "Copied!" feedback label — defaults to English for backward compatibility */
  copiedLabel?: string;
  /** Localized aria title for the copy button — defaults to English for backward compatibility */
  copyTitleAria?: string;
}

export function CopyButton({ text, label = "Copy", className = "", copiedLabel = "Copied!", copyTitleAria }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is unavailable
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? copiedLabel : (copyTitleAria ?? `Copy ${label}`)}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition-all hover:bg-surface-muted hover:text-primary active:scale-95 ${className}`}
    >
      {copied ? (
        <>
          <Check size={13} className="text-success" />
          <span className="text-success font-semibold">{copiedLabel}</span>
        </>
      ) : (
        <>
          <Copy size={13} className="text-muted-foreground" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
