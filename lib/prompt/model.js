/*
  PROMPT QUALITY — veri modeli.

  Sprint 4 / TASK-03. Bir prompt için kalite raporu şeması.
  Video Health'in model dilini takip eder: aynı seviye kavramları,
  aynı puanlama şekli. Kullanıcı iki ekran arasında geçince aynı
  görsel dili görsün.

  Kategori kararı:
    Spec 6 kategori istiyor: Detail, Consistency, Cinematic, Emotion,
    Motion, Compatibility. Ağırlıklar özdeş değil — Detail ve Consistency
    resimde en belirleyici olan iki eksen, biraz daha ağır bastırıldı.
*/

export const PROMPT_HEALTH_VERSION = 1;

export const PROMPT_CATEGORIES = [
  { key: 'detail',        weight: 0.22, label: { tr: 'Detay',      en: 'Detail' } },
  { key: 'consistency',   weight: 0.20, label: { tr: 'Tutarlılık', en: 'Consistency' } },
  { key: 'cinematic',     weight: 0.16, label: { tr: 'Sinema',     en: 'Cinematic' } },
  { key: 'emotion',       weight: 0.12, label: { tr: 'Duygu',      en: 'Emotion' } },
  { key: 'motion',        weight: 0.14, label: { tr: 'Hareket',    en: 'Motion' } },
  { key: 'compatibility', weight: 0.16, label: { tr: 'Uyumluluk',  en: 'Compatibility' } }
];

export const PROMPT_CAT_KEYS = PROMPT_CATEGORIES.map(c => c.key);

export const PROMPT_SEVERITIES = {
  info:     { rank: 0, tone: 'info',     label: { tr: 'Bilgi',   en: 'Info' } },
  tip:      { rank: 1, tone: 'ok',       label: { tr: 'Öneri',   en: 'Tip' } },
  warn:     { rank: 2, tone: 'warn',     label: { tr: 'Uyarı',   en: 'Warning' } },
  critical: { rank: 3, tone: 'critical', label: { tr: 'Kritik',  en: 'Critical' } }
};

/*
  Eşikler.
  Bu sabitler kural motoru için ayarlanabilir kadranlardır; TASK-01'in
  HEALTH sabit blokuyla aynı stilde tek yerde toplandı ki motor kodu
  değişmeden ayar yapılabilsin.
*/
export const PROMPT_THRESH = {
  MIN_WORDS: 8,          // altında zayıf — çok jenerik
  IDEAL_MIN: 20,
  IDEAL_MAX: 140,
  MAX_WORDS: 260,        // üstünde model dağıtır
  MIN_DETAIL_HITS: 3,    // detay sözlüğünden en az kaç eşleşme
  MIN_CINEMA_HITS: 1,    // en az bir kadraj/lens/kamera terimi
  MIN_MOTION_HITS: 1,    // video prompt'unda en az bir hareket terimi
  STYLE_MATCH_MIN: 0.5   // kilitli stille ne kadar tutmalı (0-1)
};

/* ---------- Boş rapor ---------- */
export function emptyPromptReport(patch) {
  return {
    version: PROMPT_HEALTH_VERSION,
    createdAt: null,
    overall: 0,
    stars: 0,
    scores: PROMPT_CAT_KEYS.reduce((a, k) => (a[k] = 0, a), {}),
    issues: [],       // { id, layer, scene, severity, category, code,
                      //   title, detail, recommendation, gain }
    stats: {},
    source: 'rules',  // 'rules' | 'rules+ai'
    ...(patch || {})
  };
}

/* ---------- Puanlama ---------- */
export function promptClamp(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function promptOverall(scores) {
  let sum = 0, w = 0;
  for (const c of PROMPT_CATEGORIES) {
    const v = scores?.[c.key];
    if (!Number.isFinite(v)) continue;
    sum += v * c.weight;
    w += c.weight;
  }
  return w === 0 ? 0 : promptClamp(sum / w);
}

export function promptStars(score) {
  return Math.round((promptClamp(score) / 100) * 10) / 2;
}

export function promptBand(score) {
  const s = promptClamp(score);
  if (s >= 85) return { key: 'great', tone: 'ok' };
  if (s >= 70) return { key: 'good',  tone: 'ok' };
  if (s >= 55) return { key: 'fair',  tone: 'warn' };
  if (s >= 40) return { key: 'weak',  tone: 'warn' };
  return                 { key: 'poor',  tone: 'critical' };
}

/* Sorunları önem sırasına koy (Video Health ile aynı imza). */
export function promptSortIssues(issues) {
  return [...(issues || [])].sort((a, b) => {
    const r = (PROMPT_SEVERITIES[b.severity]?.rank || 0) -
              (PROMPT_SEVERITIES[a.severity]?.rank || 0);
    if (r) return r;
    return (b.gain || 0) - (a.gain || 0);
  });
}
