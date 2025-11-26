"use server";

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function translateText(text: string, targetLang: 'en' | 'es'): Promise<string> {
    if (!text.trim()) return "";

    // --- ESTRATEGIA DE REINTENTOS (Retry Logic) ---
    const MAX_RETRIES = 3;

    // 1. Intentar con MyMemory (Gratis + Email Limit)
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(
                `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ko|${targetLang}&de=pocapay@pocapay.com`
            );

            if (!res.ok) throw new Error(`MyMemory HTTP Error: ${res.status}`);

            const data = await res.json();

            if (data.responseStatus !== 200) {
                throw new Error(`MyMemory API Error: ${data.responseStatus} - ${data.responseDetails}`);
            }

            return data.responseData.translatedText;

        } catch (error) {
            console.warn(`MyMemory Attempt ${attempt} failed:`, error);

            if (attempt < MAX_RETRIES) {
                // Exponential Backoff: Esperar 1s, 2s, 4s...
                const delay = 1000 * Math.pow(2, attempt - 1);
                await wait(delay);
            } else {
                console.warn("MyMemory exhausted. Switching to DeepL Backup...");
            }
        }
    }

    // 2. Fallback a DeepL (Backup de Calidad)
    // Si llegamos aquí es porque MyMemory falló 3 veces
    try {
        const deeplRes = await fetch("https://api-free.deepl.com/v2/translate", {
            method: "POST",
            headers: {
                "Authorization": `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                text: text,
                target_lang: targetLang.toUpperCase(), // DeepL usa 'EN', 'ES'
            }),
        });

        if (!deeplRes.ok) throw new Error(`DeepL Error: ${deeplRes.status}`);

        const deeplData = await deeplRes.json();
        return deeplData.translations[0].text;

    } catch (deeplError) {
        console.error("ALL TRANSLATION SERVICES FAILED", deeplError);
        // Último recurso: Devolver el texto original para que al menos se vea algo
        return text;
    }
}
