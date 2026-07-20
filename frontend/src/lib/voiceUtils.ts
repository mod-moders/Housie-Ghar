export interface FormattedVoice {
  name: string;
  cleanName: string;
  lang: string;
  badge: string;
  category: "Indian English" | "Global English" | "Hindi" | "Nepali" | "Universal AI";
  isNeural: boolean;
  rawVoice?: SpeechSynthesisVoice;
}

export function getTop5CuratedVoices(voices: SpeechSynthesisVoice[]): FormattedVoice[] {
  const formatted = voices.map((v) => {
    let name = v.name || "Default AI Voice";
    let sanitized = name.replace(/undefined/gi, "").replace(/\s+/g, " ").trim();
    sanitized = sanitized.replace(/-\s*-/g, "-").replace(/\(\s*\)/g, "").trim();

    const isNeural =
      /natural|neural|google|premium|edge|deep|wavenet|online/i.test(v.name) ||
      /natural|neural|google|premium|edge|deep|wavenet|online/i.test(sanitized);

    let cleanName = sanitized;
    if (cleanName.startsWith("Microsoft ")) {
      cleanName = cleanName
        .replace(/^Microsoft\s+/, "")
        .replace(/\s*Online\s*\(Natural\)/i, " Natural")
        .replace(/\s*-\s*English\s*/i, " - ")
        .trim();
    } else if (cleanName.startsWith("Google ")) {
      cleanName = cleanName.replace(/Google\s+/i, "Google ");
    }
    cleanName = cleanName.replace(/\s*-\s*$/, "").replace(/\s*\(\s*\)$/, "").trim();

    return {
      name: v.name,
      cleanName,
      lang: v.lang,
      isNeural,
      rawVoice: v,
    };
  });

  // Helper to find best match for a language pattern
  const findBest = (langPred: (lang: string) => boolean) => {
    const matching = formatted.filter((v) => langPred(v.lang));
    if (matching.length === 0) return null;
    return (
      matching.find((v) => v.isNeural && /natural|neural|google|swara|neerja|hemkala|madhur/i.test(v.name)) ||
      matching.find((v) => v.isNeural) ||
      matching[0]
    );
  };

  const indEnglish = findBest((l) => l.toLowerCase().includes("en-in"));
  const globalEnglish = findBest((l) => l.toLowerCase().includes("en-us") || l.toLowerCase().includes("en-gb"));
  const hindiVoice = findBest((l) => l.toLowerCase().startsWith("hi"));
  const nepaliVoice = findBest((l) => l.toLowerCase().startsWith("ne"));
  const universalVoice = findBest((l) => l.toLowerCase().startsWith("en")) || formatted[0];

  const result: FormattedVoice[] = [];

  if (indEnglish) {
    result.push({
      ...indEnglish,
      cleanName: indEnglish.cleanName || "Indian English AI",
      badge: "🇮🇳 Indian English AI",
      category: "Indian English",
    });
  }

  if (globalEnglish && globalEnglish.name !== indEnglish?.name) {
    result.push({
      ...globalEnglish,
      cleanName: globalEnglish.cleanName || "Global English Studio AI",
      badge: "🎙️ Global Studio AI",
      category: "Global English",
    });
  }

  if (hindiVoice) {
    result.push({
      ...hindiVoice,
      cleanName: hindiVoice.cleanName || "Hindi Natural AI",
      badge: "🇮🇳 Hindi Natural (हिंदी)",
      category: "Hindi",
    });
  } else {
    result.push({
      name: "Hindi_Natural_AI_Fallback",
      cleanName: "Hindi Swara / Madhur AI (Natural)",
      lang: "hi-IN",
      badge: "🇮🇳 Hindi Natural (हिंदी)",
      category: "Hindi",
      isNeural: true,
    });
  }

  if (nepaliVoice) {
    result.push({
      ...nepaliVoice,
      cleanName: nepaliVoice.cleanName || "Nepali Natural AI",
      badge: "🇳🇵 Nepali Natural (नेपाली)",
      category: "Nepali",
    });
  } else {
    result.push({
      name: "Nepali_Natural_AI_Fallback",
      cleanName: "Nepali Hemkala / Sagar AI (Natural)",
      lang: "ne-NP",
      badge: "🇳🇵 Nepali Natural (नेपाली)",
      category: "Nepali",
      isNeural: true,
    });
  }

  if (universalVoice && !result.some((r) => r.name === universalVoice.name)) {
    result.push({
      ...universalVoice,
      cleanName: universalVoice.cleanName || "Universal Adaptive AI",
      badge: "⚡ Universal Adaptive AI",
      category: "Universal AI",
    });
  }

  return result.slice(0, 5);
}

// Retain getRankedVoices alias for backward compatibility
export function getRankedVoices(voices: SpeechSynthesisVoice[]): FormattedVoice[] {
  return getTop5CuratedVoices(voices);
}
