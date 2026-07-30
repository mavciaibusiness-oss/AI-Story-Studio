import { TASKS, TASK_KEYS } from './workflow';

/*
  CREATOR OS — Active Workflow Manager: durum modeli.

  Sprint 5 / TASK-02, Adım 1.

  TASK-01'de workflow STATİKTİ: kurulur, gösterilir, kullanıcı elle
  işaretler. TASK-02 ile CANLI olacak — her olaydan sonra yeniden
  değerlendirilecek, önerecek, engelleyecek.

  Bu dosya o canlılığın temelini kuruyor: durumlar ve bağımlılıklar.

  ---------------------------------------------------------------
  YEDİ DURUM (spec'in listesi)

    waiting    Bekliyor    — sırası gelmedi ama yapılabilir
    active     Aktif       — kullanıcı şu an bunda
    done       Tamamlandı  — bitti
    skipped    Atlandı     — kullanıcı geçti
    suggested  Önerildi    — AI bunu öneriyor (tek öneri kuralı)
    blocked    Engellendi  — önkoşulu eksik, şimdi yapılamaz
    future     Yakında     — modül henüz yok (Sprint-6)

  TASK-01'de dört durum vardı: todo, active, done, skipped.
  `todo` → `waiting` olarak yeniden adlandırılmadı; ESKİ ADLAR
  KORUNUYOR çünkü TASK-01'de kaydedilmiş oturumlar localStorage'da
  duruyor ve `todo` taşıyor. Yeniden adlandırmak onları bozardı.

  Bunun yerine `todo` = `waiting` eşdeğeri kabul ediliyor ve
  normalizeStatus() eski değerleri yeni modele çeviriyor.
  ---------------------------------------------------------------
*/

export const STATES = {
  waiting:   { key: 'waiting',   order: 2, label: { tr: 'Bekliyor',   en: 'Waiting' } },
  active:    { key: 'active',    order: 1, label: { tr: 'Aktif',      en: 'Active' } },
  suggested: { key: 'suggested', order: 0, label: { tr: 'Önerildi',   en: 'Suggested' } },
  done:      { key: 'done',      order: 5, label: { tr: 'Tamamlandı', en: 'Done' } },
  skipped:   { key: 'skipped',   order: 6, label: { tr: 'Atlandı',    en: 'Skipped' } },
  blocked:   { key: 'blocked',   order: 3, label: { tr: 'Engellendi', en: 'Blocked' } },
  future:    { key: 'future',    order: 4, label: { tr: 'Yakında',    en: 'Coming soon' } }
};

export const STATE_KEYS = Object.keys(STATES);

/* TASK-01 uyumluluğu: eski `todo` değeri `waiting`e denk.
   Kaydedilmiş oturumlar bozulmasın. */
const LEGACY = { todo: 'waiting' };

export function normalizeStatus(status) {
  if (!status) return 'waiting';
  if (LEGACY[status]) return LEGACY[status];
  return STATES[status] ? status : 'waiting';
}

/* Bu durum "iş bitti" sayılır mı? İlerleme hesabı için. */
export function isSettled(status) {
  const s = normalizeStatus(status);
  return s === 'done' || s === 'skipped';
}

/* Kullanıcı bu görevi şimdi açabilir mi? */
export function isActionable(status) {
  const s = normalizeStatus(status);
  return s === 'waiting' || s === 'active' || s === 'suggested';
}

/*
  ---------------------------------------------------------------
  BAĞIMLILIKLAR

  Spec: "Henüz hikaye oluşturmadan storyboard hazırlıyorsun. Bu durum
  kaliteyi düşürebilir. [Yine de Devam Et]"

  İki tür bağımlılık var ve KARIŞTIRILMAMALI:

    requires  — ZORUNLU. Önkoşul yoksa görev anlamsız, hatta çöker.
                Prompt yazmak için sahne gerek; sahne yoksa yazacak
                bir şey yok. Durum: blocked.

    prefers   — TAVSİYE. Önkoşul olmadan da yapılabilir ama sonuç
                zayıflar. Kapak görselini videodan önce hazırlamak
                mümkün ama videoyu görmeden yapmak zor.
                Durum: uyarı, engelleme YOK.

  Ayrımın önemi: her şeyi zorunlu yapmak kullanıcıyı hapseder
  ("Yine de Devam Et" diyemez), hiçbirini yapmamak da uyarısız
  bırakır. Spec ikisini de istiyor — "engellendi" durumu VE
  "yine de devam et" düğmesi.
  ---------------------------------------------------------------
*/
export const DEPENDENCIES = {
  storyboard: {
    requires: ['script'],
    prefers: [],
    /* Sahne bölme metinden yapılıyor; metin yoksa bölünecek bir şey yok. */
    reason: { tr: 'Sahnelere bölmek için önce senaryo metni gerekiyor.',
              en: 'Splitting into scenes needs the script text first.' }
  },
  characters: {
    requires: ['script'],
    prefers: ['storyboard'],
    reason: { tr: 'Karakterleri tanımlamak için önce hikâye metni gerekiyor.',
              en: 'Defining characters needs the story text first.' }
  },
  prompts: {
    requires: ['storyboard'],
    prefers: ['characters'],
    reason: { tr: 'Prompt yazmak için sahnelerin ayrılmış olması gerekiyor.',
              en: 'Writing prompts needs the scenes to be split first.' }
  },
  images: {
    requires: ['prompts'],
    prefers: [],
    reason: { tr: 'Görselleri üretmek için önce promptlar hazır olmalı.',
              en: 'Generating visuals needs the prompts ready first.' }
  },
  voice: {
    requires: ['storyboard'],
    prefers: [],
    reason: { tr: 'Seslendirme için sahne metinleri gerekiyor.',
              en: 'Voiceover needs the scene texts.' }
  },
  edit: {
    requires: ['storyboard'],
    /* Kurgu teknik olarak görselsiz de çalışır (boş sahneler) ama
       sonuç işe yaramaz. Zorunlu değil, kuvvetle tavsiye. */
    prefers: ['images', 'voice'],
    reason: { tr: 'Kurgu için sahnelerin hazır olması gerekiyor.',
              en: 'Editing needs the scenes to be ready.' }
  },
  subtitles: {
    requires: ['storyboard'],
    prefers: ['voice'],
    reason: { tr: 'Altyazı için sahne metinleri gerekiyor.',
              en: 'Subtitles need the scene texts.' }
  },
  thumbnail: {
    requires: [],
    prefers: ['images'],
    reason: null
  },
  shorts: {
    requires: ['edit'],
    prefers: [],
    reason: { tr: 'Kesit çıkarmak için önce video oluşturulmalı.',
              en: 'Extracting a cut needs the video to be built first.' }
  },
  publish: {
    requires: [],
    prefers: ['edit'],
    reason: null
  },
  health: {
    requires: ['storyboard'],
    prefers: [],
    reason: { tr: 'Sağlık analizi için sahneler gerekiyor.',
              en: 'The health check needs scenes.' }
  },
  director: {
    /* TASK-06 mimarisi: Yönetmen beş motorun çıktısını okuyor,
       başında Sağlık var. Sahne yoksa okuyacak bir şey yok. */
    requires: ['storyboard'],
    prefers: ['health'],
    reason: { tr: 'Yönetmen kararları için sahneler gerekiyor.',
              en: 'Director decisions need scenes.' }
  },
  rebuild: {
    /* Yüklenen videoyu çözümlüyor — hiçbir şey gerektirmiyor.
       Aslında akışın BAŞINDA olabilir. */
    requires: [],
    prefers: [],
    reason: null
  }
};

/* Görevin bağımlılık tanımı — yoksa serbest. */
export function dependenciesOf(taskKey) {
  return DEPENDENCIES[taskKey] || { requires: [], prefers: [], reason: null };
}

/*
  ---------- Bağımlılık değerlendirmesi ----------

  Girdi: görev anahtarı + görev listesi (durumlarıyla)
  Çıkış: { blocked, missingRequired[], missingPreferred[], reason }

  ÖNEMLİ: bağımlılık YALNIZCA yol haritasındaki görevlere bakar.
  Kullanıcı 'script' görevini listeden çıkardıysa 'storyboard'
  engellenmemeli — kullanıcı o adımı bilinçle atmış demektir.
  Listede olmayan bir önkoşulu beklemek kullanıcıyı hapseder.
*/
export function evaluateDependencies(taskKey, tasks) {
  const dep = dependenciesOf(taskKey);
  const list = Array.isArray(tasks) ? tasks : [];
  const byKey = new Map(list.map(t => [t.key, t]));

  const missingRequired = [];
  for (const r of dep.requires) {
    const t = byKey.get(r);
    /* Listede yoksa engel sayma — kullanıcı çıkarmış olabilir */
    if (!t) continue;
    if (!isSettled(t.status)) missingRequired.push(r);
  }

  const missingPreferred = [];
  for (const p of dep.prefers) {
    const t = byKey.get(p);
    if (!t) continue;
    if (!isSettled(t.status)) missingPreferred.push(p);
  }

  return {
    blocked: missingRequired.length > 0,
    missingRequired,
    missingPreferred,
    reason: missingRequired.length > 0 ? dep.reason : null
  };
}

/*
  ---------- Durumları yeniden hesapla ----------

  Spec: "Creator OS workflow'u her olaydan sonra yeniden
  değerlendirmelidir."

  Bu fonksiyon canlılığın kalbi. Her görevin durumunu güncelliyor:

    • done / skipped  → dokunulmaz (kullanıcının kararı)
    • active          → dokunulmaz (kullanıcı orada)
    • future görev    → 'future'
    • önkoşul eksik   → 'blocked'
    • önkoşul tamam   → 'waiting'

  KULLANICININ KARARINA DOKUNULMUYOR: tamamlanmış bir görevi
  engellemek ya da atlanmış bir görevi geri getirmek, kullanıcının
  yaptığı işi geçersiz kılmak olur.

  `suggested` durumu burada ATANMIYOR — o öneri motorunun işi
  (Adım 3). Burada yalnızca engel/serbest ayrımı yapılıyor.
*/
export function recomputeStates(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];

  return list.map(task => {
    const status = normalizeStatus(task.status);

    /* Kullanıcının kararı korunur */
    if (status === 'done' || status === 'skipped' || status === 'active') {
      return status === task.status ? task : { ...task, status };
    }

    /* Sprint-6 görevi */
    if (task.future) {
      return task.status === 'future' ? task : { ...task, status: 'future' };
    }

    const dep = evaluateDependencies(task.key, list);
    const next = dep.blocked ? 'blocked' : 'waiting';

    if (task.status === next && !dep.blocked) return task;

    return {
      ...task,
      status: next,
      /* Engel sebebi görevle birlikte taşınıyor — arayüz
         "neden yapamıyorum" sorusunu yanıtlayabilsin. */
      blockedBy: dep.blocked ? dep.missingRequired : null,
      blockReason: dep.reason || null
    };
  });
}

/*
  ---------- Uyarılar ----------

  Spec: "Henüz hikaye oluşturmadan storyboard hazırlıyorsun. Bu durum
  kaliteyi düşürebilir. [Yine de Devam Et]"

  `prefers` karşılanmamışsa uyarı üretiliyor — ENGEL DEĞİL. Kullanıcı
  yine de devam edebilir; bu yüzden `dismissible: true`.

  Uyarı yalnızca kullanıcı o göreve GİRERKEN anlamlı; sürekli
  göstermek gürültü olur. Arayüz bunu görev açılışında kullanacak.
*/
export function warningsFor(taskKey, tasks) {
  const dep = evaluateDependencies(taskKey, tasks);
  if (!dep.missingPreferred.length) return [];

  return [{
    code: 'missing-preferred',
    task: taskKey,
    missing: dep.missingPreferred,
    dismissible: true,
    /* Metin arayüzde kuruluyor; burada hangi görevlerin eksik
       olduğunu veriyoruz ki i18n şablonu doldurulabilsin. */
    labels: dep.missingPreferred.map(k => TASKS[k]?.label || null).filter(Boolean)
  }];
}

/* ---------- Sıralama yardımcısı ----------
   Zaman çizelgesi görünümü için: durum önceliğine göre değil,
   yol haritası SIRASINA göre. Sıra kullanıcının planı; durum
   sırası onu bozar. */
export function timelineOrder(tasks) {
  return [...(tasks || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/* Bir görevin bağımlılık tanımı var mı — arayüz "serbest" diyebilsin */
export function hasDependencies(taskKey) {
  const d = DEPENDENCIES[taskKey];
  return !!d && (d.requires.length > 0 || d.prefers.length > 0);
}

/* Tüm bağımlılıkların GERÇEK görevlere işaret ettiğini doğrula.
   Yazım hatası sessizce engel üretir; test bunu yakalar. */
export function validateDependencies() {
  const bad = [];
  for (const [key, dep] of Object.entries(DEPENDENCIES)) {
    if (!TASK_KEYS.includes(key)) bad.push({ key, problem: 'unknown-task' });
    for (const r of [...dep.requires, ...dep.prefers]) {
      if (!TASK_KEYS.includes(r)) bad.push({ key, problem: 'unknown-dep:' + r });
    }
  }
  return bad;
}
