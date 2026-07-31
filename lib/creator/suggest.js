import { normalizeStatus, isSettled, evaluateDependencies, DEPENDENCIES } from './state';
import { staleTasks } from './live';
import { TASKS } from './workflow';

/*
  CREATOR OS — Öneri Motoru.

  Sprint 5 / TASK-02, Adım 3.

  Spec kuralı, tartışmasız:

    "AI Director her zaman tek bir öneri üretmelidir."

    Yanlış:  Ne yapmak istersin?  • Storyboard • Thumbnail • Prompt
    Doğru:   Sıradaki en mantıklı adım: Storyboard oluştur.

  Bu dosya o TEK öneriyi üretiyor — ve gerekçesini.

  ---------------------------------------------------------------
  NEDEN GEREKÇE ŞART

  "Storyboard'a git" demek yetmez. Kullanıcı neden o adımı yapması
  gerektiğini anlamazsa öneriyi keyfi bulur ve güvenmez.

  Spec'in ürün felsefesi de bunu istiyor: "Ürün kullanıcıyı
  eğitmelidir. Creator OS yalnızca araç sağlamaz, nasıl daha iyi
  içerik üretileceğini de öğretir."

  Her öneri bir `reason` kodu taşıyor; arayüz i18n'den metni kuruyor.
  Hazır cümle yazmıyoruz (Adım 2'deki günlük kararının aynısı).
  ---------------------------------------------------------------

  ÖNCELİK SIRASI — neden bu sırada:

    1. eskimiş iş      Bozuk bir şey var. İlerlemeden önce düzelt;
                       yoksa üstüne inşa edilen her şey de bozuk olur.
    2. devam eden iş   Kullanıcı bir işin ortasında. Yarım bırakıp
                       başka şeye geçirmek en kötü yönlendirme.
    3. kilit açan iş   Birden çok görevi serbest bırakan adım, tek
                       görevi açandan daha değerli.
    4. plan sırası     Hiçbiri yoksa yol haritasının kendi sırası.

  Her seviyede TEK sonuç dönüyor.
*/

export const SUGGEST_VERSION = 1;

/* Öneri gerekçeleri — arayüz i18n anahtarı olarak kullanıyor. */
export const REASONS = {
  'stale':        { priority: 1 },   // eskimiş iş var
  'continue':     { priority: 2 },   // devam eden görev
  'unlocks':      { priority: 3 },   // çok sayıda görevi açar
  'next-in-plan': { priority: 4 },   // plandaki sıradaki
  'all-done':     { priority: 9 },   // yapılacak kalmadı
  'all-blocked':  { priority: 8 },   // hepsi engelli
  'empty':        { priority: 9 }    // görev yok
};

/*
  Bir görev tamamlanırsa kaç görevin kilidi açılır?

  Doğrudan bağımlıları sayıyoruz. Zincirin tamamını saymak
  (storyboard → prompts → images) cazip ama yanıltıcı: images'ı açan
  storyboard değil, prompts. Doğrudan etkiyi ölçmek daha dürüst.
*/
function unlockCount(taskKey, tasks) {
  let n = 0;
  for (const t of tasks) {
    if (normalizeStatus(t.status) !== 'blocked') continue;
    const dep = DEPENDENCIES[t.key];
    if (!dep) continue;
    if (!dep.requires.includes(taskKey)) continue;

    /* Yalnızca BU görev eksikse açılır. Başka eksik varsa
       tamamlamak yetmez — saymak abartı olur. */
    const evalDep = evaluateDependencies(t.key, tasks);
    if (evalDep.missingRequired.length === 1 &&
        evalDep.missingRequired[0] === taskKey) {
      n++;
    }
  }
  return n;
}

/* Şimdi yapılabilir görevler — engelli, bitmiş, atlanmış ve
   Sprint-6 görevleri elenir. */
function actionable(tasks) {
  return (tasks || []).filter(t => {
    if (t.future) return false;
    const s = normalizeStatus(t.status);
    return s === 'waiting' || s === 'active' || s === 'suggested';
  });
}

/*
  YUMUŞAK BAĞIMLILIK: bu görevin `prefers` listesindeki bir iş şu an
  yapılabilir durumda ve bitmemiş mi?

  NEDEN ÖNEMLİ — ilk sürümde bu yoktu ve öneri zinciri şöyleydi:

    script → storyboard → prompts → characters → …

  `prompts` önce geliyordu çünkü kilit açıyor (images'ı serbest
  bırakıyor). Ama `prompts: { prefers: ['characters'] }` — karakterler
  önce tanımlanırsa promptlar tutarlı olur.

  Sonuç: motor kullanıcıya karakter tanımı olmadan prompt yazdırıyor,
  sonra "karakterler eksik" uyarısı veriyordu. Kendi verdiği tavsiyeyi
  kendi öneri sırası çiğniyordu.

  Artık yumuşak önkoşulu bekleyen görev geri plana alınıyor — ENGEL
  DEĞİL, yalnızca sıralama tercihi. Kullanıcı isterse yine açabilir.
*/
function softBlocked(taskKey, tasks) {
  const dep = DEPENDENCIES[taskKey];
  if (!dep?.prefers?.length) return false;

  const byKey = new Map(tasks.map(t => [t.key, t]));
  return dep.prefers.some(k => {
    const t = byKey.get(k);
    if (!t || t.future) return false;
    if (isSettled(t.status)) return false;
    /* Yumuşak önkoşul kendisi engelliyse beklemenin anlamı yok —
       kullanıcıyı kilitler. Yalnızca YAPILABİLİR olanı bekliyoruz. */
    const s = normalizeStatus(t.status);
    return s === 'waiting' || s === 'active' || s === 'suggested';
  });
}

/*
  ---------- ANA GİRİŞ ----------

  Girdi: oturum
  Çıkış: tek öneri

    {
      task,          // önerilen görev (null olabilir)
      reason,        // gerekçe kodu
      detail,        // gerekçeye özgü veri (kaç görev açılır, hangi iş eskimiş)
      alternatives   // BİLGİ AMAÇLI, arayüz göstermek zorunda değil
    }

  `alternatives` neden var: spec menü göstermeyi yasaklıyor ve arayüz
  de göstermeyecek. Ama kullanıcı "başka ne yapabilirim" diye sorarsa
  (gizli bir "diğer seçenekler" bağlantısı) veri hazır olmalı. Öneri
  motorunun kendisi hep TEK sonuç veriyor; menüye çevirmek arayüzün
  bilinçli kararı olur.
*/
export function suggestNext(session) {
  const tasks = session?.workflow?.tasks || [];

  if (!tasks.length) {
    return { task: null, reason: 'empty', detail: null, alternatives: [] };
  }

  /* --- 1. Eskimiş iş var mı? --- */
  const stale = staleTasks(session);
  if (stale.length) {
    /* Eskimiş işin SEBEBİNİ öner, işin kendisini değil.
       Promptlar eskimiş çünkü storyboard yeniden açıldı → önerilecek
       adım storyboard'u bitirmek. Promptlara yönlendirmek kullanıcıyı
       aynı yere geri getirirdi. */
    const cause = stale[0].because[0];
    const causeTask = tasks.find(t => t.key === cause);
    if (causeTask && !isSettled(causeTask.status) && !causeTask.future) {
      return {
        task: causeTask,
        reason: 'stale',
        detail: {
          staleTasks: stale.map(s => ({ key: s.key, label: s.label })),
          because: cause
        },
        alternatives: []
      };
    }
  }

  /* --- 2. Devam eden iş var mı? --- */
  const active = tasks.find(t => normalizeStatus(t.status) === 'active');
  if (active && !active.future) {
    return {
      task: active,
      reason: 'continue',
      detail: null,
      alternatives: []
    };
  }

  const open = actionable(tasks);

  if (!open.length) {
    /* Hiç yapılabilir görev yok. İki farklı durum ve ayırmak önemli:
       hepsi bitti mi, yoksa hepsi engelli mi? */
    const blocked = tasks.filter(t => normalizeStatus(t.status) === 'blocked');
    if (blocked.length) {
      return {
        task: null, reason: 'all-blocked',
        detail: { blocked: blocked.map(t => ({ key: t.key, label: t.label })) },
        alternatives: []
      };
    }
    return { task: null, reason: 'all-done', detail: null, alternatives: [] };
  }

  /* --- 3. Kilit açan iş --- */
  const scored = open.map(t => ({
    task: t,
    unlocks: unlockCount(t.key, tasks),
    /* Yumuşak önkoşulu bekleyen görev geri plana — kendi verdiğimiz
       tavsiyeyi kendi sıramız çiğnemesin. */
    soft: softBlocked(t.key, tasks),
    order: t.order ?? 999
  }));

  /* Yumuşak engelli olmayanlar önce. Hepsi yumuşak engelliyse
     (nadir) hepsi eşit sayılır ve normal sıralama işler —
     kullanıcı kilitlenmesin. */
  const clean = scored.filter(s => !s.soft);
  const pool = clean.length ? clean : scored;

  const best = pool.reduce((a, b) => {
    if (b.unlocks !== a.unlocks) return b.unlocks > a.unlocks ? b : a;
    /* Eşitlikte plan sırası — kullanıcının kendi planı */
    return b.order < a.order ? b : a;
  });

  const alternatives = scored
    .filter(s => s.task.key !== best.task.key)
    .sort((a, b) => (a.soft - b.soft) || (b.unlocks - a.unlocks) || (a.order - b.order))
    .slice(0, 3)
    .map(s => ({ key: s.task.key, label: s.task.label, unlocks: s.unlocks }));

  if (best.unlocks > 0) {
    return {
      task: best.task,
      reason: 'unlocks',
      detail: { unlocks: best.unlocks },
      alternatives
    };
  }

  /* --- 4. Plan sırası --- */
  const first = [...open].sort((a, b) => (a.order ?? 999) - (b.order ?? 999))[0];
  return {
    task: first,
    reason: 'next-in-plan',
    detail: null,
    alternatives
  };
}

/*
  ---------- ÖNERİYİ İŞARETLE ----------

  Spec yedi durumdan biri olarak `suggested` istiyor. Bu fonksiyon
  öneriyi görev listesine yansıtıyor.

  KURAL: aynı anda tek `suggested` görev. Önceki öneri temizlenir,
  yoksa liste öneri işaretleriyle dolar ve "tek öneri" kuralı görsel
  olarak çiğnenir.

  Aktif görev ÖNERİLİ İŞARETLENMEZ — zaten üstünde çalışıyor, ikinci
  bir etiket gürültü olur.
*/
export function markSuggested(session) {
  if (!session?.workflow) return session;

  const suggestion = suggestNext(session);
  const key = suggestion.task?.key || null;

  const tasks = session.workflow.tasks.map(t => {
    const s = normalizeStatus(t.status);

    /* Eski öneri işaretini temizle */
    if (s === 'suggested' && t.key !== key) {
      return { ...t, status: 'waiting' };
    }
    /* Yeni öneriyi işaretle — ama aktif görevi bozmadan */
    if (t.key === key && s === 'waiting') {
      return { ...t, status: 'suggested' };
    }
    return t;
  });

  return {
    ...session,
    workflow: { ...session.workflow, tasks },
    /* Öneri oturuma yazılıyor ki arayüz her seferinde yeniden
       hesaplamak zorunda kalmasın ve iki yerde farklı öneri
       görünmesin (yol haritası vs. dönüş şeridi). */
    suggestion: {
      taskKey: key,
      reason: suggestion.reason,
      detail: suggestion.detail,
      at: new Date().toISOString()
    }
  };
}

/*
  ---------- İLERLEME ÖZETİ ----------

  Adım 1'deki sessionProgress yedi duruma göre yenilendi ve öneriyi
  de içeriyor. Arayüz tek çağrıyla her şeyi alsın.
*/
export function workflowStatus(session) {
  const tasks = session?.workflow?.tasks || [];
  const doable = tasks.filter(t => !t.future);
  const done = doable.filter(t => normalizeStatus(t.status) === 'done').length;
  const skipped = doable.filter(t => normalizeStatus(t.status) === 'skipped').length;
  const blocked = doable.filter(t => normalizeStatus(t.status) === 'blocked').length;
  const active = tasks.find(t => normalizeStatus(t.status) === 'active') || null;

  const suggestion = suggestNext(session);
  const stale = staleTasks(session);

  return {
    total: tasks.length,
    doable: doable.length,
    done,
    skipped,
    blocked,
    remaining: doable.length - done - skipped,
    /* Yüzde yapılabilir görevler üzerinden — Sprint-6 görevleri
       paydaya girmiyor (TASK-01'deki karar). */
    percent: doable.length ? Math.round((done + skipped) / doable.length * 100) : 0,
    active,
    suggestion,
    stale,
    complete: doable.length > 0 && done + skipped === doable.length,
    /* Tıkanma: yapılacak var ama hiçbiri yapılamıyor. Arayüz bunu
       ayrı ele almalı — "bitti" ile karıştırılmamalı. */
    stuck: suggestion.reason === 'all-blocked'
  };
}

/*
  ---------- GEREKÇE VERİSİ ----------

  Arayüzün metni kurabilmesi için gereken alanları toplar.
  Metin YOK — anahtar ve veri var.
*/
export function suggestionData(suggestion, locale) {
  if (!suggestion) return null;
  const t = suggestion.task;

  return {
    reason: suggestion.reason,
    taskKey: t?.key || null,
    label: t?.label || null,
    desc: t?.desc || null,
    route: t?.route || null,
    /* Gerekçeye özgü sayılar/etiketler */
    unlocks: suggestion.detail?.unlocks ?? null,
    staleLabels: (suggestion.detail?.staleTasks || []).map(s => s.label),
    blockedCount: (suggestion.detail?.blocked || []).length || null,
    hasAlternatives: (suggestion.alternatives || []).length > 0
  };
}
