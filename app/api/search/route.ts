import { NextRequest, NextResponse } from "next/server";

const GENIUS_ACCESS_TOKEN = process.env.GENIUS_ACCESS_TOKEN;

type GeniusHit = {
  result: {
    id: number;
    title: string;
    artist_names: string;
    song_art_image_thumbnail_url: string;
    url: string;
  };
};

// Filter out romanized, translated, and non-original versions
const SKIP_PATTERNS = [
  "romanized",
  "romanization",
  "english translation",
  "traducción",
  "traduccion",
  "tradução",
  "translation",
  "japanese",
  "japanese translation",
  "chinese translation",
  "thai translation",
  "turkish translation",
  "french translation",
  "german translation",
  "italian translation",
  "russian translation",
  "arabic translation",
  "vietnamese translation",
  "portuguese translation",
  "spanish translation",
  "indonesian translation",
];

function isOriginalVersion(hit: GeniusHit): boolean {
  const title = hit.result.title.toLowerCase();
  const artist = hit.result.artist_names.toLowerCase();

  // Skip if title or artist contains skip patterns
  for (const pattern of SKIP_PATTERNS) {
    if (title.includes(pattern) || artist.includes(pattern)) {
      return false;
    }
  }

  // Skip if artist is "Genius Romanizations", "Genius Translations", etc.
  if (
    artist.includes("genius romaniz") ||
    artist.includes("genius translat") ||
    artist.includes("genius traduc") ||
    artist.includes("genius traduz")
  ) {
    return false;
  }

  return true;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q");

  if (!q || q.trim().length < 2) {
    return NextResponse.json({ error: "Query too short" }, { status: 400 });
  }

  if (!GENIUS_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "GENIUS_ACCESS_TOKEN not configured" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch(
      `https://api.genius.com/search?q=${encodeURIComponent(q)}`,
      {
        headers: {
          Authorization: `Bearer ${GENIUS_ACCESS_TOKEN}`,
        },
      }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Genius API error: ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const hits: GeniusHit[] = data.response?.hits || [];

    // Filter to only original versions, take top 8
    const results = hits
      .filter(isOriginalVersion)
      .slice(0, 8)
      .map((hit) => ({
        id: hit.result.id,
        title: hit.result.title,
        artist: hit.result.artist_names,
        thumbnail: hit.result.song_art_image_thumbnail_url,
        url: hit.result.url,
      }));

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Genius search error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    );
  }
}
