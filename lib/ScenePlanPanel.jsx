'use client';
import { useState, useCallback } from 'react';
import { useT, useI18n } from '@/lib/i18n';
import { SCENE_TYPES, TRANSITIONS } from '@/lib/scene/plan';
import { formatDuration } from '@/lib/timeline';

/*
  SAHNE PLANI PANELİ — Sprint 4 / TASK-04, Adım 3.

  Storyboard sayfasında Video Health panelinin altında durur.
  Kapalı başlar: kullanıcı isteyince açılır, sayfayı boğmaz.

  Üç yaratıcı modu (spec):
    beginner     → AI karar verir, tüm plan uygulanır
    advanced     → kullanıcı önerileri tek tek seçer
    professional → hiçbiri otomatik uygulanmaz, AI yalnızca önerir

  Mod seçimi sunucuya `selection` olarak gider:
    beginner     → selection yok
    advanced     → kullanıcının işaretledikleri
    professional → boş seçim

  DÜRÜSTLÜK NOTU:
    Geçiş önerileri gösterilir ama render motoru şu an crossfade'i
    yalnızca GLOBAL seçenek olarak destekliyor; sahne başına geçiş
    uygulanmıyor. Arayüz bunu açıkça söyler — kullanıcı uygulandığını
    sanmasın.
*/

const MODES = ['beginner', 'advanced', 'professional'];

export default function ScenePlanPanel({ episodeId, storyboard, onApplied, spendCredits }) {
  const t = useT();
  const { locale } = useI18n();

  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState(null);
  const [mode, setMode] = useState('advanced');
  const [busy, setBusy] = useState(null);          // 'plan' | 'refine' | 'apply'
  const [err, setErr] = useState(null);
  const [warn, setWarn] = useState(null);
  const [note, setNote] = useState(null);
  const [pickSplits, setPickSplits] = useState([]);   // sahne numaraları
  const [pickMerges, setPickMerges] = useState([]);   // "a-b" anahtarları
  const [history, setHistory] = useState([]);        // uygulanmış planlar

  const scenes = storyboard?.scenes?.length || 0;

  async function call(action, extra) {
    setBusy(action); setErr(null); setWarn(null);
    try {
      const res = await fetch('/api/scene', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, episodeId, locale, ...(extra || {}) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('sp.failed'));
      return data;
    } catch (e) { setErr(e.message); return null; }
    finally { setBusy(null); }
  }

  const loadHistory = useCallback(async () => {
    const data = await call('history');
    if (data) setHistory(data.history || []);
  }, [episodeId]);

  const loadPlan = useCallback(async () => {
    const data = await call('plan');
    if (!data) return;
    setPlan(data.plan);
    setNote(null);
    // Varsayılan seçim: tüm öneriler işaretli (advanced modda kolaylık)
    setPickSplits(data.plan.splits.filter(s => s.pieces).map(s => s.scene));
    setPickMerges(data.plan.merges.map(m => m.scenes.join('-')));
    loadHistory();
  }, [episodeId, locale, loadHistory]);

  async function refine() {
    const data = await call('refine');
    if (!data) return;
    setPlan(data.plan);
    setNote(data.note || null);
    if (data.warning) setWarn(data.warning);
    if (data.creditsLeft !== null && data.creditsLeft !== undefined) spendCredits?.(data.creditsLeft);
    // İyileştirme sonrası seçimi tazele
    setPickSplits(data.plan.splits.filter(s => s.pieces).map(s => s.scene));
    setPickMerges(data.plan.merges.map(m => m.scenes.join('-')));
  }

  async function apply() {
    /* Mod seçimi selection'a çevrilir. Professional modda hiçbir şey
       uygulanmaz — kullanıcı planı okuyup elle çalışır. */
    let selection = null;
    if (mode === 'professional') {
      selection = { splits: [], merges: [] };
    } else if (mode === 'advanced') {
      selection = {
        splits: pickSplits,
        merges: pickMerges.map(k => k.split('-').map(Number))
      };
    }

    const data = await call('apply', { plan, selection, mode, aiNote: note || '' });
    if (!data) return;
    /* Sunucu storyboard'u yazdı. İstemcinin durumunu HEMEN eşitle:
       otomatik kayıt döngüsü eski haliyle üzerine yazmasın. */
    if (Array.isArray(data.nextScenes)) onApplied?.(data.nextScenes);
    setPlan(data.plan);
    setWarn(data.needsVoiceWork ? t('sp.voiceWarn') : null);
    setNote(t('sp.applied', { a: data.before, b: data.scenes }));
    setPickSplits(data.plan.splits.filter(s => s.pieces).map(s => s.scene));
    setPickMerges(data.plan.merges.map(m => m.scenes.join('-')));
  }

  if (!episodeId || scenes === 0) return null;

  const splittable = plan?.splits?.filter(s => s.pieces) || [];
  const unsplittable = plan?.splits?.filter(s => !s.pieces) || [];
  const nothingToDo = plan && !splittable.length && !plan.merges.length;
  const canApply = mode !== 'professional' &&
    (mode === 'beginner' || pickSplits.length > 0 || pickMerges.length > 0);

  return (
    <section className="sp-panel" aria-label={t('sp.title')}>
      <button className="sp-head" onClick={() => { setOpen(!open); if (!plan) loadPlan(); }}
        aria-expanded={open}>
        <span className="sp-head-title">{t('sp.title')}</span>
        {plan && (
          <span className="sp-head-summary">
            {plan.current.scenes} → <b>{plan.recommended.scenes}</b> {t('sp.scenesUnit')}
          </span>
        )}
        <span className="sp-head-caret" aria-hidden="true">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="sp-body">
          {busy === 'plan' && !plan && <p className="hint">{t('sp.loading')}</p>}
          {err && <span className="err">{err}</span>}

          {plan && (
            <>
              {/* Özet — spec'in beklediği cümle */}
              <p className="sp-verdict">
                {nothingToDo
                  ? t('sp.balanced', { n: plan.current.scenes })
                  : t('sp.verdict', { n: plan.recommended.scenes })}
              </p>
              <div className="sp-metrics">
                <Metric label={t('sp.avgDur')} value={plan.recommended.avgDur + 's'} />
                <Metric label={t('sp.totalDur')} value={formatDuration(plan.recommended.total)}
                  hint={plan.estimated ? t('sp.estimated') : null} />
                <Metric label={t('sp.toSplit')} value={splittable.length} warn={splittable.length > 0} />
                <Metric label={t('sp.toMerge')} value={plan.merges.length} warn={plan.merges.length > 0} />
              </div>

              {note && <p className="sp-note">{note}</p>}
              {warn && <div className="admin-alert">{warn}</div>}

              {/* Mod seçimi */}
              <div className="sp-modes">
                <div className="entry-label" style={{ margin: '0 0 6px' }}>{t('sp.mode')}</div>
                <div className="chips">
                  {MODES.map(m => (
                    <button key={m} className={'chip' + (mode === m ? ' on' : '')}
                      onClick={() => setMode(m)}>{t('sp.mode.' + m)}</button>
                  ))}
                </div>
                <p className="hint">{t('sp.modeHint.' + mode)}</p>
              </div>

              {/* Bölme önerileri */}
              {splittable.length > 0 && (
                <div className="sp-group">
                  <div className="entry-label">{t('sp.splits')}</div>
                  {splittable.map(s => {
                    const picked = pickSplits.includes(s.scene);
                    return (
                      <div key={s.scene} className={'sp-item' + (picked ? ' on' : '')}>
                        <label className="sp-item-head">
                          {mode === 'advanced' && (
                            <input type="checkbox" checked={picked}
                              onChange={e => setPickSplits(
                                e.target.checked
                                  ? [...pickSplits, s.scene]
                                  : pickSplits.filter(x => x !== s.scene))} />
                          )}
                          <span className="sp-item-scene">{t('sp.scene', { n: s.scene })}</span>
                          <span className={'sp-type sp-type-' + s.type}>{t('sp.type.' + s.type)}</span>
                          <span className="sp-item-dur">{s.dur}s → {s.pieces.length} {t('sp.pieces')}</span>
                          {s.refinedByAI && <span className="tag tag-admin">AI</span>}
                        </label>
                        <div className="sp-pieces">
                          {s.pieces.map((p, i) => (
                            <div className="sp-piece" key={i}>
                              <span className="sp-piece-dur">{p.dur}s</span>
                              <span className="sp-piece-text">{p.text}</span>
                            </div>
                          ))}
                        </div>
                        {s.stillLong > 0 && (
                          <p className="hint">{t('sp.stillLong', { n: s.stillLong })}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bölünemeyen sahneler */}
              {unsplittable.length > 0 && (
                <div className="sp-group">
                  <div className="entry-label">{t('sp.cantSplit')}</div>
                  {unsplittable.map(s => (
                    <p className="hint" key={s.scene}>
                      {t('sp.scene', { n: s.scene })} ({s.dur}s) — {t('sp.cantSplitWhy')}
                    </p>
                  ))}
                </div>
              )}

              {/* Birleşme önerileri */}
              {plan.merges.length > 0 && (
                <div className="sp-group">
                  <div className="entry-label">{t('sp.merges')}</div>
                  {plan.merges.map(m => {
                    const key = m.scenes.join('-');
                    const picked = pickMerges.includes(key);
                    return (
                      <label key={key} className={'sp-item sp-item-row' + (picked ? ' on' : '')}>
                        {mode === 'advanced' && (
                          <input type="checkbox" checked={picked}
                            onChange={e => setPickMerges(
                              e.target.checked
                                ? [...pickMerges, key]
                                : pickMerges.filter(x => x !== key))} />
                        )}
                        <span className="sp-item-scene">
                          {t('sp.scene', { n: m.scenes[0] })} + {t('sp.scene', { n: m.scenes[1] })}
                        </span>
                        <span className="sp-item-dur">
                          {m.durs.join('s + ')}s → {m.combined}s
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Geçiş önerileri — render notu ile birlikte */}
              {plan.transitions.length > 0 && (
                <div className="sp-group">
                  <div className="entry-label">{t('sp.transitions')}</div>
                  <div className="sp-trans">
                    {plan.transitions.map(tr => (
                      <span className="sp-tran" key={tr.from + '-' + tr.to}
                        title={t('sp.scene', { n: tr.from }) + ' → ' + t('sp.scene', { n: tr.to })}>
                        {tr.from}→{tr.to}: <b>{t('sp.tran.' + tr.transition)}</b>
                        {tr.refinedByAI && ' ✦'}
                      </span>
                    ))}
                  </div>
                  {/* Dürüstlük: motor bunları henüz uygulamıyor */}
                  <p className="hint">{t('sp.transNote')}</p>
                </div>
              )}

              {/* Geçmiş — uygulanmış planlar, geri alınabilir */}
              {history.length > 0 && (
                <div className="sp-group">
                  <div className="entry-label">{t('sp.history')}</div>
                  <div className="sp-hist">
                    {history.map(h => (
                      <div className="sp-hist-row" key={h.id}>
                        <span className="sp-hist-ver">{t('sp.version', { n: h.version })}</span>
                        <span className="sp-hist-change">
                          {h.scenes_before} → {h.scenes_after}
                        </span>
                        <span className="sp-hist-mode">{t('sp.mode.' + h.mode)}</span>
                        {h.source === 'rules+ai' && <span className="tag tag-admin">AI</span>}
                        <span className="sp-hist-date">
                          {new Date(h.created_at).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB')}
                        </span>
                        {h.canUndo ? (
                          <button className="btn btn-mini" disabled={!!busy}
                            onClick={() => undo(h.id)}>{t('sp.undo')}</button>
                        ) : (
                          <span className="hint">{t('sp.undone2')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Eylemler */}
              <div className="sp-actions">
                <button className="btn btn-mini" onClick={loadPlan} disabled={!!busy}>
                  {busy === 'plan' ? t('sp.loading') : t('sp.recalc')}
                </button>
                <button className="btn btn-mini" onClick={refine}
                  disabled={!!busy || !splittable.length}
                  title={!splittable.length ? t('sp.noRefine') : undefined}>
                  {busy === 'refine' ? t('sp.refining') : t('sp.refine') + ' · ' + t('sp.cost', { n: 7 })}
                </button>
                <button className="btn btn-primary btn-mini" onClick={apply}
                  disabled={!!busy || !canApply || nothingToDo}
                  title={mode === 'professional' ? t('sp.modeHint.professional') : undefined}>
                  {busy === 'apply' ? t('sp.applying') : t('sp.apply')}
                </button>
              </div>
              <p className="hint">{t('sp.applyWarn')}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, warn, hint }) {
  return (
    <div className={'sp-metric' + (warn ? ' sp-metric-warn' : '')}>
      <div className="sp-metric-label">{label}</div>
      <div className="sp-metric-value">{value}</div>
      {hint && <div className="sp-metric-hint">{hint}</div>}
    </div>
  );
}
