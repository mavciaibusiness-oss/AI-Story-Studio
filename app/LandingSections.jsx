'use client';
import { useT } from '@/lib/i18n';
import { readyCapabilities, readyDaily } from '@/lib/landing/examples';

/*
  LANDING BÖLÜMLERİ — Creator OS anlatımı.

  Sprint 6 / TASK-01, Adım 4.

  ---------------------------------------------------------------
  ESKİ BÖLÜMLER NEDEN DEĞİŞTİ

  Eski "nasıl çalışır" bölümü modül adlarını sayıyordu:
  Storyboard → Prompt → Ses → Kurgu. Bu ARAÇ anlatımı.

  Spec: "İnsanlara AI Studio satmıyoruz, Creator OS satıyoruz."
  Kullanıcının hissetmesi gereken: "Ben ne yapacağımı
  düşünmüyorum, uygulama bana söylüyor."

  Beş adımlık akış bunu anlatıyor — modül adı geçmiyor.
  ---------------------------------------------------------------

  HAZIR OLMAYAN GÖSTERİLMİYOR

  Yetenek listesi ve günlük kartlar `lib/landing/examples.js`ten
  geliyor ve `ready: false` olanlar SÜZÜLÜYOR.

  Rakip analizi ve trendler henüz yok; landing'de saymak yalan
  olurdu. Sprint-6'da gelince `ready: true` yapılacak ve buraya
  kod değişikliği olmadan düşecekler.
*/

/* Beş adım — spec'in istediği akış. Metin i18n'de. */
const STEPS = ['s1', 's2', 's3', 's4', 's5'];

export function WhatIsCreatorOS() {
  const t = useT();
  return (
    <section className="lp-what" id="creator-os">
      <h2 className="lp-what-title">{t('lp.what.title')}</h2>
      <p className="lp-what-lead">{t('lp.what.lead')}</p>
      <p className="lp-what-body">{t('lp.what.body')}</p>
    </section>
  );
}

export function HowItWorks() {
  const t = useT();
  return (
    <section id="nasil">
      <h2 className="section-title">{t('lp.how.title')}</h2>
      <ol className="lp-steps">
        {STEPS.map((k, i) => (
          <li className="lp-step" key={k}>
            <span className="lp-step-n">{i + 1}</span>
            <span className="lp-step-text">{t('lp.how.' + k)}</span>
          </li>
        ))}
      </ol>
      <p className="lp-steps-note">{t('lp.how.note')}</p>
    </section>
  );
}

/*
  Güven bölümü — "AI gerçekten bunu yapabiliyor mu?"

  Cevap: iddia değil, LİSTE. Ve listedeki her madde uygulamada
  gerçekten çalışan bir ekrana karşılık geliyor.
*/
export function Capabilities() {
  const t = useT();
  const items = readyCapabilities();

  return (
    <section className="lp-caps">
      <h2 className="section-title">{t('lp.caps.title')}</h2>
      <div className="lp-caps-grid">
        {items.map(c => (
          <div className="lp-cap" key={c.key}>
            <span className="lp-cap-mark" aria-hidden="true">✓</span>
            <span>{t('lp.cap.' + c.key)}</span>
          </div>
        ))}
      </div>
      {/* Sayı gerçek: listedeki madde sayısı. Uydurma "50+ özellik"
          gibi bir iddia yok. */}
      <p className="lp-caps-note">{t('lp.caps.note', { n: items.length })}</p>
    </section>
  );
}

/*
  Günlük kullanım — "Her gün neden Creator OS açılıyor?"

  Spec dört kart istiyordu (sabah/öğlen/akşam/hafta sonu). İkisi
  trend ve niş verisi gerektiriyor — yok. Yalnızca gerçek olanlar
  gösteriliyor.

  Hiç kart kalmazsa bölüm hiç görünmüyor: iki kartlık bir "her gün"
  vaadi zayıf ama boş bir başlık daha kötü.
*/
export function DailyUse() {
  const t = useT();
  const items = readyDaily();
  if (!items.length) return null;

  return (
    <section className="lp-daily">
      <h2 className="section-title">{t('lp.daily.title')}</h2>
      <div className="lp-daily-grid">
        {items.map(d => (
          <div className="card lp-daily-card" key={d.key}>
            <div className="lp-daily-when">{t('lp.daily.' + d.key + '.when')}</div>
            <div className="lp-daily-what">{t('lp.daily.' + d.key + '.what')}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
