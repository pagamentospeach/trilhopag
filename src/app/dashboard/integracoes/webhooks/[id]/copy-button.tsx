"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
      aria-label="Copiar"
    >
      {copied ? (
        <Check className="size-4 text-cyan-400" />
      ) : (
        <Copy className="size-4" />
      )}
    </button>
  );
}
