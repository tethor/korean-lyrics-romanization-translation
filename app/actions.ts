"use server";

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Simple in-memory cache
const translationCache = new Map<string, string>();

function cacheKey(text: string, lang: string): string {
  return `${lang}::${text}`;
}

/**
 * Translate lyrics as sections (blocks separated by empty lines).
 * Much faster than line-by-line: ~3-5 API calls instead of ~30.
 * Preserves line structure by splitting translated sections back into lines.
 */
export async function translateBatch(
  lines: string[],
  targetLang: "en" | "es"
): Promise<string[]> {
  if (lines.length === 0) return [];

  const results: string[] = new Array(lines.length).fill("");

  // Group lines into sections (separated by empty lines)
  const sections: { startIdx: number; lines: string[] }[] = [];
  let current: { startIdx: number; lines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "") {
      if (current) {
        sections.push(current);
        current = null;
      }
      results[i] = ""; // keep empty lines
    } else {
      if (!current) {
        current = { startIdx: i, lines: [] };
      }
      current.lines.push(lines[i]);
    }
  }
  if (current) sections.push(current);

  // Translate each section as a block
  for (const section of sections) {
    const combined = section.lines.join("\n");
    const cached = translationCache.get(cacheKey(combined, targetLang));

    if (cached) {
      const translatedLines = cached.split("\n");
      for (let i = 0; i < section.lines.length; i++) {
        results[section.startIdx + i] = translatedLines[i] || section.lines[i];
      }
      continue;
    }

    try {
      const translated = await translateText(combined, targetLang);
      const translatedLines = translated.split("\n");

      // Map translated lines back to original indices
      for (let i = 0; i < section.lines.length; i++) {
        const trans = translatedLines[i] || section.lines[i];
        results[section.startIdx + i] = trans;
        translationCache.set(cacheKey(section.lines[i], targetLang), trans);
      }

      // Cache the full section too
      translationCache.set(cacheKey(combined, targetLang), translated);
    } catch {
      // Fallback: keep original
      for (let i = 0; i < section.lines.length; i++) {
        results[section.startIdx + i] = section.lines[i];
      }
    }
  }

  return results;
}

/**
 * Translate a single text block with retry + DeepL fallback.
 */
async function translateText(
  text: string,
  targetLang: "en" | "es"
): Promise<string> {
  if (!text.trim()) return "";

  const langPair = `ko|${targetLang}`;

  // 1. Try MyMemory (free, 2 retries)
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}&de=pocapay@pocapay.com`
      );

      if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);

      const data = await res.json();

      if (data.responseStatus === 200) {
        return data.responseData.translatedText;
      }

      throw new Error(`MyMemory: ${data.responseDetails}`);
    } catch (error) {
      if (attempt < 2) {
        await wait(800 * Math.pow(2, attempt - 1));
      }
    }
  }

  // 2. DeepL fallback
  if (DEEPL_API_KEY) {
    try {
      const deeplRes = await fetch("https://api-free.deepl.com/v2/translate", {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          text,
          target_lang: targetLang.toUpperCase(),
        }),
      });

      if (deeplRes.ok) {
        const deeplData = await deeplRes.json();
        return deeplData.translations[0].text;
      }
    } catch {}
  }

  // 3. Last resort
  return text;
}
