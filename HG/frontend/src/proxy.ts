import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const staffToken = req.cookies.get("hg_auth_token")?.value;
  const playerToken = req.cookies.get("hg_player_token")?.value;

  // Staff area requires the staff cookie. Every door's login page (paths ending
  // in /login) is public; no other /staff route ends in /login.
  if (pathname.startsWith("/staff") && !pathname.endsWith("/login")) {
    if (!staffToken) {
      const url = req.nextUrl.clone();
      url.pathname = pathname.startsWith("/staff/superadmin")
        ? "/staff/superadmin/login"
        : pathname.startsWith("/staff/admin")
        ? "/staff/admin/login"
        : pathname.startsWith("/staff/bookie")
        ? "/staff/bookie/login"
        : "/staff/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Already-logged-in players skip the gate.
  if (pathname === "/login") {
    if (playerToken) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Public pages require a player session (staff sessions also pass).
  if (!pathname.startsWith("/staff") && !playerToken && !staffToken) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/game/:path*", "/winners", "/how-to-play", "/profile", "/stats", "/staff/:path*"],
};
