'use client';
import { useEffect, useState, useCallback } from 'react';
import { useT, useI18n } from '@/lib/i18n';
import { useStudio } from '@/lib/store';
import {
  HEALTH_CATEGORIES, SEVERITY_KEYS, healthBand, starsOf,
  projectedGain, issueCountByCategory, sortIssues
} from '@/lib/health/model';
import EpisodeBar from '@/lib/EpisodeBar';

/*
  VIDEO SAĞLIĞI EKRANI.

  Üç bölüm: özet + kategoriler, bulgular listesi, zaman çizelgesi.
  Sağda geçmiş raporlar dikey liste olarak durur — kullanıcı sürüm
  karşılaştırması yapabilir (TASK-01 "Health History").

  Yeni CSS SINIFI EKLENMEZ. Mevcut token'lar ve bileşen sınıfları
  (card, stat, hint, chip, entry-label, plan-pill) yeniden kullanılır.
  Tasarım dilini korumak yeni surface yaratmaktan önemli.
*/

export default function HealthView() {
  const t = useT();
  const { locale } = useI18n();
  const { episodeId, storyboard, profile, spendCredits } = useStudio();

  const [report, setReport] = useState(null);
  const [history, setHistory] = useState([]);
  const [running, setRunning] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [err, setErr] = useState(null);
  const [warn, setWarn] = useState(null);

  const scenes = storyboard?.scenes?.length || 0;
  const canRun = !!episodeId && scenes > 0;

  /* Geçmişi yükle - bölüm değişince sıfırlan */
  const loadHistory = useCallback(async () => {
    if (!episodeId) return;
    try {
      const res = await fetch('/api/health', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', episodeId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Geçmiş alınamadı.');
      setHistory(data.reports || []);
    } catch (e) { /* sessiz — kullanıcı analiz başlatınca yeniden denenir */ }
  }, [episodeId]);

  useEffect(() => { setReport(null); setErr(null); setWarn(null); loadHistory(); }, [episodeId, loadHistory]);

  async function run() {
    setRunning(true); setErr(null); setWarn(null);
    try {
      const res = await fetch('/api/health', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'analyze', episodeId, useAI, locale })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analiz başarısız.');
      setReport(data.report);
      if (data.creditsLeft !== null && data.creditsLeft !== undefined) spendCredits(data.creditsLeft);
      if (data.warning) setWarn(data.warning);
      await loadHistory();
    } catch (e) { setErr(e.message); }
    finally { setRunning(false); }
  }

  async function openReport(id) {
    setErr(null); setWarn(null);
    try {
      const res = await fetch('/api/health', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', reportId: id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rapor alınamadı.');
      setReport(data.report);
    } catch (e) { setErr(e.message); }
  }

  return (
    <>
      <h1 className="page-title">{t('vh.title')}</h1>
      <p className="page-sub">{t('vh.subtitle')}</p>

      <EpisodeBar />

      {!episodeId && <p className="hint">{t('vh.noEpisode')}</p>}

      {episodeId && (
        <div className="vh-layout">
          <div className="vh-main">
            {/* Çalıştırma paneli */}
            <div className="card vh-runner">
              <div className="vh-runner-opts">
                <label className={'chip' + (useAI ? ' on' : '')}>
                  <input type="checkbox" checked={useAI} onChange={e => setUseAI(e.target.checked)} />
                  {t('vh.runAI')} · {t('vh.aiCost', { n: 8 })}
                </label>
                <label className={'chip' + (!useAI ? ' on' : '')}>
                  <input type="checkbox" checked={!useAI} onChange={e => setUseAI(!e.target.checked)} />
                  {t('vh.runRules')}
                </label>
              </div>
              <button className="btn btn-primary" onClick={run} disabled={running || !canRun}>
                {running ? t('vh.running') : (report ? t('vh.rerun') : t('vh.runBtn'))}
              </button>
            </div>

            {!canRun && <p className="hint">{t('vh.emptyScenes')}</p>}
            {err && <span className="err">{err}</span>}
            {warn && <div className="admin-alert">{t('vh.aiWarn', { msg: warn })}</div>}

            {report && <ReportView report={report} t={t} />}
          </div>

          {/* Geçmiş */}
          {history.length > 0 && (
            <aside className="vh-history">
              <h2 className="entry-label">{t('vh.history')}</h2>
              <div className="vh-hist-list">
                {history.map((h, i) => (
                  <button key={h.id}
                    className={'vh-hist' + (report?.id === h.id ? ' on' : '')}
                    onClick={() => openReport(h.id)}>
                    <div className="vh-hist-top">
                      <span className="vh-hist-ver">{t('vh.version', { n: h.version })}</span>
                      {i === 0 && <span className="tag">{t('vh.newer')}</span>}
                    </div>
                    <div className="vh-hist-score">{h.overall}</div>
                    <div className="vh-hist-date">
                      {new Date(h.created_at).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB')}
                    </div>
                  </button>
                ))}
              </div>
            </aside>
          )}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function ReportView({ report, t }) {
  const band = healthBand(report.overall);
  const stars = starsOf(report.overall);
  const counts = issueCountByCategory(report.issues);
  const projected = projectedGain(report.issues, report.scores);

  return (
    <>
      {/* Genel puan + AI özeti */}
      <div className="card vh-overall">
        <div className="vh-over-left">
          <div className="entry-label">{t('vh.overall')}</div>
          <div className="vh-score">{report.overall}<span>/100</span></div>
          <div className="vh-stars" aria-label={stars + ' / 5'}>
            {'★★★★★'.split('').map((c, i) =>
              <span key={i} className={i < Math.floor(stars) ? 'on' : (i < stars ? 'half' : '')}>★</span>
            )}
          </div>
          <div className={'plan-pill vh-band vh-band-' + band.tone}>{t('vh.band.' + band.key)}</div>
        </div>
        <div className="vh-over-right">
          {report.summary && <p className="vh-summary">{report.summary}</p>}
          {report.stats?.estimated && <p className="hint">{t('vh.estimated')}</p>}
          {projected.overall > report.overall && (
            <p className="vh-projected">
              {t('vh.projected')}: <b>{projected.overall}</b>{' '}
              <span className="hint">(+{projected.overall - report.overall})</span>
            </p>
          )}
        </div>
      </div>

      {/* Kategori kartları */}
      <h2 className="entry-label">{t('vh.categories')}</h2>
      <div className="vh-cats">
        {HEALTH_CATEGORIES.map(c => {
          const v = report.scores?.[c.key];
          const has = Number.isFinite(v);
          const cnt = counts[c.key] || 0;
          const projV = projected.scores?.[c.key];
          return (
            <div key={c.key} className="card vh-cat">
              <div className="vh-cat-name">{t('vh.cat.' + c.key)}</div>
              <div className="vh-cat-score">
                {has ? v : '—'}
                {has && projV > v && <span className="vh-cat-proj">→ {projV}</span>}
              </div>
              <div className="vh-cat-bar" aria-hidden="true">
                <i style={{ width: (has ? v : 0) + '%' }} />
              </div>
              {cnt > 0 && <div className="vh-cat-count">{cnt}</div>}
            </div>
          );
        })}
      </div>

      {/* Bulgular */}
      <h2 className="entry-label">{t('vh.issues')}</h2>
      {report.issues.length === 0 ? (
        <p className="hint">{t('vh.noIssues')}</p>
      ) : (
        <div className="vh-issues">
          {sortIssues(report.issues).map(i => (
            <div key={i.id} className={'card vh-issue vh-sev-' + i.severity}>
              <div className="vh-issue-head">
                <span className={'vh-sev vh-sev-tag-' + i.severity}>{t('vh.sev.' + i.severity)}</span>
                <span className="vh-issue-cat">{t('vh.cat.' + i.category)}</span>
                {i.scene && <span className="vh-issue-scene">{t('vh.scene', { n: i.scene })}</span>}
              </div>
              <div className="vh-issue-title">{i.title}</div>
              <p className="vh-issue-detail">{i.detail}</p>
              {i.aiNote && (
                <p className="vh-issue-ai">
                  <span className="entry-label" style={{ margin: 0 }}>{t('vh.aiNote')}</span>
                  {i.aiNote}
                </p>
              )}
              <div className="vh-issue-rec">
                <div className="entry-label" style={{ margin: '0 0 4px' }}>{t('vh.recommendation')}</div>
                {i.recommendation}
                {i.gain > 0 && <span className="vh-issue-gain">{t('vh.gain', { n: i.gain })}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Zaman çizelgesi */}
      {report.timeline?.length > 0 && (
        <>
          <h2 className="entry-label">{t('vh.timeline')}</h2>
          <div className="vh-tl">
            {report.timeline.map(s => (
              <div key={s.scene} className={'vh-tl-scene vh-tl-r' + s.rating}>
                <div className="vh-tl-scene-head">
                  <span>{t('vh.scene', { n: s.scene })}</span>
                  <span className="vh-tl-stars">
                    {'★★★★★'.split('').map((c, i) => <span key={i} className={i < s.rating ? 'on' : ''}>★</span>)}
                  </span>
                </div>
                <div className="vh-tl-note">{s.note}</div>
                <div className="vh-tl-meta">{fmtTime(s.at)} → {fmtTime(s.end)} · {s.dur.toFixed(1)}s</div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function fmtTime(sec) {
  if (!Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}
