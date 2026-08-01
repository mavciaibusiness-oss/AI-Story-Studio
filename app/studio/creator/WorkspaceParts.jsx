'use client';
import { useState } from 'react';
import Link from 'next/link';
import { workflowStatus, reasonKey } from '@/lib/creator/suggest';
import { buildQuickActions, onboardingState } from '@/lib/creator/quick';


/*
  CREATOR WORKSPACE — görünüm bileşenleri.

  Sprint 5 / TASK-04, Adım 4.

  CreatorView.jsx 1123 satıra çıkmıştı; Workspace'e özgü görünüm
  parçaları buraya taşındı. CreatorView artık durum yönetimi ve
  akıştan sorumlu, bu dosya çizimden.

  Bölme ölçütü: bu bileşenlerin hiçbiri oturum durumunu değiştirmiyor,
  hepsi aldığı veriyi çiziyor. Mantık taşıyanlar (WorkflowCard,
  TaskRow, EventLog) CreatorView'da kaldı — onlar oturumu güncelliyor.
*/

/*
  AI Director paneli — aktif plan varken.

  Spec: "Kullanıcının son isteğini gösterir... Son çalışmana devam
  etmek ister misin?"

  Sonraki adımı ve gerekçesini büyük gösteriyor; kullanıcı buraya
  bakıp devam edebilmeli.
*/
export function DirectorPanel({ session, status, t, locale }) {
  const L = (o) => o?.[locale] || o?.tr || '';
  const sg = status?.suggestion;

  return (
    <div className="ws-dir">
      <div className="ws-dir-label">{t('ws.working')}</div>
      <div className="ws-dir-title">{session.title}</div>

      {sg?.task ? (
        <div className="ws-dir-next">
          <div>
            <div className="ws-dir-step">{L(sg.task.label)}</div>
            <div className="ws-dir-why">{(() => { const r = reasonKey(sg); return t(r.key, r.vars); })()}</div>
          </div>
          <Link href={sg.task.route} className="btn btn-primary">{t('cos.go')}</Link>
        </div>
      ) : status?.complete ? (
        <div className="ws-dir-done">{t('cos.allDone')}</div>
      ) : status?.stuck ? (
        <div className="ws-dir-stuck">{t('cos.stuckTitle')}</div>
      ) : null}

      {status && status.doable > 0 && (
        <div className="ws-dir-bar">
          <i style={{ width: status.percent + '%' }} />
        </div>
      )}
    </div>
  );
}


/* Giriş paneli — plan yokken. Creator OS'un tek cümle girişi. */
export function EntryPanel({ t, locale, text, setText, preview, onStart }) {
  return (
    <div className="ws-entry">
      <div className="cos-greet">{t('cos.greet')}</div>
      <h1 className="ws-question">{t('cos.question')}</h1>

      <div className="ws-input-wrap">
        <textarea className="input cos-input" rows={2}
          placeholder={t('cos.placeholder')}
          value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onStart(); }
          }} />
        <button className="btn btn-primary cos-start"
          onClick={() => onStart()} disabled={!text.trim()}>
          {t('cos.start')}
        </button>
      </div>

      {preview?.intent && (
        <div className="cos-preview">
          {t('cos.understood')}: <b>{preview.label?.[locale] || preview.label?.tr}</b>
          {preview.ambiguous && <span className="cos-preview-amb">{t('cos.notSure')}</span>}
        </div>
      )}
    </div>
  );
}


/*
  Çalışma durumu şeridi.

  Spec'in "Video işleniyor · 2 dakika" örneği UYGULANMADI: render
  tarayıcıda çalışıyor, Workspace'e gelen kullanıcının arka planda
  işi olamaz. Sahte ilerleme göstermek yerine gerçek durumu
  gösteriyoruz (bkz. lib/creator/workstate.js).
*/
export function StateBar({ state, summary, t, locale }) {
  const L = (o) => o?.[locale] || o?.tr || '';
  const d = state.data || {};

  const text = (() => {
    switch (state.kind) {
      case 'no-plan':       return t('ws.s.noPlan');
      case 'blocked':       return t('ws.s.blocked', { n: d.blocked });
      case 'needs-fix':     return t('ws.s.needsFix', { n: d.count });
      case 'complete':      return t('ws.s.complete');
      case 'in-progress':   return t('ws.s.inProgress', { n: d.remaining });
      case 'ready-to-work':
        return d.plans
          ? t('ws.s.openPlans', { n: d.plans })
          : t('ws.s.ready', { n: d.remaining });
      default: return null;
    }
  })();

  if (!text) return null;

  const prod = d.production;

  return (
    <div className={'ws-state ws-state-' + state.kind}>
      <span className="ws-state-text">{text}</span>

      {/* Üretim ilerlemesi — gerçek sahne sayıları */}
      {prod?.steps?.length > 0 && (
        <span className="ws-state-steps">
          {prod.steps.map(s => (
            <span className={'ws-step' + (s.complete ? ' ws-step-done' : '')} key={s.key}>
              {t('cos.' + s.key) || s.key} {s.have}/{s.total}
            </span>
          ))}
        </span>
      )}

      {/* Tahmini süre — timeline motorundan, gerçek ölçüm.
          `estimated` ise "yaklaşık" diyoruz; uydurmuyoruz. */}
      {prod?.duration && (
        <span className="ws-state-dur">
          {prod.duration.estimated ? t('ws.s.approx') : ''} {formatDur(prod.duration.total)}
        </span>
      )}

      {summary.blockedSteps > 0 && state.kind !== 'blocked' && (
        <span className="ws-state-blocked">
          {t('cos.blockedCount', { n: summary.blockedSteps })}
        </span>
      )}
    </div>
  );
}


function formatDur(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  return m > 0 ? m + ':' + String(s % 60).padStart(2, '0') : s + 's';
}


/*
  Boş durum — spec: "Workspace boş görünmeyecek. Her zaman bir durum
  gösterecek."

  Yarım plan varsa onu öneriyor, yoksa ne yapabileceğini anlatıyor.
*/
export function EmptyState({ unfinished, t, locale, onboarding, onResume }) {
  if (unfinished.length > 0) {
    return (
      <div className="card ws-empty">
        <div className="ws-empty-title">{t('ws.resumeTitle')}</div>
        <div className="cos-resume-list">
          {unfinished.slice(0, 4).map(s => {
            const p = workflowStatus(s);
            return (
              <button className="cos-resume-item" key={s.id} onClick={() => onResume(s)}>
                <span className="cos-resume-title">{s.title}</span>
                <span className="cos-resume-meta">{p.done}/{p.doable} · {p.percent}%</span>
                <span className="cos-resume-bar"><i style={{ width: p.percent + '%' }} /></span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* Deneyim seviyesine göre farklı karşılama.

     Deneyimli kullanıcıya her gün "ne yapabilirsin" anlatmak can
     sıkıcı; o zaten biliyor. Yeni kullanıcıya ise yönlendirme şart. */
  const stage = onboarding?.stage || 'first-time';

  return (
    <div className="card ws-empty">
      <div className="ws-empty-title">{t('ws.stage.' + stage + '.title')}</div>
      {onboarding?.showGuide && (
        <p className="hint">{t('ws.stage.' + stage + '.hint')}</p>
      )}
    </div>
  );
}


/* Bildirim çubuğu */
export function NotificationBar({ items, t, locale, onClose, onOpenSession }) {
  const L = (o) => o?.[locale] || o?.tr || '';

  return (
    <div className="ws-notes">
      {items.map(x => (
        <div className={'ws-note ws-note-' + x.level} key={x.id}>
          <span className="ws-note-text">{noteText(x, t, L)}</span>
          {x.kind === 'unfinished-plans' && (
            <button className="btn btn-mini" onClick={() => onOpenSession(x.data.id)}>
              {t('ws.open')}
            </button>
          )}
          {x.kind === 'next-step' && x.data.route && (
            <Link href={x.data.route} className="btn btn-mini">{t('cos.go')}</Link>
          )}
          {x.kind === 'memory-proposals' && (
            <Link href="/studio/hafiza" className="btn btn-mini">{t('ws.review')}</Link>
          )}
          <button className="ws-note-x" onClick={() => onClose(x.id)}
            title={t('ws.dismiss')}>×</button>
        </div>
      ))}
    </div>
  );
}


/* Bildirim metni — anahtar + veriden kuruluyor (metin saklanmıyor) */
function noteText(x, t, L) {
  const d = x.data || {};
  switch (x.kind) {
    case 'stale-work':
      return t('ws.n.stale', { n: d.count, tasks: (d.tasks || []).map(y => L(y.label)).join(', ') });
    case 'stuck':
      return t('ws.n.stuck', { n: d.blocked });
    case 'plan-complete':
      return t('ws.n.complete', { title: d.title });
    case 'next-step':
      return t('ws.n.next', { task: L(d.label) });
    case 'unfinished-plans':
      return t('ws.n.unfinished', { n: d.count, title: d.title });
    case 'known-genre':
      return t('ws.n.genre', { genre: d.genre, n: d.count, m: d.total });
    case 'memory-proposals':
      return t('ws.n.proposals', { n: d.count });
    case 'no-plans':
      return t('ws.n.empty');
    default:
      return x.kind;
  }
}


export function Widget({ widget, data, t, locale, edit, first, last, onMove, onOpenSession }) {
  const L = (o) => o?.[locale] || o?.tr || '';
  if (!data) return null;

  return (
    <div className="ws-card">
      <div className="ws-card-head">
        <span className="ws-card-title">{L(widget.label)}</span>
        {edit && (
          <span className="ws-card-move">
            <button className="cos-move-btn" disabled={first}
              onClick={() => onMove(widget.key, 'up')}>↑</button>
            <button className="cos-move-btn" disabled={last}
              onClick={() => onMove(widget.key, 'down')}>↓</button>
          </span>
        )}
      </div>
      <WidgetBody kind={widget.key} data={data} t={t} L={L}
        onOpenSession={onOpenSession} />
    </div>
  );
}

function WidgetBody({ kind, data, t, L, onOpenSession }) {
  switch (kind) {
    case 'memory':
      return (
        <div className="ws-card-body">
          {data.genre && (
            <p className="ws-fact">{t('ws.w.genre', {
              genre: data.genre, p: Math.round((data.genreConfidence || 0) * 100) })}</p>
          )}
          {data.style && <p className="ws-fact">{t('ws.w.style', { style: data.style })}</p>}
          <p className="hint">{t('ws.w.episodes', { n: data.episodes })}</p>
          <Link href="/studio/hafiza" className="ws-card-link">{t('ws.w.memoryLink')}</Link>
        </div>
      );

    case 'goals':
      return (
        <div className="ws-card-body">
          {data.items.map(g => <p className="ws-fact" key={g.id}>• {g.text}</p>)}
          {data.open > 3 && <p className="hint">{t('ws.w.moreGoals', { n: data.open - 3 })}</p>}
          <Link href="/studio/hafiza" className="ws-card-link">{t('ws.w.manage')}</Link>
        </div>
      );

    case 'channels':
      return (
        <div className="ws-card-body">
          {data.items.map(c => (
            <p className="ws-fact" key={c.id}>
              • {c.name}{c.topic ? ' — ' + c.topic : ''}
            </p>
          ))}
          <Link href="/studio/hafiza" className="ws-card-link">{t('ws.w.manage')}</Link>
        </div>
      );

    case 'recent':
      return (
        <div className="ws-card-body">
          {data.items.map(s => (
            <button className="ws-recent" key={s.id} onClick={() => onOpenSession(s.id)}>
              <span className="ws-recent-title">{s.title}</span>
              <span className="ws-recent-pct">{s.complete ? '✓' : s.percent + '%'}</span>
            </button>
          ))}
        </div>
      );

    case 'progress':
      return (
        <div className="ws-card-body">
          <div className="ws-card-big">{data.percent}%</div>
          <p className="hint">
            {t('ws.w.progress', { done: data.done, total: data.doable })}
            {data.blocked > 0 && ' · ' + t('cos.blockedCount', { n: data.blocked })}
          </p>
        </div>
      );

    case 'habits':
      return (
        <div className="ws-card-body">
          {data.reasons.map((r, i) => (
            <p className="ws-fact" key={i}>
              {t('mem.reason.' + r.kind, { keys: r.keys.join(', ') })}
            </p>
          ))}
          <Link href="/studio/hafiza" className="ws-card-link">{t('ws.w.manage')}</Link>
        </div>
      );

    default:
      return null;
  }
}

/*
  Hızlı başlangıç — kullanıcıya göre.

  Adım 2'de sabit örnek listesiydi (EXAMPLE_PROMPTS). Artık
  lib/creator/quick.js hafızadan cümle KURUYOR — ezberlemiyor.
  Kullanıcının eski cümlelerini saklamak Creator Memory'nin yasağını
  dolanmak olurdu (bkz. quick.js'teki not).

  Yeni kullanıcıya sabit örnekler, deneyimliye kendi türünde öneriler
  ve analiz/iyileştirme işleri.
*/
export function QuickActions({ t, locale, memory, sessions, onStart }) {
  const { items, source } = buildQuickActions({ memory, sessions, locale });

  /* Şablondan cümle kur — metin i18n'den, kodda değil */
  const textOf = (item) => item.text || t(item.template, item.parts || {});

  return (
    <section className="ws-quick">
      <div className="ws-quick-label">
        {t('ws.quickActions')}
        {source === 'memory' && (
          <span className="ws-quick-tag">{t('ws.quickPersonal')}</span>
        )}
      </div>
      <div className="ws-quick-list">
        {items.map(item => (
          <button className="ws-quick-item" key={item.id}
            onClick={() => onStart(textOf(item))}>
            {textOf(item)}
          </button>
        ))}
      </div>
    </section>
  );
}
