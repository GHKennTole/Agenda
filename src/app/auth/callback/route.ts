import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Redirigir a la página de destino (por defecto /)
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Si falla la autenticación, redirigir al login con un parámetro de error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
