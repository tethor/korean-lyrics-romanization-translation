import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Referer: "https://genius.com/",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "same-origin",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "no-cache",
};

function extractLyricsFromHtml(html: string): string | null {
  const $ = cheerio.load(html);
  const lyricsParts: string[] = [];

  $('[data-lyrics-container="true"]').each((_, el) => {
    const $el = $(el);
    $el.find('[data-exclude-from-selection="true"]').remove();

    const text = $el
      .html()
      ?.replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (text) {
      lyricsParts.push(text);
    }
  });

  return lyricsParts.length > 0 ? lyricsParts.join("\n\n") : null;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const artist = req.nextUrl.searchParams.get("artist");
  const title = req.nextUrl.searchParams.get("title");

  if (!url || !url.startsWith("https://genius.com/")) {
    return NextResponse.json(
      { error: "Missing or invalid Genius URL" },
      { status: 400 }
    );
  }

  try {
    // ── 1. Try Genius page scraping ──
    const res = await fetch(url, { headers: BROWSER_HEADERS });

    if (res.ok) {
      const html = await res.text();
      const lyrics = extractLyricsFromHtml(html);

      if (lyrics) {
        return NextResponse.json({ lyrics });
      }
    }

    // ── 2. Fallback: LRCLIB ──
    if (artist && title) {
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
          if (rawLyrics) {
            return NextResponse.json({ lyrics: rawLyrics });
          }
        }
      }
    }

    return NextResponse.json(
      { error: "No lyrics found" },
      { status: 404 }
    );
  } catch (error: any) {
    console.error("Lyrics fetch error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to fetch lyrics" },
      { status: 500 }
    );
  }
}
