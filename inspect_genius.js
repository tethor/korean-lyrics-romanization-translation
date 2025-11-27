const Genius = require("genius-lyrics");
const client = new Genius.Client(process.env.GENIUS_ACCESS_TOKEN);

async function searchAndInspect(query) {
    try {
        const res = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(query)}`, {
            headers: {
                Authorization: `Bearer ${process.env.GENIUS_ACCESS_TOKEN}`
            }
        });
        const data = await res.json();

        console.log("Hits found:", data.response.hits.length);

        data.response.hits.forEach((hit, index) => {
            console.log(`\n--- Hit ${index + 1} ---`);
            console.log("Title:", hit.result.title);
            console.log("Primary Artist:", hit.result.primary_artist.name);
            console.log("Full Title:", hit.result.full_title);
            console.log("Type:", hit.type); // Check if there is a type field
            console.log("Result Type:", hit.result.type); // Sometimes nested
            console.log("Path:", hit.result.path);
            // Log keys to see if anything looks like "is_translation"
            console.log("Keys:", Object.keys(hit.result));
        });

    } catch (e) {
        console.error(e);
    }
}

// Search for a song likely to have translations
searchAndInspect("Ditto NewJeans");
