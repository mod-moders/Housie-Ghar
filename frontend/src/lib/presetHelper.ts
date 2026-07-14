export function getPresetClass(title: string): string | undefined {
  const t = title.trim().toLowerCase();
  if (t.includes("high noon")) return "hg-card-preset hg-card-preset--high-noon";
  if (t.includes("prime time")) return "hg-card-preset hg-card-preset--prime-time";
  if (t.includes("snack & stack") || t.includes("snack")) return "hg-card-preset hg-card-preset--snack-stack";
  if (t.includes("sundown")) return "hg-card-preset hg-card-preset--sundown";
  return undefined;
}
