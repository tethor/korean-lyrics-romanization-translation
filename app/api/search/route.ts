import { NextRequest, NextResponse } from "next/server";

const GENIUS_ACCESS_TOKEN = process.env.GENIUS_ACCESS_TOKEN;

type GeniusHit = {
  result: {
    id: number;
    title: string;
    artist: string;
    song_art_image_thumbnail_url: string;
    url: string;
  };
};

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

    const results = hits.slice(0, 8).map((hit) => ({
      id: hit.result.id,
      title: hit.result.title,
      artist: hit.result.artist,
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
