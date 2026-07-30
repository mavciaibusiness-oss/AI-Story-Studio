'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useT, useI18n } from '@/lib/i18n';
import { useStudio } from '@/lib/store';
import { classifyIntent, EXAMPLE_PROMPTS, intentByKey } from '@/lib/creator/intent';
import {
  createSession, loadSessions, saveSessions, upsertSession, removeSession,
  sessionProgress, markTaskActive, markTaskDone, skipTask,
  removeSessionTask, addSessionTask, reclassify, unfinishedSessions
} from '@/lib/creator/session';
import { availableToAdd, TASKS } from '@/lib/creator/workflow';

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
  const { episodeId } = useStudio();

  const [text, setText] = useState('');
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [preview, setPreview] = useState(null);   // yazarken canlı tahmin
  const [storeWarn, setStoreWarn] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [loaded, setLoaded] = useState(false);

  /* Oturumları yükle — yalnızca istemcide (localStorage) */
  useEffect(() => {
    const list = loadSessions(userId);
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
    const s = createSession(value, { episodeId });
    const list = upsertSession(sessions, s);
    persist(list);
    setActive(s);
    setText('');
    setPreview(null);
  }

  function update(next) {
    setActive(next);
    persist(upsertSession(sessions, next));
  }

  function discard(id) {
    persist(removeSession(sessions, id));
    if (active?.id === id) setActive(null);
  }

  const unfinished = unfinishedSessions(sessions).filter(s => s.id !== active?.id);
  const progress = active ? sessionProgress(active) : null;

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
          session={active} progress={progress} t={t} locale={locale}
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
              const p = sessionProgress(s);
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

function WorkflowCard({ session, progress, t, locale, showAdd, setShowAdd,
                        onUpdate, onBack, onDiscard }) {
  const wf = session.workflow;
  const L = (o) => o?.[locale] || o?.tr || '';

  return (
    <section className="cos-wf">
      <div className="cos-wf-head">
        <button className="btn btn-mini" onClick={onBack}>{t('cos.back')}</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-mini" onClick={onDiscard}>{t('cos.discard')}</button>
      </div>

      {/* Kullanıcının kendi cümlesi — ne istediğini görsün */}
      <blockquote className="cos-quote">{session.input}</blockquote>

      {/* Niyet + kararsızlık */}
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

      {/* Kararsızsa seçenek sun — sessizce yanlış tahmine bağlanma */}
      {session.ambiguous && wf.tasks.length > 0 && (
        <AmbiguityPicker session={session} t={t} locale={locale} onUpdate={onUpdate} />
      )}

      {/* Niyet hiç tanınmadıysa da seçenek sun */}
      {!session.intent && (
        <IntentFallback t={t} locale={locale} session={session} onUpdate={onUpdate} />
      )}

      {/* Akış bugün yapılamıyorsa alternatifi ÖNE çıkar */}
      {wf.available === false && wf.suggestion && (
        <div className="cos-unavailable">
          <div className="cos-unavailable-title">{L(wf.suggestion.reason)}</div>
          <p className="cos-unavailable-offer">{L(wf.suggestion.offer)}</p>
          <div className="cos-unavailable-tasks">
            {wf.suggestion.tasks.map(x => (
              <Link key={x.key} href={x.route} className="btn btn-mini">
                {L(x.label)}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* SONRAKİ ADIM — en üstte, en büyük. Spec kuralı 4. */}
      {progress?.next && (
        <div className="cos-next">
          <div className="cos-next-label">{t('cos.nextStep')}</div>
          <div className="cos-next-body">
            <div>
              <div className="cos-next-title">{L(progress.next.label)}</div>
              <p className="cos-next-desc">{L(progress.next.desc)}</p>
            </div>
            <Link href={progress.next.route} className="btn btn-primary"
              onClick={() => onUpdate(markTaskActive(session, progress.next.key))}>
              {t('cos.go')}
            </Link>
          </div>
        </div>
      )}

      {progress?.complete && (
        <div className="cos-done">{t('cos.allDone')}</div>
      )}

      {/* İlerleme */}
      {progress && progress.doable > 0 && (
        <div className="cos-progress">
          <div className="cos-progress-bar">
            <i style={{ width: progress.percent + '%' }} />
          </div>
          <div className="cos-progress-label">
            {t('cos.progress', {
              done: progress.done, total: progress.doable, p: progress.percent
            })}
            {wf.stats.future > 0 && ' · ' + t('cos.futureCount', { n: wf.stats.future })}
          </div>
        </div>
      )}

      {/* Görev listesi */}
      <div className="cos-tasks">
        {wf.tasks.map((task, i) => (
          <TaskRow key={task.key} task={task} index={i} t={t} L={L}
            session={session} onUpdate={onUpdate} />
        ))}
      </div>

      {/* Görev ekle */}
      <div className="cos-wf-actions">
        <button className="btn btn-mini" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? t('cos.closeAdd') : t('cos.addTask')}
        </button>
      </div>
      {showAdd && (
        <div className="cos-add-list">
          {availableToAdd(wf).map(a => (
            <button key={a.key} className={'cos-add-item' + (a.future ? ' cos-add-future' : '')}
              onClick={() => { onUpdate(addSessionTask(session, a.key)); setShowAdd(false); }}>
              {L(a.label)}
              {a.future && <span className="cos-soon">{t('cos.soon')}</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function TaskRow({ task, index, t, L, session, onUpdate }) {
  const done = task.status === 'done';
  const skipped = task.status === 'skipped';
  const activeNow = task.status === 'active';

  return (
    <div className={'cos-task'
      + (done ? ' cos-task-done' : '')
      + (skipped ? ' cos-task-skipped' : '')
      + (activeNow ? ' cos-task-active' : '')
      + (task.future ? ' cos-task-future' : '')}>

      <div className="cos-task-n">
        {done ? '✓' : skipped ? '–' : index + 1}
      </div>

      <div className="cos-task-body">
        <div className="cos-task-head">
          <span className="cos-task-label">{L(task.label)}</span>
          {task.optional && <span className="cos-opt">{t('cos.optional')}</span>}
          {task.future && <span className="cos-soon">{t('cos.soon')}</span>}
        </div>
        <p className="cos-task-desc">{L(task.desc)}</p>
      </div>

      <div className="cos-task-actions">
        {/* Sprint-6 görevi tıklanamaz — hiçbir yere gitmeyen düğme
            göstermek güven kaybettirir */}
        {task.future ? null : done ? (
          <button className="btn btn-mini"
            onClick={() => onUpdate(markTaskActive(session, task.key))}>
            {t('cos.redo')}
          </button>
        ) : (
          <>
            <Link href={task.route} className="btn btn-mini"
              onClick={() => onUpdate(markTaskActive(session, task.key))}>
              {t('cos.open')}
            </Link>
            <button className="btn btn-mini"
              onClick={() => onUpdate(markTaskDone(session, task.key))}>
              {t('cos.markDone')}
            </button>
            {task.optional && (
              <button className="btn btn-mini"
                onClick={() => onUpdate(skipTask(session, task.key))}>
                {t('cos.skip')}
              </button>
            )}
          </>
        )}
        <button className="btn btn-mini cos-task-remove"
          onClick={() => onUpdate(removeSessionTask(session, task.key))}
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
