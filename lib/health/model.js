/*
  VIDEO HEALTH — veri modeli ve puanlama.

  Sprint 4 / TASK-01. Bu dosya saf veri ve saf fonksiyondur:
  React yok, ağ yok, tarayıcı API'si yok. Böylece hem sunucu
  route'u hem istemci bileşenleri hem de ileride Timeline Analyzer
  ve AI Director aynı tanımları paylaşır — analiz tekrarlanmaz.

  Tasarım kararı: rapor storyboard'un içinde YAŞAMAZ. Storyboard
  üretim verisidir; sağlık raporu o üretim hakkında bir gözlemdir.
  Ayrı tabloda durur, storyboard'a dokunmayız (ADR-001 korunur).
*/

export const HEALTH_VERSION = 1;

/* ---------- Kategoriler ----------
   Ağırlıklar toplam 1.0. Hook ve Retention izlenme üzerinde en
   doğrudan etkiye sahip olduğu için biraz daha ağır basar. */
export const HEALTH_CATEGORIES = [
  { key: 'story',     weight: 0.18, label: { tr: 'Hikâye',   en: 'Story' } },
  { key: 'visual',    weight: 0.15, label: { tr: 'Görsel',   en: 'Visual' } },
  { key: 'voice',     weight: 0.13, label: { tr: 'Ses',      en: 'Voice' } },
  { key: 'pacing',    weight: 0.15, label: { tr: 'Ritim',    en: 'Pacing' } },
  { key: 'hook',      weight: 0.17, label: { tr: 'Açılış',   en: 'Hook' } },
  { key: 'emotion',   weight: 0.10, label: { tr: 'Duygu',    en: 'Emotion' } },
  { key: 'retention', weight: 0.12, label: { tr: 'Tutundurma', en: 'Retention' } }
];

export const CATEGORY_KEYS = HEALTH_CATEGORIES.map(c => c.key);

/* ---------- Uyarı seviyeleri ----------
   TASK-01'deki dört seviye. rank sıralama içindir: kritik önce gelir. */
export const SEVERITIES = {
  info:     { rank: 0, tone: 'info',     label: { tr: 'Bilgi',   en: 'Information' } },
  tip:      { rank: 1, tone: 'ok',       label: { tr: 'Öneri',   en: 'Recommendation' } },
  warn:     { rank: 2, tone: 'warn',     label: { tr: 'Uyarı',   en: 'Warning' } },
  critical: { rank: 3, tone: 'critical', label: { tr: 'Kritik',  en: 'Critical' } }
};

export const SEVERITY_KEYS = ['critical', 'warn', 'tip', 'info'];

/* ---------- Eşikler ----------
   Kural tabanlı analizin sabitleri. Motorun ENGINE sabitleriyle
   çakışmasın diye ayrı tutulur; buradakiler kalite yargısıdır,
   render parametresi değil. */
export const HEALTH = {
  HOOK_WINDOW: 5,          // açılış değerlendirmesi (sn)
  SCENE_MIN: 2.0,          // bundan kısa sahne göz yorar (sn)
  SCENE_MAX: 12.0,         // bundan uzun sahne dikkat kaybettirir (sn)
  SCENE_IDEAL_LOW: 3.0,
  SCENE_IDEAL_HIGH: 8.0,
  WPM_SLOW: 95,            // konuşma hızı alt sınırı (kelime/dk)
  WPM_FAST: 190,           // üst sınır
  REPEAT_SIM: 0.72,        // prompt benzerliği bu oranın üstündeyse tekrar
  LONG_RUN: 3,             // aynı medya tipinin peş peşe sınırı
  MIN_SCENES: 3,
  STATIC_RATIO: 0.55       // hareketsiz sahne oranı bu üstündeyse ritim düşer
};

/* ---------- Boş rapor ---------- */
export function emptyReport(patch) {
  return {
    version: HEALTH_VERSION,
    createdAt: null,
    overall: 0,
    stars: 0,
    scores: CATEGORY_KEYS.reduce((a, k) => (a[k] = 0, a), {}),
    issues: [],        // { id, scene, at, severity, category, title, detail, recommendation, gain }
    timeline: [],      // { scene, at, end, dur, rating, note }
    summary: '',       // AI'nin bir paragraflık değerlendirmesi
    stats: {},         // ölçülen ham sayılar (şeffaflık için)
    source: 'rules',   // 'rules' | 'rules+ai'
    ...(patch || {})
  };
}

/* ---------- Puanlama yardımcıları ---------- */

export function clampScore(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/* Ağırlıklı genel puan. Eksik kategori 0 sayılmaz, ağırlıktan düşülür;
   böylece ölçülemeyen bir kategori toplamı haksızca aşağı çekmez. */
export function overallScore(scores) {
  let sum = 0, w = 0;
  for (const c of HEALTH_CATEGORIES) {
    const v = scores?.[c.key];
    if (!Number.isFinite(v)) continue;
    sum += v * c.weight;
    w += c.weight;
  }
  return w === 0 ? 0 : clampScore(sum / w);
}

/* 0-100 → 0-5 yıldız, yarım yıldız hassasiyetinde. */
export function starsOf(score) {
  return Math.round((clampScore(score) / 100) * 10) / 2;
}

/* Genel puanın sözel karşılığı — arayüz rengi de buradan türetilir. */
export function healthBand(score) {
  const s = clampScore(score);
  if (s >= 85) return { key: 'great', tone: 'ok',       label: { tr: 'Çok iyi',    en: 'Excellent' } };
  if (s >= 70) return { key: 'good',  tone: 'ok',       label: { tr: 'İyi',        en: 'Good' } };
  if (s >= 55) return { key: 'fair',  tone: 'warn',     label: { tr: 'Orta',       en: 'Fair' } };
  if (s >= 40) return { key: 'weak',  tone: 'warn',     label: { tr: 'Zayıf',      en: 'Weak' } };
  return          { key: 'poor',  tone: 'critical', label: { tr: 'Sorunlu',    en: 'Needs work' } };
}

/* Sorunları önem sırasına koy: önce kritik, sonra beklenen kazanç. */
export function sortIssues(issues) {
  return [...(issues || [])].sort((a, b) => {
    const r = (SEVERITIES[b.severity]?.rank || 0) - (SEVERITIES[a.severity]?.rank || 0);
    if (r) return r;
    const g = (b.gain || 0) - (a.gain || 0);
    if (g) return g;
    return (a.scene || 0) - (b.scene || 0);
  });
}

/* Kategori bazında sorun sayısı — rozet göstermek için. */
export function issueCountByCategory(issues) {
  const out = {};
  for (const k of CATEGORY_KEYS) out[k] = 0;
  for (const i of issues || []) {
    if (out[i.category] !== undefined) out[i.category]++;
  }
  return out;
}

/* Tahmini toplam kazanç: aynı kategoride birden çok öneri varsa
   kazançlar toplanmaz, azalan getiriyle birikir — abartılı vaat olmasın. */
export function projectedGain(issues, scores) {
  const byCat = {};
  for (const i of issues || []) {
    if (!i.gain || !i.category) continue;
    (byCat[i.category] = byCat[i.category] || []).push(i.gain);
  }
  const next = { ...(scores || {}) };
  for (const [cat, gains] of Object.entries(byCat)) {
    gains.sort((a, b) => b - a);
    let acc = 0, factor = 1;
    for (const g of gains) { acc += g * factor; factor *= 0.55; }
    next[cat] = clampScore((next[cat] || 0) + acc);
  }
  return { scores: next, overall: overallScore(next) };
}
