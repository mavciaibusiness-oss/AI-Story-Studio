'use client';
import { useState, useRef, useCallback } from 'react';
import { useT, useI18n } from '@/lib/i18n';
import { useStudio } from '@/lib/store';
import { scanVideo, probeVideo } from '@/lib/rebuild/extract';
import { buildStoryboardFromVideo } from '@/lib/rebuild/build';
import { analyzeRebuild, projectRebuild } from '@/lib/rebuild/report';
import { estimateFrameCount, sampleInterval } from '@/lib/rebuild/analyze';
import { HEALTH_CATEGORIES } from '@/lib/health/model';
import { formatDuration } from '@/lib/timeline';

/*
  VIDEO REBUILDER EKRANI — Sprint 4 / TASK-07, Adım 4.

  Akış: yükle → tara → sahne haritası → senaryo ekle → tam rapor

  DÖRT TASARIM KARARI:

  1. GİZLİLİK ÖNDE SÖYLENİYOR.
     Kullanıcı video yüklerken "nereye gidiyor bu" diye düşünür.
     Yükleme alanının hemen altında yazıyor: dosya tarayıcıdan
     çıkmıyor. Sonradan küçük puntoyla değil.

  2. TARAMA SÜRESİ ÖNCEDEN SÖYLENİYOR.
     Seek işlemi yavaş; 10 dakikalık videoda yüzlerce kare okunuyor.
     Kaç kare okunacağı ve tahmini süre taramadan ÖNCE gösteriliyor,
     ilerleme çubuğu ve iptal düğmesi var. Kullanıcı donduğunu
     sanmasın.

  3. GENEL PUAN YOKSA NEDEN YOK, AÇIKÇA.
     Senaryosuz videoda ölçülen tek boyut ritim. Sahte bir manşet sayı
     göstermek yerine "genel puan verilemiyor, çünkü..." diyoruz ve
     senaryo ekleme çağrısını belirgin yapıyoruz.

  4. SENARYO ÇAĞRISI SOMUT.
     "Senaryo ekle" demek yetmez; ne kazanacağını göstermek gerek.
     Kilitli 8 boyut isim isim listeleniyor.
*/

const MAX_SIZE_MB = 500;

export default function RebuildView() {
  const t = useT();
  const { locale } = useI18n();
  const { episodeId, setStoryboard } = useStudio();

  const [file, setFile] = useState(null);
  const [info, setInfo] = useState(null);
  const [scan, setScan] = useState(null);
  const [script, setScript] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [progress, setProgress] = useState(null);   // { done, total }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);

  const abortRef = useRef(null);
  const inputRef = useRef(null);

  async function pickFile(f) {
    if (!f) return;
    setErr(null); setNote(null); setScan(null); setAnalysis(null);

    if (f.size > MAX_SIZE_MB * 1024 * 1024) {
      setErr(t('rb.tooBig', { n: MAX_SIZE_MB }));
      return;
    }
    setFile(f);
    try {
      const i = await probeVideo(f);
      setInfo(i);
    } catch (e) {
      setErr(e.message);
      setFile(null); setInfo(null);
    }
  }

  const runScan = useCallback(async () => {
    if (!file) return;
    setBusy(true); setErr(null); setProgress({ done: 0, total: estimateFrameCount(info?.duration) });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await scanVideo(file, {
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total })
      });
      setScan(result);
      applyScript(result, script);
    } catch (e) {
      setErr(e.message === 'aborted' ? t('rb.cancelled') : e.message);
    } finally {
      setBusy(false); setProgress(null); abortRef.current = null;
    }
  }, [file, info, script]);

  /* Senaryo değişince yeniden analiz — tarama TEKRARLANMAZ.
     Kare okuma pahalı; senaryo eklemek onu geçersiz kılmıyor. */
  function applyScript(scanResult, text) {
    const s = scanResult || scan;
    if (!s) return;
    const built = buildStoryboardFromVideo(s, { script: text, language: locale === 'en' ? 'English' : 'Türkçe' });
    setAnalysis({ built, report: analyzeRebuild(s, built) });
  }

  function cancel() { abortRef.current?.abort(); }

  function reset() {
    setFile(null); setInfo(null); setScan(null); setAnalysis(null);
    setScript(''); setErr(null); setNote(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  /* Storyboard'u projeye aktar — kullanıcı düzenlemeye devam etsin */
  function importToProject() {
    if (!analysis?.built?.storyboard || !episodeId) return;
    setStoryboard(analysis.built.storyboard);
    setNote(t('rb.imported'));
  }

  const rep = analysis?.report;
  const caps = analysis?.built?.capabilities;
  const projection = rep?.ok ? projectRebuild(rep) : null;

  return (
    <>
      <h1 className="page-title">{t('rb.title')}</h1>
      <p className="page-sub">{t('rb.sub')}</p>

      {err && <span className="err">{err}</span>}
      {note && <p className="rb-note">{note}</p>}

      {/* ---- 1. Dosya seçimi ---- */}
      {!file && (
        <div className="card rb-drop"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}>
          <div className="rb-drop-icon" aria-hidden="true">▤</div>
          <div className="rb-drop-title">{t('rb.dropTitle')}</div>
          <p className="hint">{t('rb.dropHint', { n: MAX_SIZE_MB })}</p>
          <input ref={inputRef} type="file" accept="video/*" style={{ display: 'none' }}
            onChange={e => pickFile(e.target.files?.[0])} />
          <button className="btn btn-primary" onClick={() => inputRef.current?.click()}>
            {t('rb.choose')}
          </button>
          {/* Gizlilik önde — kullanıcı yüklerken merak eder */}
          <p className="rb-privacy">{t('rb.privacy')}</p>
        </div>
      )}

      {/* ---- 2. Dosya bilgisi + tarama ---- */}
      {file && info && !scan && (
        <div className="card rb-ready">
          <div className="rb-file">
            <span className="rb-file-name">{info.name}</span>
            <span className="rb-file-meta">
              {formatDuration(info.duration)} · {info.width}×{info.height} ·
              {' '}{(info.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>

          {/* Tarama maliyeti ÖNCEDEN söyleniyor */}
          <p className="hint">
            {t('rb.scanPlan', {
              n: estimateFrameCount(info.duration),
              iv: sampleInterval(info.duration)
            })}
          </p>
          <p className="hint">{t('rb.scanSlow')}</p>

          {busy && progress ? (
            <>
              <div className="rb-progress">
                <i style={{ width: Math.round(progress.done / progress.total * 100) + '%' }} />
              </div>
              <div className="rb-progress-label">
                {progress.done} / {progress.total} {t('rb.frames')}
              </div>
              <button className="btn btn-mini" onClick={cancel}>{t('rb.cancel')}</button>
            </>
          ) : (
            <div className="rb-actions">
              <button className="btn btn-primary" onClick={runScan} disabled={busy}>
                {t('rb.scan')}
              </button>
              <button className="btn btn-mini" onClick={reset}>{t('rb.another')}</button>
            </div>
          )}
        </div>
      )}

      {/* ---- 3. Sonuçlar ---- */}
      {scan && rep?.ok && (
        <>
          <ScanSummary scan={scan} t={t} />

          <ScriptBox script={script} setScript={setScript}
            onApply={() => applyScript(scan, script)}
            caps={caps} locked={rep.locked} t={t} busy={busy} />

          <ScoreBlock rep={rep} projection={projection} t={t} />

          <ShotMap scan={scan} analysis={analysis} t={t} />

          <Findings rep={rep} t={t} />

          <div className="rb-actions" style={{ marginTop: 18 }}>
            {episodeId ? (
              <button className="btn btn-primary btn-mini" onClick={importToProject}>
                {t('rb.import')}
              </button>
            ) : (
              <span className="hint">{t('rb.noEpisode')}</span>
            )}
            <button className="btn btn-mini" onClick={reset}>{t('rb.another')}</button>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */

function ScanSummary({ scan, t }) {
  const s = scan.summary;
  return (
    <div className="card rb-summary">
      <div className="rb-stats">
        <Stat label={t('rb.shots')} value={s.count} />
        <Stat label={t('rb.avgDur')} value={s.avgDur + 's'} />
        <Stat label={t('rb.static')} value={s.staticCount} />
        <Stat label={t('rb.repeats')} value={scan.repeated.length} warn={scan.repeated.length > 0} />
      </div>
      {/* Örnekleme sınırı: hangi kısa sahneler kaçmış olabilir */}
      <p className="hint">
        {t('rb.sampling', {
          iv: scan.sampling.interval,
          min: scan.sampling.minDetectable
        })}
      </p>
      {/* Yumuşak geçiş sınırı — Adım 1'deki bilinçli karar */}
      <p className="hint">{t('rb.fadeLimit')}</p>
      {s.unmeasuredCount > 0 && (
        <p className="hint">{t('rb.unmeasured', { n: s.unmeasuredCount })}</p>
      )}
    </div>
  );
}

function Stat({ label, value, warn }) {
  return (
    <div className={'rb-stat' + (warn ? ' rb-stat-warn' : '')}>
      <div className="rb-stat-label">{label}</div>
      <div className="rb-stat-value">{value}</div>
    </div>
  );
}

/* Senaryo kutusu — kilitli boyutları SOMUT göstererek çağrı yapıyor */
function ScriptBox({ script, setScript, onApply, caps, locked, t, busy }) {
  const has = !!caps?.hasScript;
  return (
    <div className={'card rb-script' + (has ? ' rb-script-on' : '')}>
      <div className="entry-label">{t('rb.scriptTitle')}</div>
      <p className="hint">{t('rb.scriptHint')}</p>

      {!has && locked?.length > 0 && (
        <div className="rb-locked">
          <div className="rb-locked-head">{t('rb.lockedHead', { n: locked.length })}</div>
          <div className="rb-locked-list">
            {locked.map(k => (
              <span className="rb-locked-item" key={k}>{t('rb.dim.' + k)}</span>
            ))}
          </div>
        </div>
      )}

      <textarea className="input rb-script-area" rows={6}
        placeholder={t('rb.scriptPlaceholder')}
        value={script} onChange={e => setScript(e.target.value)} />

      <div className="rb-actions">
        <button className="btn btn-primary btn-mini" onClick={onApply}
          disabled={busy || !script.trim()}>
          {t('rb.applyScript')}
        </button>
        {has && <span className="rb-ok">{t('rb.scriptApplied', { n: caps.unlocked, m: caps.total })}</span>}
      </div>
    </div>
  );
}

/*
  Puan bloğu.

  DÜRÜSTLÜK: genel puan yoksa sahte bir sayı göstermiyoruz. Neden
  verilemediğini yazıyoruz ve ölçülen kategorileri ayrı ayrı
  gösteriyoruz — kullanıcı elindeki gerçek bilgiyi görsün.
*/
function ScoreBlock({ rep, projection, t }) {
  const h = rep.health;
  const measured = h.coverage.measured;

  return (
    <div className="card rb-score">
      {h.overall === null ? (
        <div className="rb-noscore">
          <div className="rb-noscore-title">{t('rb.noOverall')}</div>
          <p className="hint">
            {t('rb.noOverallWhy', {
              p: Math.round(h.coverage.weightCovered * 100),
              n: measured.length,
              m: h.coverage.total
            })}
          </p>
        </div>
      ) : (
        <div className="rb-sum-scores">
          <div className="rb-sum-side">
            <div className="rb-sum-label">{t('rb.current')}</div>
            <div className="rb-sum-score">{h.overall}</div>
          </div>
          {projection?.gain > 0 && (
            <>
              <div className="rb-sum-arrow" aria-hidden="true">→</div>
              <div className="rb-sum-side rb-sum-after">
                <div className="rb-sum-label">{t('rb.expected')}</div>
                <div className="rb-sum-score">{projection.expected}</div>
              </div>
              <div className="rb-sum-delta">+{projection.gain}</div>
            </>
          )}
        </div>
      )}

      {/* Ölçülen kategoriler — puan olsun olmasın */}
      {measured.length > 0 && (
        <div className="rb-cats">
          {HEALTH_CATEGORIES.filter(c => measured.includes(c.key)).map(c => (
            <div className="rb-cat" key={c.key}>
              <span className="rb-cat-name">{t('vh.cat.' + c.key)}</span>
              <span className="rb-cat-score">{h.scores[c.key]}</span>
            </div>
          ))}
        </div>
      )}

      {projection && projection.current !== null && (
        <p className="hint">{t('rb.projectionNote')}</p>
      )}
      {projection?.available > 0 && projection.current === null && (
        <p className="hint">{t('rb.availableGain', { n: projection.available })}</p>
      )}
    </div>
  );
}

/* Sahne haritası — zaman ekseninde, tekrar ve durağanlık işaretli */
function ShotMap({ scan, analysis, t }) {
  const scenes = analysis?.built?.storyboard?.scenes || [];
  const assignments = analysis?.built?.alignment?.assignments || [];

  return (
    <>
      <h2 className="entry-label">{t('rb.shotMap')}</h2>
      <div className="rb-shots">
        {scan.shots.map((s, i) => {
          const sc = scenes[i];
          const a = assignments[i];
          return (
            <div className={'rb-shot' + (s.black ? ' rb-shot-black' : '')} key={i}>
              <div className="rb-shot-n">{i + 1}</div>
              <div className="rb-shot-body">
                <div className="rb-shot-head">
                  <span className="rb-shot-time">
                    {formatDuration(s.start)}–{formatDuration(s.end)}
                  </span>
                  <span className="rb-shot-dur">{s.dur}s</span>
                  {s.static === true && <span className="tag">{t('rb.tagStatic')}</span>}
                  {s.static === null && <span className="tag">{t('rb.tagUnknown')}</span>}
                  {s.black && <span className="tag">{t('rb.tagBlack')}</span>}
                  {sc?._shot?.repeatGroup !== null && sc?._shot?.repeatGroup !== undefined && (
                    <span className="tag tag-admin">
                      {t('rb.tagRepeat', { n: sc._shot.repeatGroup + 1 })}
                    </span>
                  )}
                  {a?.fit !== null && a?.fit !== undefined && (
                    <span className="rb-shot-fit" title={t('rb.fitHint')}>
                      {t('rb.fit')} {a.fit}
                    </span>
                  )}
                </div>
                {sc?.paragraph
                  ? <p className="rb-shot-text">{sc.paragraph}</p>
                  : <p className="hint">{t('rb.noText')}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Findings({ rep, t }) {
  const structural = rep.structural || [];
  const issues = rep.health?.issues || [];
  const total = structural.length + issues.length;

  if (total === 0) {
    return (
      <>
        <h2 className="entry-label">{t('rb.findings')}</h2>
        <p className="hint">{t('rb.noFindings')}</p>
      </>
    );
  }

  return (
    <>
      <h2 className="entry-label">{t('rb.findings')} ({total})</h2>
      <div className="rb-findings">
        {structural.map(f => (
          <div className={'card rb-finding vh-sev-' + f.severity} key={f.code + f.scenes.join()}>
            <div className="rb-finding-head">
              <span className={'vh-sev vh-sev-tag-' + f.severity}>{t('vh.sev.' + f.severity)}</span>
              <span className="rb-finding-src">{t('rb.fromPixels')}</span>
              {f.scenes?.length > 0 && (
                <span className="rb-finding-scenes">
                  {t('rb.scenes')} {f.scenes.join(', ')}
                </span>
              )}
            </div>
            <div className="rb-finding-title">{f.title}</div>
            <p className="rb-finding-detail">{f.detail}</p>
            <div className="rb-finding-rec">{f.recommendation}</div>
          </div>
        ))}

        {issues.map(i => (
          <div className={'card rb-finding vh-sev-' + i.severity} key={i.id}>
            <div className="rb-finding-head">
              <span className={'vh-sev vh-sev-tag-' + i.severity}>{t('vh.sev.' + i.severity)}</span>
              <span className="rb-finding-src">{t('vh.cat.' + i.category)}</span>
              {i.scene && <span className="rb-finding-scenes">{t('rb.scene')} {i.scene}</span>}
            </div>
            <div className="rb-finding-title">{i.title}</div>
            <p className="rb-finding-detail">{i.detail}</p>
            <div className="rb-finding-rec">{i.recommendation}</div>
          </div>
        ))}
      </div>

      {/* Şeffaflık: hangi uyarılar neden gizlendi */}
      {rep.suppressed?.length > 0 && (
        <p className="hint">{t('rb.suppressedNote', { n: rep.suppressed.length })}</p>
      )}
    </>
  );
}
