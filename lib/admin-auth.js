import { createClient } from '@supabase/supabase-js';
import { getSupabaseServer } from '@/lib/supabase-server';

/*
  ADMIN YETKİ KATMANI — sunucu tarafı.

  Her admin API route'u işe başlamadan önce requireAdmin() çağırır.
  Yetki iki bağımsız kaynaktan doğrulanır:

    1. profiles.role = 'admin'  (veritabanı, tek gerçek kaynak)
    2. ADMIN_EMAIL env değişkeni (ikinci kapı; kolon yanlışlıkla
       değişse bile e-posta tutmuyorsa erişim verilmez)

  İkisi de tutmalı. Tek noktanın ele geçirilmesi yetmez.

  DİKKAT: Buradaki hiçbir şey istemciye sızmamalı. SUPABASE_SERVICE_ROLE_KEY
  bütün RLS'i baypas eder; yalnızca sunucuda, yalnızca yetki doğrulandıktan
  sonra kullanılır.
*/

/** Yetkiyi doğrular. Başarısızsa { error, status } döner, başarılıysa { user, profile }. */
export async function requireAdmin() {
  const supabase = getSupabaseServer();

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return { error: 'Oturum bulunamadı.', status: 401 };
  }

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id, email, role, plan, credits')
    .eq('id', user.id)
    .single();

  if (pErr || !profile) {
    return { error: 'Profil bulunamadı.', status: 403 };
  }

  if (profile.role !== 'admin') {
    return { error: 'Bu işlem için yetkin yok.', status: 403 };
  }

  // İkinci kapı: env'deki admin e-postasıyla eşleşmeli
  const allowed = (process.env.ADMIN_EMAIL || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length > 0) {
    const email = (profile.email || user.email || '').toLowerCase();
    if (!allowed.includes(email)) {
      return { error: 'Bu işlem için yetkin yok.', status: 403 };
    }
  }

  return { user, profile };
}

/*
  Servis rolü istemcisi — RLS'i baypas eder.
  Yalnızca requireAdmin() geçtikten sonra çağrılmalı.
  Kullanıcı silme ve şifre atama gibi auth.users'a dokunan
  işlemler bunsuz yapılamaz.
*/
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY tanımlı değil. Vercel ortam değişkenlerine ekle.');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/** VIP kredisi sonsuz sayılır; arayüz ve AI route bu sabiti paylaşır. */
export const VIP_CREDITS = 999999999;
