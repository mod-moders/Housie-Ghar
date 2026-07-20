import type { NextConfig } from "next";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_API_URL: apiUrl,
  },
  // Local dev only: resolveAudioUrl() (src/lib/api.ts) deliberately returns a bare relative
  // "/api/..." path (not an absolute URL) whenever NEXT_PUBLIC_API_URL contains "localhost" —
  // in production the frontend and backend are on different domains and every audio/API call
  // needs the full cross-origin URL, but locally the intent was always for these relative paths
  // to reach the backend some other way. No rewrite existed to do that, so any request built
  // this way (every uploaded call/config audio file played through <audio>/Audio(), which all
  // go through resolveAudioUrl) 404'd against Next's own (nonexistent) /api/* route space
  // instead of ever reaching the backend — silently breaking playback for every uploaded
  // audio file in local dev. This only rewrites when the backend is actually on localhost, so
  // it's inert in production (those requests already carry the absolute Railway URL and never
  // reach this rewrite layer at all).
  async rewrites() {
    if (!apiUrl.includes("localhost")) return [];
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
