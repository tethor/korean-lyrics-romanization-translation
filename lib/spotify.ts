/**
 * Spotify Internal Lyrics API client.
 *
 * Uses sp_dc cookie to authenticate and fetch lyrics.
 * Works from any IP (no Cloudflare blocking).
 *
 * Requires: SPOTIFY_SP_DC env var
 */

import crypto from "crypto";

const TOKEN_URL = "https://open.spotify.com/api/token";
const LYRICS_URL = "https://spclient.wg.spotify.com/color-lyrics/v2/track/";
const SERVER_TIME_URL = "https://open.spotify.com/api/server-time";
const SECRET_KEY_URL =
  "https://github.com/xyloflake/spot-secrets-go/blob/main/secrets/secretDict.json?raw=true";
const SEARCH_URL = "https://api.spotify.com/v1/search";

let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedSecret: { key: string; version: number } | null = null;

function generateTOTP(serverTimeSeconds: number, secret: string): string {
  const period = 30;
  const digits = 6;
  const counter = Math.floor(serverTimeSeconds / period);
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(counterBytes).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = binary % Math.pow(10, digits);
  return String(code).padStart(digits, "0");
}

async function getSecretKey(): Promise<{ key: string; version: number }> {
  if (cachedSecret) return cachedSecret;
  const res = await fetch(SECRET_KEY_URL);
  const data = await res.json();
  const version = Math.max(...Object.keys(data).map(Number));
  const originalSecret: number[] = data[version];
  const transformed = originalSecret
    .map((char, i) => char ^ ((i % 33) + 9))
    .map((c) => String.fromCharCode(c))
    .join("");
  cachedSecret = { key: transformed, version };
  return cachedSecret;
}

async function getAccessToken(sp_dc: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 300_000) {
    return cachedToken.token;
  }

  const timeRes = await fetch(SERVER_TIME_URL);
  const timeData = await timeRes.json();
  const serverTimeSeconds = timeData.serverTime;
  const { key: secret, version } = await getSecretKey();
  const totp = generateTOTP(serverTimeSeconds, secret);
  const timestamp = Math.floor(Date.now());

  const params = new URLSearchParams({
    reason: "transport",
    productType: "web-player",
    totp,
    totpVer: String(version),
    ts: String(timestamp),
  });

  const tokenRes = await fetch(`${TOKEN_URL}?${params}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Cookie: `sp_dc=${sp_dc}`,
    },
  });

  if (!tokenRes.ok) throw new Error(`Token failed: ${tokenRes.status}`);

  const tokenData = await tokenRes.json();
  cachedToken = {
    token: tokenData.accessToken,
    expiresAt: tokenData.accessTokenExpirationTimestampMs || Date.now() + 3_600_000,
  };
  return cachedToken.token;
}

/**
 * Search Spotify for a track, return track ID.
 */
export async function searchSpotifyTrack(
  artist: string,
  title: string,
  sp_dc: string
): Promise<string | null> {
  try {
    const token = await getAccessToken(sp_dc);
    const cleanArtist = artist.replace(/\s*\(.*?\)\s*/g, "").trim();
    const query = encodeURIComponent(`${title} ${cleanArtist}`);

    const res = await fetch(`${SEARCH_URL}?q=${query}&type=track&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return null;

    const data = await res.json();
    const tracks = data?.tracks?.items;
    if (!tracks || tracks.length === 0) return null;

    // Find best match by artist name
    const cleanArtistLower = cleanArtist.toLowerCase();
    const match = tracks.find((t: any) =>
      t.artists?.some(
        (a: any) =>
          a.name.toLowerCase().includes(cleanArtistLower) ||
          cleanArtistLower.includes(a.name.toLowerCase())
      )
    );

    return (match || tracks[0])?.id || null;
  } catch (err) {
    console.error("Spotify search error:", err);
    return null;
  }
}

/**
 * Fetch lyrics for a Spotify track.
 */
export async function fetchSpotifyLyrics(
  trackId: string,
  sp_dc: string
): Promise<string | null> {
  try {
    const token = await getAccessToken(sp_dc);

    const res = await fetch(
      `${LYRICS_URL}${trackId}?format=json&market=from_token`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        cachedToken = null; // force refresh
        const newToken = await getAccessToken(sp_dc);
        const retryRes = await fetch(
          `${LYRICS_URL}${trackId}?format=json&market=from_token`,
          { headers: { Authorization: `Bearer ${newToken}` } }
        );
        if (!retryRes.ok) return null;
        return extractLyrics(await retryRes.json());
      }
      return null;
    }

    return extractLyrics(await res.json());
  } catch (err) {
    console.error("Spotify lyrics error:", err);
    return null;
  }
}

function extractLyrics(data: any): string | null {
  const lines = data?.lyrics?.lines;
  if (!lines || !Array.isArray(lines) || lines.length === 0) return null;
  return lines.map((line: any) => line.words).join("\n");
}
