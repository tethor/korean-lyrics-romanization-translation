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
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch lyrics page: ${res.status}` },
        { status: res.status }
      );
    }

    const html = await res.text();

    // Try multiple extraction strategies
    let rawLyrics = "";

    // Strategy 1: data-lyrics-container (new Genius layout)
    const containerRegex =
      /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;
    const containerMatches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = containerRegex.exec(html)) !== null) {
      containerMatches.push(m[1]);
    }

    if (containerMatches.length > 0) {
      rawLyrics = containerMatches.join("\n");
    }

    // Strategy 2: Lyrics__Container class (React version)
    if (!rawLyrics) {
      const classRegex =
        /<div[^>]*class="[^"]*Lyrics__Container[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
      const classMatches: string[] = [];
      while ((m = classRegex.exec(html)) !== null) {
        classMatches.push(m[1]);
      }
      if (classMatches.length > 0) {
        rawLyrics = classMatches.join("\n");
      }
    }

    if (!rawLyrics) {
      return NextResponse.json(
        { error: "Could not extract lyrics from this page" },
        { status: 404 }
      );
    }

    // Clean HTML
    const cleanLyrics = rawLyrics
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\[.*?\]/g, "") // Remove [Chorus], [Verse 1], etc.
      .replace(/\n{3,}/g, "\n\n")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .trim();

    // Filter: keep empty lines + lines with ANY Korean characters
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
