import { recomputeStates, normalizeStatus, evaluateDependencies } from './state';
import { addTask, removeTask, moveTask, TASKS } from './workflow';

/*
  CREATOR OS — Active Workflow Manager: olay günlüğü ve canlı hesaplama.

  Sprint 5 / TASK-02, Adım 2.

  Spec iki şey istiyor:

    "Creator OS workflow'u her olaydan sonra yeniden değerlendirmelidir."
    "Her değişiklik Creator Session içerisine yazılır."

  Bu dosya ikisini tek noktada birleştiriyor: `applyEvent`.

  ---------------------------------------------------------------
  NEDEN TEK GİRİŞ NOKTASI

  TASK-01'de her işlem ayrı fonksiyondu (markTaskDone, addSessionTask…)
  ve her biri kendi başına oturumu güncelliyordu. Sorun: yeni bir kural
  eklendiğinde (durum yeniden hesaplama, günlük yazma) HER fonksiyona
  ayrı ayrı eklemek gerekir. Biri unutulursa sessizce tutarsız kalır.

  `applyEvent` bunu tersine çeviriyor: bütün değişiklikler buradan
  geçiyor ve üç şey GARANTİLİ oluyor:

    1. değişiklik uygulanır
    2. durumlar yeniden hesaplanır
    3. olay günlüğe yazılır

  Yeni bir olay türü eklemek, üç garantiyi otomatik alıyor.
  ---------------------------------------------------------------

  GÜNLÜK NEDEN SINIRLI:
    Oturumlar localStorage'da (kota ~5-10 MB, MAX_SESSIONS=10). Sınırsız
    günlük kotayı doldurur ve TASK-01'de gördüğümüz "kayıt başarısız"
    durumuna yol açar. Son 100 olay yeterli — eskisi zaten değersiz.
*/

export const LIVE_VERSION = 1;
export const MAX_LOG = 100;

/*
  Olay türleri — spec'in "Workflow Günlüğü" örnekleri:

    Workflow oluşturuldu    → workflow.created
    Storyboard tamamlandı   → task.done
    Prompt yeniden üretildi → task.reopened
    Thumbnail eklendi       → task.added
    Video atlandı           → task.skipped

  Her tür bir i18n anahtarına karşılık geliyor; arayüz metni oradan
  kuruyor. Günlüğe hazır cümle yazmıyoruz — dil değişince eski kayıtlar
  yanlış dilde kalırdı.
*/
export const EVENTS = {
  'workflow.created':  { icon: '✦' },
  'workflow.rebuilt':  { icon: '↻' },
  'task.done':         { icon: '✓' },
  'task.reopened':     { icon: '↺' },
  'task.skipped':      { icon: '–' },
  'task.active':       { icon: '●' },
  'task.added':        { icon: '+' },
  'task.removed':      { icon: '×' },
  'task.moved':        { icon: '⇅' },
  'task.blocked':      { icon: '⊘' },
  'task.unblocked':    { icon: '○' },
  'module.opened':     { icon: '→' },
  'intent.changed':    { icon: '✎' },
  'episode.attached':  { icon: '▤' }
};

export const EVENT_KEYS = Object.keys(EVENTS);

function makeEntry(type, payload) {
  return {
    id: 'ev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
    type,
    at: new Date().toISOString(),
    ...(payload || {})
  };
}

/*
  ---------- DURUM DEĞİŞİMLERİNİ GÜNLÜĞE YANSIT ----------

  Yeniden hesaplama bazı görevleri engelli hale getiriyor ya da
  serbest bırakıyor. Bunlar da birer olay — kullanıcı "neden bu görev
  açıldı" diye sorabilmeli.

  Yalnızca ENGEL değişimleri kaydediliyor; her waiting↔waiting geçişi
  gürültü olurdu.
*/
function diffBlocking(before, after) {
  const prev = new Map((before || []).map(t => [t.key, normalizeStatus(t.status)]));
  const events = [];

  for (const t of after || []) {
    const was = prev.get(t.key);
    const now = normalizeStatus(t.status);
    if (was === now) continue;

    if (now === 'blocked' && was !== 'blocked') {
      events.push(makeEntry('task.blocked', {
        taskKey: t.key, blockedBy: t.blockedBy || []
      }));
    } else if (was === 'blocked' && now !== 'blocked') {
      events.push(makeEntry('task.unblocked', { taskKey: t.key }));
    }
  }
  return events;
}

/*
  ---------- ANA GİRİŞ: applyEvent ----------

  Girdi:  oturum + olay
  Çıkış:  yeni oturum (SAF — girdi değişmez)

  Olay biçimi: { type, taskKey?, toIndex?, intent?, episodeId?, route? }

  Bilinmeyen olay türü sessizce yutulmaz — oturum değişmeden döner ve
  günlüğe yazılmaz. Sessiz yutma hata ayıklamayı imkânsız kılar.
*/
export function applyEvent(session, event) {
  if (!session?.workflow || !event?.type) return session;
  if (!EVENTS[event.type]) return session;

  const before = session.workflow.tasks || [];
  let tasks = before;
  let extra = {};

  switch (event.type) {
    case 'task.done':
      tasks = setStatus(tasks, event.taskKey, 'done');
      break;

    case 'task.reopened':
      /* Tekrar aç: 'waiting'e döner, yeniden hesaplama gerekirse
         tekrar engelleyecek. Doğrudan 'active' yapmıyoruz — önkoşulu
         bu arada bozulmuş olabilir. */
      tasks = setStatus(tasks, event.taskKey, 'waiting');
      break;

    case 'task.skipped':
      tasks = setStatus(tasks, event.taskKey, 'skipped');
      break;

    case 'task.active': {
      /* Tek aktif görev kuralı (TASK-01'den) */
      const cleared = tasks.map(t =>
        normalizeStatus(t.status) === 'active' && t.key !== event.taskKey
          ? { ...t, status: 'waiting' } : t);
      tasks = setStatus(cleared, event.taskKey, 'active');
      break;
    }

    case 'task.added': {
      const wf = addTask(session.workflow, event.taskKey, event.toIndex);
      tasks = wf.tasks;
      break;
    }

    case 'task.removed': {
      const wf = removeTask(session.workflow, event.taskKey);
      tasks = wf.tasks;
      break;
    }

    case 'task.moved': {
      const wf = moveTask(session.workflow, event.taskKey, event.toIndex);
      tasks = wf.tasks;
      extra = { toIndex: event.toIndex };
      break;
    }

    case 'module.opened':
      /* Modül açıldı: görev aktif işaretlenir. Kullanıcı ayrıca
         "bitirdim" demedikçe tamamlanmış saymıyoruz — sayfayı açmak
         işi yapmak değildir. */
      if (event.taskKey) {
        const cleared = tasks.map(t =>
          normalizeStatus(t.status) === 'active' && t.key !== event.taskKey
            ? { ...t, status: 'waiting' } : t);
        tasks = setStatus(cleared, event.taskKey, 'active');
      }
      extra = { route: event.route || null };
      break;

    case 'workflow.created':
    case 'workflow.rebuilt':
    case 'intent.changed':
    case 'episode.attached':
      /* Görev listesine dokunmayan olaylar — yalnızca günlük ve
         yeniden hesaplama. */
      extra = {
        intent: event.intent || null,
        episodeId: event.episodeId || null
      };
      break;

    default:
      return session;
  }

  /* Değişiklik uygulandı; şimdi durumları yeniden hesapla */
  const recomputed = recomputeStates(tasks);

  /* Ana olay + engel değişimleri.

     SIRA ÖNEMLİ: kullanıcının kendi eylemi en üstte, onun yol açtığı
     engel değişimleri altında. İlk sürümde her girdiyi tek tek başa
     ekliyordum ve türetilmiş olaylar kullanıcının eylemini aşağı
     itiyordu — günlüğe bakınca "ne yaptım" görünmüyordu. */
  const entries = [
    makeEntry(event.type, {
      taskKey: event.taskKey || null,
      taskLabel: event.taskKey ? (TASKS[event.taskKey]?.label || null) : null,
      ...extra
    }),
    ...diffBlocking(before, recomputed)
  ];

  const log = [...entries, ...(Array.isArray(session.log) ? session.log : [])]
    .slice(0, MAX_LOG);

  return {
    ...session,
    workflow: {
      ...session.workflow,
      tasks: recomputed,
      stats: statsOf(recomputed)
    },
    log,
    updatedAt: new Date().toISOString()
  };
}

function setStatus(tasks, key, status) {
  if (!key) return tasks;
  return (tasks || []).map(t => t.key === key ? { ...t, status } : t);
}

/*
  İstatistikler — TASK-01'deki statsOf yedi duruma göre yenilendi.
  workflow.js'teki sürüm 'done' sayıyordu; artık 'blocked' ve
  'suggested' de var.
*/
function statsOf(tasks) {
  const list = tasks || [];
  const doable = list.filter(t => !t.future);
  return {
    total: list.length,
    available: doable.length,
    future: list.filter(t => t.future).length,
    optional: list.filter(t => t.optional).length,
    done: list.filter(t => normalizeStatus(t.status) === 'done').length,
    skipped: list.filter(t => normalizeStatus(t.status) === 'skipped').length,
    blocked: list.filter(t => normalizeStatus(t.status) === 'blocked').length,
    active: list.filter(t => normalizeStatus(t.status) === 'active').length
  };
}

/*
  ---------- ESKİMİŞ İŞ TESPİTİ ----------

  Durum: kullanıcı promptları bitirdi, sonra storyboard'u yeniden açtı.
  Promptlar eski sahnelere göre yazılmıştı; storyboard değişirse
  eskimiş olabilirler.

  İKİ YANLIŞ SEÇENEK:
    • Promptları otomatik 'waiting'e çevirmek — kullanıcının bitirdiği
      işi TAHMİNE dayanarak silmek olur. Belki sadece bakıyordu.
    • Hiçbir şey dememek — kullanıcı eskimiş promptlarla devam eder.

  DOĞRUSU (spec'in "Akıllı Uyarılar" bölümü): işi koru, riski bildir.

  Bir görev "eskimiş" sayılır: kendisi tamamlanmış ama zorunlu
  önkoşullarından biri artık tamamlanmış değil.
*/
export function staleTasks(session) {
  const tasks = session?.workflow?.tasks || [];
  const stale = [];

  for (const t of tasks) {
    if (normalizeStatus(t.status) !== 'done') continue;
    const dep = evaluateDependencies(t.key, tasks);
    if (dep.missingRequired.length > 0) {
      stale.push({
        key: t.key,
        label: t.label,
        /* Hangi önkoşul geri açıldı — kullanıcı sebebini görsün */
        because: dep.missingRequired,
        becauseLabels: dep.missingRequired
          .map(k => TASKS[k]?.label || null).filter(Boolean)
      });
    }
  }
  return stale;
}

/*
  ---------- OTURUMU CANLIYA YÜKSELT ----------

  TASK-01'de oluşturulmuş oturumlarda `log` yok ve durumlar `todo`.
  Bu fonksiyon onları yeni modele taşıyor:

    • durumlar yeniden hesaplanır (todo → waiting/blocked)
    • boş günlük açılır ve ilk kayıt yazılır

  Var olan kullanıcı verisini bozmadan yükseltmek şart — TASK-01'de
  plan yapmış biri paketi uygulayınca planını kaybetmemeli.
*/
export function upgradeSession(session) {
  if (!session?.workflow) return session;
  if (Array.isArray(session.log)) return session;   // zaten canlı

  const recomputed = recomputeStates(session.workflow.tasks || []);
  return {
    ...session,
    workflow: {
      ...session.workflow,
      tasks: recomputed,
      stats: statsOf(recomputed)
    },
    log: [makeEntry('workflow.rebuilt', { reason: 'upgraded-from-task-01' })],
    updatedAt: session.updatedAt || new Date().toISOString()
  };
}

/*
  ---------- GÜNLÜK OKUMA ----------

  Arayüz için: olayları grupla, okunabilir hale getir.
  Metin YOK — i18n anahtarı ve veri var; dil arayüzde kuruluyor.
*/
export function readLog(session, opts) {
  const log = Array.isArray(session?.log) ? session.log : [];
  const limit = Number.isInteger(opts?.limit) ? opts.limit : 20;

  /* Gürültü filtresi: engel değişimleri çoktur ve kullanıcı için
     her zaman ilginç değil. Arayüz isterse açar. */
  const filtered = opts?.includeBlocking
    ? log
    : log.filter(e => e.type !== 'task.blocked' && e.type !== 'task.unblocked');

  return filtered.slice(0, limit).map(e => ({
    ...e,
    icon: EVENTS[e.type]?.icon || '·'
  }));
}

/* Belirli bir görevin geçmişi — "bu adımda ne oldu" sorusu için. */
export function taskHistory(session, taskKey) {
  const log = Array.isArray(session?.log) ? session.log : [];
  return log.filter(e => e.taskKey === taskKey);
}

/*
  Günlük özeti — kaç iş yapıldı, ne zaman başlandı.
  TASK-04 Creator Memory bunu okuyacak.
*/
export function logSummary(session) {
  const log = Array.isArray(session?.log) ? session.log : [];
  if (!log.length) return { events: 0, first: null, last: null, byType: {} };

  const byType = {};
  for (const e of log) byType[e.type] = (byType[e.type] || 0) + 1;

  /* Günlük en yeni başta; ilk olay sonda */
  return {
    events: log.length,
    first: log[log.length - 1].at,
    last: log[0].at,
    byType,
    /* Kapasiteye ulaşıldıysa eski olaylar düşmüş demektir —
       arayüz "son 100 olay" diyebilsin. */
    truncated: log.length >= MAX_LOG
  };
}

/*
  ---------- KOLAYLIK SARMALLARI ----------

  Arayüz `applyEvent(session, { type: 'task.done', taskKey })` yazmak
  yerine bunları çağırabilir. Hepsi aynı garantilerden geçiyor.
*/
export const live = {
  done:     (s, taskKey) => applyEvent(s, { type: 'task.done', taskKey }),
  reopen:   (s, taskKey) => applyEvent(s, { type: 'task.reopened', taskKey }),
  skip:     (s, taskKey) => applyEvent(s, { type: 'task.skipped', taskKey }),
  activate: (s, taskKey) => applyEvent(s, { type: 'task.active', taskKey }),
  add:      (s, taskKey, at) => applyEvent(s, { type: 'task.added', taskKey, toIndex: at }),
  remove:   (s, taskKey) => applyEvent(s, { type: 'task.removed', taskKey }),
  move:     (s, taskKey, to) => applyEvent(s, { type: 'task.moved', taskKey, toIndex: to }),
  openModule: (s, taskKey, route) =>
    applyEvent(s, { type: 'module.opened', taskKey, route }),
  attachEpisode: (s, episodeId) =>
    applyEvent(s, { type: 'episode.attached', episodeId })
};
