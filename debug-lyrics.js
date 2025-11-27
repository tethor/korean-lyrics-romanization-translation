const cheerio = require("cheerio");

async function fetchLyrics(url) {
    try {
        const res = await fetch(url);
        const html = await res.text();
        const $ = cheerio.load(html);

        let lyrics = "";

        $('[data-lyrics-container="true"]').each((i, el) => {
            // Get HTML, replace <br> with newlines
            let text = $(el).html().replace(/<br\s*\/?>/gi, "\n");
            // Remove other tags
            text = text.replace(/<[^>]*>/g, "");
            // Decode entities (basic ones)
            text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&nbsp;/g, " ");
            if (text) lyrics += text + "\n";
        });

        if (!lyrics) {
            lyrics = $(".lyrics").text().trim();
        }

        // CLEANING LOGIC

        // 1. Remove everything before "Read More" if it exists near the start
        const readMoreIndex = lyrics.indexOf("Read More");
        if (readMoreIndex !== -1 && readMoreIndex < 2000) { // Increased limit just in case
            lyrics = lyrics.substring(readMoreIndex + 9); // "Read More".length
        }

        // 2. Remove "Contributors" line if it remains (e.g. "150 Contributors")
        // Using a regex that matches the start of the string
        lyrics = lyrics.replace(/^\d+\s*Contributors.*/gm, "");

        // 3. Remove "Translations" block if it remains
        // It usually looks like "TranslationsRomanization..."
        // We can try to remove lines that look like language lists if they are at the top
        // But usually "Read More" covers this.

        return lyrics.trim();
    } catch (e) {
        console.error("Error:", e);
        return "";
    }
}

async function main() {
    // Gangnam Style URL
    const url = "https://genius.com/Psy-gangnam-style-lyrics";
    console.log(`Fetching ${url}...`);
    const lyrics = await fetchLyrics(url);
    console.log("--- RAW LYRICS START ---");
    console.log(lyrics);
    console.log("--- RAW LYRICS END ---");
}

main();
