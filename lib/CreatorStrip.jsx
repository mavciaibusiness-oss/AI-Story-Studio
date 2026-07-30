'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT, useI18n } from '@/lib/i18n';
import { useStudio } from '@/lib/store';
import { loadSessions, saveSessions, sessionProgress, markTaskDone,
         upsertSession, unfinishedSessions } from '@/lib/creator/session';

/*
  CREATOR OS — dönüş şeridi.

  Sprint 5 / TASK-01, Adım 5.

  Kullanıcı yol haritasından bir modüle gitti. Şimdi Storyboard
  sayfasında. "Planıma nasıl dönerim, sırada ne vardı?" diye
  düşünmemeli.

  Spec kuralı 3: "Kullanıcı hiçbir zaman boş ekran görmesin. Her
  ekranda bir sonraki öneri, hazır aksiyon veya devam edilecek görev
  bulunmalıdır."

  Bu şerit her modül sayfasının üstünde duruyor ve şunu söylüyor:
    • hangi plandasın
    • bu sayfa planın hangi adımı
    • sırada ne var

  NEDEN CREATOR OS SAYFASINDA GİZLİ:
    Orada zaten yol haritası var; şerit tekrar olurdu.

  NEDEN "BİTTİ" DÜĞMESİ BURADA:
    Kullanıcı modülde işini bitirince plana dönmeden işaretleyebilmeli.
    Adım 4'te bunu yalnızca Creator OS sayfasında yapabiliyordu —
    her seferinde geri gitmek gereksiz sürtünme.
*/

/* Rota → görev anahtarı. workflow.js'teki ROUTES'un tersi.
   Şeridin "bu sayfa planın hangi adımı" sorusunu yanıtlaması için. */
const ROUTE_TASK = {
  '/studio/senaryo':      'script',
  '/studio/storyboard':   'storyboard',
  '/studio/karakterler':  'characters',
  '/studio/promptlar':    'prompts',
  '/studio/gorseller':    'images',
  '/studio/seslendirme':  'voice',
  '/studio/atolye':       'edit',
  '/studio/altyazi':      'subtitles',
  '/studio/thumbnail':    'thumbnail',
  '/studio/shorts':       'shorts',
  '/studio/youtube':      'publish',
  '/studio/saglik':       'health',
  '/studio/yonetmen':     'director',
  '/studio/yeniden':      'rebuild'
};

export default function CreatorStrip() {
  const t = useT();
  const { locale } = useI18n();
  const { profile } = useStudio();
  const path = usePathname();

  const [session, setSession] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [dismissed, setDismissed] = useState(false);

  /* Kullanıcı kimliği profile'da yok; store'daki e-posta yerine
     localStorage anahtarı için 'anon' kullanmıyoruz — layout
     kullanıcıyı biliyor ama buraya geçirilmiyor. Bu yüzden
     oturumları e-posta üzerinden ayırıyoruz. */
  const userKey = profile?.email || null;

  useEffect(() => {
    const list = loadSessions(userKey);
    setSessions(list);
    const unfinished = unfinishedSessions(list);
    setSession(unfinished[0] || null);
  }, [userKey, path]);

  /* Creator OS sayfasında gizli — orada zaten yol haritası var */
  if (path === '/studio/creator') return null;
  if (!session || dismissed) return null;

  const progress = sessionProgress(session);
  const currentKey = ROUTE_TASK[path] || null;
  const currentTask = currentKey
    ? session.workflow?.tasks?.find(x => x.key === currentKey)
    : null;

  const L = (o) => o?.[locale] || o?.tr || '';

  function complete() {
    if (!currentTask) return;
    const next = markTaskDone(session, currentTask.key);
    const list = upsertSession(sessions, next);
    setSessions(list);
    saveSessions(userKey, list);
    setSession(next);
  }

  const done = currentTask?.status === 'done';

  return (
    <div className="cst">
      <Link href="/studio/creator" className="cst-home" title={t('cst.backToPlan')}>✦</Link>

      <div className="cst-body">
        <div className="cst-title">{session.title}</div>
        <div className="cst-meta">
          {/* Bu sayfa planın neresi */}
          {currentTask ? (
            <span className={'cst-here' + (done ? ' cst-here-done' : '')}>
              {done ? t('cst.stepDone', { s: L(currentTask.label) })
                    : t('cst.youAreHere', { s: L(currentTask.label) })}
            </span>
          ) : (
            <span className="cst-here cst-here-off">{t('cst.notInPlan')}</span>
          )}
          <span className="cst-progress">{progress.done}/{progress.doable}</span>
        </div>
      </div>

      {/* Bu adım bitti mi — plana dönmeden işaretlenebilsin */}
      {currentTask && !done && (
        <button className="btn btn-mini" onClick={complete}>{t('cst.markDone')}</button>
      )}

      {/* Sırada ne var — spec kuralı 4 */}
      {progress.next && progress.next.key !== currentKey && (
        <Link href={progress.next.route} className="btn btn-primary btn-mini">
          {t('cst.next')}: {L(progress.next.label)}
        </Link>
      )}
      {progress.complete && <span className="cst-done">{t('cst.allDone')}</span>}

      <button className="cst-close" onClick={() => setDismissed(true)}
        title={t('cst.hide')}>×</button>
    </div>
  );
}
