import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const artist = req.nextUrl.searchParams.get("artist");
  const title = req.nextUrl.searchParams.get("title");

  if (!artist || !title) {
    return NextResponse.json(
      { error: "Missing artist or title" },
      { status: 400 }
    );
  }

  try {
    // 1. Try LRCLIB (free, no API key, great K-Pop coverage)
    const lrclibUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`;
    const lrclibRes = await fetch(lrclibUrl, {
      headers: { "User-Agent": "KLyricNeo/1.0" },
    });

    if (lrclibRes.ok) {
      const results = await lrclibRes.json();
      if (results.length > 0) {
        const best = results[0];
        const rawLyrics = (best.plainLyrics || "").trim();

        if (rawLyrics) {
          return NextResponse.json({ lyrics: rawLyrics });
        }
      }
    }

    // 2. Fallback: Genius scraping
    const geniusUrl = req.nextUrl.searchParams.get("url");
    if (geniusUrl && geniusUrl.startsWith("https://genius.com/")) {
      const geniusRes = await fetch(geniusUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

      if (geniusRes.ok) {
        const html = await geniusRes.text();

        const containerRegex =
          /<div[^>]*data-lyrics-container="true"[^>]*>([\s\S]*?)<\/div>/gi;
        const matches: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = containerRegex.exec(html)) !== null) {
          matches.push(m[1]);
        }

        if (matches.length > 0) {
          const rawLyrics = matches.join("\n");
          const cleaned = rawLyrics
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/div>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&#x27;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/\n{3,}/g, "\n\n")
            .trim();

          if (cleaned) {
            return NextResponse.json({ lyrics: cleaned });
          }
        }
      }
    }

    return NextResponse.json(
      { error: "No lyrics found" },
      { status: 404 }
    );
  } catch (error) {
    console.error("Lyrics fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch lyrics" },
      { status: 500 }
    );
  }
}
