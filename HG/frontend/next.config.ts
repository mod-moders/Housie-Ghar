import type { NextConfig } from "next";

// Where the backend actually runs. The browser never hits this directly —
// requests to /api and /socket.io are proxied to it server-side (see rewrites
// below), so the whole app is reachable through a single origin / one URL.
const BACKEND = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:4000";

const nextConfig: NextConfig = {
  // Allow the dev server to be reached through a tunnel / LAN host, not just
  // localhost (Next blocks cross-origin dev requests by default).
  allowedDevOrigins: ["*.trycloudflare.com", "*.ngrok-free.app", "*.loca.lt"],

  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      { source: "/socket.io/:path*", destination: `${BACKEND}/socket.io/:path*` },
      // Uploaded caller MP3s are served by the backend (see numberCalls.controller)
      { source: "/audio/:path*", destination: `${BACKEND}/audio/:path*` },
    ];
  },
};

export default nextConfig;
