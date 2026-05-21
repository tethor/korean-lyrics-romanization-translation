import { NextRequest, NextResponse } from "next/server";

const HANGUL_RE = /[\uAC00-\uD7AF]/;

// Reuse browser instance
let browser: any = null;

async function getBrowser() {
  if (browser) {
    try {
      if (browser.isConnected()) return browser;
    } catch {}
  }
  const { chromium } = await import("playwright-extra");
  const { default: stealth } = await import(
    "puppeteer-extra-plugin-stealth"
  );
  chromium.use(stealth());

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  return browser;
}

async function fetchGeniusLyrics(url: string): Promise<string | null> {
  let page;
  try {
    const b = await getBrowser();
    page = await b.newPage();

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForSelector('[data-lyrics-container="true"]', {
      timeout: 10000,
    });

    const lyrics = await page.evaluate(() => {
      const containers = document.querySelectorAll(
        '[data-lyrics-container="true"]'
      );
      const parts: string[] = [];

      containers.forEach((el) => {
        const clone = el.cloneNode(true) as HTMLElement;
        clone
          .querySelectorAll('[data-exclude-from-selection="true"]')
          .forEach((n) => n.remove());

        const html = clone.innerHTML
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&#x27;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/\n{3,}/g, "\n\n")
          .trim();

        if (html) parts.push(html);
      });

      return parts.length > 0 ? parts.join("\n\n") : null;
    });

    return lyrics;
  } catch (err) {
    console.error("Playwright error:", (err as Error).message);
    // Reset browser on error
    browser = null;
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
  }
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

    // ── 1. Playwright + Genius ──
    if (url && url.startsWith("https://genius.com/")) {
      lyrics = await fetchGeniusLyrics(url);
    }

    // ── 2. Fallback: LRCLIB ──
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
    console.error("Lyrics error:", error?.message);
    return NextResponse.json(
      { error: "Failed to fetch lyrics" },
      { status: 500 }
    );
  }
}
