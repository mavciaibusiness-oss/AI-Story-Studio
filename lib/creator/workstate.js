import { normalizeStatus } from './state';
import { workflowStatus } from './suggest';
import { detectTask, progressEvidence } from './detect';
import { buildTimeline } from '@/lib/timeline';

/*
  CREATOR WORKSPACE — çalışma durumu.

  Sprint 5 / TASK-04, Adım 3.

  Spec: "Workspace boş görünmeyecek. Her zaman bir durum gösterecek."
  Örnekleri: "Henüz proje yok", "Video işleniyor · 2 dakika",
  "Bugün tamamlanacak 3 görev var".

  ---------------------------------------------------------------
  "VİDEO İŞLENİYOR · 2 DAKİKA" GÖSTERİLEMİYOR — ve nedeni önemli

  Render TARAYICIDA çalışıyor (lib/engine.js, FFmpeg WASM). Yani:

    • Kullanıcı Atölye sayfasından ayrılırsa render DURUR
    • Workspace'e gelen kullanıcının arka planda çalışan işi OLAMAZ
    • Sunucuda iş kuyruğu yok

  "Video işleniyor, 2 dakika kaldı" kartı göstermek YALAN olurdu:
  ya hiç render yoktur, ya kullanıcı zaten Atölye'de ona bakıyordur.

  Sahte bir ilerleme çubuğu, ürünün söylediği her şeye olan güveni
  zedeler. Bunun yerine GERÇEK durumları gösteriyoruz:

    • kaç adım kaldı, hangisi sırada
    • sahnelerin kaçında görsel/ses/prompt hazır
    • tahmini video süresi (timeline motorundan — bu gerçek ölçüm)
    • ne kadar iş bekliyor

  Arka plan işleri Sprint-6'da (spec: "arka plan görevleri") gelirse
  o zaman gerçek bir "işleniyor" durumu gösterilebilir.
  ---------------------------------------------------------------
*/

export const WORKSTATE_VERSION = 1;

/*
  Durum türleri — öncelik sırasıyla. Workspace tek durum gösteriyor
  (spec: "Her zaman BİR durum gösterecek").
*/
export const STATES = {
  'no-plan':      { priority: 0 },   // hiç plan yok
  'blocked':      { priority: 1 },   // tıkanmış
  'needs-fix':    { priority: 2 },   // eskimiş iş var
  'in-progress':  { priority: 3 },   // devam eden iş
  'ready-to-work':{ priority: 4 },   // sırada iş var
  'complete':     { priority: 5 }    // bitti
};

/*
  ---------- ANA DURUM ----------

  Girdi: { sessions, active, storyboard }
  Çıkış: { kind, data }

  Metin YOK — anahtar ve veri. Arayüz i18n'den kuruyor.
*/
export function workState({ sessions, active, storyboard }) {
  const list = Array.isArray(sessions) ? sessions : [];

  if (!list.length && !active) {
    return { kind: 'no-plan', data: {} };
  }

  if (!active) {
    /* Plan var ama açık değil — kaç tanesi yarım */
    const open = list.filter(s => {
      const st = workflowStatus(s);
      return st.doable > 0 && !st.complete;
    });
    return open.length
      ? { kind: 'ready-to-work', data: { plans: open.length } }
      : { kind: 'complete', data: { plans: list.length } };
  }

  const st = workflowStatus(active);

  if (st.stuck) {
    return { kind: 'blocked', data: { blocked: st.blocked } };
  }
  if ((st.stale || []).length) {
    return { kind: 'needs-fix', data: { count: st.stale.length } };
  }
  if (st.complete) {
    return { kind: 'complete', data: { plans: 1, title: active.title } };
  }

  /* Devam eden iş — sahne düzeyinde ilerleme varsa daha zengin */
  const production = productionState(active, storyboard);

  return {
    kind: st.active ? 'in-progress' : 'ready-to-work',
    data: {
      remaining: st.remaining,
      done: st.done,
      total: st.doable,
      percent: st.percent,
      nextTask: st.suggestion?.task?.key || null,
      nextLabel: st.suggestion?.task?.label || null,
      production
    }
  };
}

/*
  ---------- ÜRETİM DURUMU ----------

  Sahne düzeyinde gerçek ilerleme: kaç sahnede görsel var, kaçında ses.

  Bu GERÇEK bir ölçüm — storyboard'a bakıyor, tahmin etmiyor.
  "Video işleniyor" gibi uydurma bir durumdan farkı bu.

  Storyboard yoksa null — boş bir ilerleme çubuğu göstermiyoruz.
*/
export function productionState(session, storyboard) {
  const scenes = Array.isArray(storyboard?.scenes) ? storyboard.scenes : [];
  if (!scenes.length) return null;

  const tasks = session?.workflow?.tasks || [];
  const evidence = progressEvidence(tasks, storyboard);

  /* Tahmini video süresi — timeline motorundan (gerçek ölçüm) */
  let duration = null;
  try {
    const tl = buildTimeline(storyboard);
    duration = {
      total: tl.total,
      /* estimated:true → süreler metinden tahmin edildi.
         false → gerçek ses uzunluğu ölçüldü. Ayrımı taşıyoruz;
         arayüz "yaklaşık" diyebilsin. */
      estimated: tl.estimated
    };
  } catch { /* timeline kurulamadı — süre gösterilmiyor */ }

  /* Hangi üretim adımları ne kadar tamam */
  const steps = ['prompts', 'images', 'voice', 'subtitles']
    .map(key => {
      const d = detectTask(key, storyboard);
      if (!d.detectable || d.total === 0) return null;
      return { key, have: d.have, total: d.total, complete: d.complete };
    })
    .filter(Boolean);

  return {
    scenes: scenes.length,
    duration,
    steps,
    /* Kısmi ilerleme olan adımlar — arayüz vurgulayabilsin */
    partial: Object.keys(evidence).length
  };
}

/*
  ---------- GÜNLÜK ÖZET ----------

  Spec: "Bugün tamamlanacak 3 görev var."

  DİKKAT: "bugün" iddiasında bulunmuyoruz. Kullanıcının bugün ne kadar
  çalışacağını bilmiyoruz; bir gün hedefi koymadık ve koymamalıyız —
  uydurma bir hedef baskı yaratır ve tutmazsa ürün yanlış konuşmuş olur.

  Bunun yerine GERÇEĞİ söylüyoruz: "3 adım kaldı".
*/
export function workSummary({ sessions, active }) {
  const list = Array.isArray(sessions) ? sessions : [];

  let remaining = 0, blocked = 0, plans = 0;
  for (const s of list) {
    const st = workflowStatus(s);
    if (st.doable === 0) continue;
    if (!st.complete) plans++;
    remaining += st.remaining;
    blocked += st.blocked;
  }

  const activeSt = active ? workflowStatus(active) : null;

  return {
    openPlans: plans,
    remainingSteps: remaining,
    blockedSteps: blocked,
    activeRemaining: activeSt ? activeSt.remaining : 0,
    activePercent: activeSt ? activeSt.percent : 0
  };
}

/* Durum önceliği — iki durum çakışırsa hangisi gösterilir. */
export function statePriority(kind) {
  return STATES[kind]?.priority ?? 9;
}
