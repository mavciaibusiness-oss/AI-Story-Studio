'use client';
import Link from 'next/link';
import { useStudio } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { progressOf } from '@/lib/storyboard';

export default function EpisodeBar() {
  const { episodeId, storyboard, saving, dirty } = useStudio();
  const t = useT();

  if (!episodeId) {
    return (
      <div className="card" style={{ marginBottom: 20, borderColor: 'var(--lamp)' }}>
        <p className="hint" style={{ margin: 0 }}>
          {t('bar.noProject')}{' '}
          <Link href="/studio/projeler" style={{ color: 'var(--lamp)' }}>{t('nav.projects')}</Link>{' '}
          {t('bar.noProjectHint')}
        </p>
      </div>
    );
  }

  const p = progressOf(storyboard);
  const FMTS = { youtube: '16:9', shorts: '9:16', tiktok: '9:16', reels: '9:16', documentary: '16:9', podcast: '1:1', custom: storyboard.aspect };
  const fmtLabel = (storyboard.format || 'youtube').replace(/^\w/, c => c.toUpperCase());
  const aspectLabel = FMTS[storyboard.format] || storyboard.aspect || '16:9';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 12,
      padding: '10px 16px', marginBottom: 20, fontSize: 13
    }}>
      <span style={{ fontWeight: 600 }}>{storyboard.title || t('common.unnamed')}</span>
      <span className="format-badge"><em>{fmtLabel}</em> {aspectLabel}</span>
      <span className="hint" style={{ margin: 0 }}>{p.scenes} {t('common.scenes')}</span>
      <span className="hint" style={{ margin: 0 }}>· {p.prompts} {t('bar.prompts')}</span>
      <span className="hint" style={{ margin: 0 }}>· {p.images} {t('bar.images')}</span>
      <span className="hint" style={{ margin: 0 }}>· {p.voices} {t('bar.voices')}</span>
      <div style={{ flex: 1, minWidth: 60, height: 3, background: 'var(--line)', borderRadius: 2 }}>
        <div style={{ width: p.pct + '%', height: '100%', background: 'var(--lamp)', borderRadius: 2 }} />
      </div>
      <span style={{ color: saving ? 'var(--lamp)' : dirty ? 'var(--muted)' : 'var(--ok)', fontSize: 12 }}>
        {saving ? t('common.saving') : dirty ? t('common.dirty') : '✓ ' + t('common.saved')}
      </span>
    </div>
  );
}
