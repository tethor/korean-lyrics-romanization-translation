import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

const HANGUL_RE = /[\uAC00-\uD7AF]/;

// ── Extract lyrics from colorcodedlyrics.com ──
function extractCCLyrics(html: string): string | null {
  const $ = cheerio.load(html);
  const entryContent = $(".entry-content");
  if (!entryContent.length) return null;

  // Remove metadata, ads, and non-lyrics elements
  entryContent.find("script, style, .adsbygoogle, ins").remove();

  const text = entryContent
    .html()
    ?.replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!text) return null;

  // Extract only lines with hangul (skip English metadata)
  const lines = text.split("\n");
  const METADATA_RE =
    /^(lyrics|작사|composer|작곡|arranger|편곡|producer|프로듀서|written|performed|mixed|mastered|vocal|rap|dance|interview|:)/i;
  const NAME_ONLY_RE = /^[가-힣\s]+\([A-Z\s]+\)$/; // e.g. "민지 (MINJI)"
  const hangulLines = lines.filter((line) => {
    const t = line.trim();
    return (
      t.length > 0 &&
      HANGUL_RE.test(t) &&
      !METADATA_RE.test(t) &&
      !NAME_ONLY_RE.test(t) &&
      !t.startsWith(":")
    );
  });

  return hangulLines.length > 3 ? hangulLines.join("\n") : null;
}

// ── Search colorcodedlyrics for a song ──
async function searchCCLyrics(
  artist: string,
  title: string
): Promise<string | null> {
  // Clean artist/title for search
  const cleanArtist = artist.replace(/\s*\(.*?\)\s*/g, "").trim();
  const query = `${cleanArtist} ${title}`.toLowerCase();

  try {
    const searchUrl = `https://colorcodedlyrics.com/?s=${encodeURIComponent(query)}`;
    const res = await fetch(searchUrl, { headers: BROWSER_HEADERS });

    if (!res.ok) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    // Find the first article link that matches
    const links = $('article a[href*="colorcodedlyrics.com/"]');
    for (const link of links) {
      const href = $(link).attr("href");
      if (href && href.includes("colorcodedlyrics.com/")) {
        // Verify the URL looks like a lyrics page (has date pattern)
        if (/\/\d{4}\/\d{2}\/\d{2}\//.test(href)) {
          return href;
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

// ── Extract lyrics from Genius HTML ──
function extractGeniusLyrics(html: string): string | null {
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

    if (text) lyricsParts.push(text);
  });

  return lyricsParts.length > 0 ? lyricsParts.join("\n\n") : null;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const artist = req.nextUrl.searchParams.get("artist");
  const title = req.nextUrl.searchParams.get("title");

  if (!artist || !title) {
    return NextResponse.json(
      { error: "Missing artist or title" },
      { status: 400 }
    );
  }

  try {
    let lyrics: string | null = null;

    // ── 1. Try colorcodedlyrics (hangul source, works from VPS) ──
    try {
      const ccUrl = await searchCCLyrics(artist, title);
      if (ccUrl) {
        const ccRes = await fetch(ccUrl, { headers: BROWSER_HEADERS });
        if (ccRes.ok) {
          const ccHtml = await ccRes.text();
          lyrics = extractCCLyrics(ccHtml);
        }
      }
    } catch {}

    // ── 2. Try Genius direct fetch ──
    if (!lyrics && url && url.startsWith("https://genius.com/")) {
      try {
        const res = await fetch(url, { headers: BROWSER_HEADERS });
        if (res.ok) {
          const html = await res.text();
          lyrics = extractGeniusLyrics(html);
        }
      } catch {}
    }

    // ── 3. Fallback: LRCLIB ──
    if (!lyrics) {
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
            if (rawLyrics) lyrics = rawLyrics;
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
