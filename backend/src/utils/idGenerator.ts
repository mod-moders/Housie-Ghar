/**
 * Formatted Custom Tracking ID Generator
 * Formats 1-based sequential numbers into standard IDs:
 * - 1..999: PREFIX + A001..A999
 * - 1000..1998: PREFIX + B001..B999
 * - ...
 * - 25975..26973: PREFIX + AA001..AA999
 */

export function getSeriesCode(seqVal: number): string {
  let blockIdx = Math.floor((seqVal - 1) / 999);
  let letterCode = '';
  let tempIdx = blockIdx;
  while (tempIdx >= 0) {
    letterCode = String.fromCharCode(65 + (tempIdx % 26)) + letterCode;
    tempIdx = Math.floor(tempIdx / 26) - 1;
  }
  return letterCode;
}

export function formatCustomId(prefix: string, seqVal: number): string {
  if (!seqVal || seqVal < 1) return '';
  const numPart = String(((seqVal - 1) % 999) + 1).padStart(3, '0');
  return `${prefix}${getSeriesCode(seqVal)}${numPart}`;
}

export function incrementLetters(letters: string): string {
  if (!letters) return 'A';
  const chars = letters.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] === 'Z') {
      chars[i] = 'A';
      i--;
    } else {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join('');
    }
  }
  return 'A' + chars.join('');
}

export function generateNextId(currentId: string | null, prefix: string): string {
  if (!currentId) {
    return `${prefix}001`;
  }
  const idStr = currentId.substring(prefix.length);
  const match = idStr.match(/^([A-Z]*?)(\d+)$/);
  if (!match) {
    return `${prefix}001`;
  }
  const letters = match[1];
  const num = parseInt(match[2], 10);
  if (num < 999) {
    const nextNumStr = String(num + 1).padStart(3, '0');
    return `${prefix}${letters}${nextNumStr}`;
  } else {
    const nextLetters = incrementLetters(letters);
    return `${prefix}${nextLetters}001`;
  }
}
