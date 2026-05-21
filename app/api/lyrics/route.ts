import { NextRequest, NextResponse } from "next/server";
import {
  searchSpotifyTrack,
  fetchSpotifyLyrics,
} from "@/lib/spotify";

const SPOTIFY_SP_DC = process.env.SPOTIFY_SP_DC;

export async function GET(req: NextRequest) {
  const artist = req.nextUrl.searchParams.get("artist");
  const title = req.nextUrl.searchParams.get("title");

  if (!artist || !title) {
    return NextResponse.json(
      { error: "Missing artist or title" },
      { status: 400 }
    );
  }

  // ── 1. Spotify (best quality, hangul, works from VPS) ──
  if (SPOTIFY_SP_DC) {
    try {
      const trackId = await searchSpotifyTrack(artist, title, SPOTIFY_SP_DC);
      if (trackId) {
        const lyrics = await fetchSpotifyLyrics(trackId, SPOTIFY_SP_DC);
        if (lyrics && lyrics.trim().length > 0) {
          return NextResponse.json({ lyrics: lyrics.trim(), source: "spotify" });
        }
      }
    } catch (err) {
      console.error("Spotify lyrics failed:", err);
    }
  }

  // ── 2. Fallback: LRCLIB ──
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
          return NextResponse.json({ lyrics: rawLyrics, source: "lrclib" });
        }
      }
    }
  } catch {}

  return NextResponse.json({ error: "No lyrics found" }, { status: 404 });
}
