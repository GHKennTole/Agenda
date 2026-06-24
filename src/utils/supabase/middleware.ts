import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        experimental: {
          passkey: true,
        },
      },
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Obtener el usuario actual para refrescar la sesión y verificar autenticación
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const url = request.nextUrl.clone()
  const isLoginPage = url.pathname.startsWith('/login')
  const isSetupPage = url.pathname.startsWith('/setup')
  const isApiRoute = url.pathname.startsWith('/api')
  const isNextStatic = url.pathname.startsWith('/_next')
  const isPublicFile = url.pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|js|txt)$/)

  // Si no hay usuario y no está en una página pública o API, redirigir a /login
  if (!user && !isLoginPage && !isSetupPage && !isPublicFile && !isApiRoute && !isNextStatic) {
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Si hay usuario y está en /login o /setup, redirigir a la página de inicio
  if (user && (isLoginPage || isSetupPage)) {
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
