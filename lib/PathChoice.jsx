'use client';
import { useT } from '@/lib/i18n';

/*
  YOL SEÇİMİ — tek kaynak.

  "AI ile Oluştur" / "Kendi İçeriğim Hazır" kartları daha önce üç ayrı yerde
  kopyalanmıştı (landing, studio girişi, senaryo modülü). Landing artık bir
  pazarlama sayfası ve yol seçimi barındırmıyor; kalan iki kullanım bu
  bileşeni paylaşır. Kart tasarımı değişince tek dosya güncellenir.

  İkonlar emoji değil çizgi SVG — currentColor ile lamba rengini alır.
  Kart <button> olduğu için tüm iç öğeler phrasing content (span/svg).

  props:
    onPick(mode)  — 'ai' | 'own' seçildiğinde çağrılır
    busy          — o an hazırlanan mod ('ai' | 'own' | null); kartları kilitler
*/

const ICONS = {
  spark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9L12 3z" />
      <path d="M19 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
    </svg>
  ),
  film: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M7.5 5v14M16.5 5v14M3 9.5h4.5M3 14.5h4.5M16.5 9.5H21M16.5 14.5H21" />
    </svg>
  )
};

export default function PathChoice({ onPick, busy }) {
  const t = useT();

  const paths = [
    { mode: 'ai',  icon: 'spark', badge: 'entry.aiBadge',  title: 'wchoose.aiTitle',
      desc: 'wchoose.aiDesc',  pick: 'wchoose.aiPick',
      feats: ['entry.aiF1', 'entry.aiF2', 'entry.aiF3'] },
    { mode: 'own', icon: 'film', badge: 'entry.ownBadge', title: 'wchoose.ownTitle',
      desc: 'wchoose.ownDesc', pick: 'wchoose.ownPick',
      feats: ['entry.ownF1', 'entry.ownF2', 'entry.ownF3'] }
  ];

  return (
    <div className="entry-paths">
      {paths.map(p => (
        <button key={p.mode} className="path-card"
          onClick={() => onPick(p.mode)} disabled={!!busy}>
          <span className="path-badge">{t(p.badge)}</span>
          <span className="path-ic">{ICONS[p.icon]}</span>
          <span className="path-name">{t(p.title)}</span>
          <span className="path-desc">{t(p.desc)}</span>
          <span className="path-feats">
            {p.feats.map(f => <span key={f}>{t(f)}</span>)}
          </span>
          <span className="btn btn-primary">
            {busy === p.mode ? t('entry.creating') : t(p.pick)}
          </span>
        </button>
      ))}
    </div>
  );
}
