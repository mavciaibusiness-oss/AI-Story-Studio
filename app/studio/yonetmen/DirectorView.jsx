'use client';
import { useState, useCallback, useEffect } from 'react';
import { useT, useI18n } from '@/lib/i18n';
import { useStudio } from '@/lib/store';
import { DIRECTOR_KINDS, KIND_KEYS } from '@/lib/director/model';
import { formatDuration } from '@/lib/timeline';
import EpisodeBar from '@/lib/EpisodeBar';

/*
  AI DIRECTOR EKRANI — Sprint 4 / TASK-06, Adım 3.

  Spec'in "Creator Interaction" bölümü: her öneride Uygula / Yoksay /
  Açıkla. Yaratıcı son sözü söyler.

  ÜÇ TASARIM KARARI:

  1. OTOMATİK OLMAYAN ÖNERİDE "UYGULA" DÜĞMESİ YOK.
     Ses hızı değiştirmek ya da yeni görsel üretmek kullanıcının kendi
     işi. Düğme gösterip tıklayınca hiçbir şey olmaması güven kaybıdır.
     Onun yerine "elle yapılacak" rozeti ve nereye gideceği yazıyor.

  2. YOKSAY KALICI DEĞİL, OTURUMLUK.
     Kullanıcı bir öneriyi yoksayınca listeden çıkıyor ama veritabanına
     yazılmıyor — o Adım 4'ün işi. Şu an sayfayı yenileyince geri gelir
     ve arayüz bunu söylüyor. Kalıcı sanıp sonra şaşırmasın.

  3. GÜVEN YÜZDE OLARAK DEĞİL, YILDIZ VE SÖZLE.
     Motor 0.63 gibi bir sayı üretiyor ama "%63 emin" demek uydurma
     kesinlik hissi verir. Yıldız + "yüksek/orta/düşük" daha dürüst.
*/

export default function DirectorView() {
  const t = useT();
  const { locale } = useI18n();
  const { episodeId, storyboard, setStoryboard, spendCredits } = useStudio();

  const [dir, setDir] = useState(null);
  const [busy, setBusy] = useState(null);        // 'direct' | 'explain' | id
  const [err, setErr] = useState(null);
  const [warn, setWarn] = useState(null);
  const [ignoredIds, setIgnoredIds] = useState([]);  // sunucuda kalıcı
  const [history, setHistory] = useState(null);      // uygulanmış öneriler
  const [showHistory, setShowHistory] = useState(false);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('list');      // 'list' | 'timeline'

  const scenes = storyboard?.scenes?.length || 0;

  async function call(action, extra) {
    setBusy(extra?.id || action); setErr(null);
    try {
      const res = await fetch('/api/director', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, episodeId, locale, ...(extra || {}) })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('dr.failed'));
      return data;
    } catch (e) { setErr(e.message); return null; }
    finally { setBusy(null); }
  }

  const loadHistory = useCallback(async () => {
    const data = await call('history');
    if (data) setHistory(data);
  }, [episodeId]);

  const load = useCallback(async () => {
    const data = await call('direct');
    if (!data) return;
    setDir(data.director);
    setIgnoredIds(data.ignoredIds || []);
    setWarn(null);
    loadHistory();
  }, [episodeId, locale, loadHistory]);

  useEffect(() => {
    setDir(null); setIgnoredIds([]); setHistory(null); setErr(null);
  }, [episodeId]);

  /* Yoksayma artık SUNUCUDA kalıcı. Kaydedilemezse kullanıcıya
     söylüyoruz — yoksaydığını sanıp sayfayı yenileyince geri
     gelmesine şaşırmasın. */
  async function ignore(id) {
    const data = await call('ignore', { id });
    if (!data) return;
    setDir(data.director);
    setIgnoredIds(data.ignoredIds || []);
  }

  async function unignoreAll() {
    const data = await call('unignore', { ids: ignoredIds });
    if (!data) return;
    setDir(data.director);
    setIgnoredIds(data.ignoredIds || []);
  }

  async function undo(actionId) {
    const data = await call('undo', { actionId });
    if (!data) return;
    if (Array.isArray(data.nextScenes)) {
      setStoryboard(prev => ({ ...prev, scenes: data.nextScenes }));
    }
    setDir(data.director);
    setWarn(t('dr.undone'));
    loadHistory();
  }

  async function explain(id) {
    const data = await call('explain', { ids: [id] });
    if (!data) return;
    setDir(data.director);
    if (data.creditsLeft !== null && data.creditsLeft !== undefined) spendCredits(data.creditsLeft);
  }

  async function apply(id) {
    const data = await call('apply', { id });
    if (!data) return;
    /* Sunucu storyboard'u yazdı; istemci durumunu HEMEN eşitle ki
       otomatik kayıt eski haliyle üzerine yazmasın. */
    if (Array.isArray(data.nextScenes)) {
      setStoryboard(prev => ({ ...prev, scenes: data.nextScenes }));
    }
    setDir(data.director);
    setWarn(t('dr.applied'));
    loadHistory();
  }

  async function applyAll() {
    const ids = visible.filter(r => r.auto).map(r => r.id);
    if (!ids.length) return;
    const data = await call('applyMany', { ids });
    if (!data) return;
    if (Array.isArray(data.nextScenes)) {
      setStoryboard(prev => ({ ...prev, scenes: data.nextScenes }));
    }
    setDir(data.director);
    setWarn(t('dr.appliedMany', { n: data.applied.length, s: data.skipped?.length || 0 }));
    loadHistory();
  }

  if (!episodeId) {
    return (
      <>
        <h1 className="page-title">{t('dr.title')}</h1>
        <p className="page-sub">{t('dr.sub')}</p>
        <EpisodeBar />
        <p className="hint">{t('dr.noEpisode')}</p>
      </>
    );
  }

  /* Sunucu yoksayılanları zaten eledi; burada yalnızca tür filtresi. */
  const all = dir?.recommendations || [];
  const visible = all.filter(r => filter === 'all' || r.kind === filter);
  const autoCount = visible.filter(r => r.auto).length;

  return (
    <>
      <h1 className="page-title">{t('dr.title')}</h1>
      <p className="page-sub">{t('dr.sub')}</p>
      <EpisodeBar />

      {scenes === 0 && <p className="hint">{t('dr.noScenes')}</p>}

      {scenes > 0 && !dir && (
        <div className="card dr-start">
          <p className="hint">{t('dr.startHint')}</p>
          <button className="btn btn-primary" onClick={load} disabled={busy === 'direct'}>
            {busy === 'direct' ? t('dr.thinking') : t('dr.start')}
          </button>
        </div>
      )}

      {err && <span className="err">{err}</span>}
      {warn && <p className="dr-note">{warn}</p>}

      {dir && (
        <>
          <Summary dir={dir} t={t} />

          {/* Filtre + görünüm */}
          <div className="dr-bar">
            <div className="chips">
              <button className={'chip' + (filter === 'all' ? ' on' : '')}
                onClick={() => setFilter('all')}>
                {t('dr.all')} ({all.length})
              </button>
              {KIND_KEYS.filter(k => (dir.summary.byKind[k] || 0) > 0).map(k => (
                <button key={k} className={'chip' + (filter === k ? ' on' : '')}
                  onClick={() => setFilter(k)}>
                  {t('dr.kind.' + k)} ({dir.summary.byKind[k]})
                </button>
              ))}
            </div>
            <span style={{ flex: 1 }} />
            <div className="chips">
              <button className={'chip' + (view === 'list' ? ' on' : '')}
                onClick={() => setView('list')}>{t('dr.viewList')}</button>
              <button className={'chip' + (view === 'timeline' ? ' on' : '')}
                onClick={() => setView('timeline')}>{t('dr.viewTimeline')}</button>
            </div>
          </div>

          <div className="dr-actions">
            <button className="btn btn-mini" onClick={load} disabled={!!busy}>
              {busy === 'direct' ? t('dr.thinking') : t('dr.recalc')}
            </button>
            {autoCount > 0 && (
              <button className="btn btn-primary btn-mini" onClick={applyAll} disabled={!!busy}>
                {t('dr.applyAll', { n: autoCount })}
              </button>
            )}
            {ignoredIds.length > 0 && (
              <button className="btn btn-mini" onClick={unignoreAll} disabled={!!busy}>
                {t('dr.restoreIgnored', { n: ignoredIds.length })}
              </button>
            )}
            {history?.actions?.length > 0 && (
              <button className="btn btn-mini" onClick={() => setShowHistory(!showHistory)}>
                {t('dr.history')} ({history.actions.length})
              </button>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="hint">{all.length === 0 ? t('dr.clean') : t('dr.allFiltered')}</p>
          ) : view === 'timeline' ? (
            <DirectorTimeline recs={visible} t={t} onExplain={explain}
              onApply={apply} onIgnore={ignore} busy={busy} />
          ) : (
            <div className="dr-list">
              {visible.map(r => (
                <RecCard key={r.id} r={r} t={t} busy={busy}
                  onExplain={() => explain(r.id)}
                  onApply={() => apply(r.id)}
                  onIgnore={() => ignore(r.id)} />
              ))}
            </div>
          )}

          {ignoredIds.length > 0 && <p className="hint">{t('dr.ignoredPersisted', { n: ignoredIds.length })}</p>}

          {/* Uygulanan öneriler — geri alınabilir */}
          {showHistory && history?.actions?.length > 0 && (
            <>
              <h2 className="entry-label" style={{ marginTop: 20 }}>{t('dr.history')}</h2>
              <div className="dr-hist">
                {history.actions.map(a => (
                  <div className="dr-hist-row" key={a.id}>
                    <span className={'dr-hist-status dr-hist-' + a.status}>
                      {t('dr.status.' + a.status)}
                    </span>
                    <span className="dr-hist-title">{a.rec_title}</span>
                    <span className="dr-hist-date">
                      {new Date(a.created_at).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB')}
                    </span>
                    {a.status === 'applied' && a.canUndo ? (
                      <button className="btn btn-mini" disabled={!!busy}
                        onClick={() => undo(a.id)}>{t('dr.undo')}</button>
                    ) : a.status === 'applied' ? (
                      <span className="hint">{t('dr.noUndo')}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function Summary({ dir, t }) {
  const p = dir.projected;
  return (
    <div className="card dr-summary">
      <div className="dr-sum-scores">
        <div className="dr-sum-side">
          <div className="dr-sum-label">{t('dr.current')}</div>
          <div className="dr-sum-score">{p.current}</div>
        </div>
        <div className="dr-sum-arrow" aria-hidden="true">→</div>
        <div className="dr-sum-side dr-sum-after">
          <div className="dr-sum-label">{t('dr.expected')}</div>
          <div className="dr-sum-score">{p.expected}</div>
        </div>
        {p.gain > 0 && <div className="dr-sum-delta">+{p.gain}</div>}
      </div>

      {/* Dürüstlük: bu bir tahmin, hem de üst sınırlı bir tahmin.
          Ham bulgu toplamı ile gerçekçi beklenti farklıysa söyle. */}
      <p className="hint">
        {t('dr.projectionNote')}
        {p.rawGain > p.gain && ' ' + t('dr.headroomNote', { raw: p.rawGain, head: p.headroom })}
      </p>

      <div className="dr-sum-meta">
        <span>{t('dr.recCount', { n: dir.summary.total })}</span>
        <span>{t('dr.autoCount', { n: dir.summary.auto, m: dir.summary.manual })}</span>
        <span>{t('dr.dataQuality')}: {t('dr.dq.' + dir.dataQuality)}</span>
      </div>
    </div>
  );
}

/* Güven göstergesi: yıldız + sözel band.
   Yüzde göstermiyoruz — 0.63'ü "%63 emin" diye sunmak uydurma
   kesinlik hissi verir. */
function Confidence({ r, t }) {
  const filled = Math.round(r.confidence * 5);
  return (
    <span className={'dr-conf dr-conf-' + r.confidenceBand}
      title={t('dr.agreement', { n: r.confidenceBasis?.agreement || 1 })}>
      <span className="dr-conf-stars">
        {'★★★★★'.split('').map((c, i) =>
          <span key={i} className={i < filled ? 'on' : ''}>★</span>)}
      </span>
      <span className="dr-conf-band">{t('dr.conf.' + r.confidenceBand)}</span>
    </span>
  );
}

function RecCard({ r, t, busy, onExplain, onApply, onIgnore }) {
  const working = busy === r.id;
  return (
    <div className={'card dr-rec dr-kind-' + r.kind}>
      <div className="dr-rec-head">
        <span className="dr-rec-kind">{t('dr.kind.' + r.kind)}</span>
        {r.scene && <span className="dr-rec-scene">{t('dr.scene', { n: r.scene })}</span>}
        {r.at !== null && <span className="dr-rec-at">{formatDuration(r.at)}</span>}
        <Confidence r={r} t={t} />
      </div>

      <div className="dr-rec-title">{r.title}</div>
      <p className="dr-rec-reason">{r.reason}</p>

      {r.impact && (
        <div className="dr-rec-impact">
          +{r.impact.points} {t('dr.metric.' + r.impact.metric)}
          <span className="hint"> · {t('dr.estimate')}</span>
        </div>
      )}

      {/* AI açıklaması — istendiğinde gelir */}
      {r.explain && (
        <div className="dr-explain">
          <div className="entry-label" style={{ margin: '0 0 4px' }}>{t('dr.why')}</div>
          <p>{r.explain.why}</p>
          {r.explain.how && (
            <>
              <div className="entry-label" style={{ margin: '8px 0 4px' }}>{t('dr.how')}</div>
              <p>{r.explain.how}</p>
            </>
          )}
        </div>
      )}

      <div className="dr-rec-actions">
        {/* Otomatik uygulanamayan öneride UYGULA DÜĞMESİ YOK.
            Tıklayınca hiçbir şey olmaması güven kaybı olurdu. */}
        {r.auto ? (
          <button className="btn btn-primary btn-mini" onClick={onApply} disabled={!!busy}>
            {working ? t('dr.applying') : t('dr.apply')}
          </button>
        ) : (
          <span className="dr-manual">{t('dr.manual')}</span>
        )}
        {!r.explain && (
          <button className="btn btn-mini" onClick={onExplain} disabled={!!busy}>
            {working ? t('dr.explaining') : t('dr.explain') + ' · ' + t('dr.cost', { n: 4 })}
          </button>
        )}
        <button className="btn btn-mini" onClick={onIgnore} disabled={!!busy}>
          {t('dr.ignore')}
        </button>
      </div>
    </div>
  );
}

/* Director Timeline — spec'in zaman eksenli görünümü.
   Zamanı olmayan öneriler (hikâye geneli) sonda toplanır. */
function DirectorTimeline({ recs, t, onExplain, onApply, onIgnore, busy }) {
  const timed = recs.filter(r => r.at !== null).sort((a, b) => a.at - b.at);
  const untimed = recs.filter(r => r.at === null);

  return (
    <div className="dr-timeline">
      {timed.map(r => (
        <div className={'dr-tl-row dr-kind-' + r.kind} key={r.id}>
          <div className="dr-tl-time">{formatDuration(r.at)}</div>
          <div className="dr-tl-body">
            <div className="dr-tl-head">
              <span className="dr-rec-kind">{t('dr.kind.' + r.kind)}</span>
              <Confidence r={r} t={t} />
            </div>
            <div className="dr-tl-title">{r.title}</div>
            <p className="dr-tl-reason">{r.reason}</p>
            {r.explain && <p className="dr-tl-explain">{r.explain.why}</p>}
            <div className="dr-rec-actions">
              {r.auto ? (
                <button className="btn btn-primary btn-mini"
                  onClick={() => onApply(r.id)} disabled={!!busy}>{t('dr.apply')}</button>
              ) : (
                <span className="dr-manual">{t('dr.manual')}</span>
              )}
              {!r.explain && (
                <button className="btn btn-mini" onClick={() => onExplain(r.id)}
                  disabled={!!busy}>{t('dr.explain')}</button>
              )}
              <button className="btn btn-mini" onClick={() => onIgnore(r.id)}
                disabled={!!busy}>{t('dr.ignore')}</button>
            </div>
          </div>
        </div>
      ))}

      {untimed.length > 0 && (
        <>
          <div className="entry-label" style={{ marginTop: 16 }}>{t('dr.wholeStory')}</div>
          {untimed.map(r => (
            <div className={'dr-tl-row dr-kind-' + r.kind} key={r.id}>
              <div className="dr-tl-time">—</div>
              <div className="dr-tl-body">
                <div className="dr-tl-title">{r.title}</div>
                <p className="dr-tl-reason">{r.reason}</p>
                <div className="dr-rec-actions">
                  <span className="dr-manual">{t('dr.manual')}</span>
                  <button className="btn btn-mini" onClick={() => onIgnore(r.id)}
                    disabled={!!busy}>{t('dr.ignore')}</button>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
