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

  /*
    Yanlış anahtar sessizce başarısız olur: anon anahtarıyla profil
    güncellemesi 0 satır etkiler ama hata vermez, buna karşılık
    auth.admin çağrıları 403 döner. Yani panelin bir kısmı çalışır,
    bir kısmı çalışmaz ve sebebi görünmez. Anahtarı baştan doğrulayıp
    net söylüyoruz.
  */
  const role = decodeKeyRole(key);
  if (role && role !== 'service_role') {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY yanlış: bu anahtarın rolü "' + role + '". ' +
      'Buraya anon/publishable anahtarı değil, Supabase → Settings → API → ' +
      'service_role (secret) anahtarı gelmeli. Değiştirdikten sonra sunucuyu yeniden başlat.'
    );
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/* Supabase JWT anahtarlarının payload'ındaki role alanını oku.
   Yeni sb_secret_* biçimindeki anahtarlar JWT değildir; o durumda
   null döner ve doğrulama atlanır. */
function decodeKeyRole(key) {
  const parts = String(key).split('.');
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], 'base64').toString('utf8');
    return JSON.parse(json).role || null;
  } catch {
    return null;
  }
}

/** VIP kredisi sonsuz sayılır; arayüz ve AI route bu sabiti paylaşır. */
export const VIP_CREDITS = 999999999;
