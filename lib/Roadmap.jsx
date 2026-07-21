'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStudio } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { computeWizard } from '@/lib/wizard';

/*
  Üstte kalıcı ilerleme çubuğu (%0–100) + 12 adımlık yol haritası.
  Tamamlanan adım yeşil ✓, aktif adım turuncu ➜, başlanmayan gri ○.
  Bir video açık değilken gizlenir (hiçbir üretim adımı henüz anlamlı değil).
*/
export default function Roadmap() {
  const { storyboard, episodeId, finalVideo, profile } = useStudio();
  const t = useT();
  const path = usePathname();

  if (!episodeId) return null;

  const { steps, pct } = computeWizard(storyboard, { episodeId, finalVideo });
  const credits = profile?.credits ?? 0;
  const maxCredits = profile?.plan === 'pro' ? 5000 : 100;
  const creditPct = Math.min(100, Math.round((credits / maxCredits) * 100));

  return (
    <div className="roadmap">
      <div className="roadmap-head">
        <span className="roadmap-title">{t('wiz.roadmap')}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="credit-badge" title={credits + ' / ' + maxCredits + ' AI kredisi'}>
            <span className="credit-bar"><i style={{ width: creditPct + '%' }} /></span>
            <span className="credit-num">{credits}</span>
            <span className="credit-label">{t('nav.credits')}</span>
          </span>
          <span className="roadmap-pct">{t('wiz.progress')} %{pct}</span>
        </div>
      </div>
      <div className="roadmap-bar"><i style={{ width: pct + '%' }} /></div>

      <div className="roadmap-steps">
        {steps.map(st => {
          const here = path === st.href;
          const mark = st.status === 'done' ? '✓' : st.status === 'active' ? '➜' : '○';
          return (
            <Link key={st.key} href={st.href}
              className={'rstep rstep-' + st.status + (here ? ' rstep-here' : '')}
              title={t('wiz.step.' + st.key)}>
              <span className="rstep-mark">{mark}</span>
              <span className="rstep-n">{st.n}</span>
              <span className="rstep-label">{t('wiz.step.' + st.key)}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
