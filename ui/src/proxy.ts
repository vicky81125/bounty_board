import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { safeRedirect } from '@/lib/utils/safe-redirect'

const PUBLIC_PATHS = ['/login', '/signup', '/auth/callback']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Always refresh session first — required for @supabase/ssr cookie handling
  const { supabaseResponse, user } = await updateSession(req)

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return supabaseResponse
  }

  if (!user) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set(
      'next',
      safeRedirect(pathname, '/dashboard')
    )
    return NextResponse.redirect(loginUrl)
  }

  // Forward pathname as header so server layout components can read it
  supabaseResponse.headers.set('x-pathname', pathname)
  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
