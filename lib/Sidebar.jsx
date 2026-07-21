'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useStudio } from '@/lib/store';
import { useI18n, LOCALES } from '@/lib/i18n';
import { computeWizard, WIZARD_STEPS } from '@/lib/wizard';

/* Etiketler çeviri anahtarı olarak tutulur, render sırasında çözülür */
const LINKS = [
  { sep: 'nav.project' },
  { href: '/studio', key: 'nav.overview', icon: '◆' },
  { href: '/studio/projeler', key: 'nav.projects', icon: '▤' },
  { sep: 'nav.production' },
  { href: '/studio/senaryo', key: 'nav.script', icon: '✍' },
  { href: '/studio/storyboard', key: 'nav.storyboard', icon: '▦' },
  { href: '/studio/karakterler', key: 'nav.characters', icon: '☺' },
  { href: '/studio/promptlar', key: 'nav.prompts', icon: '⌘' },
  { sep: 'nav.assets' },
  { href: '/studio/gorseller', key: 'nav.images', icon: '▣' },
  { href: '/studio/seslendirme', key: 'nav.voice', icon: '♪' },
  { sep: 'nav.output' },
  { href: '/studio/atolye', key: 'nav.edit', icon: '⚡' },
  { href: '/studio/altyazi', key: 'nav.subtitles', icon: '≡' },
  { href: '/studio/thumbnail', key: 'nav.thumbnail', icon: '▨' },
  { href: '/studio/shorts', key: 'nav.shorts', icon: '▮' },
  { href: '/studio/youtube', key: 'nav.publish', icon: '↗' },
  { sep: 'nav.account' },
  { href: '/studio/ayarlar', key: 'nav.settings', icon: '⚙' },
];

export default function Sidebar() {
  const path = usePathname();
  const { profile, storyboard, episodeId, finalVideo } = useStudio();
  const { t, locale, setLocale } = useI18n();

  /* Adım no + durum (yeşil ✓ / turuncu / gri) href üzerinden eşlenir */
  const wiz = episodeId ? computeWizard(storyboard, { episodeId, finalVideo }) : null;
  const stepByHref = {};
  if (wiz) wiz.steps.forEach(s => { stepByHref[s.href] = s; });

  async function logout() {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  return (
    <aside className="sidebar">
      <Link href="/studio" className="logo">AI Content <em>Studio</em></Link>

      {episodeId && <div className="wiz-guide">{t('wiz.hint')}</div>}

      {LINKS.map((l, i) => {
        if (l.sep) return <div className="nav-sep" key={'s' + i}>{t(l.sep)}</div>;
        const st = stepByHref[l.href];
        const statusClass = st ? ' nav-' + st.status : '';
        return (
          <Link key={l.href} href={l.href} className={'navlink' + (path === l.href ? ' active' : '') + statusClass}>
            {st
              ? <span className="nav-num" aria-hidden="true">{st.status === 'done' ? '✓' : st.n}</span>
              : <span aria-hidden="true" style={{ width: 16, textAlign: 'center' }}>{l.icon}</span>}
            {t(l.key)}
          </Link>
        );
      })}

      <div className="sidebar-foot">
        {/* Hızlı dil değiştirici — Ayarlar'a gitmeden */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {LOCALES.map(l => (
            <button key={l.k} onClick={() => setLocale(l.k)}
              title={l.l}
              className={'chip' + (locale === l.k ? ' on' : '')}
              style={{ flex: 1, justifyContent: 'center', fontSize: 11, padding: '4px 6px' }}>
              {l.flag} {l.k.toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: 8 }}>
          {profile?.plan === 'pro' ? 'Pro' : 'Free'} · {profile?.credits ?? 0} {t('nav.credits')}
        </div>
        <button className="btn btn-mini" onClick={logout} style={{ width: '100%', justifyContent: 'center' }}>
          {t('nav.signout')}
        </button>
      </div>
    </aside>
  );
}
