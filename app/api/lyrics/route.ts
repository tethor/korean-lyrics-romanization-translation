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
        const rawLyrics = best.plainLyrics || "";

        if (rawLyrics.trim()) {
          const hangulRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
          const lines = rawLyrics.split("\n");
          const koreanLines = lines.filter(
            (line: string) => line.trim() === "" || hangulRegex.test(line)
          );

          const finalLyrics = koreanLines.join("\n").trim();
          if (finalLyrics) {
            return NextResponse.json({ lyrics: finalLyrics });
          }
        }
      }
    }

    // 2. Fallback: Genius scraping (may fail due to Cloudflare)
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
          const cleanLyrics = rawLyrics
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/div>/gi, "\n")
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&#x27;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/\[.*?\]/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .split("\n")
            .map((line: string) => line.trim())
            .join("\n")
            .trim();

          const hangulRegex = /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
          const lines = cleanLyrics.split("\n");
          const koreanLines = lines.filter(
            (line: string) => line.trim() === "" || hangulRegex.test(line)
          );

          const finalLyrics = koreanLines.join("\n").trim();
          if (finalLyrics) {
            return NextResponse.json({ lyrics: finalLyrics });
          }
        }
      }
    }

    return NextResponse.json(
      { error: "No Korean lyrics found" },
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
