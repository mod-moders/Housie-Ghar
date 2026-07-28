/**
 * Pure parse/format helpers for phone entry fields.
 *
 * Deliberately has NO imports. The dial codes are passed in by the caller
 * (PhoneInput) rather than imported from ./countryDialCodes, because the test
 * file is run by `node --test`, which requires explicit .ts extensions on
 * relative imports, while this project's tsconfig (moduleResolution: bundler,
 * no allowImportingTsExtensions) rejects them. Keeping this module import-free
 * is what lets it be both typechecked and unit tested. Adding an import here
 * will break `npm test` at runtime.
 */

export interface ParsedPhone {
  dial: string;
  national: string;
}

/** Digits only. */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Split a stored phone value into a dial code and a national part.
 *
 * `dials` is matched LONGEST FIRST. Order matters: "+977" (Nepal) and "+91"
 * (India) share a "+9" prefix, and "+1876" (Jamaica) starts with "+1". Matching
 * shortest-first would read a Nepali number as Indian and silently mangle it.
 *
 * A value that does not start with "+" is a legacy row written before country
 * codes existed. It is shown under `defaultDial` with its digits intact, and is
 * NOT rewritten until the user actually edits and saves the field.
 */
export function parsePhone(
  value: string | null | undefined,
  dials: string[],
  defaultDial: string
): ParsedPhone {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("+")) {
    return { dial: defaultDial, national: digits(raw) };
  }
  const normalised = "+" + digits(raw);
  const longestFirst = [...dials].sort((a, b) => b.length - a.length);
  for (const dial of longestFirst) {
    if (normalised.startsWith(dial)) {
      return { dial, national: normalised.slice(dial.length) };
    }
  }
  return { dial: defaultDial, national: digits(raw) };
}

/**
 * Join a dial code and national part into the value that gets stored.
 *
 * Returns "" for an empty national part rather than a bare dial code, so the
 * existing `if (!phone.trim())` required-field checks at the call sites still
 * reject an untouched field.
 */
export function formatPhone(dial: string, national: string): string {
  const n = digits(national);
  if (!n) return "";
  return `${dial}${n}`;
}
