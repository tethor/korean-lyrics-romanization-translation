"use server";

import prisma from "@/lib/prisma";
import Genius from "genius-lyrics";
import crypto from "crypto";

const Client = new Genius.Client(process.env.GENIUS_ACCESS_TOKEN);

const DEEPL_API_KEY = process.env.DEEPL_API_KEY;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- DB & Indexing Logic ---

function generateSlug(title: string, artist: string): string {
    return `${title}-${artist}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function generateContentHash(content: string): string {
    return crypto.createHash("md5").update(content).digest("hex");
}

export async function saveSong(data: {
    title: string;
    artist: string;
    original: string;
    romanized: string;
    translationEn: string;
    translationEs: string;
}) {
    const baseSlug = generateSlug(data.title, data.artist);
    const contentHash = generateContentHash(data.original);

    // 1. Check if song exists by slug
    const existingSong = await prisma.song.findUnique({
        where: { slug: baseSlug },
    });

    if (existingSong) {
        // 2. Smart Indexing: If content is identical, do nothing (return existing)
        if (existingSong.contentHash === contentHash) {
            return existingSong;
        }

        // 3. If content differs, create a new version with a unique slug
        const newSlug = `${baseSlug}-${Date.now()}`;
        return await prisma.song.create({
            data: {
                ...data,
                slug: newSlug,
                contentHash,
            },
        });
    }

    // 4. Create new song
    return await prisma.song.create({
        data: {
            ...data,
            slug: baseSlug,
            contentHash,
        },
    });
}

export async function getSongBySlug(slug: string) {
    return await prisma.song.findUnique({
        where: { slug },
    });
}

// --- Search & Fetch Logic ---

// --- Helper: Levenshtein Distance for Fuzzy Matching ---
function levenshteinDistance(a: string, b: string): number {
    const matrix = [];

    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

function calculateSimilarity(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    const longerLength = longer.length;
    if (longerLength === 0) {
        return 1.0;
    }
    return (longerLength - levenshteinDistance(longer, shorter)) / longerLength;
}

export async function findSavedSongMatch(title: string, artist: string) {
    try {
        const normalizedTitle = title.toLowerCase().trim();
        const normalizedArtist = artist.toLowerCase().trim();
        const normalizedQuery = `${normalizedTitle} ${normalizedArtist}`;

        const savedSongs = await prisma.song.findMany();

        const bestMatch = savedSongs
            .map(song => {
                const dbTitle = song.title.toLowerCase();
                const dbArtist = song.artist.toLowerCase();

                // Check exact title match first for speed
                if (dbTitle === normalizedTitle && dbArtist === normalizedArtist) {
                    return { ...song, similarity: 1.0 };
                }

                const titleSim = calculateSimilarity(normalizedTitle, dbTitle);
                const combinedSim = calculateSimilarity(normalizedQuery, `${dbTitle} ${dbArtist}`);

                return {
                    ...song,
                    similarity: Math.max(titleSim, combinedSim)
                };
            })
            .filter(song => song.similarity > 0.85) // High threshold for auto-loading (85%)
            .sort((a, b) => b.similarity - a.similarity)[0];

        return bestMatch || null;

    } catch (e) {
        console.error("Error finding saved match:", e);
        return null;
    }
}

export async function searchSong(query: string) {
    try {
        // Search Genius API
        const res = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, {
            headers: {
                Authorization: `Bearer ${process.env.GENIUS_ACCESS_TOKEN}`
            }
        });

        if (!res.ok) throw new Error(`Genius API Error: ${res.status}`);

        const data = await res.json();
        return data.response.hits
            .filter((hit: any) => {
                const title = hit.result.title.toLowerCase();
                const artist = hit.result.primary_artist.name.toLowerCase();

                // 1. Exclude based on "Genius ... Translations" artist pattern (covers most languages)
                if (artist.includes("genius") &&
                    (artist.includes("translation") || artist.includes("romanization") || artist.includes("tradu"))) {
                    return false;
                }

                // 2. Exclude based on common title patterns (fallback)
                if (title.includes("romanized") ||
                    title.includes("translation") ||
                    title.includes("traducción") ||
                    title.includes("tradução")) {
                    return false;
                }

                return true;
            })
            .map((hit: any) => ({
                id: hit.result.id,
                title: hit.result.title,
                artist: hit.result.primary_artist.name,
                image: hit.result.song_art_image_thumbnail_url,
                url: hit.result.url,
            }));

    } catch (e) {
        console.error("Search Error:", e);
        return [];
    }
}

export async function getSavedSongs() {
    try {
        return await prisma.song.findMany({
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                title: true,
                artist: true,
                slug: true,
                createdAt: true,
            }
        });
    } catch (e) {
        console.error("Error fetching saved songs:", e);
        return [];
    }
}

export async function deleteSong(id: number) {
    try {
        return await prisma.song.delete({
            where: { id }
        });
    } catch (e) {
        console.error("Error deleting song:", e);
        throw e;
    }
}

import * as cheerio from "cheerio";

export async function fetchLyrics(url: string) {
    try {
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        // Genius lyrics selectors (they change often, so we try multiple)
        let lyrics = "";

        // Selector 1: Modern Genius
        $('[data-lyrics-container="true"]').each((i, el) => {
            let text = $(el).html()?.replace(/<br\s*\/?>/gi, "\n");
            // Basic entity decoding
            text = text?.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ");
            // Remove tags
            text = text?.replace(/<[^>]*>/g, "");
            if (text) lyrics += text + "\n";
        });

        // Selector 2: Old Genius
        if (!lyrics) {
            lyrics = $(".lyrics").text().trim();
        }

        // CLEANING LOGIC
        // 1. Remove everything before "Read More" if it exists near the start (Metadata/Description)
        const readMoreIndex = lyrics.indexOf("Read More");
        if (readMoreIndex !== -1 && readMoreIndex < 2000) {
            lyrics = lyrics.substring(readMoreIndex + 9); // "Read More".length
        }

        // 2. Remove "Contributors" line if it remains
        lyrics = lyrics.replace(/^\d+\s*Contributors.*/gm, "");

        return lyrics.trim();
    } catch (e) {
        console.error("Lyrics Scrape Error:", e);
        return "";
    }
}

// --- Translation Logic (Existing) ---

// --- Translation Logic ---

export async function translateBatch(texts: string[], targetLang: 'en' | 'es'): Promise<string[]> {
    if (texts.length === 0) return [];

    const CHUNK_SIZE = 15; // Process 15 lines at a time
    const DELIMITER = " ||| ";
    const results: string[] = [];

    for (let i = 0; i < texts.length; i += CHUNK_SIZE) {
        const chunk = texts.slice(i, i + CHUNK_SIZE);
        const combinedText = chunk.join(DELIMITER);

        try {
            // Translate the chunk
            const translatedCombined = await translateText(combinedText, targetLang);

            // Split back and add to results using regex to be more robust against missing spaces
            const translatedChunk = translatedCombined.split(/\s*\|\|\|\s*/).map(s => s.trim());

            // Safety check: if split length doesn't match chunk length, we might have issues
            // But usually we just append what we got. 
            // If it fails completely, we might get the original text back or empty string depending on translateText
            if (translatedChunk.length !== chunk.length) {
                console.warn(`Translation chunk mismatch. Expected ${chunk.length}, got ${translatedChunk.length}`);
                // Fallback: pad with empty strings or original text if possible, 
                // but for now let's just push what we have and maybe fill the rest with original
                results.push(...translatedChunk);
                // If we are missing items, fill with original for the remaining
                const missingCount = chunk.length - translatedChunk.length;
                if (missingCount > 0) {
                    results.push(...chunk.slice(translatedChunk.length));
                }
            } else {
                results.push(...translatedChunk);
            }

        } catch (e) {
            console.error(`Batch chunk error (lines ${i}-${i + CHUNK_SIZE}):`, e);
            // Fallback: push original lines for this chunk
            results.push(...chunk);
        }

        // Add a small delay between chunks to be nice to the API
        if (i + CHUNK_SIZE < texts.length) {
            await wait(1000); // 1 second delay
        }
    }

    return results;
}

export async function translateText(text: string, targetLang: 'en' | 'es'): Promise<string> {
    if (!text.trim()) return "";

    const MAX_RETRIES = 3;

    // 1. MyMemory
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
                const delay = 1000 * Math.pow(2, attempt - 1);
                await wait(delay);
            } else {
                console.warn("MyMemory exhausted. Switching to DeepL Backup...");
            }
        }
    }

    // 2. DeepL Fallback
    try {
        const deeplRes = await fetch("https://api-free.deepl.com/v2/translate", {
            method: "POST",
            headers: {
                "Authorization": `DeepL-Auth-Key ${DEEPL_API_KEY}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
                text: text,
                target_lang: targetLang.toUpperCase(),
            }),
        });

        if (!deeplRes.ok) throw new Error(`DeepL Error: ${deeplRes.status}`);

        const deeplData = await deeplRes.json();
        return deeplData.translations[0].text;

    } catch (deeplError) {
        console.error("ALL TRANSLATION SERVICES FAILED", deeplError);
        return text;
    }
}

// --- Genius Strategy Helpers ---

export async function findGeniusTranslation(
    title: string,
    artist: string,
    type: 'romanized' | 'english' | 'spanish'
): Promise<string | null> {
    try {
        // Clean title and artist (remove content in parentheses)
        const cleanTitle = title.replace(/\([^)]*\)/g, '').trim();
        const cleanArtist = artist.replace(/\([^)]*\)/g, '').trim();

        let query = "";
        if (type === 'romanized') query = `${cleanTitle} ${cleanArtist} Romanized`;
        else if (type === 'english') query = `${cleanTitle} ${cleanArtist} English Translation`;
        else if (type === 'spanish') query = `${cleanTitle} ${cleanArtist} Spanish Translation`;

        if (process.env.NODE_ENV === 'development') {
            console.log(`🔎 Searching Genius for ${type}: "${query}"`);
        }

        // Search Genius
        const res = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, {
            headers: { Authorization: `Bearer ${process.env.GENIUS_ACCESS_TOKEN}` }
        });

        if (!res.ok) return null;

        const data = await res.json();
        if (data.response.hits.length === 0) return null;

        // Check multiple results
        const MAX_RESULTS_TO_CHECK = 10; // Increased to 10 to dig deeper
        const hitsToCheck = data.response.hits.slice(0, MAX_RESULTS_TO_CHECK);

        for (const hit of hitsToCheck) {
            const hitTitle = hit.result.title.toLowerCase();
            const hitArtist = hit.result.primary_artist.name.toLowerCase();
            const fullText = `${hitTitle} ${hitArtist}`;

            let isValid = false;

            if (type === 'romanized') {
                isValid = fullText.includes('romanized') || fullText.includes('romanization');
            } else if (type === 'english') {
                isValid = fullText.includes('english') ||
                    fullText.includes('translation') ||
                    hitArtist.includes('genius english');
            } else if (type === 'spanish') {
                isValid = fullText.includes('spanish') ||
                    fullText.includes('español') ||
                    fullText.includes('traducción') ||
                    fullText.includes('traduccion') ||
                    hitArtist.includes('genius traducciones');
            }

            if (process.env.NODE_ENV === 'development') {
                console.log(`   - Checking: "${hit.result.title}" by "${hit.result.primary_artist.name}" -> ${isValid ? '✅ MATCH' : '❌ NO MATCH'}`);
            }

            if (isValid) {
                if (process.env.NODE_ENV === 'development') {
                    console.log(`🎉 Found Genius ${type}: ${hit.result.title}`);
                }
                return await fetchLyrics(hit.result.url);
            }
        }

        if (process.env.NODE_ENV === 'development') {
            console.log(`⚠️ No valid ${type} found in top ${MAX_RESULTS_TO_CHECK} results`);
        }
        return null;

    } catch (e) {
        console.error(`Error finding Genius ${type}:`, e);
        return null;
    }
}

// --- SERVER ACTION: Romanizar texto (Implementación Nativa Ligera) ---
export async function generateRomanization(text: string): Promise<string> {
    try {
        // Mapeo básico de Hangul Jamo para referencia de alineación
        const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
        const MEDIALS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
        const FINALS = ['', 'k', 'kk', 'ks', 'n', 'nj', 'nh', 'd', 'l', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h'];

        return text.split('').map(char => {
            const code = char.charCodeAt(0);
            // Verificar si es un caracter Hangul (AC00-D7A3)
            if (code >= 0xAC00 && code <= 0xD7A3) {
                const offset = code - 0xAC00;
                const initial = Math.floor(offset / 588);
                const medial = Math.floor((offset % 588) / 28);
                const final = offset % 28;
                return (INITIALS[initial] + MEDIALS[medial] + FINALS[final]);
            }
            return char; // Devolver tal cual si no es Hangul
        }).join('');

    } catch (e) {
        console.error("Error generating romanization:", e);
        return text;
    }
}
