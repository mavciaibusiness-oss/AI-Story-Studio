'use client';
import { useState } from 'react';
import { useT } from '@/lib/i18n';
import {
  PROMPT_CATEGORIES, promptBand, promptSortIssues
} from '@/lib/prompt/model';

/*
  PROMPT KALİTE ROZETİ — Sprint 4 / TASK-03, Adım 4.

  Her prompt kartının başlık satırına giren küçük puan rozeti.
  Tıklanınca kartın altında ayrıntı paneli açılır: kategori puanları,
  bulgular ve öneriler, "Yeniden yaz" düğmesi.

  Tasarım kararı — MEVCUT SAYFA BOZULMAZ:
    Prompt sayfası zaten kalabalık (üretim ayarları + kartlar). Rozet
    tek bir küçük öğe olarak başlık satırına giriyor; ayrıntı yalnızca
    istendiğinde açılıyor. Sayfanın varsayılan görünümü neredeyse aynı
    kalıyor, sadece her kartta bir puan görünüyor.

  Rozet puanı KURAL MOTORUNDAN gelir; ücretsiz ve anında. Yeniden yazım
  isteğe bağlı, kredili ve kullanıcı onayıyla uygulanır.
*/

function starRow(stars) {
  const full = Math.floor(stars);
  return '★★★★★'.split('').map((c, i) => (
    <span key={i} className={i < full ? 'on' : (i < stars ? 'half' : '')}>★</span>
  ));
}

export default function PromptQualityBadge({
  report, sceneIndex, onRewrite, rewriting, rewriteResult, onApply, onDiscard
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (!report) return null;

  const band = promptBand(report.overall);
  const issues = promptSortIssues(report.issues || []);
  const critical = issues.filter(i => i.severity === 'critical').length;
  const warns = issues.filter(i => i.severity === 'warn').length;

  return (
    <>
      <button className={'pq-badge pq-badge-' + band.tone}
        onClick={() => setOpen(!open)}
        title={t('pq.badgeHint')}
        aria-expanded={open}>
        <span className="pq-badge-score">{report.overall}</span>
        <span className="pq-badge-stars">{starRow(report.stars)}</span>
        {(critical + warns) > 0 && (
          <span className="pq-badge-count">{critical + warns}</span>
        )}
      </button>

      {open && (
        <div className="pq-panel">
          {/* Kategori puanları */}
          <div className="pq-cats">
            {PROMPT_CATEGORIES.map(c => {
              const v = report.scores?.[c.key];
              const has = Number.isFinite(v);
              return (
                <div key={c.key} className="pq-cat">
                  <div className="pq-cat-name">{t('pq.cat.' + c.key)}</div>
                  <div className="pq-cat-val">{has ? v : '—'}</div>
                  <div className="pq-cat-bar" aria-hidden="true">
                    <i style={{ width: (has ? v : 0) + '%' }} />
                  </div>
                </div>
              );
            })}
          </div>
          {Object.keys(report.scores || {}).length < PROMPT_CATEGORIES.length && (
            <p className="hint">{t('pq.notMeasured')}</p>
          )}

          {/* Bulgular */}
          {issues.length === 0 ? (
            <p className="hint">{t('pq.noIssues')}</p>
          ) : (
            <div className="pq-issues">
              {issues.map(i => (
                <div key={i.id} className={'pq-issue pq-sev-' + i.severity}>
                  <div className="pq-issue-top">
                    <span className={'pq-sev-tag pq-sev-tag-' + i.severity}>
                      {t('pq.sev.' + i.severity)}
                    </span>
                    <span className="pq-issue-title">{i.title}</span>
                    {i.gain > 0 && <span className="pq-issue-gain">+{i.gain}</span>}
                  </div>
                  <p className="pq-issue-detail">{i.detail}</p>
                  <p className="pq-issue-rec">→ {i.recommendation}</p>
                </div>
              ))}
            </div>
          )}

          {/* Yeniden yazım */}
          {!rewriteResult && (
            <div className="pq-actions">
              <button className="btn btn-primary btn-mini"
                onClick={() => onRewrite(sceneIndex)}
                disabled={rewriting}>
                {rewriting ? t('pq.rewriting') : t('pq.rewrite') + ' · ' + t('pq.cost', { n: 6 })}
              </button>
              <span className="hint">{t('pq.rewriteHint')}</span>
            </div>
          )}

          {/* Karşılaştırma */}
          {rewriteResult && (
            <RewriteCompare
              result={rewriteResult} t={t}
              onApply={() => onApply(sceneIndex, rewriteResult.layers)}
              onDiscard={() => onDiscard(sceneIndex)} />
          )}
        </div>
      )}
    </>
  );
}

/* Before / after karşılaştırma — spec'in "Prompt Comparison" bölümü.
   Puanlar AI'nin iddiası değil; yeni prompt aynı kural motorundan
   geçirilerek bağımsız ölçüldü. */
function RewriteCompare({ result, t, onApply, onDiscard }) {
  const b = result.before, a = result.after;
  const delta = (a?.overall || 0) - (b?.overall || 0);

  return (
    <div className="pq-compare">
      <div className="pq-compare-head">
        <div className="pq-compare-side">
          <div className="pq-compare-label">{t('pq.before')}</div>
          <div className="pq-compare-score">{b?.overall ?? '—'}</div>
          <div className="pq-compare-stars">{starRow(b?.stars || 0)}</div>
        </div>
        <div className="pq-compare-arrow" aria-hidden="true">→</div>
        <div className="pq-compare-side pq-compare-after">
          <div className="pq-compare-label">{t('pq.after')}</div>
          <div className="pq-compare-score">{a?.overall ?? '—'}</div>
          <div className="pq-compare-stars">{starRow(a?.stars || 0)}</div>
        </div>
        {delta > 0 && <div className="pq-compare-delta">+{delta}</div>}
      </div>

      {result.changeNote && <p className="pq-note">{result.changeNote}</p>}

      {result.issuesFixed > 0 && (
        <p className="hint">{t('pq.fixed', { n: result.issuesFixed })}</p>
      )}

      {/* Yeni katmanlar */}
      <div className="pq-layers">
        {Object.entries(result.layers || {})
          .filter(([, v]) => v && String(v).trim())
          .map(([k, v]) => (
            <div className="pq-layer" key={k}>
              <div className="pq-layer-name">{k}</div>
              <div className="pq-layer-text">{v}</div>
            </div>
          ))}
      </div>

      <div className="pq-actions">
        <button className="btn btn-primary btn-mini" onClick={onApply}>
          {t('pq.apply')}
        </button>
        <button className="btn btn-mini" onClick={onDiscard}>
          {t('pq.discard')}
        </button>
      </div>
    </div>
  );
}
