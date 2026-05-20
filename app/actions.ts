"use server";

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Simple in-memory cache (per server instance) ───
const translationCache = new Map<string, string>();

function cacheKey(text: string, lang: string): string {
  return `${lang}::${text}`;
}

// ─── Batch translation: sends multiple lines in fewer requests ───
export async function translateBatch(
  lines: string[],
  targetLang: "en" | "es"
): Promise<string[]> {
  if (lines.length === 0) return [];

  // Filter out empty lines but keep track of indices
  const nonEmpty: { idx: number; text: string }[] = [];
  const results: string[] = new Array(lines.length).fill("");

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim()) {
      nonEmpty.push({ idx: i, text: lines[i] });
    }
  }

  if (nonEmpty.length === 0) return results;

  // Check cache first
  const toTranslate: { idx: number; text: string }[] = [];
  for (const item of nonEmpty) {
    const cached = translationCache.get(cacheKey(item.text, targetLang));
    if (cached) {
      results[item.idx] = cached;
    } else {
      toTranslate.push(item);
    }
  }

  if (toTranslate.length === 0) return results;

  // Batch lines: join with newline separator, send in chunks of ~400 chars
  const BATCH_CHAR_LIMIT = 400;
  const batches: { idx: number; text: string }[][] = [];
  let currentBatch: { idx: number; text: string }[] = [];
  let currentLen = 0;

  for (const item of toTranslate) {
    if (currentLen + item.text.length + 1 > BATCH_CHAR_LIMIT && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentLen = 0;
    }
    currentBatch.push(item);
    currentLen += item.text.length + 1; // +1 for newline
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  // Process batches with concurrency limit
  const CONCURRENCY = 3;
  let batchIdx = 0;

  const processBatch = async () => {
    while (batchIdx < batches.length) {
      const batch = batches[batchIdx++];
      const combinedText = batch.map((b) => b.text).join("\n");

      try {
        const translated = await translateSingle(combinedText, targetLang);
        const translatedLines = translated.split("\n");

        for (let i = 0; i < batch.length; i++) {
          const trans = translatedLines[i] || batch[i].text;
          results[batch[i].idx] = trans;
          translationCache.set(cacheKey(batch[i].text, targetLang), trans);
        }
      } catch {
        // Fallback: translate individually
        for (const item of batch) {
          try {
            const trans = await translateSingle(item.text, targetLang);
            results[item.idx] = trans;
            translationCache.set(cacheKey(item.text, targetLang), trans);
          } catch {
            results[item.idx] = item.text;
          }
        }
      }
    }
  };

  const workers = Array(Math.min(CONCURRENCY, batches.length))
    .fill(null)
    .map(() => processBatch());

  await Promise.all(workers);
  return results;
}

// ─── Single text translation with retry + DeepL fallback ───
async function translateSingle(
  text: string,
  targetLang: "en" | "es"
): Promise<string> {
  if (!text.trim()) return "";

  const MAX_RETRIES = 2;
  const langPair = `ko|${targetLang}`;

  // 1. Try MyMemory
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
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
      if (attempt < MAX_RETRIES) {
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
