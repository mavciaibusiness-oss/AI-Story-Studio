'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useT, useI18n } from '@/lib/i18n';
import { useStudio } from '@/lib/store';
import { classifyIntent, EXAMPLE_PROMPTS, intentByKey } from '@/lib/creator/intent';
import {
  createSession, loadSessions, saveSessions, upsertSession, removeSession,
  reclassify, unfinishedSessions
} from '@/lib/creator/session';
import { availableToAdd, TASKS } from '@/lib/creator/workflow';
/* TASK-02: canlı workflow motoru. Görev işlemleri artık live.* üzerinden
   geçiyor — her biri durumları yeniden hesaplayıp günlüğe yazıyor. */
import { live, upgradeSession, readLog, staleTasks } from '@/lib/creator/live';
import { workflowStatus, markSuggested } from '@/lib/creator/suggest';
import { STATES, normalizeStatus, warningsFor } from '@/lib/creator/state';
/* TASK-02 Adım 6: storyboard'dan otomatik ilerleme tespiti */
import { autoCompletable, progressEvidence, isDetectable } from '@/lib/creator/detect';

/*
  CREATOR OS — giriş ekranı.

  Sprint 5 / TASK-01, Adım 4.

  Spec'in ekran tarifi:

    Merhaba 👋
    Bugün ne yapmak istiyorsun?
    ______________________________
    [ Creator OS ile Başla ]

  BEŞ TASARIM KARARI:

  1. BOŞ EKRAN YOK (spec kuralı 3).
     Her durumda bir sonraki hamle görünür: yeni oturumda örnekler,
     kurulmuş yol haritasında sonraki adım, yarım kalmış oturumda
     "devam et".

  2. SONRAKİ ADIM HER ZAMAN ÖNDE (spec kuralı 4).
     Yol haritası kartının en üstünde, en büyük düğme. Kullanıcı
     listeyi okumak zorunda kalmadan devam edebilmeli.

  3. KARARSIZLIKTA SORULUYOR.
     Spec "kullanıcı karar vermesin" diyor. Ama motor kararsızsa
     (ambiguous) sessizce yanlış tahmine bağlanmak daha kötü.
     Seçenekler gösteriliyor — kuralın dürüst uygulaması.

  4. SPRINT-6 GÖREVLERİ DÜRÜST GÖSTERİLİYOR.
     "Yakında" etiketi, soluk görünüm, tıklanamaz. Ve akışın tamamı
     Sprint-6'daysa bugün yapılabilecek alternatif öne çıkarılıyor.

  5. DEPOLAMA SINIRI SÖYLENİYOR.
     Oturumlar bu tarayıcıda tutuluyor (TASK-04'e kadar). Kullanıcı
     başka bilgisayarda bulamayınca şaşırmasın diye yazıyoruz.
*/

export default function CreatorView({ userId }) {
  const t = useT();
  const { locale } = useI18n();
  const { episodeId, storyboard } = useStudio();

  const [text, setText] = useState('');
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [preview, setPreview] = useState(null);   // yazarken canlı tahmin
  const [storeWarn, setStoreWarn] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [loaded, setLoaded] = useState(false);

  /* Oturumları yükle — yalnızca istemcide (localStorage) */
  useEffect(() => {
    /* TASK-01 oturumlarını canlı modele yükselt — planlar kaybolmasın */
    const list = loadSessions(userId).map(s => markSuggested(upgradeSession(s)));
    setSessions(list);
    setLoaded(true);
  }, [userId]);

  const persist = useCallback((list) => {
    setSessions(list);
    const ok = saveSessions(userId, list);
    /* Kota dolduysa kullanıcıya söyle — sessizce kaybetme */
    setStoreWarn(!ok);
  }, [userId]);

  /* Canlı tahmin: kullanıcı yazarken ne anladığımızı gösteriyoruz.
     Sürpriz olmasın — "Başla"ya basınca beklemediği bir akış çıkmasın. */
  useEffect(() => {
    const v = text.trim();
    if (v.length < 4) { setPreview(null); return; }
    const id = setTimeout(() => setPreview(classifyIntent(v)), 220);
    return () => clearTimeout(id);
  }, [text]);

  function start(input) {
    const value = String(input ?? text).trim();
    if (!value) return;
    const s = markSuggested(upgradeSession(createSession(value, { episodeId })));
    const list = upsertSession(sessions, s);
    persist(list);
    setActive(s);
    setText('');
    setPreview(null);
  }

  /* Her değişiklikten sonra öneri yeniden hesaplanıyor — spec:
     "Creator OS workflow'u her olaydan sonra yeniden değerlendirmelidir." */
  function update(next) {
    const marked = markSuggested(next);
    setActive(marked);
    persist(upsertSession(sessions, marked));
  }

  /* OTOMATİK İLERLEME: storyboard'da kanıt varsa görevi işaretle.

     Yalnızca KESİN kanıtta (tüm sahnelerde) çalışıyor — kısmi iş
     bitmiş sayılmaz. Kullanıcının atladığı görevlere dokunulmuyor.

     Bağlı bölüm yoksa çalışmıyor: başka bir videonun storyboard'una
     bakıp bu planı işaretlemek yanlış olur. */
  useEffect(() => {
    if (!active || !storyboard) return;
    if (active.episodeId && episodeId && active.episodeId !== episodeId) return;

    const keys = autoCompletable(active.workflow?.tasks || [], storyboard);
    if (!keys.length) return;

    let next = active;
    for (const k of keys) next = live.done(next, k);
    update(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, storyboard, episodeId]);

  function discard(id) {
    persist(removeSession(sessions, id));
    if (active?.id === id) setActive(null);
  }

  const unfinished = unfinishedSessions(sessions).filter(s => s.id !== active?.id);
  const status = active ? workflowStatus(active) : null;

  return (
    <>
      {/* ---- Giriş ---- */}
      {!active && (
        <section className="cos-hero">
          <div className="cos-greet">{t('cos.greet')}</div>
          <h1 className="cos-question">{t('cos.question')}</h1>

          <div className="cos-input-wrap">
            <textarea
              className="input cos-input"
              rows={2}
              placeholder={t('cos.placeholder')}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start(); }
              }} />

            {/* Canlı tahmin — sürpriz olmasın */}
            {preview?.intent && (
              <div className="cos-preview">
                {t('cos.understood')}: <b>{preview.label?.[locale] || preview.label?.tr}</b>
                {Object.keys(preview.modifiers || {}).length > 0 && (
                  <span className="cos-preview-mods">
                    {Object.values(preview.modifiers).map(k => {
                      const d = intentByKey(k);
                      return d ? (d.label[locale] || d.label.tr) : k;
                    }).join(' · ')}
                  </span>
                )}
                {preview.ambiguous && <span className="cos-preview-amb">{t('cos.notSure')}</span>}
              </div>
            )}

            <button className="btn btn-primary cos-start"
              onClick={() => start()} disabled={!text.trim()}>
              {t('cos.start')}
            </button>
          </div>

          {/* Hazır örnekler — boş ekran yok */}
          <div className="cos-examples">
            <div className="cos-examples-label">{t('cos.examples')}</div>
            <div className="cos-examples-list">
              {EXAMPLE_PROMPTS.map((e, i) => (
                <button key={i} className="cos-example"
                  onClick={() => start(e[locale] || e.tr)}>
                  {e[locale] || e.tr}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---- Yol haritası ---- */}
      {active && (
        <WorkflowCard
          session={active} status={status} t={t} locale={locale}
          storyboard={storyboard}
          showAdd={showAdd} setShowAdd={setShowAdd}
          onUpdate={update}
          onBack={() => setActive(null)}
          onDiscard={() => discard(active.id)} />
      )}

      {/* ---- Devam edilecek oturumlar ---- */}
      {loaded && unfinished.length > 0 && (
        <section className="cos-resume">
          <div className="entry-label">{t('cos.continue')}</div>
          <div className="cos-resume-list">
            {unfinished.slice(0, 4).map(s => {
              const p = workflowStatus(s);
              return (
                <button className="cos-resume-item" key={s.id}
                  onClick={() => setActive(s)}>
                  <span className="cos-resume-title">{s.title}</span>
                  <span className="cos-resume-meta">
                    {p.done}/{p.doable} · {p.percent}%
                  </span>
                  <span className="cos-resume-bar">
                    <i style={{ width: p.percent + '%' }} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Depolama sınırı — kullanıcı başka cihazda bulamayınca şaşırmasın */}
      {loaded && sessions.length > 0 && (
        <p className="hint cos-store-note">{t('cos.storageNote')}</p>
      )}
      {storeWarn && <div className="admin-alert">{t('cos.storeFull')}</div>}
    </>
  );
}

/* ------------------------------------------------------------------ */

function WorkflowCard({ session, status, t, locale, showAdd, setShowAdd,
                        storyboard, onUpdate, onBack, onDiscard }) {
  const wf = session.workflow;
  const L = (o) => o?.[locale] || o?.tr || '';
  const [showLog, setShowLog] = useState(false);
  const [warnFor, setWarnFor] = useState(null);   // akıllı uyarı bekleyen görev

  const sg = status?.suggestion;
  const stale = status?.stale || [];
  /* Kısmi ilerleme: "12 sahneden 7'sinde görsel var" */
  const evidence = storyboard ? progressEvidence(wf.tasks, storyboard) : {};

  /* Akıllı uyarı: kullanıcı yumuşak önkoşulu eksik bir göreve
     girmek istiyor. Spec: "[Yine de Devam Et]" — engel değil, bilgi. */
  function openTask(task) {
    const w = warningsFor(task.key, wf.tasks);
    if (w.length && warnFor !== task.key) {
      setWarnFor(task.key);
      return false;   // önce uyarıyı göster
    }
    setWarnFor(null);
    onUpdate(live.openModule(session, task.key, task.route));
    return true;
  }

  return (
    <section className="cos-wf">
      <div className="cos-wf-head">
        <button className="btn btn-mini" onClick={onBack}>{t('cos.back')}</button>
        <span style={{ flex: 1 }} />
        {(session.log?.length > 0) && (
          <button className="btn btn-mini" onClick={() => setShowLog(!showLog)}>
            {showLog ? t('cos.closeLog') : t('cos.showLog')}
          </button>
        )}
        <button className="btn btn-mini" onClick={onDiscard}>{t('cos.discard')}</button>
      </div>

      <blockquote className="cos-quote">{session.input}</blockquote>

      <div className="cos-intent">
        {session.intent ? (
          <>
            <span className="cos-intent-label">{L(wf.label) || session.intent}</span>
            {session.confidence !== null && session.confidence !== undefined && (
              <span className="cos-intent-conf">
                {t('cos.confidence')} {Math.round(session.confidence * 100)}%
              </span>
            )}
            {session.intentSource === 'user' && (
              <span className="tag">{t('cos.youChose')}</span>
            )}
          </>
        ) : (
          <span className="cos-intent-label">{t('cos.noIntent')}</span>
        )}
      </div>

      {session.ambiguous && wf.tasks.length > 0 && (
        <AmbiguityPicker session={session} t={t} locale={locale} onUpdate={onUpdate} />
      )}
      {!session.intent && (
        <IntentFallback t={t} locale={locale} session={session} onUpdate={onUpdate} />
      )}

      {wf.available === false && wf.suggestion && (
        <div className="cos-unavailable">
          <div className="cos-unavailable-title">{L(wf.suggestion.reason)}</div>
          <p className="cos-unavailable-offer">{L(wf.suggestion.offer)}</p>
          <div className="cos-unavailable-tasks">
            {wf.suggestion.tasks.map(x => (
              <Link key={x.key} href={x.route} className="btn btn-mini">{L(x.label)}</Link>
            ))}
          </div>
        </div>
      )}

      {/* ESKİMİŞ İŞ — işi silmiyoruz, riski bildiriyoruz */}
      {stale.length > 0 && (
        <div className="cos-stale">
          <div className="cos-stale-title">{t('cos.staleTitle')}</div>
          {stale.map(x => (
            <p className="cos-stale-item" key={x.key}>
              {t('cos.staleItem', {
                task: L(x.label),
                because: x.becauseLabels.map(l => L(l)).join(', ')
              })}
            </p>
          ))}
        </div>
      )}

      {/* TEK ÖNERİ — gerekçesiyle. Spec kuralı: menü değil, tek adım. */}
      {sg?.task && (
        <div className="cos-next">
          <div className="cos-next-label">{t('cos.nextStep')}</div>
          <div className="cos-next-body">
            <div>
              <div className="cos-next-title">{L(sg.task.label)}</div>
              <p className="cos-next-desc">{L(sg.task.desc)}</p>
              <p className="cos-next-why">{reasonText(sg, t)}</p>
            </div>
            <Link href={sg.task.route} className="btn btn-primary"
              onClick={(e) => { if (!openTask(sg.task)) e.preventDefault(); }}>
              {t('cos.go')}
            </Link>
          </div>
        </div>
      )}

      {/* Tıkanma — "bitti" ile karıştırılmamalı */}
      {status?.stuck && (
        <div className="cos-stuck">
          <div className="cos-stuck-title">{t('cos.stuckTitle')}</div>
          <p className="hint">{t('cos.stuckHint')}</p>
        </div>
      )}
      {status?.complete && <div className="cos-done">{t('cos.allDone')}</div>}

      {/* Akıllı uyarı — [Yine de Devam Et] */}
      {warnFor && (
        <SmartWarning taskKey={warnFor} tasks={wf.tasks} t={t} L={L}
          onProceed={() => {
            const task = wf.tasks.find(x => x.key === warnFor);
            setWarnFor(null);
            if (task) {
              onUpdate(live.openModule(session, task.key, task.route));
              window.location.href = task.route;
            }
          }}
          onCancel={() => setWarnFor(null)} />
      )}

      {status && status.doable > 0 && (
        <div className="cos-progress">
          <div className="cos-progress-bar">
            <i style={{ width: status.percent + '%' }} />
          </div>
          <div className="cos-progress-label">
            {t('cos.progress', { done: status.done, total: status.doable, p: status.percent })}
            {status.blocked > 0 && ' · ' + t('cos.blockedCount', { n: status.blocked })}
            {wf.stats.future > 0 && ' · ' + t('cos.futureCount', { n: wf.stats.future })}
          </div>
        </div>
      )}

      {/* CREATOR TIMELINE — zaman sıralı, yedi durum */}
      <div className="cos-timeline">
        {wf.tasks.map((task, i) => (
          <TaskRow key={task.key} task={task} index={i} t={t} L={L}
            session={session} onUpdate={onUpdate}
            isSuggested={sg?.task?.key === task.key}
            onOpen={openTask}
            evidence={evidence[task.key] || null}
            total={wf.tasks.length}
            last={i === wf.tasks.length - 1} />
        ))}
      </div>

      <div className="cos-wf-actions">
        <button className="btn btn-mini" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? t('cos.closeAdd') : t('cos.addTask')}
        </button>
      </div>
      {showAdd && (
        <div className="cos-add-list">
          {availableToAdd(wf).map(a => (
            <button key={a.key} className={'cos-add-item' + (a.future ? ' cos-add-future' : '')}
              onClick={() => { onUpdate(live.add(session, a.key)); setShowAdd(false); }}>
              {L(a.label)}
              {a.future && <span className="cos-soon">{t('cos.soon')}</span>}
            </button>
          ))}
        </div>
      )}

      {/* OLAY GÜNLÜĞÜ */}
      {showLog && <EventLog session={session} t={t} L={L} />}
    </section>
  );
}

/* Öneri gerekçesi — metin i18n'den, veri motordan. */
function reasonText(sg, t) {
  switch (sg.reason) {
    case 'stale':
      return t('cos.why.stale');
    case 'continue':
      return t('cos.why.continue');
    case 'unlocks':
      return t('cos.why.unlocks', { n: sg.detail?.unlocks ?? 0 });
    case 'next-in-plan':
    default:
      return t('cos.why.next');
  }
}

/* Akıllı uyarı kutusu — spec'in "[Yine de Devam Et]" akışı */
function SmartWarning({ taskKey, tasks, t, L, onProceed, onCancel }) {
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
function EventLog({ session, t, L }) {
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

function TaskRow({ task, index, t, L, session, onUpdate, isSuggested, onOpen,
                  evidence, total, last }) {
  const st = normalizeStatus(task.status);
  const done = st === 'done';
  const skipped = st === 'skipped';
  const blocked = st === 'blocked';
  const activeNow = st === 'active';

  return (
    <div className={'cos-task cos-st-' + st + (isSuggested ? ' cos-task-suggested' : '')}>
      {/* Zaman çizelgesi çizgisi */}
      <div className="cos-tl-rail">
        <div className="cos-tl-dot">
          {done ? '✓' : skipped ? '–' : blocked ? '⊘' : task.future ? '⧗' : index + 1}
        </div>
        {!last && <div className="cos-tl-line" />}
      </div>

      <div className="cos-task-body">
        <div className="cos-task-head">
          <span className="cos-task-label">{L(task.label)}</span>
          <span className={'cos-state cos-state-' + st}>{L(STATES[st]?.label)}</span>
          {task.optional && <span className="cos-opt">{t('cos.optional')}</span>}
        </div>
        <p className="cos-task-desc">{L(task.desc)}</p>

        {/* Engelli görevde NEDEN yapamıyorum */}
        {blocked && task.blockReason && (
          <p className="cos-blocked-why">{L(task.blockReason)}</p>
        )}

        {/* Kısmi ilerleme kanıtı — işaretleme yok, bilgi */}
        {evidence && (
          <div className="cos-evidence">
            <div className="cos-evidence-bar">
              <i style={{ width: Math.round(evidence.ratio * 100) + '%' }} />
            </div>
            <span>{t('cos.evidence', { have: evidence.have, total: evidence.total })}</span>
          </div>
        )}
      </div>

      <div className="cos-task-actions">
        {/* SIRALAMA — spec kabul kriteri: "Görevler yeniden sıralanabiliyor"
            Sürükle-bırak yerine düğme: erişilebilir, dokunmatikte çalışır,
            test edilebilir. */}
        <span className="cos-move">
          <button className="cos-move-btn" disabled={index === 0}
            onClick={() => onUpdate(live.move(session, task.key, index - 1))}
            title={t('cos.moveUp')}>↑</button>
          <button className="cos-move-btn" disabled={index === total - 1}
            onClick={() => onUpdate(live.move(session, task.key, index + 1))}
            title={t('cos.moveDown')}>↓</button>
        </span>

        {task.future ? null : blocked ? null : done ? (
          <button className="btn btn-mini"
            onClick={() => onUpdate(live.reopen(session, task.key))}>
            {t('cos.redo')}
          </button>
        ) : (
          <>
            <Link href={task.route} className="btn btn-mini"
              onClick={(e) => { if (!onOpen(task)) e.preventDefault(); }}>
              {t('cos.open')}
            </Link>
            <button className="btn btn-mini"
              onClick={() => onUpdate(live.done(session, task.key))}>
              {t('cos.markDone')}
            </button>
            {task.optional && (
              <button className="btn btn-mini"
                onClick={() => onUpdate(live.skip(session, task.key))}>
                {t('cos.skip')}
              </button>
            )}
          </>
        )}
        <button className="btn btn-mini cos-task-remove"
          onClick={() => onUpdate(live.remove(session, task.key))}
          title={t('cos.remove')}>×</button>
      </div>
    </div>
  );
}

/* Kararsızlıkta seçenek sunma — motorun aday listesinden */
function AmbiguityPicker({ session, t, locale, onUpdate }) {
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

function IntentFallback({ t, locale, session, onUpdate }) {
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
