'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useT } from '@/lib/i18n';

/*
  YENİ ŞİFRE BELİRLEME.

  Sprint 6 / TASK-01, Adım 6.

  ---------------------------------------------------------------
  BURAYA NASIL GELİNİR

  1. Kullanıcı /giris'te "Şifremi Unuttum" der
  2. Supabase e-posta gönderir
  3. Bağlantı /auth/callback?type=recovery&next=/sifre-yenile
  4. Callback oturumu açar ve buraya yönlendirir

  Yani buraya gelen kullanıcının OTURUMU ZATEN AÇIK — Supabase
  recovery akışı geçici bir oturum veriyor. `updateUser` çağırmak
  için gereken tek şey bu.

  OTURUM YOKSA: bağlantının süresi dolmuş ya da kullanıcı doğrudan
  adrese gelmiş. Boş bir form gösterip "kaydet"e bastırmak yerine
  durumu söylüyoruz.
  ---------------------------------------------------------------
*/

const MIN_LEN = 8;

export default function SifreYenile() {
  const t = useT();
  const router = useRouter();

  const [ready, setReady] = useState(null);   // null = kontrol ediliyor
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(false);

  /* Oturum var mı — recovery bağlantısı çalıştı mı? */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getSupabaseBrowser();
        const { data } = await supabase.auth.getUser();
        if (!cancelled) setReady(!!data?.user);
      } catch {
        if (!cancelled) setReady(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setErr(null);

    /* Doğrulama İSTEMCİDE de yapılıyor — sunucuya gidip dönmek
       yerine anında söylemek daha iyi. Sunucu da kendi kontrolünü
       yapıyor; bu yalnızca hız için. */
    if (pass.length < MIN_LEN) { setErr(t('pw.tooShort', { n: MIN_LEN })); return; }
    if (pass !== pass2) { setErr(t('pw.mismatch')); return; }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password: pass });
      if (error) { setErr(cevirHata(error.message, t)); return; }
      setDone(true);
      /* Kısa bir onay göster, sonra stüdyoya. Hemen yönlendirmek
         "oldu mu olmadı mı" belirsizliği bırakır. */
      setTimeout(() => router.push('/studio'), 1400);
    } catch (e2) {
      setErr(cevirHata(String(e2?.message || e2), t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container" style={{ maxWidth: 420, paddingTop: 70 }}>
      <Link href="/" className="logo" style={{ display: 'block', marginBottom: 26 }}>
        AI Content <em>Studio</em>
      </Link>

      <div className="card">
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 24, marginBottom: 4 }}>
          {t('pw.title')}
        </h1>

        {/* Oturum kontrolü sürerken form gösterip sonra kaldırmak
            titrek görünür; bekliyoruz. */}
        {ready === null && <p className="hint">{t('pw.checking')}</p>}

        {/* Bağlantı geçersiz — boş form göstermiyoruz */}
        {ready === false && (
          <>
            <p className="hint" style={{ marginBottom: 18 }}>{t('pw.expired')}</p>
            <Link href="/giris" className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}>
              {t('pw.backToLogin')}
            </Link>
          </>
        )}

        {ready === true && !done && (
          <>
            <p className="hint" style={{ marginBottom: 22 }}>{t('pw.sub')}</p>
            <form onSubmit={submit}>
              <div className="field">
                <label>{t('pw.new')}</label>
                <input className="input" type="password" value={pass}
                  onChange={e => setPass(e.target.value)}
                  autoComplete="new-password" minLength={MIN_LEN} required />
              </div>
              <div className="field">
                <label>{t('pw.repeat')}</label>
                <input className="input" type="password" value={pass2}
                  onChange={e => setPass2(e.target.value)}
                  autoComplete="new-password" minLength={MIN_LEN} required />
              </div>

              {err && <span className="err">{err}</span>}

              <button className="btn btn-primary" disabled={busy}
                style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
                {busy ? t('common.busy') : t('pw.save')}
              </button>
            </form>
            <p className="hint" style={{ marginTop: 14 }}>{t('pw.rule', { n: MIN_LEN })}</p>
          </>
        )}

        {done && <p className="pw-done">{t('pw.done')}</p>}
      </div>
    </div>
  );
}

/* Supabase hatalarını okunur hale getir. */
function cevirHata(msg, t) {
  const m = String(msg || '').toLowerCase();
  if (m.includes('should be different') || m.includes('same as')) {
    return t('pw.sameAsOld');
  }
  if (m.includes('at least') || m.includes('too short')) {
    return t('pw.tooShort', { n: MIN_LEN });
  }
  if (m.includes('session') || m.includes('jwt') || m.includes('expired')) {
    return t('pw.expired');
  }
  return msg;
}
