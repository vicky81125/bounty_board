// Edge runtime — cookie presence check only (no DB access in edge runtime).
// Real auth is enforced by getServerSession() in each layout and by FastAPI get_current_user.

import { NextRequest, NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login", "/signup"]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const hasSession = req.cookies.has("bounty_session")
  if (!hasSession) {
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Forward pathname as header so server layout components can read it
  // (server components cannot access req.nextUrl directly)
  const res = NextResponse.next()
  res.headers.set("x-pathname", pathname)
  return res
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
}
