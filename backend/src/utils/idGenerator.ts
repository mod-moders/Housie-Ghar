/**
 * Separates characters of an alphabetical string and increments it sequentially like Excel columns.
 * E.g., "" -> "A", "A" -> "B", "Z" -> "AA", "AA" -> "AB", "AZ" -> "BA", "ZZ" -> "AAA"
 * 
 * @param letters Current string of uppercase characters
 * @returns The next sequential string of characters
 */
export function incrementLetters(letters: string): string {
  if (!letters) return "A";
  
  const chars = letters.split("");
  let i = chars.length - 1;
  
  while (i >= 0) {
    if (chars[i] === "Z") {
      chars[i] = "A";
      i--;
    } else {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join("");
    }
  }
  
  // If all characters rolled over to 'A' (e.g., "ZZ" rolled to "AA" then rolls to "AAA")
  return "A" + chars.join("");
}

/**
 * Generates custom sequential rolling IDs for Housie Ghar requests.
 * 
 * Logic & Rules:
 * 1. The base format starts with the Prefix followed by a 3-digit number (e.g., HGTK001).
 * 2. The number increments sequentially up to 999 (e.g., HGTK999).
 * 3. Once the number exceeds 999, it resets to 001, and an uppercase alphabet letter is inserted
 *    immediately after the prefix and before the number (e.g., HGTKA001).
 * 4. The alphabet increments from A to Z every time the numbers hit 999 (e.g., A999 progresses to B001).
 * 5. Once the alphabet reaches Z999, it must append a new letter, starting at AA001, AA999 to AB001, etc.
 * 
 * @param currentId The last generated ID from the database, or null if it's the first entry
 * @param prefix The designated string prefix (e.g., "HGTK", "HGWR", "HGPCR")
 * @returns The next generated sequential ID
 */
export function generateNextId(currentId: string | null, prefix: string): string {
  if (!currentId || !currentId.startsWith(prefix)) {
    return prefix + "001";
  }

  // Extract the part after the prefix
  const part = currentId.substring(prefix.length);

  // Match optional uppercase letters followed by exactly 3 digits
  const match = part.match(/^([A-Z]*)(\d{3})$/);
  if (!match) {
    // Fallback if the format was somehow corrupted
    return prefix + "001";
  }

  const letters = match[1];
  const digitsStr = match[2];
  const num = parseInt(digitsStr, 10);

  if (num < 999) {
    const nextNum = num + 1;
    const padded = nextNum.toString().padStart(3, "0");
    return prefix + letters + padded;
  } else {
    // Roll over digits to 001 and increment alphabetical suffix
    const nextLetters = incrementLetters(letters);
    return prefix + nextLetters + "001";
  }
}
