'use client';
import { useState, useCallback, useEffect } from 'react';
import { useT, useI18n } from '@/lib/i18n';

/*
  SMART PROJECT MANAGER — arayüz bileşenleri.

  Sprint 5 / TASK-05, Adım 4.

  ---------------------------------------------------------------
  MEVCUT SAYFA BOZULMUYOR

  `/studio/projeler` zaten çalışıyor ve önemli mantık taşıyor:
  proje/video oluşturma, silme, kopyalama, açma. O kodun hiçbirine
  dokunmuyoruz.

  Bu dosya AKILLI KATMANI ekliyor: durum rozetleri, yarım kalanlar,
  öneriler, sürüm geçmişi, karşılaştırma. Mevcut sayfa bunları
  çağırıyor; kendi işini yapmaya devam ediyor.

  Yeni rota da açmıyoruz — kullanıcının onayladığı mimari kısıt.
  ---------------------------------------------------------------
*/

const api = (action, extra = {}) =>
  fetch('/api/project', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra })
  }).then(r => r.json());

/* ---------- Durum rozeti ---------- */
export function StatusBadge({ status, derived, t }) {
  if (!status) return null;
  return (
    <span className={'pj-badge pj-badge-' + status}
      title={derived ? t('pj.derivedHint') : t('pj.manualHint')}>
      {t('pj.status.' + status)}
      {/* Elle işaretlenmiş durumlar ayırt ediliyor — kullanıcı
          "bunu ben mi söyledim yoksa sistem mi anladı" bilsin. */}
      {!derived && <span className="pj-badge-manual">•</span>}
    </span>
  );
}

/*
  ---------- AKILLI PANEL ----------

  Projeler sayfasının üstünde: durum dağılımı, yarım kalanlar,
  öneriler. Veri yoksa hiç görünmüyor — boş kutu göstermek yer
  israfı (TASK-04'teki karar).
*/
export function SmartPanel({ onOpenEpisode }) {
  const t = useT();
  const { locale } = useI18n();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api('list');
      if (r.error) { setErr(r.error); return; }
      setData(r);
    } catch (e) { setErr(String(e?.message || e)); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (err) return <span className="err">{err}</span>;
  if (!data) return null;

  const { statuses, unfinished, suggestions } = data;
  const hasAnything = statuses?.total > 0;
  if (!hasAnything) return null;

  return (
    <>
      {/* Durum dağılımı */}
      <div className="pj-statusbar">
        {Object.entries(statuses.counts || {}).map(([k, n]) => (
          <span className={'pj-count pj-badge-' + k} key={k}>
            {t('pj.status.' + k)} <b>{n}</b>
          </span>
        ))}
      </div>

      {/* Yarım kalanlar — spec: "Continue Working" */}
      {unfinished?.length > 0 && (
        <section className="card pj-section">
          <div className="entry-label">{t('pj.unfinished')}</div>
          <p className="hint">{t('pj.unfinishedHint')}</p>
          {unfinished.slice(0, 4).map(p => (
            <div className="pj-row" key={p.id}>
              <div className="pj-row-body">
                <div className="pj-row-title">{p.title}</div>
                <div className="pj-row-meta">
                  <StatusBadge status={p.status} derived={p.statusDerived} t={t} />
                  <span>{t('pj.idle', { n: p.idleDays })}</span>
                  {p.ready.total > 0 && (
                    <span>{t('pj.ready', { a: p.ready.media, b: p.ready.total })}</span>
                  )}
                </div>
              </div>
              <button className="btn btn-mini btn-primary"
                onClick={() => onOpenEpisode?.(p.id)}>
                {t('pj.continue')}
              </button>
            </div>
          ))}
        </section>
      )}

      {/* AI önerileri — her birinin dayanağı gösteriliyor */}
      {suggestions?.length > 0 && (
        <section className="card pj-section pj-suggestions">
          <div className="entry-label">{t('pj.suggestions')}</div>
          {suggestions.map((s, i) => (
            <div className="pj-suggestion" key={i}>
              <div className="pj-suggestion-body">
                <div className="pj-suggestion-text">
                  {t('pj.sug.' + s.kind, { title: s.sourceTitle })}
                </div>
                {/* DAYANAK — öneri neden yapıldı. Dayanaksız öneri
                    gürültüdür (TASK-06 dersi). */}
                <div className="pj-suggestion-basis">{basisText(s, t)}</div>
              </div>
              <button className="btn btn-mini"
                onClick={() => onOpenEpisode?.(s.sourceId)}>
                {t('pj.open')}
              </button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function basisText(s, t) {
  const b = s.basis || {};
  switch (s.kind) {
    case 'to-shortform': return t('pj.basis.shortform', { n: b.scenes });
    case 'sequel':       return t('pj.basis.sequel', { genre: b.genre, n: b.completed });
    case 'finish-it':    return t('pj.basis.finish', { p: b.percent, n: b.remaining });
    default:             return '';
  }
}

/*
  ---------- SÜRÜM GEÇMİŞİ ----------

  Bir bölümün sürümleri ve GÜVENLİ geri alma akışı.

  Spec: "Kullanıcı önceki sürüme dönebilmeli."

  GÜVENLİ = ne kaybedeceğini görmeden geri alamaz. İki aşama:
    1. önizleme → "8 görsel, 5 ses kaybolacak"
    2. onay     → ancak o zaman uygulanıyor
*/
export function VersionPanel({ episodeId, onRestored }) {
  const t = useT();
  const { locale } = useI18n();
  const [state, setState] = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    if (!episodeId) return;
    setErr(null);
    const r = await api('versions', { episodeId });
    if (r.error) { setErr(r.error); return; }
    setState(r);
  }, [episodeId]);

  useEffect(() => { load(); }, [load]);

  async function askPreview(v) {
    setBusy(true); setErr(null);
    try {
      const r = await api('preview', { episodeId, versionId: v.id });
      if (r.error) { setErr(t('pj.err.' + r.error) || r.error); return; }
      setPreview({ version: v, ...r.preview });
    } finally { setBusy(false); }
  }

  async function doRestore(confirmed) {
    if (!preview?.version) return;
    setBusy(true); setErr(null);
    try {
      const r = await api('restore', {
        episodeId, versionId: preview.version.id, confirmed
      });
      if (r.needsConfirm) {
        /* Sunucu onay istiyor — önizlemeyi güncelleyip bekliyoruz.
           İstemci "zaten onayladım" diyemez; sunucu kendi hesabını
           yapıyor. */
        setPreview({ version: preview.version, ...r.preview, needsConfirm: true });
        return;
      }
      if (r.error) { setErr(t('pj.err.' + r.error) || r.error); return; }
      setPreview(null);
      await load();
      onRestored?.(r.storyboard, r.lost);
    } finally { setBusy(false); }
  }

  if (!episodeId) return null;
  if (err) return <span className="err">{err}</span>;
  if (!state) return null;

  const { versions, summary } = state;

  if (!versions?.length) {
    return (
      <section className="card pj-section">
        <div className="entry-label">{t('pj.versions')}</div>
        <p className="hint">{t('pj.noVersions')}</p>
      </section>
    );
  }

  return (
    <section className="card pj-section">
      <div className="entry-label">{t('pj.versions')}</div>
      <p className="hint">
        {t('pj.versionSummary', { n: summary.total, r: summary.restorable })}
        {summary.notRestorable > 0 && ' · ' +
          t('pj.notRestorable', { n: summary.notRestorable })}
      </p>

      {versions.map(v => (
        <div className="pj-version" key={v.id}>
          <div className="pj-version-body">
            <div className="pj-version-head">
              <span className="pj-version-kind">{t('pj.kind.' + v.kind)}</span>
              <span className="pj-version-at">
                {v.at ? new Date(v.at).toLocaleString(locale === 'en' ? 'en-GB' : 'tr')
                      : t('pj.noDate')}
              </span>
            </div>
            <div className="pj-version-detail">{versionDetail(v, t)}</div>
          </div>
          {v.canRestore ? (
            <button className="btn btn-mini" disabled={busy}
              onClick={() => askPreview(v)}>{t('pj.restore')}</button>
          ) : (
            /* Çalışmayan düğme göstermiyoruz — sebebi yazıyoruz.
               (TASK-02'deki engelli görev kararının aynısı.) */
            <span className="pj-version-no">{t('pj.cannotRestore')}</span>
          )}
        </div>
      ))}

      {/* GERİ ALMA ONAYI — ne kaybolacağı burada */}
      {preview && (
        <div className="pj-confirm">
          <div className="pj-confirm-title">
            {t('pj.confirmTitle', { kind: t('pj.kind.' + preview.version.kind) })}
          </div>

          {preview.scope === 'scene' ? (
            <p className="pj-confirm-line">{t('pj.confirmScene', { n: preview.scene })}</p>
          ) : (
            <p className="pj-confirm-line">
              {t('pj.confirmScenes', { a: preview.scenesNow, b: preview.scenesAfter })}
            </p>
          )}

          {preview.lost?.length > 0 ? (
            <div className="pj-lost">
              <div className="pj-lost-title">{t('pj.willLose')}</div>
              <ul className="pj-lost-list">
                {preview.lost.map(l => (
                  <li key={l.kind}>{t('pj.lost.' + l.kind, { n: l.count })}</li>
                ))}
              </ul>
              <p className="pj-lost-warn">{t('pj.lostWarn')}</p>
            </div>
          ) : (
            <p className="pj-confirm-safe">{t('pj.noLoss')}</p>
          )}

          <div className="pj-confirm-actions">
            <button className="btn btn-mini btn-danger" disabled={busy}
              onClick={() => doRestore(true)}>
              {preview.lost?.length ? t('pj.restoreAnyway') : t('pj.restoreConfirm')}
            </button>
            <button className="btn btn-mini" disabled={busy}
              onClick={() => setPreview(null)}>{t('pj.cancel')}</button>
          </div>
        </div>
      )}
    </section>
  );
}

function versionDetail(v, t) {
  const d = v.detail || {};
  switch (v.kind) {
    case 'scene-plan':
      return t('pj.detail.plan', { a: d.before, b: d.after, s: d.splits ?? 0 });
    case 'rewrite':
      return t('pj.detail.rewrite', { a: d.scoreBefore, b: d.scoreAfter, n: d.touched });
    case 'director':
      return (d.title || t('pj.kind.director')) +
        (v.scene ? ' · ' + t('pj.scene', { n: v.scene }) : '');
    default:
      return '';
  }
}

/*
  ---------- KARŞILAŞTIRMA ----------

  İki proje yan yana. Ölçülemeyenler AÇIKÇA bildiriliyor —
  uydurma izlenme sayısı yok (bkz. lib/project/compare.js).
*/
export function ComparePanel({ episodes }) {
  const t = useT();
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function run() {
    if (!a || !b || a === b) return;
    setBusy(true); setErr(null);
    try {
      const r = await api('compare', { a, b });
      if (r.error) { setErr(r.error); return; }
      setResult(r);
    } finally { setBusy(false); }
  }

  const options = episodes || [];
  if (options.length < 2) return null;

  return (
    <section className="card pj-section">
      <div className="entry-label">{t('pj.compare')}</div>

      <div className="pj-compare-pick">
        <select className="select" value={a} onChange={e => setA(e.target.value)}>
          <option value="">{t('pj.pickFirst')}</option>
          {options.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <select className="select" value={b} onChange={e => setB(e.target.value)}>
          <option value="">{t('pj.pickSecond')}</option>
          {options.filter(e => e.id !== a).map(e =>
            <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <button className="btn btn-mini btn-primary"
          disabled={busy || !a || !b || a === b} onClick={run}>
          {t('pj.runCompare')}
        </button>
      </div>

      {err && <span className="err">{err}</span>}

      {result && (
        <>
          <div className="pj-compare-head">
            <span>{result.a.title}</span>
            <span>{result.b.title}</span>
          </div>

          <table className="pj-table">
            <tbody>
              {result.rows.map(r => (
                <tr key={r.key} className={r.comparable ? '' : 'pj-row-dim'}>
                  <td className="pj-metric">{t('pj.metric.' + r.key)}</td>
                  <td className={'pj-val' + (r.winner === 'a' ? ' pj-win' : '')}>
                    {r.a ?? '—'}
                  </td>
                  <td className={'pj-val' + (r.winner === 'b' ? ' pj-win' : '')}>
                    {r.b ?? '—'}
                  </td>
                  <td className="pj-note">
                    {r.winner === 'tie' ? t('pj.tie')
                      : r.reason === 'no-better' ? t('pj.noBetter')
                      : r.reason === 'missing-data' ? t('pj.noData')
                      : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="hint">
            {t('pj.comparableCount', { n: result.comparable, m: result.total })}
          </p>

          {/* ÖLÇÜLEMEYENLER — gizlemiyoruz */}
          <div className="pj-unavailable">
            <div className="pj-unavailable-title">{t('pj.unavailable')}</div>
            <div className="pj-unavailable-list">
              {result.unavailable.map(u => (
                <span className="pj-unavailable-item" key={u.key}>
                  {t('pj.metric.' + u.key)}
                </span>
              ))}
            </div>
            <p className="hint">{t('pj.unavailableHint')}</p>
          </div>
        </>
      )}
    </section>
  );
}
