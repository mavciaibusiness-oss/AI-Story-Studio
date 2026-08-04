import { normalizeStatus } from './state';

/*
  CREATOR OS — görev süresi ölçümü.

  Sprint 6 / TASK-02, Adım 1.

  ---------------------------------------------------------------
  NEDEN VAR: SÜREYİ UYDURMAMAK İÇİN

  Spec çıktı örneğinde "Tahmini süre: 26 dakika" var. O rakamı
  bugün üretemeyiz — hiçbir yerde adım süresi ölçülmüyor.

  Kullanıcının kararı (Sprint-6 TASK-02):
    "Şimdilik uydurma süre gösterme. Sadece adım sayısını göster.
     Aynı anda görev başlangıç/bitiş zamanlarını kaydetmeye başla.
     Yeterli gerçek veri oluştuğunda kullanıcıya KENDİ kullanım
     geçmişine göre ortalama süre göster."

  Bu dosya o ölçümü yapıyor. Bugün süre göstermiyor; veri birikince
  gerçek rakam çıkıyor — üstelik o kullanıcının kendi hızına göre,
  benim varsayımıma göre değil.
  ---------------------------------------------------------------

  YENİ VERİ TOPLAMIYORUZ

  Olay günlüğü (lib/creator/live.js) zaten her olaya `at` zaman
  damgası yazıyor. Bu dosya o damgalardan süre ÇIKARIYOR — yeni
  bir kayıt mekanizması, yeni tablo, yeni migration yok.

  Yani ölçüm Sprint-5'ten beri toplanıyordu; kimse okumuyordu.
*/

export const TIMING_VERSION = 1;

/*
  Bir görevin süresi sayılabilmesi için kaç örnek gerekli.

  Tek ölçümden ortalama çıkarmak yanıltıcı: kullanıcı bir kez
  telefonu açıp yarım saat sonra dönmüş olabilir. LEARN.MIN_SAMPLES
  (3) ile aynı mantık.
*/
export const MIN_SAMPLES = 3;

/*
  Bir ölçümün geçerli sayılacağı üst sınır.

  Kullanıcı görevi açıp bilgisayarı kapatırsa aradaki 14 saat
  "çalışma süresi" değil. 90 dakikadan uzun ölçümler ATILIYOR —
  ortalamayı bozarlar.

  Alt sınır da var: 5 saniyeden kısa bir "tamamlandı" muhtemelen
  yanlışlıkla tıklama.
*/
export const MAX_TASK_MIN = 90;
export const MIN_TASK_SEC = 5;

/*
  ---------- BİR OTURUMDAN SÜRELERİ ÇIKAR ----------

  Bir görev `module.opened` ya da `task.activated` ile başlıyor,
  `task.done` ile bitiyor. Aradaki fark süre.

  Girdi: oturum (log dizisi ile)
  Çıkış: { [taskKey]: [dakika, ...] }
*/
export function extractDurations(session) {
  const log = Array.isArray(session?.log) ? session.log : [];
  if (!log.length) return {};

  /* Günlük en yeni başta; kronolojik okumak için ters çeviriyoruz */
  const events = [...log].reverse();
  const started = {};
  const out = {};

  for (const e of events) {
    const key = e?.taskKey;
    if (!key || !e.at) continue;
    const t = new Date(e.at).getTime();
    if (!Number.isFinite(t)) continue;

    if (e.type === 'module.opened' || e.type === 'task.activated') {
      /* Zaten açıksa ilk açılışı koruyoruz — kullanıcı sekmeler
         arasında gidip gelmiş olabilir. */
      if (started[key] == null) started[key] = t;
    } else if (e.type === 'task.done') {
      const from = started[key];
      delete started[key];
      if (from == null) continue;

      const sec = (t - from) / 1000;
      if (sec < MIN_TASK_SEC) continue;              // yanlışlıkla tıklama
      if (sec > MAX_TASK_MIN * 60) continue;         // arada bırakılmış
      (out[key] = out[key] || []).push(+(sec / 60).toFixed(1));
    } else if (e.type === 'task.reopened' || e.type === 'task.skipped') {
      /* Geri açılan ya da atlanan görevin ölçümü geçersiz */
      delete started[key];
    }
  }

  return out;
}

/*
  ---------- BİRDEN ÇOK OTURUMDAN TOPLA ----------

  Çıkış: { [taskKey]: { samples, avgMin, minMin, maxMin } }

  Yeterli örnek yoksa o görev listede YOK — "bilmiyoruz" demek,
  tek ölçümden ortalama uydurmaktan iyidir.
*/
export function taskTimings(sessions) {
  const all = {};
  for (const s of (sessions || [])) {
    const d = extractDurations(s);
    for (const [k, arr] of Object.entries(d)) {
      (all[k] = all[k] || []).push(...arr);
    }
  }

  const out = {};
  for (const [k, arr] of Object.entries(all)) {
    if (arr.length < MIN_SAMPLES) continue;
    const sum = arr.reduce((a, b) => a + b, 0);
    out[k] = {
      samples: arr.length,
      avgMin: +(sum / arr.length).toFixed(1),
      minMin: Math.min(...arr),
      maxMin: Math.max(...arr)
    };
  }
  return out;
}

/*
  ---------- PLAN SÜRESİ TAHMİNİ ----------

  Spec'in "Tahmini süre: 26 dakika" çıktısı — ama YALNIZCA gerçek
  ölçüm varsa.

  Girdi: workflow + taskTimings çıktısı
  Çıkış:
    { known: false, tasks, measured: 0 }   ← süre gösterme
    { known: true, totalMin, tasks, measured, coverage }

  KISMİ KAPSAMA: 12 görevin 4'ünde ölçüm varsa toplam süre
  YANILTICI olur — eksik 8 görev sıfır sayılmış gibi görünür.
  Kapsama %60'ın altındaysa `known: false`.

  Bu, TASK-07'de (Sprint-4) `overall: null` kararının aynısı:
  yetersiz veriyle toplam üretmek uydurmaktır.
*/
export const MIN_COVERAGE = 0.6;

export function estimatePlan(workflow, timings) {
  const tasks = (workflow?.tasks || []).filter(t => !t.future);
  const total = tasks.length;
  if (!total) return { known: false, tasks: 0, measured: 0 };

  const t = timings || {};
  let sum = 0, measured = 0;
  for (const task of tasks) {
    const m = t[task.key];
    if (m) { sum += m.avgMin; measured++; }
  }

  const coverage = measured / total;
  if (coverage < MIN_COVERAGE) {
    return { known: false, tasks: total, measured, coverage: +coverage.toFixed(2) };
  }

  /*
    Ölçülmeyen görevler için ölçülenlerin ortalaması kullanılıyor.
    Sıfır saymak toplamı olduğundan küçük gösterirdi.

    Bu bir TAHMİN ve arayüz "yaklaşık" diyecek — ama tahmin
    kullanıcının KENDİ ölçümlerinden çıkıyor, benim varsayımımdan
    değil.
  */
  const avgOfMeasured = sum / measured;
  const estimated = sum + avgOfMeasured * (total - measured);

  return {
    known: true,
    totalMin: Math.round(estimated),
    tasks: total,
    measured,
    coverage: +coverage.toFixed(2)
  };
}

/*
  ---------- ÖLÇÜM DURUMU ----------

  Arayüz "kaç görev ölçüldü, ne zaman süre görebileceğim" desin.
*/
export function timingStatus(sessions) {
  const timings = taskTimings(sessions);
  const measured = Object.keys(timings).length;

  /* Kaç ölçüm toplandı — henüz eşiği geçmeyenler dahil */
  let raw = 0;
  for (const s of (sessions || [])) {
    for (const arr of Object.values(extractDurations(s))) raw += arr.length;
  }

  return {
    measuredTasks: measured,
    totalMeasurements: raw,
    minSamples: MIN_SAMPLES,
    /* Hiç ölçüm yoksa arayüz süre bölümünü hiç göstermesin */
    ready: measured > 0
  };
}
