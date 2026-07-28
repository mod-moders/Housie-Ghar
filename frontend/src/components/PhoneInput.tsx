"use client";

import React from "react";
import { COUNTRIES, DEFAULT_DIAL, flagEmoji } from "@/lib/countryDialCodes";
import { parsePhone, formatPhone } from "@/lib/phoneFormat";

/** Computed once at module load, not per render. */
const DIALS: string[] = Array.from(new Set(COUNTRIES.map((c) => c.dial)));

interface PhoneInputProps {
  value: string;
  onChange: (next: string) => void;
  required?: boolean;
  placeholder?: string;
  /** Two call sites pass an inline inputStyle; applied to both fields. */
  style?: React.CSSProperties;
  /** Two call sites rely on .hg-form-field markup instead. */
  className?: string;
  disabled?: boolean;
}

/**
 * Country code + national number, presented as one control.
 *
 * Owns a SINGLE string value in E.164 ("+919876543210") so every call site keeps
 * the plain value/onChange shape it already had and no caller has to hold two
 * pieces of state. See lib/phoneFormat.ts for the parsing rules — in particular
 * why an empty national part must emit "" rather than a bare dial code.
 */
export function PhoneInput({
  value,
  onChange,
  required,
  placeholder = "9876543210",
  style,
  className,
  disabled,
}: PhoneInputProps) {
  const { dial, national } = parsePhone(value, DIALS, DEFAULT_DIAL);

  return (
    <div
      className={className}
      /* wrap + a flex-basis on the number field so this survives a narrow
         container. Several call sites drop it into a 1fr 1fr grid cell (~180px
         on a phone), where a rigid side-by-side row squeezes the number down to
         ~80px and clips the digits. Below that basis the number field takes its
         own line at full width instead of being cut off. */
      style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", width: "100%" }}
    >
      <select
        aria-label="Country code"
        value={dial}
        disabled={disabled}
        onChange={(e) => onChange(formatPhone(e.target.value, national))}
        style={{ ...style, width: "auto", flex: "0 0 auto", paddingLeft: 8, paddingRight: 4 }}
      >
        {COUNTRIES.map((c) => (
          <option key={c.iso2} value={c.dial}>
            {flagEmoji(c.iso2)} {c.dial}
          </option>
        ))}
      </select>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={national}
        onChange={(e) => onChange(formatPhone(dial, e.target.value))}
        style={{ ...style, flex: "1 1 140px", minWidth: 0 }}
      />
    </div>
  );
}
