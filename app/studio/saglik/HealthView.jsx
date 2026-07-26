'use client';
import { useEffect, useState, useCallback } from 'react';
import { useT, useI18n } from '@/lib/i18n';
import { useStudio } from '@/lib/store';
import {
  HEALTH_CATEGORIES, SEVERITY_KEYS, healthBand, starsOf,
  projectedGain, issueCountByCategory, sortIssues, groupIssues
} from '@/lib/health/model';
import { NARRATIVE_PHASES } from '@/lib/health/vocab';
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
  const [rewrite, setRewrite] = useState(null);     // öneri sonucu
  const [rewriting, setRewriting] = useState(false);

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

  /* Hikâye yeniden yazımı — öner. KAYDETMEZ, kullanıcı onaylar. */
  async function suggestRewrite() {
    setRewriting(true); setErr(null); setWarn(null);
    try {
      const res = await fetch('/api/health', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rewrite', episodeId, locale })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('sh.rewriteFail'));
      if (data.error) { setWarn(data.error); return; }   // nothing_to_fix
      setRewrite(data);
      if (data.creditsLeft !== null && data.creditsLeft !== undefined) spendCredits(data.creditsLeft);
    } catch (e) { setErr(e.message); }
    finally { setRewriting(false); }
  }

  /* Onayla: metni storyboard'a yaz. */
  async function applyRewrite() {
    setRewriting(true); setErr(null);
    try {
      const res = await fetch('/api/health', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'applyRewrite', episodeId,
          scenes: rewrite.scenes, rewriteId: rewrite.rewriteId
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('sh.applyFail'));
      setReport(data.report);
      setRewrite(null);
      setWarn(data.needsVoiceRerecord ? t('sh.voiceWarn') : null);
      await loadHistory();
    } catch (e) { setErr(e.message); }
    finally { setRewriting(false); }
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

            {report && (
              <ReportView report={report} t={t}
                rewrite={rewrite}
                rewriting={rewriting}
                onSuggest={suggestRewrite}
                onApply={applyRewrite}
                onDiscard={() => setRewrite(null)} />
            )}
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

function ReportView({ report, t, rewrite, rewriting, onSuggest, onApply, onDiscard }) {
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

          {/* Tür bilgisi: aynı metin farklı türde farklı değerlendirilir.
              Kullanıcı hangi kurallarla ölçüldüğünü görsün. */}
          {report.genre?.family && (
            <p className="hint">
              {t('sh.evaluatedAs', {
                g: report.genre.label || '—',
                f: report.genre.familyLabel?.tr || report.genre.family
              })}
            </p>
          )}

          {/* Kapsam: puan kaç kategoriyi gerçekten ölçtü?
              Eksik kalan boyut varsa kullanıcı bunu bilmeli — yoksa
              kısa hikâyenin yüksek puanını tam sanır. */}
          {report.coverage && !report.coverage.complete && (
            <p className="vh-coverage">
              {t('sh.coverage', {
                m: report.coverage.measured?.length ?? 0,
                n: report.coverage.total ?? 9,
                p: Math.round((report.coverage.weightCovered ?? 0) * 100)
              })}
              {report.coverage.missing?.length > 0 && (
                <span className="hint">
                  {' '}({report.coverage.missing.map(k => t('vh.cat.' + k)).join(', ')})
                </span>
              )}
            </p>
          )}

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

      {/* Anlatı yayı: evre haritası + duygu eğrisi.
          İkisi aynı zaman ekseninde okunmalı, bu yüzden yan yana. */}
      {report.narrative?.measurable && report.narrative.phases?.length > 0 && (
        <>
          <h2 className="entry-label">{t('sh.arc')}</h2>
          <div className="card sh-arc">
            <PhaseStrip phases={report.narrative.phases}
              climax={report.narrative.climax} t={t} />
            {report.emotionCurve?.length > 1 && (
              <EmotionCurve curve={report.emotionCurve} t={t} />
            )}
          </div>
        </>
      )}

      {/* Tutundurma tahmini — TAHMİN olarak işaretli */}
      {report.retention?.buckets?.length > 0 && (
        <>
          <h2 className="entry-label">{t('sh.retention')}</h2>
          <div className="card sh-ret">
            <p className="hint sh-ret-disclaimer">{t('sh.retDisclaimer')}</p>
            <div className="sh-ret-buckets">
              {report.retention.buckets.map(b => (
                <div className="sh-ret-bucket" key={b.from}>
                  <div className="sh-ret-range">
                    {fmtTime(b.from)}–{fmtTime(b.to)}
                  </div>
                  <div className="sh-ret-bar">
                    <i style={{ width: b.pct + '%' }} />
                  </div>
                  <div className="sh-ret-pct">~{b.pct}%</div>
                </div>
              ))}
            </div>
            {report.retention.dropPoints?.length > 0 && (
              <div className="sh-drops">
                <div className="entry-label" style={{ margin: '12px 0 6px' }}>
                  {t('sh.dropPoints')}
                </div>
                {report.retention.dropPoints.map(d => (
                  <div className={'sh-drop sh-drop-' + d.severity} key={d.scene}>
                    <span className="sh-drop-scene">{t('vh.scene', { n: d.scene })}</span>
                    <span className="sh-drop-dur">{d.dur}s</span>
                    <span className="sh-drop-why">
                      {d.reasons.map(r => t('sh.drop.' + r)).join(' · ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="hint">
              {t('sh.confidence')}: {t('sh.conf.' + (report.retention.confidence || 'low'))}
            </p>
          </div>
        </>
      )}

      {/* Bulgular */}
      <h2 className="entry-label">{t('vh.issues')}</h2>
      {report.issues.length === 0 ? (
        <p className="hint">{t('vh.noIssues')}</p>
      ) : (
        <div className="vh-issues">
          {/* Tekrarlayan bulgular gruplanır: 20 sahnede aynı sorun varsa
              20 satır yerine tek satır + sahne listesi. Farklı bulgular
              tekrarların altında kaybolmasın. */}
          {groupIssues(report.issues).map(g => {
            /* AI notu sahne bazlı geliyor; grubun ilk örneğinden alınır */
            const first = report.issues.find(i => i.code === g.code);
            return (
              <div key={g.code} className={'card vh-issue vh-sev-' + g.severity}>
                <div className="vh-issue-head">
                  <span className={'vh-sev vh-sev-tag-' + g.severity}>{t('vh.sev.' + g.severity)}</span>
                  <span className="vh-issue-cat">{t('vh.cat.' + g.category)}</span>
                  {g.count > 1 ? (
                    <span className="vh-issue-scene">
                      {t('sh.sceneCount', { n: g.count })}
                      {g.scenes.length > 0 && ' — ' + g.scenes.join(', ')}
                    </span>
                  ) : g.scenes.length === 1 ? (
                    <span className="vh-issue-scene">{t('vh.scene', { n: g.scenes[0] })}</span>
                  ) : null}
                </div>
                <div className="vh-issue-title">{g.title}</div>
                <p className="vh-issue-detail">{g.detail}</p>
                {first?.aiNote && (
                  <p className="vh-issue-ai">
                    <span className="entry-label" style={{ margin: 0 }}>{t('vh.aiNote')}</span>
                    {first.aiNote}
                  </p>
                )}
                <div className="vh-issue-rec">
                  <div className="entry-label" style={{ margin: '0 0 4px' }}>{t('vh.recommendation')}</div>
                  {g.recommendation}
                  {g.gain > 0 && <span className="vh-issue-gain">{t('vh.gain', { n: g.gain })}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Hikâye yeniden yazımı */}
      <h2 className="entry-label">{t('sh.rewrite')}</h2>
      <div className="card sh-rewrite">
        {!rewrite ? (
          <>
            <p className="hint">{t('sh.rewriteHint')}</p>
            <button className="btn btn-primary btn-mini" onClick={onSuggest} disabled={rewriting}>
              {rewriting ? t('sh.rewriting') : t('sh.rewriteBtn') + ' · ' + t('sh.cost', { n: 12 })}
            </button>
          </>
        ) : (
          <RewriteCompare r={rewrite} t={t} busy={rewriting}
            onApply={onApply} onDiscard={onDiscard} />
        )}
      </div>

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

/* Before / after karşılaştırma + onay.
   Puanlar AI'nin iddiası değil: yeni metin aynı kural motorundan
   geçirilerek bağımsız ölçüldü. */
function RewriteCompare({ r, t, busy, onApply, onDiscard }) {
  const delta = (r.after?.overall || 0) - (r.before?.overall || 0);
  return (
    <>
      <div className="sh-rw-head">
        <div className="sh-rw-side">
          <div className="sh-rw-label">{t('sh.before')}</div>
          <div className="sh-rw-score">{r.before?.overall ?? '—'}</div>
        </div>
        <div className="sh-rw-arrow" aria-hidden="true">→</div>
        <div className="sh-rw-side sh-rw-after">
          <div className="sh-rw-label">{t('sh.after')}</div>
          <div className="sh-rw-score">{r.after?.overall ?? '—'}</div>
        </div>
        {delta > 0 && <div className="sh-rw-delta">+{delta}</div>}
      </div>

      {r.changeNote && <p className="sh-rw-note">{r.changeNote}</p>}
      {r.issuesFixed > 0 && <p className="hint">{t('sh.fixed', { n: r.issuesFixed })}</p>}
      {r.needsVoiceRerecord && <div className="admin-alert">{t('sh.voiceWarn')}</div>}

      <div className="sh-rw-scenes">
        {r.scenes.map(sc => (
          <div className="sh-rw-scene" key={sc.scene}>
            <div className="sh-rw-scene-no">{t('vh.scene', { n: sc.scene })}</div>
            <div className="sh-rw-scene-text">{sc.paragraph}</div>
          </div>
        ))}
      </div>

      {/* Reddedilen öneriler: AI kuralları çiğnediyse kullanıcı bilsin */}
      {r.rejected?.length > 0 && (
        <p className="hint">{t('sh.rejected', { n: r.rejected.length })}</p>
      )}

      <div className="sh-rw-actions">
        <button className="btn btn-primary btn-mini" onClick={onApply} disabled={busy}>
          {busy ? t('sh.applying') : t('sh.apply')}
        </button>
        <button className="btn btn-mini" onClick={onDiscard} disabled={busy}>
          {t('sh.discard')}
        </button>
      </div>
    </>
  );
}

/* Anlatı evre şeridi: her sahne bir blok, evresine göre renkli.
   Doruk noktası ayrıca işaretlenir. */
function PhaseStrip({ phases, climax, t }) {
  return (
    <div className="sh-phases" role="list" aria-label={t('sh.arc')}>
      {phases.map(p => {
        const isClimax = climax && climax.scene === p.scene;
        return (
          <div key={p.scene} role="listitem"
            className={'sh-phase sh-phase-' + p.phase + (isClimax ? ' sh-phase-peak' : '')}
            title={t('vh.scene', { n: p.scene }) + ' · ' + t('sh.phase.' + p.phase)}>
            <span className="sh-phase-n">{p.scene}</span>
            <span className="sh-phase-label">{t('sh.phase.' + p.phase)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* Duygu eğrisi: değerlik −1..+1 arası, orta çizgi nötr.
   SVG çünkü eğri sürekli okunmalı — bar grafiği yön hissini vermez. */
function EmotionCurve({ curve, t }) {
  const W = 100, H = 40, mid = H / 2;
  const step = curve.length > 1 ? W / (curve.length - 1) : W;

  const pts = curve.map((c, i) => {
    const x = i * step;
    const y = mid - (c.valence || 0) * (mid - 3);
    return [x, y];
  });

  const path = pts.map(([x, y], i) => (i === 0 ? 'M' : 'L') + x.toFixed(2) + ' ' + y.toFixed(2)).join(' ');
  const area = path + ' L' + W + ' ' + mid + ' L0 ' + mid + ' Z';

  return (
    <div className="sh-curve">
      <div className="entry-label" style={{ margin: '14px 0 6px' }}>{t('sh.curve')}</div>
      <svg viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none"
        className="sh-curve-svg" role="img" aria-label={t('sh.curve')}>
        <line x1="0" y1={mid} x2={W} y2={mid} className="sh-curve-mid" />
        <path d={area} className="sh-curve-area" />
        <path d={path} className="sh-curve-line" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.1"
            className={'sh-curve-dot' + (curve[i].valence < 0 ? ' down' : '')} />
        ))}
      </svg>
      <div className="sh-curve-axis">
        <span>{t('sh.negative')}</span>
        <span>{t('sh.positive')}</span>
      </div>
    </div>
  );
}

function fmtTime(sec) {
  if (!Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}
