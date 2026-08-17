'use client';
import { useState } from 'react';
import Link from 'next/link';
import { buildQuickActions } from '@/lib/creator/quick';
import { briefSummary } from '@/lib/creator/brief';
/*
  R1: TASK-08'de DailyParts ayrılırken bu import'lar oraya taşındı
  ama WorkspaceParts hâlâ kullanıyordu.
*/
import { warningsFor } from '@/lib/creator/state';
import { readLog } from '@/lib/creator/live';
import { classifyIntent, intentByKey } from '@/lib/creator/intent';
import { reclassify } from '@/lib/creator/session';
/* Niyet anahtarını okunur etikete çevirmek için (Adım 3) */


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

function formatDur(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  return m > 0 ? m + ':' + String(s % 60).padStart(2, '0') : s + 's';
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
    case 'unfinished-project':
      return d.count > 1
        ? t('ws.n.unfinishedProjects', { n: d.count, title: d.title, d: d.idleDays })
        : t('ws.n.unfinishedProject', { title: d.title, d: d.idleDays });
    case 'project-suggestion':
      return t('pj.sug.' + d.kind, { title: d.title });
    case 'no-plans':
      return t('ws.n.empty');
    default:
      return x.kind;
  }
}


export function Widget({ widget, data, t, locale, edit, first, last, onMove,
                         onOpenSession, onOpenProject }) {
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
        onOpenSession={onOpenSession} onOpenProject={onOpenProject} />
    </div>
  );
}

function WidgetBody({ kind, data, t, L, onOpenSession, onOpenProject }) {
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

    /* Gerçek videolar — yarım kalanlar önce.
       Durum rozeti ve ilerleme gösteriliyor; tıklayınca açılıyor. */
    case 'projects':
      return (
        <div className="ws-card-body">
          {data.items.map(p => (
            <button className="ws-project" key={p.id}
              onClick={() => onOpenProject?.(p.id)}>
              <span className="ws-project-main">
                <span className="ws-project-title">{p.title}</span>
                <span className={'ws-project-status pj-badge-' + p.status}>
                  {t('pj.status.' + p.status)}
                </span>
              </span>
              <span className="ws-project-meta">
                {p.idleDays != null
                  ? t('pj.idle', { n: p.idleDays })
                  : (p.ready != null ? '%' + p.ready : '')}
              </span>
            </button>
          ))}
          {data.total > data.items.length && (
            <Link href="/studio/projeler" className="ws-card-link">
              {t('ws.w.allProjects', { n: data.total })}
            </Link>
          )}
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


/*
  PLAN ÖZETİ — Sprint-6 TASK-02, Adım 3.

  Spec'in karşılama çıktısı:

    "Hedefini analiz ettim. Senin için şu çalışma planını hazırladım.
     ✓ ...  Tahmini süre: 26 dakika"

  ---------------------------------------------------------------
  SÜRE YOKSA SATIR YOK

  `brief.estimate.known` false ise süre HİÇ gösterilmiyor — "süre
  hesaplanamadı" bile demiyoruz. Kullanıcı adım sayısını görüyor ve
  o yeterli bilgi.

  Ölçüm biriktikçe satır kendiliğinden beliriyor (lib/creator/timing.js).
  ---------------------------------------------------------------

  ZORUNLU DOSYA ÖNDEN

  Video analizi akışı videosuz çalışmıyor. Kullanıcı 7 adımlık plan
  kurup 1. adımda takılmasındansa baştan bilsin.
*/
export function PlanBrief({ brief, t, locale, fresh, nextTask, onStart }) {
  if (!brief || !brief.steps) return null;
  const L = (o) => o?.[locale] || o?.tr || '';
  const s = briefSummary(brief);

  return (
    <div className={'pb' + (fresh ? ' pb-fresh' : '')}>
      {/*
        ---------- KARŞILAMA ----------

        Kullanıcının kararı (Sprint-6 TASK-02):
          "Creator OS hiçbir zaman 'Bu planı onaylıyor musun?' diye
           sormamalı. Plan her zaman canlıdır."

        Onay adımı YOK. Bu mesaj bağlam veriyor: planı Creator OS
        hazırladı, değiştirilebilir, şimdi başlanabilir.

        YALNIZCA YENİ PLANDA: kullanıcı üç gün sonra dönüp "seni
        anladım, plan hazırladım" mesajını tekrar görmemeli — o
        zaten çalışıyor. `fresh` bayrağı hiç görev tamamlanmamışsa
        true; ilk iş bitince mesaj kendiliğinden kayboluyor.
      */}
      {fresh && (
        <div className="pb-welcome">
          <p className="pb-welcome-text">{t('pb.welcome')}</p>
          {nextTask && (
            <button className="btn btn-primary btn-mini pb-go"
              onClick={onStart}>
              {t('pb.startFirst', { task: L(nextTask.label) })}
            </button>
          )}
        </div>
      )}

      <div className="pb-head">
        {/* Ne anladık — sınıflandırma sonucu, iddia değil */}
        <span className="pb-intent">{L(brief.intentLabel)}</span>
        {brief.ambiguous && <span className="pb-amb">{t('pb.notSure')}</span>}
      </div>

      <div className="pb-facts">
        <span className="pb-fact">{t('pb.steps', { n: s.steps })}</span>
        <span className="pb-fact">{t('pb.modules', { n: s.modules })}</span>
        {/* SÜRE: yalnızca gerçekten ölçülmüşse */}
        {s.hasEstimate && (
          <span className="pb-fact pb-time"
            title={t('pb.timeBasis', { n: brief.estimate.measured, m: brief.estimate.tasks })}>
            {t('pb.about', { n: s.minutes })}
          </span>
        )}
        {brief.futureSteps > 0 && (
          <span className="pb-fact pb-later">
            {t('pb.later', { n: brief.futureSteps })}
          </span>
        )}
      </div>

      {/* ZORUNLU DOSYA — baştan uyarı */}
      {brief.blockingInput && (
        <p className="pb-needs">
          {t('pb.needsFile', { kind: t('pb.kind.' + brief.blockingInput.kind) })}
        </p>
      )}

      {/* AI araçları — SEÇMİYORUZ, gerekeni söylüyoruz */}
      {brief.tools.length > 0 && (
        <p className="pb-tools">
          <span className="pb-tools-label">{t('pb.toolsLabel')}</span>
          {brief.tools.map((tool, i) => (
            <span className="pb-tool" key={tool.kind}>
              {i > 0 && ' · '}
              {t('pb.tool.' + tool.kind)}
              {tool.preferred && (
                <span className="pb-pref">{t('pb.usually', { name: tool.preferred })}</span>
              )}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/*
  TASK-02 Adım 3'te taşındı: CreatorView 900 satırı aştı.

  İkisi de SAF ÇİZİM — oturum durumunu değiştirmiyorlar, aldıkları
  veriyi gösteriyorlar. Bölme ölçütü Adım 4'te (TASK-04) koyduğumuz
  ölçütün aynısı.
*/
/* Akıllı uyarı kutusu — spec'in "[Yine de Devam Et]" akışı */
export function SmartWarning({ taskKey, tasks, t, L, onProceed, onCancel }) {
  const w = warningsFor(taskKey, tasks)[0];
  if (!w) return null;
  return (
    <div className="cos-warn">
      <div className="cos-warn-title">
        {t('cos.warnTitle', { missing: w.labels.map(l => L(l)).join(', ') })}
      </div>
      <p className="cos-warn-desc">{t('cos.warnDesc')}</p>
      <div className="cos-warn-actions">
        <button className="btn btn-mini" onClick={onProceed}>{t('cos.proceedAnyway')}</button>
        <button className="btn btn-mini" onClick={onCancel}>{t('cos.cancel')}</button>
      </div>
    </div>
  );
}


/* Olay günlüğü — metin burada kuruluyor, kayıtta anahtar var. */
export function EventLog({ session, t, L }) {
  const [showBlocking, setShowBlocking] = useState(false);
  const entries = readLog(session, { limit: 20, includeBlocking: showBlocking });

  return (
    <div className="cos-log">
      <div className="cos-log-head">
        <span className="entry-label" style={{ margin: 0 }}>{t('cos.logTitle')}</span>
        <button className="btn btn-mini" onClick={() => setShowBlocking(!showBlocking)}>
          {showBlocking ? t('cos.hideBlocking') : t('cos.showBlocking')}
        </button>
      </div>
      {entries.map(e => (
        <div className="cos-log-row" key={e.id}>
          <span className="cos-log-icon">{e.icon}</span>
          <span className="cos-log-text">
            {e.taskLabel ? L(e.taskLabel) + ' ' : ''}{t('cos.ev.' + e.type)}
          </span>
          <span className="cos-log-time">
            {new Date(e.at).toLocaleTimeString(undefined,
              { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      ))}
    </div>
  );
}


/* Kararsızlıkta seçenek sunma — motorun aday listesinden */
export function AmbiguityPicker({ session, t, locale, onUpdate }) {
  const candidates = classifyIntent(session.input).candidates || [];
  if (candidates.length < 2) return null;

  return (
    <div className="cos-ambiguous">
      <div className="cos-ambiguous-title">{t('cos.whichOne')}</div>
      <div className="cos-ambiguous-list">
        {candidates.map(c => (
          <button key={c.key}
            className={'cos-choice' + (c.key === session.intent ? ' on' : '')}
            onClick={() => onUpdate(reclassify(session, c.key))}>
            {c.label?.[locale] || c.label?.tr}
          </button>
        ))}
      </div>
    </div>
  );
}

/* Niyet hiç tanınmadıysa: en yaygın başlangıçları öner.
   Spec kuralı 3 — boş ekran yok. */
const FALLBACK_INTENTS = ['video.generic', 'video.horror', 'video.kids',
                          'video.shorts', 'improve.video'];


export function IntentFallback({ t, locale, session, onUpdate }) {
  return (
    <div className="cos-ambiguous">
      <div className="cos-ambiguous-title">{t('cos.cannotTell')}</div>
      <div className="cos-ambiguous-list">
        {FALLBACK_INTENTS.map(k => {
          const d = intentByKey(k);
          if (!d) return null;
          return (
            <button key={k} className="cos-choice"
              onClick={() => onUpdate(reclassify(session, k))}>
              {d.label[locale] || d.label.tr}
            </button>
          );
        })}
      </div>
    </div>
  );
}


