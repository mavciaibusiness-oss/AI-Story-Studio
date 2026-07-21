'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useStudio } from '@/lib/store';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useI18n, LOCALES } from '@/lib/i18n';
import { LANGUAGES } from '@/lib/storyboard';

export const dynamic = 'force-dynamic';

export default function Ayarlar() {
  const { profile, setProfile } = useStudio();
  const { locale, setLocale, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const isPro = profile?.plan === 'pro';

  /* Tercihler profiles.settings (jsonb) içinde tutulur */
  async function saveSetting(key, value) {
    const next = { ...(profile?.settings || {}), [key]: value };
    setProfile(pr => ({ ...pr, settings: next }));
    const supabase = getSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('profiles').update({ settings: next }).eq('id', user.id);
  }

  async function upgrade() {
    setErr(null); setBusy(true);
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      window.location.href = data.url;
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  async function deleteAccount() {
    if (!confirm('Hesabın ve tüm projelerin kalıcı olarak silinsin mi? Bu geri alınamaz.')) return;
    const supabase = getSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('episodes').delete().eq('user_id', user.id);
    await supabase.from('projects').delete().eq('user_id', user.id);
    await supabase.from('characters').delete().eq('user_id', user.id);
    await supabase.auth.signOut();
    alert('Verilerin silindi. Hesabının tamamen kaldırılması için iletişim sayfasından yaz.');
    window.location.href = '/';
  }

  return (
    <>
      <h1 className="page-title">{t('set.title')}</h1>
      <p className="page-sub">{t('set.sub')}</p>

      {/* DİL — arayüz ve üretim birbirinden bağımsız */}
      <h2 className="section-title">{t('common.language')}</h2>
      <div className="card">
        <div className="field">
          <label>{t('set.uiLang')}</label>
          <div className="chips">
            {LOCALES.map(l => (
              <button key={l.k} className={'chip' + (locale === l.k ? ' on' : '')}
                onClick={() => setLocale(l.k)}>
                <span style={{ marginRight: 5 }}>{l.flag}</span>{l.l}
              </button>
            ))}
          </div>
          <p className="hint">{t('set.uiLangHint')}</p>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label>{t('set.defaultProdLang')}</label>
          <select className="select" style={{ maxWidth: 260 }}
            value={profile?.settings?.prodLang || 'Türkçe'}
            onChange={e => saveSetting('prodLang', e.target.value)}>
            {LANGUAGES.map(l => <option key={l}>{l}</option>)}
          </select>
          <p className="hint">{t('set.defaultProdLangHint')}</p>
        </div>
      </div>
<p className="page-sub">Hesabın, planın ve verilerin.</p>

      <h2 className="section-title">Hesap</h2>
      <div className="card">
        <div className="field"><label>E-posta</label><p style={{ fontSize: 15 }}>{profile?.email}</p></div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Plan</label>
          <p style={{ fontSize: 15 }}>
            {isPro ? 'Pro' : 'Ücretsiz'} · <span style={{ color: 'var(--lamp)' }}>{profile?.credits ?? 0} AI kredisi</span>
          </p>
        </div>
      </div>

      <h2 className="section-title">Plan</h2>
      <div className="card">
        {isPro ? (
          <>
            <p style={{ marginBottom: 8 }}>Pro plandasın.</p>
            <p className="hint">Filigransız 1440p çıktı, sınırsız proje, ayda 5.000 kredi.
              İptal için <Link href="/iletisim" style={{ color: 'var(--lamp)' }}>iletişime geç</Link>.</p>
          </>
        ) : (
          <>
            <p style={{ marginBottom: 6 }}>Pro — ₺499/ay</p>
            <p className="hint" style={{ marginBottom: 16 }}>
              Filigran kalkar, 1440p açılır, kredi 100'den 5.000'e çıkar, proje sınırı biter.
            </p>
            <button className="btn btn-primary" onClick={upgrade} disabled={busy}>
              {busy ? 'Yönlendiriliyor…' : "Pro'ya geç"}
            </button>
          </>
        )}
        {err && <span className="err">{err}</span>}
      </div>

      <h2 className="section-title">Krediler nereye gidiyor</h2>
      <div className="card">
        <div className="row-list">
          {[['Hikâye yazma / düzenleme', 12], ['Sahne promptları (6 sahne)', 10],
            ['Altyazı çevirisi (dil başına)', 6], ['YouTube metinleri', 5], ['Başlık önerisi', 3]].map(([l, c]) => (
            <div className="row" key={l}>
              <div className="r-name">{l}</div>
              <div className="r-meta">{c} kredi</div>
            </div>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          Kolaj bölme, seslendirme analizi, video üretme, altyazı zamanlama, thumbnail ve Shorts kredi harcamaz —
          bunlar senin bilgisayarında çalışır.
        </p>
      </div>

      <h2 className="section-title">Verilerin</h2>
      <div className="card">
        <p className="hint" style={{ marginBottom: 14 }}>
          Projelerini Projeler sayfasından JSON olarak indirebilirsin. Görsel, ses ve videoların zaten
          hiç sunucuya gitmiyor — onlar yalnızca senin bilgisayarında.
        </p>
        <button className="btn btn-danger btn-mini" onClick={deleteAccount}>Hesabımı ve verilerimi sil</button>
      </div>

      <h2 className="section-title">Yasal</h2>
      <div className="chips">
        <Link href="/gizlilik" className="chip">Gizlilik</Link>
        <Link href="/kullanim-kosullari" className="chip">Kullanım Koşulları</Link>
        <Link href="/kvkk" className="chip">KVKK</Link>
        <Link href="/iletisim" className="chip">İletişim</Link>
      </div>
    </>
  );
}
