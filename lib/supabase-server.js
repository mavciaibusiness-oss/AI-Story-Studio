import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

/*
  KURAL: client her zaman fonksiyon içinde oluşturulur.
  Sunucu bileşenlerinde çerez yazılamaz; setAll try/catch ile susturulur.
  Token yenilemeyi middleware yapar, bu yüzden sorun çıkmaz.
*/
export function getSupabaseServer() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch (e) {
            // Server Component içinden çağrıldı — middleware zaten yeniliyor.
          }
        }
      }
    }
  );
}
