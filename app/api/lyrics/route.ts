import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: "https://genius.com/",
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
    let lyrics: string | null = null;

    // ── 1. Try direct fetch ──
    try {
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (res.ok) {
        const html = await res.text();
        lyrics = extractLyricsFromHtml(html);
      }
    } catch {}

    // ── 2. Fallback: proxy through allorigins ──
    if (!lyrics) {
      try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const proxyRes = await fetch(proxyUrl, {
          headers: { "User-Agent": "KLyricNeo/1.0" },
        });

        if (proxyRes.ok) {
          const proxyData = await proxyRes.json();
          const html = proxyData.contents || "";
          if (html) {
            lyrics = extractLyricsFromHtml(html);
          }
        }
      } catch {}
    }

    // ── 3. Fallback: LRCLIB ──
    if (!lyrics && artist && title) {
      try {
        const cleanArtist = artist.replace(/\s*\(.*?\)\s*/g, "").trim();
        const lrclibUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(cleanArtist)}`;
        const lrclibRes = await fetch(lrclibUrl, {
          headers: { "User-Agent": "KLyricNeo/1.0" },
        });

        if (lrclibRes.ok) {
          const results = await lrclibRes.json();
          if (results.length > 0) {
            const rawLyrics = (results[0].plainLyrics || "").trim();
            if (rawLyrics) {
              lyrics = rawLyrics;
            }
          }
        }
      } catch {}
    }

    if (!lyrics) {
      return NextResponse.json(
        { error: "No lyrics found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ lyrics });
  } catch (error: any) {
    console.error("Lyrics fetch error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to fetch lyrics" },
      { status: 500 }
    );
  }
}
