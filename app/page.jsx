'use client';
import Link from 'next/link';
import LangSwitch from '@/lib/LangSwitch';
import { useT } from '@/lib/i18n';
/* Sprint-6 TASK-01: hero artık fikir kutusu. Eski marka iddiası
   (Create. Animate. Publish.) yerini Creator OS mesajına bıraktı. */
import HeroIdea from './HeroIdea';
/* Sprint-6 TASK-01 Adım 4: Creator OS anlatımı. Eski "nasıl
   çalışır" modül adlarını sayıyordu; artık beş adımlık akış. */
import { WhatIsCreatorOS, HowItWorks, Capabilities, DailyUse } from './LandingSections';

/*
  AÇILIŞ SAYFASI — pazarlama.

  Yol seçimi ("AI ile Oluştur" / "Kendi İçeriğim Hazır") burada DEĞİL.
  Landing'in tek işi ziyaretçiyi kayda yönlendirmek; üretim kararları
  oturum açıldıktan sonra /studio içinde alınır.

  Tüm metinler i18n'den gelir — dil değiştirici sayfayı anında çevirir.

  Sprint-6 TASK-01: hero değişti. Eski marka iddiası ("Create.
  Animate. Publish.") yerine fikir kutusu geldi — kullanıcı ilk
  ekranda ne yapmak istediğini yazıyor ve Creator OS ne anladığını
  ANINDA gösteriyor. Vaat yerine kanıt.
*/

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

      <HeroIdea />

      <WhatIsCreatorOS />

      <HowItWorks />

      <Capabilities />

      <DailyUse />

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
