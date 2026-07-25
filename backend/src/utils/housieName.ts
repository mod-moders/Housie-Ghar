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

export const HOUSIE_NAME_MIN_LENGTH = 3;
export const HOUSIE_NAME_MAX_LENGTH = 20;

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
}

/**
 * Validate a name at the point of entry (signup / ticket lock).
 *
 * Deliberately a denylist rather than an allowlist: this market has players with
 * Devanagari names, apostrophes and initials, and launch day is the wrong time
 * to reject a legitimate name. We only forbid what actually breaks the
 * winner-string grammar or the storage layer.
 */
export function validateHousieName(rawName: unknown): HousieNameValidation {
  if (typeof rawName !== 'string') {
    return { ok: false, error: 'Housie name is required' };
  }

  const name = rawName.trim().replace(/\s+/g, ' ');

  if (name.length < HOUSIE_NAME_MIN_LENGTH || name.length > HOUSIE_NAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Housie name must be between ${HOUSIE_NAME_MIN_LENGTH} and ${HOUSIE_NAME_MAX_LENGTH} characters`,
    };
  }

  // Control characters would survive into WhatsApp messages and stored winner
  // strings. Tabs/newlines are already folded to spaces by the collapse above.
  if (/[\x00-\x1f\x7f]/.test(name)) {
    return { ok: false, error: 'Housie name contains invalid characters' };
  }

  if (FORBIDDEN_CHARS.test(name)) {
    return {
      ok: false,
      error: 'Housie name cannot contain & ( ) , ; | < > " \\ / or backticks',
    };
  }

  if (STANDALONE_AND.test(name)) {
    return { ok: false, error: 'Housie name cannot contain the word "and"' };
  }

  if (!/[\p{L}\p{N}]/u.test(name)) {
    return { ok: false, error: 'Housie name must contain at least one letter or number' };
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
