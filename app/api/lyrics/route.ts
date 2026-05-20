import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url || !url.startsWith("https://genius.com/")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch lyrics page: ${res.status}` },
        { status: res.status }
      );
    }

    const html = await res.text();

    // Extract lyrics from Genius page
    // Lyrics are in <div data-lyrics-container="true">
    const lyricsRegex =
      /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;

    const matches: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = lyricsRegex.exec(html)) !== null) {
      matches.push(match[1]);
    }

    if (matches.length === 0) {
      return NextResponse.json(
        { error: "Could not extract lyrics" },
        { status: 404 }
      );
    }

    // Clean HTML tags and normalize
    const rawLyrics = matches.join("\n");
    const cleanLyrics = rawLyrics
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\[.*?\]/g, "") // Remove [Chorus], [Verse 1], etc.
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Filter only Korean lines (has Hangul characters)
    const hangulRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
    const lines = cleanLyrics.split("\n");
    const koreanLines = lines.filter(
      (line) => line.trim() === "" || hangulRegex.test(line)
    );

    const finalLyrics = koreanLines.join("\n").trim();

    if (!finalLyrics) {
      return NextResponse.json(
        { error: "No Korean lyrics found on this page" },
        { status: 404 }
      );
    }

    return NextResponse.json({ lyrics: finalLyrics });
  } catch (error) {
    console.error("Lyrics fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch lyrics" },
      { status: 500 }
    );
  }
}
