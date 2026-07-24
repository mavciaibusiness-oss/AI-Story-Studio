import {
  HEALTH, CATEGORY_KEYS, clampScore, overallScore, starsOf,
  emptyReport, sortIssues
} from './model';
import { buildTimeline as buildSharedTimeline, wordCount } from '@/lib/timeline';

/*
  KURAL TABANLI ANALİZ.

  Storyboard'dan ölçülebilen her şeyi AI'siz hesaplar. Deterministiktir:
  aynı girdi her zaman aynı raporu verir. Kredi harcamaz, çevrimdışı
  çalışır, saniyeler değil milisaniyeler sürer.

  AI katmanı (narrate.js) bunun ÜSTÜNE biner: kurallar "sahne 7 çok uzun"
  der, AI "çünkü burada üç ayrı olay anlatılıyor, ikiye bölünmeli" der.
  Kurallar ölçer, AI yorumlar. Bu ayrım Product Bible'ın "AI agnostic"
  ilkesini korur — sağlayıcı düşse bile temel analiz çalışmaya devam eder.

  Sahne süresi ve genel timeline HESABI ARTIK BURADA YAPILMAZ.
  lib/timeline.js ortak motoruna delege edilir; hem sağlık raporu
  hem Timeline Preview aynı sayıları paylaşır (TASK-02, "tek gerçek kaynak").
*/

/* ---------- Yardımcılar ----------
   wordCount ve süre hesabı artık lib/timeline'dan geliyor.
   Aşağıdaki yerel yardımcı sadece kelime kümesi benzerliği için. */

/* İki metnin kelime kümesi benzerliği (Jaccard).
   Görsel tekrarı tespitinde prompt'lar üzerinde çalışır. */
function similarity(a, b) {
  const norm = (t) => new Set(
    String(t || '').toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/).filter(w => w.length > 3)
  );
  const A = norm(a), B = norm(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

function mkIssue(o) {
  return {
    id: o.category + ':' + (o.scene ?? 0) + ':' + o.code,
    scene: o.scene ?? null,
    at: o.at ?? null,
    severity: o.severity,
    category: o.category,
    code: o.code,
    title: o.title,
    detail: o.detail,
    recommendation: o.recommendation,
    gain: o.gain || 0
  };
}

/* ---------- Sahne zaman çizelgesi (kısa adaptör) ----------
   Ortak motor ile sağlık motorunun beklediği alan biçimi arasında
   ince bir sözleşme farkı var; adaptör aradaki köprüyü kurar. */

function buildHealthTimeline(sb) {
  const out = buildSharedTimeline(sb);
  return {
    timeline: out.scenes.map(s => ({
      scene: s.scene, at: s.at, end: s.end, dur: s.dur,
      words: s.words, media: s.media, hasMedia: s.hasMedia,
      estimated: s.estimated
    })),
    total: out.total,
    estimated: out.estimated
  };
}

/* ---------- Kategori analizleri ----------
   Her biri { score, issues, stats } döner. Puan 100'den başlar,
   tespit edilen her sorun kadar düşer. Ceza kadar açıklama da
   üretilir; TASK-01'in "never only assign scores" kuralı. */

function analyzeHook(tl, scenes) {
  const issues = [];
  let score = 100;
  if (!tl.length) return { score: 0, issues, stats: {} };

  const first = tl[0];
  const s0 = scenes[0] || {};
  const openText = String(s0.voiceText || s0.paragraph || '');

  // Açılış sahnesi çok uzunsa izleyici ilk 5 saniyede karar veremez
  if (first.dur > HEALTH.HOOK_WINDOW * 2) {
    score -= 22;
    issues.push(mkIssue({
      category: 'hook', scene: 1, at: 0, code: 'hook-long', severity: 'warn',
      title: 'Açılış sahnesi uzun',
      detail: 'İlk sahne ' + first.dur.toFixed(1) + ' saniye. İzleyici ilk 5 saniyede kalıp kalmayacağına karar verir.',
      recommendation: 'Açılışı ikiye böl ya da ilk cümleyi kısalt.',
      gain: 9
    }));
  }

  // Açılışta görsel yoksa hook ölçülemez
  if (!first.hasMedia) {
    score -= 18;
    issues.push(mkIssue({
      category: 'hook', scene: 1, at: 0, code: 'hook-nomedia', severity: 'warn',
      title: 'Açılışta görsel yok',
      detail: 'İlk sahnenin görseli atanmamış.',
      recommendation: 'İlk sahneye en güçlü görseli koy.',
      gain: 10
    }));
  }

  // Soru, çarpıcı ifade ya da doğrudan hitap açılışı güçlendirir
  const hasQuestion = /[?？]/.test(openText.slice(0, 160));
  const hasNumber = /\d/.test(openText.slice(0, 160));
  if (openText && !hasQuestion && !hasNumber && wordCount(openText) > 40) {
    score -= 12;
    issues.push(mkIssue({
      category: 'hook', scene: 1, at: 0, code: 'hook-flat', severity: 'tip',
      title: 'Açılış merak uyandırmıyor',
      detail: 'İlk paragraf uzun ve düz bir anlatımla başlıyor; soru, sayı ya da çarpıcı bir iddia içermiyor.',
      recommendation: 'İlk cümleyi bir soruyla ya da somut bir iddiayla değiştir.',
      gain: 8
    }));
  }

  if (!openText) {
    score -= 30;
    issues.push(mkIssue({
      category: 'hook', scene: 1, at: 0, code: 'hook-empty', severity: 'critical',
      title: 'Açılış metni boş',
      detail: 'İlk sahnenin metni yok.',
      recommendation: 'Açılış cümlesini yaz.',
      gain: 14
    }));
  }

  return { score: clampScore(score), issues, stats: { openWords: wordCount(openText), firstDur: first.dur } };
}

function analyzePacing(tl) {
  const issues = [];
  let score = 100;
  if (!tl.length) return { score: 0, issues, stats: {} };

  const durs = tl.map(x => x.dur);
  const avg = durs.reduce((a, b) => a + b, 0) / durs.length;
  const variance = durs.reduce((a, d) => a + (d - avg) ** 2, 0) / durs.length;
  const sd = Math.sqrt(variance);

  for (const s of tl) {
    if (s.dur > HEALTH.SCENE_MAX) {
      score -= 10;
      issues.push(mkIssue({
        category: 'pacing', scene: s.scene, at: s.at, code: 'scene-long', severity: 'warn',
        title: 'Sahne ' + s.scene + ' çok uzun',
        detail: s.dur.toFixed(1) + ' saniye. Tek görselde bu süre dikkat kaybettirir.',
        recommendation: 'Sahneyi ikiye böl, ikinci yarıya yeni bir görsel ver.',
        gain: 6
      }));
    } else if (s.dur > 0 && s.dur < HEALTH.SCENE_MIN) {
      score -= 6;
      issues.push(mkIssue({
        category: 'pacing', scene: s.scene, at: s.at, code: 'scene-short', severity: 'tip',
        title: 'Sahne ' + s.scene + ' çok kısa',
        detail: s.dur.toFixed(1) + ' saniye. İzleyici görseli algılayamadan geçiyor.',
        recommendation: 'Bir sonraki sahneyle birleştir ya da metni uzat.',
        gain: 4
      }));
    }
  }

  // Ritim tekdüzeliği: tüm sahneler aynı uzunluktaysa video monotonlaşır
  if (tl.length >= 5 && sd < 0.8 && avg > 2) {
    score -= 8;
    issues.push(mkIssue({
      category: 'pacing', scene: null, at: null, code: 'pace-flat', severity: 'tip',
      title: 'Ritim tekdüze',
      detail: 'Sahne süreleri birbirine çok yakın (sapma ' + sd.toFixed(1) + ' sn). Video monoton ilerliyor.',
      recommendation: 'Vurgulu anlarda kısa sahneler kullan, dinlenme anlarında uzat.',
      gain: 5
    }));
  }

  return {
    score: clampScore(score), issues,
    stats: { avgScene: +avg.toFixed(2), sdScene: +sd.toFixed(2) }
  };
}

function analyzeVisual(tl, scenes) {
  const issues = [];
  let score = 100;
  if (!tl.length) return { score: 0, issues, stats: {} };

  const missing = tl.filter(s => !s.hasMedia);
  if (missing.length) {
    score -= Math.min(40, missing.length * 8);
    issues.push(mkIssue({
      category: 'visual', scene: missing[0].scene, at: missing[0].at,
      code: 'visual-missing', severity: missing.length > tl.length / 2 ? 'critical' : 'warn',
      title: missing.length + ' sahnede görsel yok',
      detail: 'Görseli olmayan sahneler: ' + missing.map(s => s.scene).join(', ') + '.',
      recommendation: 'Eksik sahnelere görsel üret ya da yükle.',
      gain: Math.min(18, missing.length * 4)
    }));
  }

  // Prompt tekrarı: ardışık sahnelerde aynı görsel tarifi
  let repeats = 0;
  for (let i = 1; i < scenes.length; i++) {
    const a = scenes[i - 1].imagePrompt || scenes[i - 1].paragraph;
    const b = scenes[i].imagePrompt || scenes[i].paragraph;
    const sim = similarity(a, b);
    if (sim >= HEALTH.REPEAT_SIM) {
      repeats++;
      score -= 7;
      issues.push(mkIssue({
        category: 'visual', scene: i + 1, at: tl[i]?.at ?? null,
        code: 'visual-repeat', severity: 'warn',
        title: 'Sahne ' + (i + 1) + ' görseli tekrar ediyor',
        detail: 'Bir önceki sahneyle benzerlik %' + Math.round(sim * 100) + '. İzleyici aynı kareyi görüyor hissine kapılır.',
        recommendation: 'Kamera açısını, mekânı ya da ışığı değiştiren yeni bir prompt yaz.',
        gain: 4
      }));
    }
  }

  // Uzun süre aynı medya tipi
  let run = 1;
  for (let i = 1; i < tl.length; i++) {
    if (tl[i].media === tl[i - 1].media) run++;
    else run = 1;
    if (run === HEALTH.LONG_RUN + 1 && tl.length > HEALTH.LONG_RUN + 1) {
      score -= 5;
      issues.push(mkIssue({
        category: 'visual', scene: tl[i].scene, at: tl[i].at,
        code: 'visual-monotype', severity: 'info',
        title: 'Aynı medya tipi arka arkaya',
        detail: (HEALTH.LONG_RUN + 1) + ' sahnedir kesintisiz ' + (tl[i].media === 'video' ? 'video' : 'durağan görsel') + ' kullanılıyor.',
        recommendation: 'Araya farklı bir medya tipi ekleyerek görsel ritmi kır.',
        gain: 3
      }));
      run = 1;
    }
  }

  const staticRatio = tl.filter(s => s.media === 'image').length / tl.length;
  return {
    score: clampScore(score), issues,
    stats: { missing: missing.length, repeats, staticRatio: +staticRatio.toFixed(2) }
  };
}

function analyzeVoice(tl, scenes) {
  const issues = [];
  let score = 100;
  if (!tl.length) return { score: 0, issues, stats: {} };

  const withVoice = scenes.filter(s => s.voice).length;
  const coverage = withVoice / scenes.length;

  if (coverage === 0) {
    // Ses hiç yoksa ceza verme; ölçülemeyen kategori olarak işaretle
    return { score: null, issues, stats: { coverage: 0 } };
  }

  if (coverage < 1) {
    score -= Math.round((1 - coverage) * 45);
    issues.push(mkIssue({
      category: 'voice', scene: null, at: null, code: 'voice-partial', severity: 'warn',
      title: 'Seslendirme eksik',
      detail: scenes.length + ' sahneden ' + withVoice + ' tanesinde ses var.',
      recommendation: 'Kalan sahnelerin seslendirmesini yükle.',
      gain: 10
    }));
  }

  // Konuşma hızı: kelime/dakika
  let slow = 0, fast = 0;
  for (const s of tl) {
    if (!s.dur || !s.words || s.estimated) continue;
    const wpm = (s.words / s.dur) * 60;
    if (wpm < HEALTH.WPM_SLOW) {
      slow++;
      score -= 5;
      issues.push(mkIssue({
        category: 'voice', scene: s.scene, at: s.at, code: 'voice-slow', severity: 'tip',
        title: 'Sahne ' + s.scene + ' anlatımı yavaş',
        detail: 'Yaklaşık ' + Math.round(wpm) + ' kelime/dakika. Rahat anlatım 120-170 aralığındadır.',
        recommendation: 'Sesi %10 hızlandır ya da sahne süresini kısalt.',
        gain: 4
      }));
    } else if (wpm > HEALTH.WPM_FAST) {
      fast++;
      score -= 5;
      issues.push(mkIssue({
        category: 'voice', scene: s.scene, at: s.at, code: 'voice-fast', severity: 'tip',
        title: 'Sahne ' + s.scene + ' anlatımı hızlı',
        detail: 'Yaklaşık ' + Math.round(wpm) + ' kelime/dakika. İzleyici takip etmekte zorlanabilir.',
        recommendation: 'Metni kısalt ya da sahneyi uzat.',
        gain: 4
      }));
    }
  }

  return { score: clampScore(score), issues, stats: { coverage: +coverage.toFixed(2), slow, fast } };
}

function analyzeStory(tl, scenes, sb) {
  const issues = [];
  let score = 100;

  if (scenes.length < HEALTH.MIN_SCENES) {
    score -= 25;
    issues.push(mkIssue({
      category: 'story', scene: null, at: null, code: 'story-thin', severity: 'warn',
      title: 'Sahne sayısı az',
      detail: 'Toplam ' + scenes.length + ' sahne. Kurulum, gelişme ve sonuç için en az 3 sahne gerekir.',
      recommendation: 'Hikâyeyi kurulum, gelişme ve kapanış olacak şekilde genişlet.',
      gain: 12
    }));
  }

  const empty = scenes.map((s, i) => ({ i: i + 1, t: String(s.paragraph || '').trim() }))
    .filter(x => !x.t);
  if (empty.length) {
    score -= Math.min(35, empty.length * 9);
    issues.push(mkIssue({
      category: 'story', scene: empty[0].i, at: tl[empty[0].i - 1]?.at ?? null,
      code: 'story-empty', severity: 'critical',
      title: empty.length + ' sahnenin metni boş',
      detail: 'Boş sahneler: ' + empty.map(x => x.i).join(', ') + '.',
      recommendation: 'Bu sahnelerin metnini yaz ya da sahneleri kaldır.',
      gain: 14
    }));
  }

  // Kapanış: son sahne çok kısaysa hikâye yarıda kesilmiş hissi verir
  const last = tl[tl.length - 1];
  if (last && last.dur > 0 && last.dur < HEALTH.SCENE_IDEAL_LOW) {
    score -= 10;
    issues.push(mkIssue({
      category: 'story', scene: last.scene, at: last.at, code: 'story-abrupt', severity: 'tip',
      title: 'Kapanış ani',
      detail: 'Son sahne yalnızca ' + last.dur.toFixed(1) + ' saniye.',
      recommendation: 'Kapanışa bir sonuç cümlesi ya da çağrı ekle.',
      gain: 6
    }));
  }

  if (!String(sb?.title || '').trim()) {
    score -= 6;
    issues.push(mkIssue({
      category: 'story', scene: null, at: null, code: 'story-notitle', severity: 'info',
      title: 'Başlık yok',
      detail: 'Projeye başlık verilmemiş.',
      recommendation: 'Yayın adımında başlık üret.',
      gain: 3
    }));
  }

  return { score: clampScore(score), issues, stats: { scenes: scenes.length, empty: empty.length } };
}

function analyzeEmotion(scenes) {
  const issues = [];
  let score = 100;
  const texts = scenes.map(s => String(s.voiceText || s.paragraph || ''));
  const joined = texts.join(' ');

  if (!joined.trim()) return { score: null, issues, stats: {} };

  // Duygusal çeşitlilik göstergeleri: noktalama ve cümle uzunluğu değişimi
  const exclam = (joined.match(/[!！]/g) || []).length;
  const quest = (joined.match(/[?？]/g) || []).length;
  const sentences = joined.split(/[.!?…]+/).map(s => s.trim()).filter(Boolean);
  const lens = sentences.map(s => wordCount(s));
  const avgLen = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const sd = lens.length
    ? Math.sqrt(lens.reduce((a, l) => a + (l - avgLen) ** 2, 0) / lens.length) : 0;

  if (sentences.length > 6 && sd < 3) {
    score -= 12;
    issues.push(mkIssue({
      category: 'emotion', scene: null, at: null, code: 'emo-monotone', severity: 'tip',
      title: 'Cümle ritmi tekdüze',
      detail: 'Cümle uzunlukları birbirine çok yakın. Anlatım düz bir tonda ilerliyor.',
      recommendation: 'Vurgulu anlarda kısa cümleler kullan, betimlemede uzat.',
      gain: 6
    }));
  }

  if (exclam === 0 && quest === 0 && sentences.length > 8) {
    score -= 10;
    issues.push(mkIssue({
      category: 'emotion', scene: null, at: null, code: 'emo-flat', severity: 'info',
      title: 'Duygusal iniş çıkış zayıf',
      detail: 'Metinde hiç soru ya da vurgu işareti yok.',
      recommendation: 'Dönüm noktalarına soru ya da vurgu ekleyerek gerilim yarat.',
      gain: 5
    }));
  }

  return { score: clampScore(score), issues, stats: { sentences: sentences.length, sdLen: +sd.toFixed(1) } };
}

function analyzeRetention(tl, cats) {
  const issues = [];
  let score = 100;
  if (!tl.length) return { score: 0, issues, stats: {} };

  const total = tl[tl.length - 1].end;

  // Uzun sahneler birikimli olarak kayıp riskini büyütür
  const longOnes = tl.filter(s => s.dur > HEALTH.SCENE_MAX);
  score -= Math.min(30, longOnes.length * 8);

  // Açılış zayıfsa tutundurma doğrudan etkilenir
  if (Number.isFinite(cats.hook?.score) && cats.hook.score < 60) {
    score -= 15;
    issues.push(mkIssue({
      category: 'retention', scene: 1, at: 0, code: 'ret-hook', severity: 'critical',
      title: 'Zayıf açılış izlenmeyi düşürüyor',
      detail: 'Açılış puanı ' + cats.hook.score + '. İzleyicilerin çoğu ilk 15 saniyede ayrılır.',
      recommendation: 'İlk sahneyi yeniden yaz ve en güçlü görseli başa al.',
      gain: 11
    }));
  }

  // Çok uzun toplam süre, zayıf ritimle birleşince risk
  if (total > 600 && (cats.pacing?.score ?? 100) < 70) {
    score -= 10;
    issues.push(mkIssue({
      category: 'retention', scene: null, at: null, code: 'ret-long', severity: 'warn',
      title: 'Video uzun ve ritim zayıf',
      detail: 'Toplam süre ' + Math.round(total / 60) + ' dakika, ritim puanı ' + cats.pacing.score + '.',
      recommendation: 'Zayıf sahneleri çıkararak süreyi kısalt.',
      gain: 8
    }));
  }

  // Belirgin düşüş noktası: en uzun sahne
  if (longOnes.length) {
    const worst = longOnes.reduce((a, b) => (b.dur > a.dur ? b : a));
    issues.push(mkIssue({
      category: 'retention', scene: worst.scene, at: worst.at, code: 'ret-drop', severity: 'warn',
      title: 'Olası düşüş noktası: sahne ' + worst.scene,
      detail: worst.dur.toFixed(1) + ' saniyelik tek kare. İzleyici burada sekme değiştirir.',
      recommendation: 'Sahneyi böl ya da araya yeni bir görsel koy.',
      gain: 7
    }));
  }

  return { score: clampScore(score), issues, stats: { total: +total.toFixed(1), longScenes: longOnes.length } };
}

/* ---------- Zaman çizelgesi notları ---------- */

function timelineNotes(tl, issues) {
  const byScene = {};
  for (const i of issues) {
    if (!i.scene) continue;
    (byScene[i.scene] = byScene[i.scene] || []).push(i);
  }
  return tl.map(s => {
    const list = byScene[s.scene] || [];
    const worst = list.reduce((a, b) => {
      const rank = { info: 0, tip: 1, warn: 2, critical: 3 };
      return rank[b.severity] > rank[a?.severity ?? ''] ? b : a;
    }, null);
    // 5 yıldız temiz sahne; her sorun seviyesi bir kademe düşürür
    const drop = { info: 1, tip: 1, warn: 2, critical: 3 };
    const rating = worst ? Math.max(1, 5 - (drop[worst.severity] || 1) - (list.length - 1)) : 5;
    return {
      scene: s.scene, at: s.at, end: s.end, dur: s.dur,
      rating: Math.max(1, Math.min(5, rating)),
      note: worst ? worst.title : 'Sorun görünmüyor',
      issues: list.length
    };
  });
}

/* ---------- Ana giriş ---------- */

export function analyzeStoryboard(sb) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  const base = emptyReport({ createdAt: new Date().toISOString(), source: 'rules' });

  if (!scenes.length) {
    base.summary = 'Analiz için sahne yok. Önce senaryoyu sahnelere böl.';
    return base;
  }

  const { timeline: tl, total, estimated } = buildHealthTimeline(sb);

  const cats = {};
  cats.hook = analyzeHook(tl, scenes);
  cats.pacing = analyzePacing(tl);
  cats.visual = analyzeVisual(tl, scenes);
  cats.voice = analyzeVoice(tl, scenes);
  cats.story = analyzeStory(tl, scenes, sb);
  cats.emotion = analyzeEmotion(scenes);
  cats.retention = analyzeRetention(tl, cats);

  const scores = {};
  for (const k of CATEGORY_KEYS) {
    const v = cats[k]?.score;
    if (Number.isFinite(v)) scores[k] = v;
  }

  const issues = sortIssues(Object.values(cats).flatMap(c => c.issues || []));
  const overall = overallScore(scores);

  return {
    ...base,
    overall,
    stars: starsOf(overall),
    scores,
    issues,
    timeline: timelineNotes(tl, issues),
    stats: {
      scenes: scenes.length,
      totalDur: total,
      estimated,
      ...Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, v.stats || {}]))
    }
  };
}
