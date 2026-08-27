"use client";

import type { ChangeEvent, HTMLInputTypeAttribute } from "react";

// DESIGN.md §3/§6: admin fields share the guest underline anatomy
// (border-0 border-b, transparent, focus:border-accent).
const underlineInput =
  "w-full border-0 border-b border-border bg-transparent rounded-none px-0 pb-2 h-12 placeholder:text-text-muted focus:border-accent focus:outline-none";

export function AdminInput({
  id,
  label,
  type = "text",
  value,
  onChange,
  readOnly = false,
  required = false,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  type?: HTMLInputTypeAttribute;
  value: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  readOnly?: boolean;
  required?: boolean;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block" htmlFor={id}>
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        required={required}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`mt-2 text-text-primary ${underlineInput} ${readOnly ? "pointer-events-none select-all text-text-muted" : ""}`}
      />
    </label>
  );
}
