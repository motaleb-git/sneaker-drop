import type { ReactNode } from "react";

type Props = {
  label: string;
  error?: string;
  children: ReactNode;
  className?: string;
};

export function Field({ label, error, children, className = "" }: Props) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-400">{error}</span> : null}
    </label>
  );
}

export function inputClass(error?: string): string {
  return `w-full rounded-lg border bg-slate-950 px-3 py-2 text-sm ${
    error ? "border-rose-500" : "border-slate-700"
  }`;
}
