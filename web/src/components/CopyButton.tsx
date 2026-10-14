import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "../stores/toast";
import { Button } from "./Button";

interface CopyButtonProps {
  value: string;
  label?: string;
  copiedMessage?: string;
  size?: "sm" | "md";
  variant?: "secondary" | "quiet";
}

export function CopyButton({ value, label = "Copy", copiedMessage = "Copied", size = "sm", variant = "quiet" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast(copiedMessage);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Copying is blocked in this browser. Select the text instead.", "danger");
    }
  }
  return (
    <Button size={size} variant={variant} onClick={copy} icon={copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}>
      {label}
    </Button>
  );
}
