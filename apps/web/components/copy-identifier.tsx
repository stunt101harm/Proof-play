"use client";

import { useState } from "react";

export function CopyIdentifier({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <button className="copy-button" type="button" onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
