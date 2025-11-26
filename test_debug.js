const fs = require('fs');
const path = require('path');

// Cargar variables de entorno manualmente desde .env.local
const envPath = path.resolve(__dirname, '.env.local');
let DEEPL_API_KEY = "";
try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/DEEPL_API_KEY=(.+)/);
    if (match) DEEPL_API_KEY = match[1].trim();
} catch (e) {
    console.warn("No se pudo leer .env.local, usando fallback o fallará DeepL");
}

console.log("🔑 DeepL Key cargada:", DEEPL_API_KEY ? "SÍ (" + DEEPL_API_KEY.substring(0, 5) + "...)" : "NO");

const text = "안녕하세요"; // "Hola" en coreano

async function testMyMemory() {
    console.log("\n--- Probando MyMemory (Gratis + Email) ---");
    try {
        const email = "pocapay@pocapay.com";
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=ko|es&de=${email}`;
        console.log("URL:", url);

        const res = await fetch(url);
        const data = await res.json();

        if (res.ok && data.responseStatus === 200) {
            console.log("✅ ÉXITO MyMemory:", data.responseData.translatedText);
        } else {
            console.error("❌ ERROR MyMemory:", data);
        }
    } catch (e) {
        console.error("❌ EXCEPCIÓN MyMemory:", e.message);
    }
}

async function testDeepL() {
    console.log("\n--- Probando DeepL (Backup) ---");
    if (!DEEPL_API_KEY) {
        console.error("❌ SKIPPED: No hay API Key");
        return;
    }

    try {
        const res = await fetch("https://api-free.deepl.com/v2/translate", {
            method: "POST",
            headers: {
                "Authorization": `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                text: text,
                target_lang: "ES",
            }),
        });

        const data = await res.json();

        if (res.ok) {
            console.log("✅ ÉXITO DeepL:", data.translations[0].text);
        } else {
            console.error("❌ ERROR DeepL:", data);
        }
    } catch (e) {
        console.error("❌ EXCEPCIÓN DeepL:", e.message);
    }
}

async function runTests() {
    await testMyMemory();
    await testDeepL();
}

runTests();
