/**
 * Maps a game to its card preset (banner + accent) class.
 *
 * `singleTicketOnly` is optional so every call site that only has a title keeps
 * compiling and keeps its current behaviour exactly as it was.
 */
export function getPresetClass(title: string, singleTicketOnly?: boolean): string | undefined {
  // A single-ticket game is a bonus round rather than one of the four scheduled
  // presets, so it always gets the futuristic treatment regardless of what staff
  // happened to name it. Checked BEFORE the title matches so it wins over them.
  if (singleTicketOnly) return "hg-card-preset hg-card-preset--futuristic";

  const t = title.trim().toLowerCase();
  if (t.includes("high noon")) return "hg-card-preset hg-card-preset--high-noon";
  if (t.includes("prime time")) return "hg-card-preset hg-card-preset--prime-time";
  if (t.includes("snack & stack") || t.includes("snack")) return "hg-card-preset hg-card-preset--snack-stack";
  if (t.includes("sundown")) return "hg-card-preset hg-card-preset--sundown";
  if (t.includes("bonus")) return "hg-card-preset hg-card-preset--bonus";
  return undefined;
}
