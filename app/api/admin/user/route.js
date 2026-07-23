import { NextResponse } from 'next/server';
import { requireAdmin, getServiceClient, VIP_CREDITS } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

/*
  POST /api/admin/user
  Tek kullanıcı üzerinde işlem. Gövde: { action, userId, ... }

  Desteklenen action değerleri:
    addCredits   { userId, amount }        kredi ekle/çıkar
    setCredits   { userId, amount }        krediyi sabitle
    setPlan      { userId, plan }          free | pro | vip
    setRole      { userId, role }          user | admin
    setPassword  { userId, password }      doğrudan şifre ata
    resetEmail   { userId }                sıfırlama e-postası gönder
    createUser   { email, password, plan } yeni kullanıcı
    deleteUser   { userId }                kullanıcıyı ve verisini sil

  Her işlem requireAdmin() kapısından geçer. Admin kendini
  silemez ve kendi admin rolünü düşüremez — kilitlenmeyi önler.
*/

const PLANS = ['free', 'pro', 'vip'];
const ROLES = ['user', 'admin'];

/*
  Supabase Admin API hatalarını okunur hâle getir.

  Şifre atama ve kullanıcı silme, profil güncellemenin aksine gerçek
  service_role yetkisi ister. Anahtar yanlışsa Supabase kuru bir
  "User not allowed" döner; kullanıcı neyin eksik olduğunu anlamaz.
*/
function adminApiError(err, islem) {
  const m = String(err?.message || err || '');
  if (/not allowed|forbidden|invalid api key|jwt/i.test(m)) {
    return new Error(
      islem + ' yapılamadı: Supabase yetkiyi reddetti (' + m + '). ' +
      'Bu işlem gerçek service_role anahtarı ister. ' +
      'SUPABASE_SERVICE_ROLE_KEY değerini Supabase → Settings → API → ' +
      'service_role (secret) ile değiştir ve sunucuyu yeniden başlat.'
    );
  }
  return new Error(islem + ' yapılamadı: ' + m);
}

/* Plan değişince kredi de mantıklı bir değere çekilir. */
function creditsForPlan(plan, current) {
  if (plan === 'vip') return VIP_CREDITS;
  if (plan === 'pro') return Math.max(current || 0, 5000);
  // free'ye düşerken VIP'in sahte sonsuzu kalmasın
  return current >= VIP_CREDITS ? 100 : (current || 100);
}

export async function POST(req) {
  try {
    const gate = await requireAdmin();
    if (gate.error) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = await req.json().catch(() => ({}));
    const { action, userId } = body;
    if (!action) {
      return NextResponse.json({ error: 'action gerekli.' }, { status: 400 });
    }

    const svc = getServiceClient();
    const isSelf = userId && userId === gate.user.id;

    switch (action) {

      /* ---------- KREDİ ---------- */
      case 'addCredits': {
        const amount = Number(body.amount);
        if (!userId || !Number.isFinite(amount)) {
          return NextResponse.json({ error: 'userId ve amount gerekli.' }, { status: 400 });
        }
        const { data: p } = await svc.from('profiles').select('credits').eq('id', userId).single();
        const next = Math.max(0, (p?.credits || 0) + amount);
        /* select() ile dönen satırı say: anon anahtarla RLS sessizce
           0 satır etkiler ve hata vermez. Bunu başarı sanmayalım. */
        const { data: upd, error } = await svc.from('profiles')
          .update({ credits: next }).eq('id', userId).select('id');
        if (error) throw new Error(error.message);
        if (!upd?.length) throw new Error(
          'Kredi güncellenemedi: hiçbir satır değişmedi. ' +
          'SUPABASE_SERVICE_ROLE_KEY yanlış olabilir.');
        return NextResponse.json({ ok: true, credits: next });
      }

      case 'setCredits': {
        const amount = Number(body.amount);
        if (!userId || !Number.isFinite(amount) || amount < 0) {
          return NextResponse.json({ error: 'Geçerli bir kredi değeri gerekli.' }, { status: 400 });
        }
        const { error } = await svc.from('profiles').update({ credits: Math.floor(amount) }).eq('id', userId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, credits: Math.floor(amount) });
      }

      /* ---------- PLAN ---------- */
      case 'setPlan': {
        const plan = String(body.plan || '');
        if (!userId || !PLANS.includes(plan)) {
          return NextResponse.json({ error: 'Geçersiz plan.' }, { status: 400 });
        }
        const { data: p } = await svc.from('profiles').select('credits').eq('id', userId).single();
        const credits = creditsForPlan(plan, p?.credits || 0);
        const { error } = await svc.from('profiles').update({ plan, credits }).eq('id', userId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, plan, credits });
      }

      /* ---------- ROL ---------- */
      case 'setRole': {
        const role = String(body.role || '');
        if (!userId || !ROLES.includes(role)) {
          return NextResponse.json({ error: 'Geçersiz rol.' }, { status: 400 });
        }
        if (isSelf && role !== 'admin') {
          return NextResponse.json(
            { error: 'Kendi admin yetkini kaldıramazsın.' }, { status: 400 });
        }
        const { error } = await svc.from('profiles').update({ role }).eq('id', userId);
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, role });
      }

      /* ---------- ŞİFRE (admin doğrudan atar) ---------- */
      case 'setPassword': {
        const password = String(body.password || '');
        if (!userId || password.length < 8) {
          return NextResponse.json(
            { error: 'Şifre en az 8 karakter olmalı.' }, { status: 400 });
        }
        const { error } = await svc.auth.admin.updateUserById(userId, { password });
        if (error) throw adminApiError(error, 'Şifre değiştirme');
        return NextResponse.json({ ok: true });
      }

      /* ---------- ŞİFRE (kullanıcıya e-posta) ---------- */
      case 'resetEmail': {
        if (!userId) return NextResponse.json({ error: 'userId gerekli.' }, { status: 400 });
        const { data: p } = await svc.from('profiles').select('email').eq('id', userId).single();
        if (!p?.email) return NextResponse.json({ error: 'E-posta bulunamadı.' }, { status: 404 });
        const site = process.env.NEXT_PUBLIC_SITE_URL || '';
        const { error } = await svc.auth.resetPasswordForEmail(p.email, {
          redirectTo: site ? site + '/auth/callback?next=/studio/ayarlar' : undefined
        });
        if (error) throw new Error(error.message);
        return NextResponse.json({ ok: true, email: p.email });
      }

      /* ---------- KULLANICI OLUŞTUR ---------- */
      case 'createUser': {
        const email = String(body.email || '').trim().toLowerCase();
        const password = String(body.password || '');
        const plan = PLANS.includes(body.plan) ? body.plan : 'free';
        if (!email || password.length < 8) {
          return NextResponse.json(
            { error: 'E-posta ve en az 8 karakterlik şifre gerekli.' }, { status: 400 });
        }
        const { data, error } = await svc.auth.admin.createUser({
          email, password, email_confirm: true
        });
        if (error) throw adminApiError(error, 'Kullanıcı oluşturma');

        // Trigger profili oluşturur; plan/kredi burada ayarlanır
        const credits = creditsForPlan(plan, 100);
        await svc.from('profiles')
          .upsert({ id: data.user.id, email, plan, credits }, { onConflict: 'id' });

        return NextResponse.json({ ok: true, userId: data.user.id });
      }

      /* ---------- KULLANICI SİL ---------- */
      case 'deleteUser': {
        if (!userId) return NextResponse.json({ error: 'userId gerekli.' }, { status: 400 });
        if (isSelf) {
          return NextResponse.json(
            { error: 'Kendi hesabını buradan silemezsin.' }, { status: 400 });
        }
        // auth.users silinince profiles/projects/episodes cascade ile gider
        const { error } = await svc.auth.admin.deleteUser(userId);
        if (error) throw adminApiError(error, 'Kullanıcı silme');
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: 'Bilinmeyen action: ' + action }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
