export interface FormattedVoice {
  name: string;
  cleanName: string;
  lang: string;
  badge: string;
  isNeural: boolean;
  rawVoice: SpeechSynthesisVoice;
}

export function formatVoiceName(v: SpeechSynthesisVoice): FormattedVoice {
  let name = v.name || "Default AI Voice";

  // Sanitize 'undefined' strings produced by browser voice engines
  let sanitized = name.replace(/undefined/gi, "").replace(/\s+/g, " ").trim();
  sanitized = sanitized.replace(/-\s*-/g, "-").replace(/\(\s*\)/g, "").trim();

  const isNeural =
    /natural|neural|google|premium|edge|deep|wavenet|online/i.test(v.name) ||
    /natural|neural|google|premium|edge|deep|wavenet|online/i.test(sanitized);

  let cleanName = sanitized;
  if (cleanName.startsWith("Microsoft ")) {
    cleanName = cleanName
      .replace(/^Microsoft\s+/, "Microsoft ")
      .replace(/\s*Online\s*\(Natural\)/i, " Natural")
      .replace(/\s*-\s*English\s*/i, " - ")
      .trim();
  } else if (cleanName.startsWith("Google ")) {
    cleanName = cleanName.replace(/Google\s+/i, "Google ");
  }

  // Remove trailing dashes or orphan brackets
  cleanName = cleanName.replace(/\s*-\s*$/, "").replace(/\s*\(\s*\)$/, "").trim();

  if (!cleanName || cleanName === "Microsoft" || cleanName === "Google") {
    const langLabel = v.lang ? `(${v.lang})` : "";
    cleanName = `${v.name || "AI Voice"} ${langLabel}`.trim();
  }

  let badge = "";
  if (isNeural) {
    if (/natural/i.test(v.name) || /natural/i.test(sanitized)) {
      badge = "✨ Natural AI";
    } else if (/google/i.test(v.name)) {
      badge = "🎙️ Google Neural";
    } else {
      badge = "⚡ HD Neural";
    }
  } else if (v.default) {
    badge = "🔊 System Voice";
  }

  return {
    name: v.name,
    cleanName,
    lang: v.lang,
    badge,
    isNeural,
    rawVoice: v,
  };
}

export function getRankedVoices(voices: SpeechSynthesisVoice[]): FormattedVoice[] {
  const formatted = voices.map(formatVoiceName);

  return formatted.sort((a, b) => {
    // 1. Neural/Natural voices first
    if (a.isNeural && !b.isNeural) return -1;
    if (!a.isNeural && b.isNeural) return 1;

    // 2. English & Hindi languages prioritized
    const aEnHi = a.lang.startsWith("en") || a.lang.startsWith("hi");
    const bEnHi = b.lang.startsWith("en") || b.lang.startsWith("hi");
    if (aEnHi && !bEnHi) return -1;
    if (!aEnHi && bEnHi) return 1;

    // 3. Indian English / UK English / US English prioritized
    const aPriorityLang = a.lang.includes("en-IN") || a.lang.includes("en-GB") || a.lang.includes("en-US");
    const bPriorityLang = b.lang.includes("en-IN") || b.lang.includes("en-GB") || b.lang.includes("en-US");
    if (aPriorityLang && !bPriorityLang) return -1;
    if (!aPriorityLang && bPriorityLang) return 1;

    return a.cleanName.localeCompare(b.cleanName);
  });
}
