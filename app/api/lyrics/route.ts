import { NextRequest, NextResponse } from "next/server";

const HANGUL_RE = /[\uAC00-\uD7AF]/;

/**
 * Extract lyrics from Genius HTML using depth-counting div parser.
 * The old regex ([\s\S]*?)</div> fails because lyrics containers have
 * nested divs (headers, ads) — it stops at the first inner </div>.
 */
function extractGeniusLyrics(html: string): string {
  const parts = html.split('data-lyrics-container="true"');
  const allLyrics: string[] = [];

  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];

    // Find the > that opens the container content
    const gtPos = part.indexOf(">");
    if (gtPos === -1) continue;
    let content = part.slice(gtPos + 1);

    // Find where this container div closes (depth counting, starting at 1)
    let depth = 1;
    let pos = 0;
    let endPos = content.length;

    while (pos < content.length && depth > 0) {
      const nextOpen = content.indexOf("<div", pos);
      const nextClose = content.indexOf("</div", pos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 4;
      } else {
        depth--;
        if (depth === 0) {
          endPos = nextClose;
          break;
        }
        pos = nextClose + 5;
      }
    }

    content = content.slice(0, endPos);

    // Remove data-exclude-from-selection divs (headers, ads) using depth counting
    while (true) {
      const match = content.match(
        /<div[^>]*data-exclude-from-selection="true"[^>]*>/
      );
      if (!match || match.index === undefined) break;

      const start = match.index;
      let d = 1;
      let p = start + match[0].length;

      while (p < content.length && d > 0) {
        const o = content.indexOf("<div", p);
        const c = content.indexOf("</div", p);

        if (c === -1) break;

        if (o !== -1 && o < c) {
          d++;
          p = o + 4;
        } else {
          d--;
          if (d === 0) {
            content =
              content.slice(0, start) + content.slice(c + 6);
            break;
          }
          p = c + 5;
        }
      }
      if (d !== 0) break; // safety
    }

    // Convert <br> to newlines, strip remaining HTML tags
    let text = content;
    text = text.replace(/<br\s*\/?>/gi, "\n");
    text = text.replace(/<[^>]+>/g, "");
    text = text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"');
    text = text.replace(/\n{3,}/g, "\n\n").trim();

    if (text) {
      allLyrics.push(text);
    }
  }

  return allLyrics.join("\n\n");
}

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
          const cleaned = extractGeniusLyrics(html);

          if (cleaned && HANGUL_RE.test(cleaned)) {
            return NextResponse.json({ lyrics: cleaned });
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

        // Only use LRCLIB if lyrics contain actual hangul
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
