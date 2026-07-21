import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

/*
  E-posta onay ve şifre sıfırlama dönüş noktası.

  İki akışı da karşılar:
  - PKCE akışı        → ?code=...
  - OTP/token akışı   → ?token_hash=...&type=signup

  Oturum çerezleri @supabase/ssr tarafından yazılır. Elle çerez yazılmaz:
  isim ve biçim (sb-<ref>-auth-token, parçalı) kütüphaneye aittir, elle
  yazılan sb-access-token / sb-refresh-token çerezlerini ne middleware
  ne de sunucu okur.
*/
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');
  const next = searchParams.get('next') || '/studio';

  // Supabase hata döndürdüyse doğrudan mesajı taşı
  const errorDescription = searchParams.get('error_description');
  if (errorDescription) {
    return NextResponse.redirect(`${origin}/giris?hata=${encodeURIComponent(errorDescription)}`);
  }

  if (!code && !tokenHash) {
    return NextResponse.redirect(`${origin}/giris?hata=${encodeURIComponent('Onay bağlantısı eksik ya da bozuk.')}`);
  }

  // Çerezleri bu response üzerine yazacağız
  const response = NextResponse.redirect(`${origin}${next}`);

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        }
      }
    }
  );

  let error = null;

  if (code) {
    // PKCE: signUp/signInWithOAuth sırasında tarayıcıya yazılan doğrulayıcı ile eşleşir
    const result = await supabase.auth.exchangeCodeForSession(code);
    error = result.error;
  } else {
    // token_hash: e-posta şablonu {{ .TokenHash }} kullanıyorsa buraya düşer.
    // Farklı tarayıcıda açılsa bile çalışır.
    const result = await supabase.auth.verifyOtp({
      type: type || 'email',
      token_hash: tokenHash
    });
    error = result.error;
  }

  if (error) {
    return NextResponse.redirect(
      `${origin}/giris?hata=${encodeURIComponent(cevirHata(error.message))}`
    );
  }

  return response;
}

function cevirHata(msg) {
  const m = (msg || '').toLowerCase();
  if (m.includes('expired')) return 'Onay bağlantısının süresi dolmuş. Yeni bağlantı iste.';
  if (m.includes('invalid') || m.includes('not found')) return 'Onay bağlantısı geçersiz. Bağlantı zaten kullanılmış olabilir.';
  if (m.includes('code verifier')) return 'Onay bağlantısını kayıt olduğun tarayıcıda aç ya da yeni bağlantı iste.';
  return msg;
}
