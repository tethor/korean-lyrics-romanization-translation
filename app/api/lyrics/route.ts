import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url || !url.startsWith("https://genius.com/")) {
    return NextResponse.json(
      { error: "Missing or invalid Genius URL" },
      { status: 400 }
    );
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
        { error: `Genius page error: ${res.status}` },
        { status: res.status }
      );
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract lyrics from data-lyrics-container divs
    const lyricsParts: string[] = [];

    $('[data-lyrics-container="true"]').each((_, el) => {
      const $el = $(el);

      // Remove non-lyrics elements (headers, ads, song bio)
      $el.find('[data-exclude-from-selection="true"]').remove();

      // Get text, converting <br> to newlines
      let text = $el
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

    if (lyricsParts.length === 0) {
      return NextResponse.json(
        { error: "No lyrics found" },
        { status: 404 }
      );
    }

    const lyrics = lyricsParts.join("\n\n").trim();
    return NextResponse.json({ lyrics });
  } catch (error: any) {
    console.error("Lyrics fetch error:", error?.message || error);
    return NextResponse.json(
      { error: "Failed to fetch lyrics" },
      { status: 500 }
    );
  }
}
