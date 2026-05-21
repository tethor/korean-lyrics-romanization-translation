import { NextRequest, NextResponse } from "next/server";

const HANGUL_RE = /[\uAC00-\uD7AF]/;

export async function GET(req: NextRequest) {
  const artist = req.nextUrl.searchParams.get("artist");
  const title = req.nextUrl.searchParams.get("title");
  const geniusUrl = req.nextUrl.searchParams.get("url");

  if (!artist || !title) {
    return NextResponse.json(
      { error: "Missing artist or title" },
      { status: 400 }
    );
  }

  try {
    // ── 1. Genius scraping FIRST (has original hangul) ──
    if (geniusUrl && geniusUrl.startsWith("https://genius.com/")) {
      try {
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

            // Only use Genius lyrics if they contain actual hangul
            if (cleaned && HANGUL_RE.test(cleaned)) {
              return NextResponse.json({ lyrics: cleaned });
            }
          }
        }
      } catch {
        // Genius scraping failed, fall through to LRCLIB
      }
    }

    // ── 2. LRCLIB fallback (only if Genius failed or had no hangul) ──
    const cleanArtist = artist.replace(/\s*\(.*?\)\s*/g, "").trim();
    const lrclibUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(cleanArtist)}`;
    const lrclibRes = await fetch(lrclibUrl, {
      headers: { "User-Agent": "KLyricNeo/1.0" },
    });

    if (lrclibRes.ok) {
      const results = await lrclibRes.json();
      if (results.length > 0) {
        const best = results[0];
        const rawLyrics = (best.plainLyrics || "").trim();

        // CRITICAL: only use LRCLIB if lyrics contain actual hangul
        // Skip romanized/English-only results
        if (rawLyrics && HANGUL_RE.test(rawLyrics)) {
          return NextResponse.json({ lyrics: rawLyrics });
        }
      }
    }

    // ── 3. Nothing found with hangul ──
    return NextResponse.json(
      { error: "No lyrics with hangul found" },
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
