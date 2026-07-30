import { classifyIntent } from './intent';
import { buildWorkflow, setTaskStatus, nextTask, addTask, removeTask, moveTask } from './workflow';

/*
  CREATOR OS — Creator Session.

  Sprint 5 / TASK-01, Adım 3.

  Kullanıcının ilk cümlesi, çıkarılan niyet ve kurulan yol haritası
  bir OTURUM içinde tutuluyor. Kullanıcı modüller arasında gezerken
  yol haritası kaybolmuyor.

  Spec: "İlk cümle Creator Session içerisine kaydedilecektir. Bu,
  Sprint-5 TASK-04 Creator Memory sisteminin temelini oluşturacaktır."

  ---------------------------------------------------------------
  DEPOLAMA KARARI — NEDEN localStorage

  Spec bu görev için "Migration: Yok" diyor, yani veritabanı tablosu
  bu sprintte yok. Kalıcı depolama TASK-04'ün işi.

  Seçenekler:
    • Yalnızca React state → sayfa değişince kaybolur. Kullanıcı
      Storyboard'a gidip dönünce yol haritası yok olur. Kabul edilemez.
    • localStorage → sayfa değişse de tarayıcı kapansa da kalır.
      Sunucuya gitmez, migration gerektirmez.

  localStorage seçildi. Ama iki gerçek sınırı var ve bunları
  gizlemiyoruz:

    1. CİHAZA BAĞLI. Kullanıcı başka bilgisayardan girerse oturumu
       göremez. TASK-04'te veritabanına taşınınca çözülecek.
    2. TARAYICI PAYLAŞIMI. Aynı tarayıcıda farklı hesaplar
       kullanılabilir. Bu yüzden oturumlar KULLANICI KİMLİĞİNE göre
       ayrı anahtarlarda tutuluyor — biri diğerinin yol haritasını
       görmesin.
  ---------------------------------------------------------------
*/

export const SESSION_VERSION = 1;
const KEY_PREFIX = 'creator-session:';

/* Kaç oturum saklanır. Sınırsız büyümesi localStorage kotasını
   doldurur (genelde 5-10 MB) ve eski oturumlar zaten değersizleşir. */
export const MAX_SESSIONS = 10;

/* Kullanıcı başına anahtar. userId yoksa 'anon' — giriş yapmamış
   kullanıcı da deneyebilsin, ama oturumu karışmasın. */
function storageKey(userId) {
  return KEY_PREFIX + (userId || 'anon');
}

/* SSR koruması: Next.js sunucuda render ediyor, window yok. */
function canStore() {
  return typeof window !== 'undefined' && !!window.localStorage;
}

/* ---------- Okuma / yazma ----------
   Her ikisi de HATA YUTMUYOR ama ÇÖKMÜYOR: bozuk veri, dolu kota ya
   da kapalı depolama durumunda boş dönüp devam ediyor. Giriş ekranı
   depolama yüzünden kilitlenmemeli. */

export function loadSessions(userId) {
  if (!canStore()) return [];
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    /* Sürüm uyuşmazlığı: eski biçimdeki oturumlar atılır. Yanlış
       biçimi yorumlamaya çalışmak sessiz hatalara yol açar. */
    return parsed.filter(s => s && s.version === SESSION_VERSION);
  } catch {
    return [];
  }
}

export function saveSessions(userId, sessions) {
  if (!canStore()) return false;
  try {
    const trimmed = (sessions || [])
      .slice()
      .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
      .slice(0, MAX_SESSIONS);
    window.localStorage.setItem(storageKey(userId), JSON.stringify(trimmed));
    return true;
  } catch {
    /* Kota dolu ya da depolama kapalı. Çağıran taraf false görüp
       kullanıcıya söyleyebilir — sessizce kaybetmek yerine. */
    return false;
  }
}

/* ---------- Oturum oluştur ----------

   Girdi: kullanıcının tek cümlesi
   Çıkış: niyet + yol haritası içeren oturum

   Niyet tanınmasa bile oturum ÜRETİLİR. Spec: "Kullanıcı hiçbir
   zaman boş ekran görmesin." Tanınmayan cümlede oturum `intent: null`
   taşır ve arayüz kullanıcıya seçenek sunar.
*/
export function createSession(text, opts) {
  const input = String(text || '').trim();
  const classified = classifyIntent(input);
  const workflow = buildWorkflow(classified);
  const now = new Date().toISOString();

  return {
    id: makeId(),
    version: SESSION_VERSION,
    /* İlk cümle — Creator Memory'nin (TASK-04) temeli.
       Değiştirilmiyor; kullanıcı ne dediyse o kalıyor. */
    input,
    intent: classified.intent,
    intentLabel: classified.label || null,
    confidence: classified.confidence,
    modifiers: classified.modifiers || {},
    ambiguous: !!classified.ambiguous,
    needsInput: classified.needsInput || null,
    workflow,
    /* Bağlı bölüm — kullanıcı üretime geçince atanacak.
       Spec: "Proje gerekirse AI tarafından otomatik oluşturulmalıdır." */
    episodeId: opts?.episodeId || null,
    title: opts?.title || deriveTitle(input, classified),
    createdAt: now,
    updatedAt: now
  };
}

/* Oturum başlığı: kullanıcı listede ne yaptığını tanısın.
   Cümle kısaysa olduğu gibi, uzunsa niyet etiketi + kırpılmış cümle. */
function deriveTitle(input, classified) {
  const clean = input.replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= 48) return clean;
  return clean.slice(0, 45).trimEnd() + '…';
}

function makeId() {
  /* crypto.randomUUID her yerde yok (eski Safari); yedeği var. */
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return 'cs-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

/* ---------- Oturumu güncelle ----------
   Hepsi SAF: yeni oturum nesnesi döner, girdiyi değiştirmez.
   updatedAt her değişiklikte yenilenir — liste sıralaması buna bağlı. */

function touch(session, patch) {
  return { ...session, ...patch, updatedAt: new Date().toISOString() };
}

export function markTaskDone(session, taskKey) {
  if (!session?.workflow) return session;
  return touch(session, {
    workflow: setTaskStatus(session.workflow, taskKey, 'done')
  });
}

export function markTaskActive(session, taskKey) {
  if (!session?.workflow) return session;
  /* Aynı anda tek aktif görev: önceki aktifi todo'ya çevir.
     İki aktif görev "şimdi neredeyim" sorusunu belirsizleştirir. */
  let wf = session.workflow;
  for (const t of wf.tasks) {
    if (t.status === 'active' && t.key !== taskKey) {
      wf = setTaskStatus(wf, t.key, 'todo');
    }
  }
  return touch(session, { workflow: setTaskStatus(wf, taskKey, 'active') });
}

export function skipTask(session, taskKey) {
  if (!session?.workflow) return session;
  return touch(session, {
    workflow: setTaskStatus(session.workflow, taskKey, 'skipped')
  });
}

export function addSessionTask(session, taskKey, position) {
  if (!session?.workflow) return session;
  return touch(session, {
    workflow: addTask(session.workflow, taskKey, position)
  });
}

export function removeSessionTask(session, taskKey) {
  if (!session?.workflow) return session;
  return touch(session, {
    workflow: removeTask(session.workflow, taskKey)
  });
}

export function moveSessionTask(session, taskKey, toIndex) {
  if (!session?.workflow) return session;
  return touch(session, {
    workflow: moveTask(session.workflow, taskKey, toIndex)
  });
}

/* Bölüm bağla — kullanıcı üretime geçtiğinde. */
export function attachEpisode(session, episodeId) {
  if (!session) return session;
  return touch(session, { episodeId: episodeId || null });
}

/*
  Niyeti elle değiştir — kullanıcı kararsızlıkta seçim yaparsa.

  Spec: "Kullanıcı karar vermesin, AI karar versin." Ama AI kararsız
  kaldığında (ambiguous) kullanıcıya sormak, yanlış tahmine bağlı
  kalmaktan iyidir. Bu, kuralın ihlali değil; kuralın dürüst uygulaması.

  İlk cümle KORUNUYOR — kullanıcının ne dediği kaydın parçası.
*/
export function reclassify(session, intentKey) {
  if (!session) return session;
  const forced = {
    intent: intentKey,
    label: session.workflow?.label || null,
    modifiers: session.modifiers || {},
    confidence: session.confidence,
    ambiguous: false,
    needsInput: session.needsInput
  };
  const workflow = buildWorkflow(forced);
  return touch(session, {
    intent: intentKey,
    workflow,
    ambiguous: false,
    /* Kullanıcı seçtiyse artık tahmin değil — güven tam.
       Yine de 1.0 yazmıyoruz: bu bir SEÇİM, ölçüm değil. */
    confidence: null,
    intentSource: 'user'
  });
}

/* ---------- İlerleme ---------- */
export function sessionProgress(session) {
  const tasks = session?.workflow?.tasks || [];
  const doable = tasks.filter(t => !t.future);
  const done = doable.filter(t => t.status === 'done').length;
  const skipped = doable.filter(t => t.status === 'skipped').length;
  const active = tasks.find(t => t.status === 'active') || null;

  return {
    total: tasks.length,
    /* Yüzde YAPILABİLİR görevler üzerinden. Sprint-6 görevlerini
       paydaya katmak ilerlemeyi olduğundan düşük gösterirdi —
       kullanıcı yapamadığı bir şey yüzünden geride görünmemeli. */
    doable: doable.length,
    done,
    skipped,
    remaining: doable.length - done - skipped,
    percent: doable.length ? Math.round((done + skipped) / doable.length * 100) : 0,
    active,
    next: nextTask(session?.workflow),
    complete: doable.length > 0 && done + skipped === doable.length
  };
}

/* ---------- Liste yönetimi ---------- */

export function upsertSession(sessions, session) {
  const list = Array.isArray(sessions) ? sessions : [];
  const i = list.findIndex(s => s.id === session.id);
  if (i === -1) return [session, ...list];
  const next = [...list];
  next[i] = session;
  return next;
}

export function removeSession(sessions, id) {
  return (Array.isArray(sessions) ? sessions : []).filter(s => s.id !== id);
}

/* En son güncellenen oturum — "kaldığın yerden devam et" için. */
export function latestSession(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  if (!list.length) return null;
  return [...list].sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
}

/* Tamamlanmamış oturumlar — giriş ekranı "devam et" önerecek.
   Spec: "Kullanıcı durursa Creator OS öneri sunmalıdır." */
export function unfinishedSessions(sessions) {
  return (Array.isArray(sessions) ? sessions : [])
    .filter(s => {
      const p = sessionProgress(s);
      return p.doable > 0 && !p.complete;
    })
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}
