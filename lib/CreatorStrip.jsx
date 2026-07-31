'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT, useI18n } from '@/lib/i18n';
import { loadSessions, saveSessions, upsertSession,
         unfinishedSessions } from '@/lib/creator/session';
import { live, upgradeSession, staleTasks } from '@/lib/creator/live';
import { workflowStatus, markSuggested } from '@/lib/creator/suggest';
import { normalizeStatus, warningsFor } from '@/lib/creator/state';
import { ROUTES } from '@/lib/creator/workflow';

/*
  CREATOR OS — dönüş şeridi (Active Workflow Manager sürümü).

  Sprint 5 / TASK-02, Adım 5.

  TASK-01'de bu şerit vardı ama iki sorunu vardı:

  ---------------------------------------------------------------
  1. HİÇ ÇALIŞMIYORDU — farklı depolama anahtarı

     CreatorView oturumları `userId` (auth UUID) anahtarıyla
     kaydediyordu; şerit `profile.email` ile okuyordu. İki farklı
     localStorage kovası — şerit ekranın yazdığı planları hiç
     göremiyordu.

     TASK-01 Adım 5'te bunu risk olarak not düşmüştüm ama
     düzeltmemiştim. Artık layout `userId` geçiriyor ve ikisi aynı
     anahtarı kullanıyor.

  2. GÜNLÜĞE YAZMIYORDU

     Şeritteki "bitirdim" düğmesi TASK-01'in `markTaskDone`ını
     çağırıyordu: durumları yeniden hesaplamıyor, olayı günlüğe
     yazmıyordu. Kullanıcı modülde iş bitirse Creator OS ekranı
     bundan habersiz kalıyordu.

     Artık `live.*` kullanıyor — üç garanti (uygula, hesapla, yaz).
  ---------------------------------------------------------------

  Spec kuralı 4: "AI her zaman sonraki adımı bilmelidir."
  Şerit artık öneriyi GEREKÇESİYLE gösteriyor.
*/

/* Rota → görev anahtarı. workflow.js'teki ROUTES'un tersi.

   ROUTES'tan TÜRETİLİYOR, elle yazılmıyor: TASK-01'de iki liste ayrı
   tutuluyordu ve biri değişince öbürü sessizce eskiyordu. */
const ROUTE_TASK = Object.fromEntries(
  Object.entries(ROUTES).map(([task, route]) => [route, task])
);

export default function CreatorStrip({ userId }) {
  const t = useT();
  const { locale } = useI18n();
  const path = usePathname();

  const [sessions, setSessions] = useState([]);
  const [session, setSession] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  const L = (o) => o?.[locale] || o?.tr || '';

  /* Oturumları yükle. Yol değişince tekrar okunuyor: kullanıcı
     Creator OS ekranında bir şey değiştirip modüle geçmiş olabilir. */
  useEffect(() => {
    const list = loadSessions(userId).map(s => markSuggested(upgradeSession(s)));
    setSessions(list);
    const unfinished = unfinishedSessions(list);
    setSession(unfinished[0] || null);
  }, [userId, path]);

  const persist = useCallback((next) => {
    const marked = markSuggested(next);
    setSession(marked);
    setSessions(prev => {
      const list = upsertSession(prev, marked);
      saveSessions(userId, list);
      return list;
    });
  }, [userId]);

  /* Modül açılışını kaydet — spec: "Creator OS modülleri doğrudan
     açmalıdır." Kullanıcı bir modüle geldiyse o görev aktif sayılır.

     Yalnızca durum değişecekse yazıyoruz; her sayfa gezintisinde
     günlüğe kayıt düşmek gürültü olur. */
  useEffect(() => {
    if (!session) return;
    const key = ROUTE_TASK[path];
    if (!key) return;
    const task = session.workflow?.tasks?.find(x => x.key === key);
    if (!task) return;
    const st = normalizeStatus(task.status);
    if (st === 'active' || st === 'done' || st === 'skipped') return;

    persist(live.openModule(session, key, path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, session?.id]);

  if (path === '/studio/creator') return null;
  if (!session || dismissed) return null;

  const status = workflowStatus(session);
  const currentKey = ROUTE_TASK[path] || null;
  const currentTask = currentKey
    ? session.workflow?.tasks?.find(x => x.key === currentKey)
    : null;
  const currentState = currentTask ? normalizeStatus(currentTask.status) : null;
  const done = currentState === 'done';

  const sg = status.suggestion;
  const stale = staleTasks(session);

  /* Bu sayfada yumuşak önkoşul eksikse hatırlat — engel değil.
     Kullanıcı zaten burada; "yapma" demek geç ve gereksiz. */
  const softWarn = currentTask && !done
    ? warningsFor(currentTask.key, session.workflow.tasks)[0]
    : null;

  return (
    <div className="cst">
      <Link href="/studio/creator" className="cst-home" title={t('cst.backToPlan')}>✦</Link>

      <div className="cst-body">
        <div className="cst-title">{session.title}</div>
        <div className="cst-meta">
          {currentTask ? (
            <span className={'cst-here' + (done ? ' cst-here-done' : '')}>
              {done ? t('cst.stepDone', { s: L(currentTask.label) })
                    : t('cst.youAreHere', { s: L(currentTask.label) })}
            </span>
          ) : (
            <span className="cst-here cst-here-off">{t('cst.notInPlan')}</span>
          )}
          <span className="cst-progress">{status.done}/{status.doable}</span>
          {status.blocked > 0 && (
            <span className="cst-blocked">{t('cst.blocked', { n: status.blocked })}</span>
          )}
        </div>

        {/* Eskimiş iş — modüldeyken de bilmesi gerek */}
        {stale.length > 0 && (
          <div className="cst-stale">{t('cst.stale', { n: stale.length })}</div>
        )}

        {/* Yumuşak önkoşul hatırlatması */}
        {softWarn && (
          <div className="cst-soft">
            {t('cst.softWarn', { missing: softWarn.labels.map(l => L(l)).join(', ') })}
          </div>
        )}
      </div>

      {currentTask && !done && (
        <button className="btn btn-mini"
          onClick={() => persist(live.done(session, currentTask.key))}>
          {t('cst.markDone')}
        </button>
      )}

      {/* SONRAKİ ADIM — gerekçesiyle. Spec kuralı 4. */}
      {sg?.task && sg.task.key !== currentKey && (
        <Link href={sg.task.route} className="btn btn-primary btn-mini"
          title={reasonTitle(sg, t)}>
          {t('cst.next')}: {L(sg.task.label)}
        </Link>
      )}
      {status.complete && <span className="cst-done">{t('cst.allDone')}</span>}
      {status.stuck && <span className="cst-stuck">{t('cst.stuck')}</span>}

      <button className="cst-close" onClick={() => setDismissed(true)}
        title={t('cst.hide')}>×</button>
    </div>
  );
}

/* Öneri gerekçesi — düğme ipucu olarak. Şeritte yer dar, tam cümle
   yerine hover metni kullanıyoruz. */
function reasonTitle(sg, t) {
  switch (sg.reason) {
    case 'stale':    return t('cos.why.stale');
    case 'continue': return t('cos.why.continue');
    case 'unlocks':  return t('cos.why.unlocks', { n: sg.detail?.unlocks ?? 0 });
    default:         return t('cos.why.next');
  }
}
