'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useT } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

function GirisFormu() {
  const t = useT();
  const params = useSearchParams();
  const next = params.get('next') || '/studio';

  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [mode, setMode] = useState('login');
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
        <p className="hint" style={{ marginBottom: 22 }}>
          {mode === 'login' ? t('auth.welcomeSub') : t('auth.signupSub')}
        </p>

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
          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? t('common.busy') : mode === 'login' ? t('auth.signin') : t('auth.signup')}
          </button>
        </form>

        {err && <span className="err">{err}</span>}
        {msg && <span className="okmsg">{msg}</span>}

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
