'use client';
import Link from 'next/link';
import LangSwitch from '@/lib/LangSwitch';
import { useT } from '@/lib/i18n';

/*
  AÇILIŞ SAYFASI — pazarlama.

  Yol seçimi ("AI ile Oluştur" / "Kendi İçeriğim Hazır") burada DEĞİL.
  Landing'in tek işi ziyaretçiyi kayda yönlendirmek; üretim kararları
  oturum açıldıktan sonra /studio içinde alınır.

  Tüm metinler i18n'den gelir — dil değiştirici sayfayı anında çevirir.
  TEK İSTİSNA: hero iddiası "Create. Animate. Publish." Bu bir marka
  imzası, çeviri konusu değil; hangi dil seçili olursa olsun İngilizce kalır.
*/

const PIPELINE = [
  { icon: '✍️', n: 'lp.p1n', d: 'lp.p1d' },
  { icon: '▦',  n: 'lp.p2n', d: 'lp.p2d' },
  { icon: '⌘',  n: 'lp.p3n', d: 'lp.p3d' },
  { icon: '▣',  n: 'lp.p4n', d: 'lp.p4d' },
  { icon: '♪',  n: 'lp.p5n', d: 'lp.p5d' },
  { icon: '🎬', n: 'lp.p6n', d: 'lp.p6d' },
  { icon: '↗',  n: 'lp.p7n', d: 'lp.p7d' },
];

const FEATURES = [
  ['lp.f1t', 'lp.f1d'], ['lp.f2t', 'lp.f2d'], ['lp.f3t', 'lp.f3d'],
  ['lp.f4t', 'lp.f4d'], ['lp.f5t', 'lp.f5d'], ['lp.f6t', 'lp.f6d'],
];

const FREE_FEATS = ['plan.f1', 'plan.f2', 'plan.f3', 'plan.f4', 'plan.f5'];
const PRO_FEATS  = ['plan.p1', 'plan.p2', 'plan.p3', 'plan.p4', 'plan.p5'];

export default function Home() {
  const t = useT();

  return (
    <div className="container">
      <nav className="nav">
        <Link href="/" className="logo">AI Content <em>Studio</em></Link>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <LangSwitch compact />
          <Link href="#nasil" className="btn btn-mini">{t('lp.nav.how')}</Link>
          <Link href="#fiyat" className="btn btn-mini">{t('lp.nav.price')}</Link>
          <Link href="/giris" className="btn btn-mini btn-primary">{t('lp.nav.login')}</Link>
        </div>
      </nav>

      <header className="hero">
        {/* Marka imzası — çevrilmez. Üç kademe: üret → canlandır → yayınla.
            Vurgu yalnızca ağırlık, renk ve boyutla; italik yok. */}
        <h1 className="hero-claim">
          <span className="hc-1">Create.</span>{' '}
          <span className="hc-2">Animate.</span>{' '}
          <span className="hc-3">Publish.</span>
        </h1>
        <p style={{ maxWidth: 580, margin: '0 auto 30px', color: 'var(--text-2)' }}>
          {t('lp.heroSub')}
        </p>

        <div className="hero-cta">
          <Link href="/giris" className="btn btn-primary btn-lg">{t('lp.ctaPrimary')}</Link>
          <Link href="#nasil" className="btn btn-lg">{t('lp.ctaSecondary')}</Link>
        </div>
        <p className="hint" style={{ marginTop: 14 }}>{t('lp.ctaNote')}</p>
      </header>

      {/* ===== NASIL ÇALIŞIR ===== */}
      <h2 className="section-title" id="nasil">{t('lp.howTitle')}</h2>
      <div className="filmstrip" aria-label={t('lp.pipelineAria')}>
        <div className="filmstrip-track">
          {PIPELINE.map((f, i) => (
            <div key={f.n} className={'frame' + (i === 5 ? ' lit' : '')}>
              <div className="f-icon" aria-hidden="true">{f.icon}</div>
              <div className="f-name">{t(f.n)}</div>
              <div className="f-desc">{t(f.d)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== NE YAPAR ===== */}
      <h2 className="section-title">{t('lp.whatTitle')}</h2>
      <div className="features">
        {FEATURES.map(([title, desc]) => (
          <div className="card feature" key={title}>
            <h3>{t(title)}</h3>
            <p>{t(desc)}</p>
          </div>
        ))}
      </div>

      {/* ===== FİYATLANDIRMA ===== */}
      <h2 className="section-title" id="fiyat">{t('lp.priceTitle')}</h2>
      <div className="pricing">
        <div className="card price-card">
          <div style={{ fontSize: 14, color: 'var(--muted)' }}>{t('plan.starter')}</div>
          <div className="amount">{t('plan.free')}</div>
          <div className="per">{t('plan.noCard')}</div>
          <ul>{FREE_FEATS.map(k => <li key={k}>{t(k)}</li>)}</ul>
          <Link href="/giris" className="btn" style={{ width: '100%', justifyContent: 'center' }}>
            {t('plan.startFree')}
          </Link>
        </div>
        <div className="card price-card pro">
          <div style={{ fontSize: 14, color: 'var(--lamp)' }}>Pro</div>
          <div className="amount">₺499</div>
          <div className="per">{t('plan.monthly')}</div>
          <ul>{PRO_FEATS.map(k => <li key={k}>{t(k)}</li>)}</ul>
          <Link href="/giris" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
            {t('plan.goPro')}
          </Link>
        </div>
      </div>
      <p className="hint" style={{ textAlign: 'center', marginTop: 14 }}>{t('lp.privacyNote')}</p>

      <footer className="landing-footer">
        <div>© {new Date().getFullYear()} AI Content Studio</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          <Link href="/gizlilik">{t('lp.footPrivacy')}</Link>
          <Link href="/kullanim-kosullari">{t('lp.footTerms')}</Link>
          <Link href="/kvkk">{t('lp.footKvkk')}</Link>
          <Link href="/iletisim">{t('lp.footContact')}</Link>
        </div>
      </footer>
    </div>
  );
}
