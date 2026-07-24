'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { useT } from '@/lib/i18n';
import { buildTimeline, formatDuration } from '@/lib/timeline';

/*
  VIDEO HEALTH PANEL — Sprint 4 / TASK-02.

  Storyboard ve Seslendirme sayfalarının hemen üstünde görünen
  tam genişlikte özet + Timeline Preview şeridi.

  Bu bileşen storyboard/health raporu ÇAĞIRMAZ; kural motoru
  ölçümlerini yerel olarak yapar (ücretsiz, AI'siz). Kullanıcı
  detay için "Video Sağlığı" sayfasına gider.

  Sunum kararı:
    - "Storyboard oluşturuldu" başlığı yok — mevcut sayfaların H1'i
      bu görevi zaten yapıyor. Panel doğrudan içeriğe girer,
      gereksiz gürültü çıkarmaz.
    - Timeline şeridi renkle sorunu işaretler: temiz yeşil, kısa
      sarı, uzun turuncu, boş gri. Aynı dil sağlık sayfasıyla ortak.

  Storyboard boşsa bileşen null döner — üst sayfa akışı bozulmaz.
*/

/* Sağlık puanı: kural motorunu çağırmadan kaba tahmin.
   Detaylı puan sağlık sayfasında. Burada bir "trafik ışığı" yeter. */
function quickScore(tl) {
  if (!tl.scenes.length) return null;
  let s = 100;
  s -= tl.warnings.long.length * 6;
  s -= tl.warnings.short.length * 4;
  s -= tl.warnings.missingText.length * 10;
  return Math.max(0, Math.min(100, Math.round(s)));
}

function band(score) {
  if (score === null) return null;
  if (score >= 85) return 'ok';
  if (score >= 60) return 'warn';
  return 'critical';
}

export default function VideoHealthPanel({ storyboard, compact }) {
  const t = useT();

  const tl = useMemo(() => buildTimeline(storyboard), [storyboard]);
  const score = quickScore(tl);
  const tone = band(score);

  if (!tl.scenes.length) return null;

  const total = tl.total;
  const longCount = tl.warnings.long.length;
  const shortCount = tl.warnings.short.length;
  const missingCount = tl.warnings.missingText.length;

  return (
    <section className={'vh-panel' + (compact ? ' vh-panel-compact' : '')}
      aria-label={t('vh.title')}>
      {/* Özet çubuğu */}
      <div className="vh-panel-summary">
        <div className={'vh-panel-score vh-panel-score-' + tone}>
          <div className="vh-panel-score-label">{t('vh.overall')}</div>
          <div className="vh-panel-score-value">{score}<span>/100</span></div>
        </div>

        <div className="vh-panel-metric">
          <div className="vh-panel-metric-label">{t('tl.duration')}</div>
          <div className="vh-panel-metric-value">
            {formatDuration(total)}
            {tl.estimated && <span className="vh-panel-est" title={t('tl.estimatedHint')}>~</span>}
          </div>
        </div>

        <div className="vh-panel-metric">
          <div className="vh-panel-metric-label">{t('tl.scenes')}</div>
          <div className="vh-panel-metric-value">{tl.stats.scenes}</div>
        </div>

        {longCount > 0 && (
          <div className="vh-panel-metric vh-panel-metric-warn">
            <div className="vh-panel-metric-label">{t('tl.warnLong')}</div>
            <div className="vh-panel-metric-value">{longCount}</div>
          </div>
        )}

        {shortCount > 0 && (
          <div className="vh-panel-metric vh-panel-metric-warn">
            <div className="vh-panel-metric-label">{t('tl.warnShort')}</div>
            <div className="vh-panel-metric-value">{shortCount}</div>
          </div>
        )}

        {missingCount > 0 && (
          <div className="vh-panel-metric vh-panel-metric-warn">
            <div className="vh-panel-metric-label">{t('tl.warnMissing')}</div>
            <div className="vh-panel-metric-value">{missingCount}</div>
          </div>
        )}

        <Link href="/studio/saglik" className="btn btn-mini vh-panel-link">
          {t('tl.openHealth')} →
        </Link>
      </div>

      {/* Timeline Preview şeridi */}
      <TimelineStrip tl={tl} t={t} />
    </section>
  );
}

/* Şerit: her sahne süresi kadar genişlikte bir blok.
   Toplama nefes payları da katılır ki blok oranı gerçek zamanı yansıtsın. */
function TimelineStrip({ tl, t }) {
  const totalW = Math.max(0.01, tl.totalWithGap);
  const showLabels = tl.scenes.length <= 30;

  return (
    <div className="vh-strip" role="list" aria-label={t('tl.preview')}>
      {tl.scenes.map((s, i) => {
        const width = ((s.dur || 0) / totalW) * 100;
        const tone =
          s.warning === 'long' ? 'warn' :
          s.warning === 'short' ? 'tip' :
          s.warning === 'missingText' ? 'missing' :
          'ok';
        return (
          <div key={s.scene}
            role="listitem"
            className={'vh-strip-block vh-strip-' + tone}
            style={{ flexGrow: s.hasDur ? width : 1, flexBasis: s.hasDur ? 0 : 34 }}
            title={t('vh.scene', { n: s.scene }) + ' · ' +
                   (s.hasDur ? formatDuration(s.dur) : t('tl.warnMissing'))}>
            <span className="vh-strip-num">{s.scene}</span>
            {showLabels && s.hasDur && width > 4 && (
              <span className="vh-strip-time">{formatDuration(s.dur)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
