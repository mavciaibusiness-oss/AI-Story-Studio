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
import { workflowStatus, markSuggested, reasonKey } from '@/lib/creator/suggest';
import { STATES, normalizeStatus, warningsFor } from '@/lib/creator/state';
/* TASK-02 Adım 6: storyboard'dan otomatik ilerleme tespiti */
import { autoCompletable, progressEvidence, isDetectable } from '@/lib/creator/detect';
/* TASK-03 Adım 5: hafıza yol haritasını kişiselleştiriyor */
import { personalizeWorkflow, intentHints, personalizationSummary } from '@/lib/creator/personalize';
/* TASK-04: Workspace katmanı — bildirimler ve widget düzeni */
import { buildNotifications, dismiss, actionCount } from '@/lib/creator/notify';
import { buildLayout, layoutKeys, widgetData, moveWidget } from '@/lib/creator/widgets';
/* TASK-04 Adım 3: gerçek çalışma durumu */
import { workState, workSummary } from '@/lib/creator/workstate';
import { buildQuickActions, onboardingState } from '@/lib/creator/quick';
/* Workspace görünüm bileşenleri — CreatorView 1123 satıra çıkmıştı,
   çizim katmanı ayrıldı. */
import { DirectorPanel, EntryPanel, StateBar, EmptyState,
         NotificationBar, Widget, QuickActions } from './WorkspaceParts';

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
  /* Creator Memory — açılışta okunur, arka planda öğrenir */
  const [memory, setMemory] = useState(null);
  const [memChanges, setMemChanges] = useState([]);
  /* Öneriler hafızanın PARÇASI DEĞİL — türetilmiş veri.

     İlk sürümde `memory.__proposals` olarak iliştiriyordum. Çalışıyordu
     ama hafıza nesnesini kirletiyordu: bir yerde kaydedilirse
     veritabanına türetilmiş veri yazılırdı. Ayrı durumda tutuluyor. */
  const [proposals, setProposals] = useState([]);
  /* Workspace: bildirim kapatmaları ve widget düzeni.

     localStorage'da tutuluyor — kullanıcı tercihi, sunucuya taşımaya
     değmez. Hafızadan farklı: hafıza cihazlar arası olmalı (öğrenilen
     bilgi), widget sırası bu ekrana özgü bir görünüm ayarı. */
  const [dismissed, setDismissed] = useState([]);
  const [layout, setLayout] = useState(null);
  const [editLayout, setEditLayout] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ws:' + (userId || 'anon'));
      if (raw) {
        const d = JSON.parse(raw);
        setDismissed(Array.isArray(d.dismissed) ? d.dismissed : []);
        setLayout(Array.isArray(d.layout) ? d.layout : null);
      }
    } catch { /* bozuk veri — varsayılana düş */ }
  }, [userId]);

  const saveWorkspace = useCallback((next) => {
    try {
      localStorage.setItem('ws:' + (userId || 'anon'), JSON.stringify(next));
    } catch { /* kota dolu — görünüm ayarı, kritik değil */ }
  }, [userId]);

  /* Oturumları yükle — yalnızca istemcide (localStorage) */
  useEffect(() => {
    /* TASK-01 oturumlarını canlı modele yükselt — planlar kaybolmasın */
    const list = loadSessions(userId).map(s => markSuggested(upgradeSession(s)));
    setSessions(list);
    setLoaded(true);
  }, [userId]);

  /* OTOMATİK ÖĞRENME — açılışta bir kez.

     Öğrenme sunucuda; istemci yalnızca oturumları gönderiyor
     (localStorage'da olduğu için sunucu göremiyor).

     Hafıza kapalıysa (migration yok) sessizce geçiyoruz: Creator OS
     hafızasız da çalışmalı. */
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/memory', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'learn',
            sessions: sessions.map(s => ({ id: s.id, log: s.log || [] }))
          })
        }).then(x => x.json());
        if (!cancelled && r?.ok && r.memory) {
          setMemory(r.memory);
          setProposals(r.proposals || []);
        }
      } catch { /* hafıza kapalı ya da ağ hatası — Creator OS çalışmaya devam */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

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
    let s = upgradeSession(createSession(value, { episodeId }));

    /* KİŞİSELLEŞTİRME: hafıza yol haritasını alışkanlığına göre
       ayarlıyor. Değişiklikler raporlanıyor — sessiz değişiklik yok. */
    if (memory && s.workflow?.tasks?.length) {
      const p = personalizeWorkflow(s.workflow, memory);
      if (p.changes.length) {
        s = { ...s, workflow: p.workflow };
        setMemChanges(p.changes);
      } else {
        setMemChanges([]);
      }
    }

    s = markSuggested(s);
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

  /* SEKME GÖRÜNÜR OLUNCA TAZELE.

     Kullanıcı modüle gitti, iş yaptı, Workspace'e döndü. Sayfa
     yeniden yüklenmediyse (Next.js istemci gezinmesi) oturumlar
     bayat kalır ve ilerleme görünmez.

     visibilitychange: sekme geri geldiğinde localStorage'dan
     yeniden okuyoruz. Ucuz bir işlem — ağ isteği yok. */
  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== 'visible') return;
      const list = loadSessions(userId).map(s => markSuggested(upgradeSession(s)));
      setSessions(list);
      /* Açık oturum varsa güncel hâlini al — kullanıcı modülde
         bir adımı bitirmiş olabilir (dönüş şeridi yazmış olur). */
      setActive(prev => prev ? (list.find(x => x.id === prev.id) || prev) : prev);
    }
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [userId]);

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

  /* ---- Workspace verisi ---- */
  const personalization = memory ? personalizationSummary(memory) : null;
  const wsCtx = { memory, sessions, active, personalization };
  const notifications = buildNotifications({ sessions, active, memory, proposals, dismissed });
  const state = workState({ sessions, active, storyboard });
  const summary = workSummary({ sessions, active });
  const built = buildLayout(wsCtx, layout);
  const badge = actionCount(notifications);

  function closeNotification(id) {
    const next = dismiss(dismissed, id);
    setDismissed(next);
    saveWorkspace({ dismissed: next, layout });
  }

  function moveCard(key, dir) {
    const current = layout || layoutKeys(built);
    const next = moveWidget(current, key, dir);
    setLayout(next);
    saveWorkspace({ dismissed, layout: next });
  }

  function resetCards() {
    setLayout(null);
    saveWorkspace({ dismissed, layout: null });
  }

  return (
    <div className="ws">
      {/* ============ 1. AI DIRECTOR PANELİ (en üstte) ============
          Spec: "AI Director her zaman ilk görülen bölüm olacak."

          Aktif plan varsa sonraki adımı, yoksa giriş sorusunu
          gösteriyor. İkisi de aynı yeri kaplıyor — kullanıcı her
          zaman aynı noktaya bakıyor. */}
      <section className="ws-director">
        {active ? (
          <DirectorPanel session={active} status={status} t={t} locale={locale}
            onOpen={() => {}} onBack={() => setActive(null)} />
        ) : (
          <EntryPanel t={t} locale={locale} text={text} setText={setText}
            preview={preview} onStart={start} />
        )}
      </section>

      {/* Çalışma durumu — spec: "Her zaman bir durum gösterecek."
          Gerçek veriden: kaç adım kaldı, sahnelerin kaçı hazır. */}
      <StateBar state={state} summary={summary} t={t} locale={locale} />

      {/* Bildirimler — Director panelinin hemen altında, dikkat çeksin */}
      {notifications.length > 0 && (
        <NotificationBar items={notifications} t={t} locale={locale}
          onClose={closeNotification}
          onOpenSession={(id) => {
            const s = sessions.find(x => x.id === id);
            if (s) setActive(s);
          }} />
      )}

      {err && <span className="err">{err}</span>}
      {note && <p className="cos-note">{note}</p>}

      {/* ============ ORTA + SAĞ: iki sütun ============ */}
      <div className="ws-body">
        {/* ---- 2. ACTIVE WORKFLOW (orta) ---- */}
        <main className="ws-main">
          {active ? (
            <WorkflowCard
              session={active} status={status} t={t} locale={locale}
              showAdd={showAdd} setShowAdd={setShowAdd}
              storyboard={storyboard}
              memChanges={memChanges}
              onUpdate={update}
              onBack={() => setActive(null)}
              onDiscard={() => discard(active.id)} />
          ) : (
            <EmptyState unfinished={unfinished} t={t} locale={locale}
              onboarding={onboardingState({ memory, sessions })}
              onResume={setActive} onStart={start} />
          )}
        </main>

        {/* ---- 3. WIDGET'LAR (sağ) ---- */}
        <aside className="ws-side">
          <div className="ws-side-head">
            <span className="ws-side-title">{t('ws.widgets')}</span>
            <button className="btn btn-mini" onClick={() => setEditLayout(!editLayout)}>
              {editLayout ? t('ws.done') : t('ws.arrange')}
            </button>
          </div>

          {built.widgets.length === 0 && (
            <p className="hint">{t('ws.noWidgets')}</p>
          )}

          {built.widgets.map((w, i) => (
            <Widget key={w.key} widget={w} data={widgetData(w.key, wsCtx)}
              t={t} locale={locale} edit={editLayout}
              first={i === 0} last={i === built.widgets.length - 1}
              onMove={moveCard}
              onOpenSession={(id) => {
                const s = sessions.find(x => x.id === id);
                if (s) setActive(s);
              }} />
          ))}

          {editLayout && built.source === 'user' && (
            <button className="btn btn-mini" onClick={resetCards}>
              {t('ws.resetCards')}
            </button>
          )}
        </aside>
      </div>

      {/* ============ 4. QUICK ACTIONS (alt) ============ */}
      <QuickActions t={t} locale={locale} memory={memory} sessions={sessions} onStart={start} />

      {loaded && sessions.length > 0 && (
        <p className="hint cos-store-note">{t('cos.storageNote')}</p>
      )}
      {storeWarn && <div className="admin-alert">{t('cos.storeFull')}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function WorkflowCard({ session, status, t, locale, showAdd, setShowAdd,
                        storyboard, memChanges, onUpdate, onBack, onDiscard }) {
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

      {/* KİŞİSELLEŞTİRME RAPORU — spec: kullanıcı kontrolü kaybetmemeli.
          Hafıza yol haritasını değiştirdiyse ne yaptığını söylüyoruz. */}
      {memChanges?.length > 0 && (
        <div className="cos-memory">
          <div className="cos-memory-title">{t('cos.memoryTitle')}</div>
          {memChanges.map((c, i) => (
            <p className="cos-memory-item" key={i}>
              {c.type === 'task-added'
                ? t('cos.memAdded', { task: L(c.label),
                    n: c.evidence.count, m: c.evidence.sessions })
                : t('cos.memSkipped', { task: L(c.label),
                    n: c.evidence.count, m: c.evidence.sessions })}
            </p>
          ))}
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
              <p className="cos-next-why">{(() => { const r = reasonKey(sg); return t(r.key, r.vars); })()}</p>
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
          {task.usuallySkipped && <span className="cos-hab">{t('cos.usuallySkip')}</span>}
          {task.fromMemory && <span className="cos-hab">{t('cos.fromMemory')}</span>}
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
