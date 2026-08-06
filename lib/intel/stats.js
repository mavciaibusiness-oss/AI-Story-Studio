import { projectSummary, STATUSES } from '@/lib/project/model';
import { workingHours, MIN_HOUR_SAMPLES } from './actions';

/*
  CREATOR INTELLIGENCE — istatistikler ve çalışma alışkanlığı.

  Sprint 6 / Creator Intelligence, Adım 5.

  Spec maddeleri:
    3. Çalışma alışkanlığı — sabah mı akşam mı, haftada kaç proje
    7. Creator Statistics — bugüne kadar X video, Y reklam...

  ---------------------------------------------------------------
  "19 KANAL" EKLENMEDİ

  Kullanıcı kararı: "Ölçülemeyen maddeler eklenmeyecek. YouTube/
  kanal entegrasyonu geldiğinde ayrı sinyal olarak eklenir."

  Kanal kavramı yok. `projects` tablosu PROJE tutuyor, kanal değil.
  Bir kullanıcının kaç YouTube kanalı olduğunu bilmiyoruz.

  Video, reklam ve Shorts sayıları GERÇEK — episodes tablosundan
  sayılıyor.
  ---------------------------------------------------------------

  BU DOSYA VERİTABANINA ERİŞMİYOR

  Saf dönüşüm. Sorguları API atıyor.
*/

export const STATS_VERSION = 1;

/* Format → kategori. lib/dashboard/summary.js'teki eşlemenin
   aynısı — iki yerde farklı sayarsak sayılar çelişir. */
const CATEGORY = {
  youtube: 'video', documentary: 'video', podcast: 'video',
  shorts: 'shorts', tiktok: 'shorts', reels: 'shorts',
  square: 'ad'
};

/*
  ---------- TOPLAM ÜRETİM ----------

  Spec: "Bugüne kadar 432 video, 97 reklam, 82 Shorts"

  Dashboard'daki `productivity` HAFTALIK sayıyor; bu tüm zamanlar.
  İkisi farklı sorular: "bu hafta ne ürettim" ve "bugüne kadar ne
  yaptım".

  TAMAMLANAN ve BAŞLANAN ayrı. 5 video başlatıp hiçbirini
  bitirmemek ile 5 video bitirmek aynı şey değil — Dashboard'da da
  aynı kararı vermiştik.
*/
export function lifetimeStats(episodes) {
  const eps = (episodes || []).map(projectSummary);

  const empty = () => ({ started: 0, completed: 0 });
  const byCategory = { video: empty(), shorts: empty(), ad: empty(), other: empty() };
  let scenes = 0, withScenes = 0;
  let firstAt = null, lastAt = null;

  for (const p of eps) {
    const cat = CATEGORY[p.format] || 'other';
    byCategory[cat].started++;
    if (STATUSES[p.status]?.terminal) byCategory[cat].completed++;

    if (p.scenes > 0) { withScenes++; scenes += p.scenes; }

    if (p.createdAt) {
      const t = new Date(p.createdAt).getTime();
      if (Number.isFinite(t)) {
        if (!firstAt || t < firstAt) firstAt = t;
        if (!lastAt || t > lastAt) lastAt = t;
      }
    }
  }

  const totals = Object.values(byCategory).reduce(
    (a, v) => ({ started: a.started + v.started, completed: a.completed + v.completed }),
    { started: 0, completed: 0 });

  return {
    byCategory,
    totals,
    scenes,
    storyboards: withScenes,
    firstAt: firstAt ? new Date(firstAt).toISOString() : null,
    lastAt: lastAt ? new Date(lastAt).toISOString() : null,
    /* Kaç gündür üretiyor — "bugüne kadar" ifadesine bağlam veriyor */
    activeDays: firstAt ? Math.max(1, Math.round((Date.now() - firstAt) / 86400000)) : 0,
    /*
      ÖLÇÜLEMEYEN — açıkça bildiriliyor.
      "19 kanal" burada yok çünkü kanal kavramı yok.
    */
    notMeasured: ['channels', 'views', 'revenue']
  };
}

/*
  ---------- HAFTALIK RİTİM ----------

  Spec: "Haftada kaç proje?"

  Ortalama, TOPLAM SÜREYE bölünerek hesaplanıyor — ilk projeden
  bugüne. Kullanıcı 3 ay ara verdiyse ortalama düşük çıkar; bu
  doğru, çünkü ritim sorusu tam da bunu soruyor.

  EN AZ 3 HAFTA gerekiyor: iki haftalık veriden "haftada kaç
  proje" çıkarmak yanıltıcı.
*/
export const MIN_WEEKS = 3;

export function weeklyRhythm(episodes) {
  const stats = lifetimeStats(episodes);
  if (!stats.firstAt) {
    return { known: false, reason: 'no-data' };
  }

  const weeks = stats.activeDays / 7;
  if (weeks < MIN_WEEKS) {
    return { known: false, reason: 'too-new', weeks: +weeks.toFixed(1), minWeeks: MIN_WEEKS };
  }

  return {
    known: true,
    weeks: Math.round(weeks),
    perWeek: +(stats.totals.started / weeks).toFixed(1),
    completedPerWeek: +(stats.totals.completed / weeks).toFixed(1)
  };
}

/*
  ---------- ÇALIŞMA ALIŞKANLIĞI ----------

  Spec: "Sabah mı çalışıyor? Akşam mı?"

  `workingHours` (lib/intel/actions.js) hesaplıyor; burada onu
  proje verisiyle birleştiriyoruz.

  YETERSİZ VERİDE SÖYLEMİYORUZ. 10 sinyalden az varsa "sen
  sabahçısın" demek uydurma olur.
*/
export function workHabit(actionRows, episodes) {
  const hours = workingHours(actionRows);
  const rhythm = weeklyRhythm(episodes);

  return {
    hours,
    rhythm,
    /* Arayüz bölümü hiç göstermesin diye: ikisi de bilinmiyorsa
       söyleyecek bir şey yok */
    known: hours.known || rhythm.known,
    minHourSamples: MIN_HOUR_SAMPLES
  };
}

/*
  ---------- ÖNE ÇIKAN SAYI ----------

  Arayüz bir tane büyük sayı gösterecek. Hangisi?

  En çok üretilen kategori — kullanıcının kendini gördüğü sayı.
  Hepsi sıfırsa null (hiç üretim yok).
*/
export function headlineStat(stats) {
  const entries = Object.entries(stats?.byCategory || {})
    .filter(([k]) => k !== 'other')
    .sort((a, b) => b[1].started - a[1].started);
  const [key, val] = entries[0] || [];
  if (!key || !val || val.started === 0) return null;
  return { key, started: val.started, completed: val.completed };
}
