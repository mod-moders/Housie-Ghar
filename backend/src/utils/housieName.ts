/**
 * Housie name handling — validation, normalization, and winner-string parsing.
 *
 * These three concerns were previously reimplemented ad hoc at each call site
 * (signup, ticket locking, prize claiming, stats), and the copies disagreed:
 *
 *   - signup compared names case-SENSITIVELY while claim matching compared them
 *     lowercased, so 'RajaBabu' and 'rajababu' could both exist and either could
 *     claim the other's prizes.
 *   - claimAllPrizes stripped punctuation from the parsed winner name
 *     (`R.K.Singh` -> `rksingh`) but compared it against the un-stripped player
 *     name, so any player with punctuation in their name silently fell into the
 *     single-ticket fallback branch and was underpaid on multi-ticket wins.
 *
 * Everything that touches a housie name should go through this module so those
 * rules can only ever disagree in one place.
 */

/** Characters that would corrupt a `winner_housie_name` string once stored. */
const FORBIDDEN_CHARS = /[&(),;|<>"\\\/`]/;

/** A standalone "and" is a separator in the winner-string grammar. */
const STANDALONE_AND = /\band\b/i;

export const HOUSIE_NAME_MIN_LENGTH = 2;
export const HOUSIE_NAME_MAX_LENGTH = 16;

/**
 * Canonical comparison form. Applied to BOTH sides of every name comparison —
 * asymmetric normalization is what caused the underpayment bug.
 */
export function normalizeHousieName(name: string): string {
  return String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export interface HousieNameValidation {
  ok: boolean;
  error?: string;
  alternatives?: string[];
}

export function generateAlternatives(rawName: string): string[] {
  const base = String(rawName ?? '').trim();
  // Remove emojis and non-ascii / non-latin symbols
  let cleaned = base.replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '');
  
  // Replace spaces and typical separators with underscores for cand1, periods for cand2
  let cand1 = cleaned.replace(/[\s\-!@#$%^&*()+=~`[\]{}|\\:;"'<>,?/]/g, '_').replace(/__+/g, '_');
  let cand2 = cleaned.replace(/[\s\-!@#$%^&*()+=~`[\]{}|\\:;"'<>,?/]/g, '.').replace(/\.\.+/g, '.');
  let cand3 = cleaned.replace(/[\s\-!@#$%^&*()+=~`[\]{}|\\:;"'<>,?/]/g, '');

  // Strip leading/trailing dots/underscores
  const cleanEnds = (s: string) => s.replace(/^[._]+|[._]+$/g, '');
  cand1 = cleanEnds(cand1);
  cand2 = cleanEnds(cand2);
  cand3 = cleanEnds(cand3);

  // If any candidate is empty/invalid, fallback to a base name
  const fallbackBase = "player";
  if (!/^[A-Za-z0-9_.]+$/.test(cand1) || cand1.length < 2) cand1 = `${fallbackBase}_1`;
  if (!/^[A-Za-z0-9_.]+$/.test(cand2) || cand2.length < 2) cand2 = `${fallbackBase}.2`;
  if (!/^[A-Za-z0-9_.]+$/.test(cand3) || cand3.length < 2) cand3 = `${fallbackBase}3`;

  // Truncate to maximum 13 chars to leave space for suffix
  const truncate = (s: string) => s.substring(0, 13);
  cand1 = truncate(cand1);
  cand2 = truncate(cand2);
  cand3 = truncate(cand3);

  // Ensure alternatives are distinct, valid (2-16 chars) and — critically —
  // never equal to the name that was just rejected.
  //
  // This helper has two callers with opposite inputs. The validation path feeds
  // an INVALID name, so cand1..3 are genuine transformations of it ("John Doe!"
  // -> John_Doe / John.Doe / JohnDoe42) and none of them collide with the input.
  // The signup "name already taken" path feeds an ALREADY-VALID name: there is
  // nothing to transform, so all three candidates collapse back to the input and
  // the first suggestion used to be the taken name itself — rendered as a
  // clickable button that just re-triggered the same 409.
  const rejected = normalizeHousieName(base);
  const results: string[] = [];

  const push = (candidate: string) => {
    if (results.length >= 3) return;
    const c = candidate.substring(0, 16);
    if (c.length < 2) return;
    if (!/^[A-Za-z0-9_.]+$/.test(c)) return;
    if (normalizeHousieName(c) === rejected) return;
    if (results.some((r) => normalizeHousieName(r) === normalizeHousieName(c))) return;
    results.push(c);
  };

  push(cand1);
  push(cand2);
  push(`${cand3}${Math.floor(Math.random() * 90) + 10}`);

  // Backfill whatever the candidates above could not supply. Random first so two
  // users hitting the same taken name are not steered onto the same suggestion,
  // then a deterministic sweep so this always terminates with three.
  for (let i = 0; results.length < 3 && i < 40; i++) {
    push(`${cand3}${Math.floor(Math.random() * 900) + 10}`);
  }
  for (let i = 1; results.length < 3 && i < 100; i++) {
    push(`${cand3}_${i}`);
  }

  return results;
}

/**
 * Validate a name at the point of entry (signup / ticket lock / profile).
 * Enforces the strict platform constraints:
 * 1. Technical Limits: Length between 2 and 16 characters.
 * 2. Permitted characters: Alphanumeric (A-Z, a-z, 0-9), underscores (_), and periods (.).
 * 3. Strictly forbidden: Spaces, emojis, and special symbols.
 */
export function validateHousieName(rawName: unknown): HousieNameValidation {
  if (typeof rawName !== 'string') {
    return { ok: false, error: 'Housie name is required' };
  }

  const name = rawName.trim().replace(/\s+/g, ' ');

  if (name.length < HOUSIE_NAME_MIN_LENGTH || name.length > HOUSIE_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Housie name must be between ${HOUSIE_NAME_MIN_LENGTH} and ${HOUSIE_NAME_MAX_LENGTH} characters in length.`,
      alternatives: generateAlternatives(name)
    };
  }

  if (!/^[A-Za-z0-9_.]+$/.test(name)) {
    let reason = 'Housie name contains invalid characters.';
    if (/\s/.test(name)) {
      reason = 'Housie name cannot contain spaces.';
    } else if (/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(name)) {
      reason = 'Housie name cannot contain emojis.';
    } else {
      reason = 'Housie name can only contain alphanumeric characters, underscores (_), and periods (.).';
    }
    return {
      ok: false,
      error: reason,
      alternatives: generateAlternatives(name)
    };
  }

  return { ok: true };
}

export interface ParsedWinnerSegment {
  /** Winner name exactly as stored, trimmed. */
  name: string;
  /** Canonical comparison form of `name`. */
  normalized: string;
  /** Ticket numbers credited to this winner in the string. */
  ticketNumbers: number[];
}

/**
 * Parse a stored `winner_housie_name` such as `"Alice (5 & 12) & Bob (7)"`.
 *
 * The separator split must ignore `&`/`,`/`and` that appear INSIDE a
 * parenthesised ticket list, which is what the negative lookahead does.
 */
export function parseWinnerNames(winnerString: string | null | undefined): ParsedWinnerSegment[] {
  const raw = String(winnerString ?? '').trim();
  if (!raw) return [];

  const segments = raw.split(/\s*(?:&|,|\band\b)\s*(?![^()]*\))/i);
  const parsed: ParsedWinnerSegment[] = [];

  for (const segment of segments) {
    const match = segment.match(/^([^(]*)(?:\(([^)]*)\))?/);
    if (!match) continue;

    const name = (match[1] ?? '').trim();
    if (!name) continue;

    const ticketNumbers = (match[2]?.match(/\d+/g) ?? [])
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n));

    parsed.push({ name, normalized: normalizeHousieName(name), ticketNumbers });
  }

  return parsed;
}

/**
 * Does `winnerString` credit `playerName`? Both sides go through the same
 * normalization, so case and spacing differences never decide a payout.
 */
export function winnerStringIncludes(
  winnerString: string | null | undefined,
  playerName: string
): boolean {
  const target = normalizeHousieName(playerName);
  if (!target) return false;
  return parseWinnerNames(winnerString).some((s) => s.normalized === target);
}

/**
 * Ticket count credited to `playerName` within `winnerString`. Returns 0 when
 * the player is not named. Callers multiply `amount_per_winner` by this to get
 * the player's true share of a prize split across tickets.
 */
export function ticketCountForPlayer(
  winnerString: string | null | undefined,
  playerName: string
): number {
  const target = normalizeHousieName(playerName);
  if (!target) return 0;

  return parseWinnerNames(winnerString)
    .filter((s) => s.normalized === target)
    .reduce((total, s) => total + Math.max(1, s.ticketNumbers.length), 0);
}
