'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useT } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/*
  Google logosu — inline SVG.

  Dış kaynaktan görsel çekmiyoruz: ağ isteği, gizlilik ve görselin
  yüklenmeme riski. Marka renkleri Google'ın kendi yönergesinden.
*/
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z"/>
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z"/>
      <path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.5C2.9 17.3 2 20.5 2 24s.9 6.7 2.5 9.9l7.3-5.7z"/>
      <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"/>
    </svg>
  );
}

/*
  Google akışının hataları.

  En sık görülen: Supabase panelinde sağlayıcı açık değil. Ham
  İngilizce mesaj yerine ne yapabileceğini söylüyoruz.
*/
function googleHata(msg) {
  const m = String(msg || '').toLowerCase();
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) {
    return 'Google girişi henüz açık değil. E-posta ile devam edebilirsin.';
  }
  if (m.includes('popup') || m.includes('closed')) {
    return 'Google penceresi kapandı. Tekrar dene.';
  }
  return msg;
}


function GirisFormu() {
  const t = useT();
  const params = useSearchParams();
  /*
    R3: VARSAYILAN HEDEF Creator OS.

    Eskiden `/studio` (Dashboard) idi — kullanıcı giriş yapınca
    rapor ekranına düşüyor ve nereden başlayacağını bulamıyordu.

    `?next=` KORUNUYOR: landing'den fikirle gelen, şifre
    sıfırlayan ya da belirli bir sayfaya davet edilen kullanıcı
    oraya gitmeye devam ediyor.

    Dashboard silinmedi — menüden erişilebilir, sadece varsayılan
    giriş noktası değil.
  */
  const next = params.get('next') || '/studio/creator';

  /*
    Sprint-6 TASK-01 Adım 3: landing'de yazılan fikri göster.

    Kullanıcı ana sayfada bir cümle yazdı ve buraya yönlendirildi.
    O cümleyi burada göstermek iki işe yarıyor:

      • Neden giriş yaptığını hatırlatıyor
      • Fikrinin KAYBOLMADIĞINI gösteriyor — kayboldu sanıp
        vazgeçmesin

    Yalnızca gösteriyoruz; kullanmak Creator OS'un işi.
  */
  const [pending, setPending] = useState('');
  useEffect(() => {
    try { setPending(sessionStorage.getItem('cos:pending') || ''); }
    catch { /* gizli mod */ }
  }, []);

  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [mode, setMode] = useState('login');
  /* Bilgi mesajı — hatadan ayrı. Şifre sıfırlama "hata" değil. */
  const [info, setInfo] = useState(null);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [onaySiz, setOnaySiz] = useState(false);   // e-posta onaylanmamış durumu
  const [tekrarBusy, setTekrarBusy] = useState(false);

  // Callback'ten dönen hata mesajını göster
  useEffect(() => {
    const hata = params.get('hata');
    if (hata) setErr(hata);
  }, [params]);

  function cevirHata(message) {
    const m = (message || '').toLowerCase();
    if (m.includes('email not confirmed')) return 'E-posta adresin henüz onaylanmadı. Gelen kutunu kontrol et.';
    if (m.includes('invalid login credentials')) return 'E-posta ya da parola hatalı.';
    if (m.includes('user already registered')) return 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.';
    if (m.includes('password should be')) return 'Parola en az 6 karakter olmalı.';
    if (m.includes('rate limit') || m.includes('too many')) return 'Çok fazla deneme yapıldı. Birkaç dakika bekle.';
    if (m.includes('unable to validate email')) return 'E-posta adresi geçersiz görünüyor.';
    return message;
  }

  /*
    ---------- GOOGLE İLE DEVAM ET ----------

    Sprint-6 TASK-01 Adım 5.

    Spec: "Şifre oluşturma zorunlu değildir."

    Supabase OAuth akışı PKCE kullanıyor — kullanıcı Google'a gider,
    döndüğünde `?code=` ile /auth/callback'e düşer. O rota ZATEN
    `exchangeCodeForSession` çağırıyor (e-posta onayı için yazılmıştı);
    OAuth için yeni bir şey gerekmiyor.

    `next` korunuyor: landing'den fikir yazıp gelen kullanıcı Google
    ile girse de Creator OS'a düşer ve fikri kurulur.

    YAPILANDIRMA GEREKİYOR: Supabase panelinde Google sağlayıcısı
    açık olmalı. Kapalıysa Supabase hata döndürür ve kullanıcıya
    okunur bir mesaj gösteriyoruz — sessizce başarısız olmuyoruz.
  */
  /*
    ---------- ŞİFREMİ UNUTTUM ----------

    Sprint-6 TASK-01 Adım 6.

    Supabase sıfırlama e-postası gönderiyor; bağlantı
    /auth/callback?type=recovery&next=/sifre-yenile adresine
    düşüyor. Callback oturumu açıyor, kullanıcı yeni şifresini
    orada belirliyor.

    GİZLİLİK: e-posta kayıtlı olsa da olmasa da AYNI mesajı
    veriyoruz. Farklı mesaj vermek, hangi adreslerin sistemde
    kayıtlı olduğunu sızdırır (kullanıcı numaralandırma).
  */
  async function resetPassword() {
    setErr(null);
    const addr = email.trim();
    if (!addr) { setErr(t('auth.needEmail')); return; }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowser();
      await supabase.auth.resetPasswordForEmail(addr, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery&next=${encodeURIComponent('/sifre-yenile')}`
      });
      /* Hata olsa bile aynı mesaj — bkz. gizlilik notu. */
      setInfo(t('auth.resetSent'));
    } catch {
      setInfo(t('auth.resetSent'));
    } finally {
      setBusy(false);
    }
  }

  async function googleSignIn() {
    setErr(null);
    setBusy(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
        }
      });
      /* Hata yoksa tarayıcı Google'a yönlendiriliyor; bu satırdan
         sonrası çalışmıyor. Hata varsa burada kalıyoruz. */
      if (error) { setErr(googleHata(error.message)); setBusy(false); }
    } catch (e) {
      setErr(googleHata(String(e?.message || e)));
      setBusy(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    setErr(null); setMsg(null); setOnaySiz(false); setBusy(true);

    try {
      const supabase = getSupabaseBrowser();

      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) {
          if ((error.message || '').toLowerCase().includes('email not confirmed')) setOnaySiz(true);
          throw error;
        }
        // Oturum çerezleri yazıldı; sunucunun görmesi için tam sayfa geçişi yap.
        // Yol seçimi artık /studio giriş ekranında yapılıyor, sorgu taşınmaz.
        window.location.assign(next);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: pass,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
          }
        });
        if (error) throw error;

        // Onay kapalıysa Supabase oturumu hemen döner → doğrudan stüdyoya
        if (data.session) {
          window.location.assign(next);
          return;
        }
        // Zaten kayıtlı e-posta: identities boş gelir, kullanıcı sızdırılmaz
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setErr('Bu e-posta zaten kayıtlı. Giriş yapmayı dene.');
          setMode('login');
          return;
        }
        setMsg(`Onay bağlantısı ${email} adresine gönderildi. Bağlantıya tıkladığında doğrudan stüdyona gireceksin.`);
        setOnaySiz(true);
      }
    } catch (e) {
      setErr(cevirHata(e.message));
    }
    setBusy(false);
  }

  async function tekrarGonder() {
    if (!email) return setErr('Önce e-posta adresini yaz.');
    setErr(null); setMsg(null); setTekrarBusy(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
        }
      });
      if (error) throw error;
      setMsg('Yeni onay bağlantısı gönderildi. Spam klasörüne de bak.');
    } catch (e) {
      setErr(cevirHata(e.message));
    }
    setTekrarBusy(false);
  }

  return (
    <div className="container" style={{ maxWidth: 420, paddingTop: 70 }}>
      <Link href="/" className="logo" style={{ display: 'block', marginBottom: 26 }}>AI Content <em>Studio</em></Link>
      <div className="card">
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 24, marginBottom: 4 }}>
          {mode === 'login' ? t('auth.welcome') : t('auth.signup')}
        </h1>
        <p className="hint" style={{ marginBottom: pending ? 14 : 22 }}>
          {mode === 'login' ? t('auth.welcomeSub') : t('auth.signupSub')}
        </p>

        {/* Landing'de yazdığı fikir — kaybolmadığını görsün */}
        {pending && (
          <div className="auth-pending">
            <span className="auth-pending-label">{t('auth.pendingLabel')}</span>
            <span className="auth-pending-text">{pending}</span>
          </div>
        )}

        {/* Google — şifresiz yol önce geliyor. Spec: "Şifre
            oluşturma zorunlu değildir." */}
        <button type="button" className="btn auth-google"
          onClick={googleSignIn} disabled={busy}>
          <GoogleMark />
          {t('auth.google')}
        </button>

        <div className="auth-or"><span>{t('auth.or')}</span></div>

        <form onSubmit={submit}>
          <div className="field">
            <label>{t('auth.email')}</label>
            <input className="input" type="email" value={email} required autoComplete="email"
              onChange={e => setEmail(e.target.value)} placeholder={t('auth.emailPh')} />
          </div>
          <div className="field">
            <label>{t('auth.password')}</label>
            <input className="input" type="password" value={pass} required minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onChange={e => setPass(e.target.value)} placeholder={t('auth.passPh')} />
          </div>
          {/* Şifremi unuttum — YALNIZCA giriş modunda.
              Kayıt olurken göstermek anlamsız, henüz şifresi yok. */}
          {mode === 'login' && (
            <button type="button" className="auth-forgot"
              onClick={resetPassword} disabled={busy}>
              {t('auth.forgot')}
            </button>
          )}

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? t('common.busy') : mode === 'login' ? t('auth.signin') : t('auth.signup')}
          </button>
        </form>

        {err && <span className="err">{err}</span>}
        {msg && <span className="okmsg">{msg}</span>}
        {info && <span className="okmsg">{info}</span>}

        {onaySiz && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <p className="hint" style={{ marginBottom: 10 }}>
              {t('auth.noMail')}
            </p>
            <button className="btn btn-mini" onClick={tekrarGonder} disabled={tekrarBusy}
              style={{ width: '100%', justifyContent: 'center' }}>
              {tekrarBusy ? t('auth.sending') : t('auth.resend')}
            </button>
          </div>
        )}

        <p className="hint" style={{ marginTop: 18, textAlign: 'center' }}>
          {mode === 'login' ? t('auth.noAccount') + ' ' : t('auth.haveAccount') + ' '}
          <button type="button" className="btn btn-mini" style={{ marginLeft: 6 }}
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErr(null); setMsg(null); setOnaySiz(false); }}>
            {mode === 'login' ? t('auth.signup') : t('auth.signin')}
          </button>
        </p>
      </div>

      <p className="hint" style={{ textAlign: 'center', marginTop: 20 }}>
        {t('auth.legal1')} <Link href="/kullanim-kosullari" style={{ color: 'var(--lamp)' }}>{t('auth.tos')}</Link>{' '}
        {t('auth.legal2')} <Link href="/gizlilik" style={{ color: 'var(--lamp)' }}>{t('auth.privacy')}</Link>{' '}
        {t('auth.legal3')}
      </p>
    </div>
  );
}

export default function GirisPage() {
  return (
    <Suspense fallback={<div className="container" style={{ paddingTop: 70 }}><p className="hint">Yükleniyor…</p></div>}>
      <GirisFormu />
    </Suspense>
  );
}
