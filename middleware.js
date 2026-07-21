import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Önce isteği tazele (aşağıdaki sunucu bileşenleri yeni token'ı görsün)
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          // Sonra tarayıcıya yaz (yenilenen oturum kalıcı olsun)
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        }
      }
    }
  );

  /*
    ÖNEMLİ: getUser() her istekte çağrılmalı. Bu çağrı süresi dolmuş access
    token'ı yeniler ve setAll üzerinden çereze geri yazar. Çağrılmazsa oturum
    bir saat sonra sessizce düşer.
    getSession() KULLANMA — çerezden okur, sunucuda doğrulanmaz.
  */
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const korumali = path.startsWith('/studio');
  const girisSayfasi = path === '/giris';

  if (!user && korumali) {
    const url = request.nextUrl.clone();
    url.pathname = '/giris';
    url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }

  // Girişliyken /giris'e gelirse stüdyoya al
  if (user && girisSayfasi) {
    const url = request.nextUrl.clone();
    url.pathname = '/studio';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  /*
    /auth/callback matcher DIŞINDA kalmalı: oturumu o route kendi kuruyor,
    middleware araya girerse çerez yarışı olur.
    Statik dosyalar ve resimler de dışarıda — gereksiz Supabase çağrısı olmasın.
  */
  matcher: [
    '/studio/:path*',
    '/giris'
  ]
};
