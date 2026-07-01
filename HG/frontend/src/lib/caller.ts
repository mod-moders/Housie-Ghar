/**
 * Spoken-caller phrasing for a drawn Housie number (1–90).
 *
 * Mirrors how a live Tambola caller announces a number: the two digits first,
 * then the whole number — e.g. 21 → "two and one, twenty one".
 *   - 1–9          → "Number seven"
 *   - round tens   → "twenty", "ninety"
 *   - other 2-digit→ "<tens digit> and <ones digit>, <full number>"
 */

const ONES = [
  "zero", "one", "two", "three", "four",
  "five", "six", "seven", "eight", "nine",
];
const TEENS = [
  "ten", "eleven", "twelve", "thirteen", "fourteen",
  "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = [
  "", "ten", "twenty", "thirty", "forty",
  "fifty", "sixty", "seventy", "eighty", "ninety",
];

/** Plain English words for 0–99, e.g. 21 → "twenty one", 30 → "thirty". */
export function numberToWords(n: number): string {
  if (n < 10) return ONES[n];
  if (n < 20) return TEENS[n - 10];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones === 0 ? TENS[tens] : `${TENS[tens]} ${ONES[ones]}`;
}

/** Caller-style announcement for a drawn number. */
export function callerPhrase(n: number): string {
  if (n < 1 || n > 90) return numberToWords(n);
  if (n < 10) return `Number ${ONES[n]}`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (ones === 0) return numberToWords(n);
  return `${ONES[tens]} and ${ONES[ones]}, ${numberToWords(n)}`;
}
