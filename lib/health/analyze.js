import {
  HEALTH, CATEGORY_KEYS, clampScore, overallScore, starsOf,
  emptyReport, sortIssues, measurementCoverage
} from './model';
import { buildTimeline as buildSharedTimeline, wordCount } from '@/lib/timeline';
import { EMOTION_TERMS, countTermHits } from '@/lib/prompt/vocab';
import {
  DECISION_TERMS, LEARNING_TERMS, CHANGE_TERMS,
  CONFLICT_TERMS, RESOLUTION_TERMS,
  LOCATION_TERMS, ATMOSPHERE_TERMS, OBJECT_TERMS,
  SENSORY_TERMS, DOMAIN_TERMS, STORY,
  POSITIVE_EMOTIONS, NEGATIVE_EMOTIONS, TENSION_EMOTIONS,
  NARRATIVE_PHASES, genreFamily, RETENTION
} from './vocab';

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

function analyzeStory(tl, scenes, sb, structure) {
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

  /* ---- Dramatik yapı bulguları (TASK-05, Adım 2) ----
     Yapı ölçülemiyorsa (3 sahneden az) bu blok atlanır; mevcut
     kontroller yine çalışır. */
  if (structure?.measurable) {
    const f = structure.findings || [];

    if (f.includes('no-conflict')) {
      score -= 28;
      issues.push(mkIssue({
        category: 'story', scene: null, at: null, code: 'story-noconflict', severity: 'warn',
        title: 'Hikâyede çatışma yok',
        detail: 'Hiçbir sahnede engel, sorun ya da beklenmedik bir dönüş bulunmuyor. Olaylar dizilmiş ama gerilim kurulmamış.',
        recommendation: 'Karakterin önüne bir engel koy: bir sorun, bir tehdit ya da beklenmedik bir dönüş.',
        gain: 13
      }));
    }

    if (f.includes('no-resolution')) {
      score -= 20;
      issues.push(mkIssue({
        category: 'story', scene: scenes.length, at: null, code: 'story-unresolved', severity: 'warn',
        title: 'Çatışma çözülmüyor',
        detail: 'Hikâyede çatışma var ama kapanışta çözüldüğüne dair bir işaret yok. İzleyici tamamlanmamış hissiyle ayrılır.',
        recommendation: 'Kapanışa çatışmanın nasıl sonuçlandığını gösteren bir an ekle.',
        gain: 10
      }));
    }

    if (f.includes('early-climax')) {
      score -= 15;
      issues.push(mkIssue({
        category: 'story', scene: structure.climax?.scene ?? null, at: null,
        code: 'story-earlyclimax', severity: 'tip',
        title: 'Doruk noktası çok erken',
        detail: 'En gergin an sahne ' + structure.climax?.scene +
          ' (hikâyenin %' + Math.round((structure.climax?.pos || 0) * 100) +
          ' noktası). Sonrası düşüşle geçiyor.',
        recommendation: 'Gerilimi kademeli yükselt; en yüksek anı sona doğru taşı.',
        gain: 8
      }));
    }

    if (f.includes('late-climax')) {
      score -= 10;
      issues.push(mkIssue({
        category: 'story', scene: structure.climax?.scene ?? null, at: null,
        code: 'story-lateclimax', severity: 'tip',
        title: 'Doruk noktası sona dayanmış',
        detail: 'En gergin an son sahnede. Çözüm için yer kalmamış.',
        recommendation: 'Doruktan sonra kısa bir kapanış sahnesi ekle.',
        gain: 6
      }));
    }

    if (f.includes('missing-resolution-phase') && !f.includes('no-conflict')) {
      score -= 8;
      issues.push(mkIssue({
        category: 'story', scene: null, at: null, code: 'story-nophase', severity: 'info',
        title: 'Çözüm evresi belirsiz',
        detail: 'Son sahneler çözüm izlenimi vermiyor.',
        recommendation: 'Kapanışta durumun nasıl değiştiğini özetle.',
        gain: 4
      }));
    }
  }

  return {
    score: clampScore(score), issues,
    stats: {
      scenes: scenes.length, empty: empty.length,
      structure: structure?.measurable ? {
        climax: structure.climax,
        findings: structure.findings,
        ...(structure.stats || {})
      } : { measurable: false }
    }
  };
}

function analyzeEmotion(scenes, curve) {
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

  /*
    DÜZYAZI RİTMİ — duygu değil, biçem notu.

    Bu iki kontrol (cümle uzunluğu sapması, noktalama varlığı) duyguyu
    ÖLÇMEZ; düzyazı ritmini ölçer. Adım 2'ye kadar duygu kategorisinin
    tek dayanağı bunlardı — vekil ölçü, çünkü gerçek duygu ölçümü yoktu.

    Artık sahne bazlı duygu eğrisi var (aşağıda). Vekil ölçüyü aynı
    ağırlıkta tutmak yanlış sonuç veriyordu: duygu eğrisi ders kitabı
    gibi olan bir hikâye, içinde soru işareti bulunmadığı için
    cezalanıyor ve çözümsüz bir hikâyeden düşük puan alabiliyordu.
    Kalibrasyonda tam bunu gördüm.

    Karar: ritim notları KALIYOR (yazara faydalı) ama:
      - ceza küçültüldü (12→4, 10→0)
      - emo-flat bilgi düzeyine indi ve puan düşürmüyor
      - başlığı düzeltildi: "duygusal iniş çıkış" değil, "noktalama"
    Duygu puanını artık eğri belirliyor.
  */
  if (sentences.length > 6 && sd < 3) {
    score -= 4;
    issues.push(mkIssue({
      category: 'emotion', scene: null, at: null, code: 'emo-monotone', severity: 'info',
      title: 'Cümle ritmi tekdüze',
      detail: 'Cümle uzunlukları birbirine çok yakın. Anlatım düz bir tonda okunuyor.',
      recommendation: 'Vurgulu anlarda kısa cümleler kullan, betimlemede uzat.',
      gain: 3
    }));
  }

  if (exclam === 0 && quest === 0 && sentences.length > 8) {
    /* Puan düşürmüyor: soru/ünlem işareti yokluğu bir üslup tercihi.
       Sakin anlatım kusur değil. Yalnızca bilgi olarak veriyoruz. */
    issues.push(mkIssue({
      category: 'emotion', scene: null, at: null, code: 'emo-nopunct', severity: 'info',
      title: 'Vurgu işareti yok',
      detail: 'Metinde hiç soru ya da ünlem işareti yok. Sakin bir anlatım tercihi olabilir.',
      recommendation: 'Dönüm noktalarında soru ya da vurgu kullanmak gerilimi artırır.',
      gain: 0
    }));
  }

  /* ---- Duygu eğrisi (TASK-05, Adım 2) ----
     Cümle ritmi ölçümü yukarıda; burada sahne bazlı duygu YÖNÜ. */
  const range = curveRange(curve || []);
  const withEmotion = (curve || []).filter(c => c.positive + c.negative + c.tension > 0);

  if (withEmotion.length === 0) {
    /* Yukarıdaki emo-flat zaten noktalama üzerinden uyarıyor;
       burada sözcük düzeyinde teyit ediyoruz, ceza tekrarlanmıyor. */
  } else if (range !== null && range < STORY.CURVE_FLAT_RANGE) {
    score -= 22;
    issues.push(mkIssue({
      category: 'emotion', scene: null, at: null, code: 'emo-nocurve', severity: 'warn',
      title: 'Duygu eğrisi düz',
      detail: 'Sahneler arasında duygu yönü neredeyse hiç değişmiyor (genlik ' +
        range.toFixed(2) + '). Hikâye aynı tonda ilerliyor.',
      recommendation: 'Bir sahnede gerilimi yükselt, sonrasında rahatlama ver. İniş çıkış izleyiciyi tutar.',
      gain: 10
    }));
  }

  /* Tek yönlü eğri: hepsi karanlık ya da hepsi aydınlık.
     İkisi de yorucudur ama sebepleri farklı, ayrı uyarı veriyoruz. */
  if (withEmotion.length >= 3) {
    const allDown = withEmotion.every(c => c.valence < 0);
    const allUp = withEmotion.every(c => c.valence > 0);

    if (allDown) {
      score -= 12;
      issues.push(mkIssue({
        category: 'emotion', scene: null, at: null, code: 'emo-relentless', severity: 'tip',
        title: 'Hikâye baştan sona karanlık',
        detail: 'Duygu taşıyan her sahne olumsuz yönde. Rahatlama anı olmayınca izleyici tükenir.',
        recommendation: 'Araya kısa bir umut ya da rahatlama anı serpiştir.',
        gain: 6
      }));
    } else if (allUp) {
      score -= 12;
      issues.push(mkIssue({
        category: 'emotion', scene: null, at: null, code: 'emo-nostakes', severity: 'tip',
        title: 'Hikâyede risk hissi yok',
        detail: 'Duygu taşıyan her sahne olumlu yönde. Kaybedilecek bir şey olmayınca gerilim kurulmaz.',
        recommendation: 'Bir sahnede işlerin ters gitmesine izin ver.',
        gain: 6
      }));
    }
  }

  return {
    score: clampScore(score), issues,
    stats: {
      sentences: sentences.length, sdLen: +sd.toFixed(1),
      curveRange: range,
      scenesWithEmotion: withEmotion.length
    }
  };
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

/*
  Karakter arkı ölçülebilir mi?

  NEDEN YALNIZCA KELİME SAYISI YETMEZ:
    Kelime sayısı dile bağlı bir vekil ölçüdür. Türkçe sondan eklemeli;
    aynı anlatı Türkçe'de ~40, İngilizce'de ~60 kelime tutar. Tek bir
    kelime eşiği ya Türkçe'de erken kapanır ya İngilizce'de gürültü üretir.

  DAHA SAĞLAM SİNYAL: sahne sayısı.
    Bir ark en az üç vuruş ister (başlangıç, dönüş, bitiş). Bu uygulamada
    vuruşlar sahnelere karşılık gelir. Yazar hikâyeyi üç ya da daha çok
    sahneye bölmüşse vuruşları kendisi ayırmış demektir — o zaman daha
    az metinle de ark taranabilir.

  Karar: uzun metin TEK BAŞINA yeterli, ya da yapı varsa daha az metin yeter.
*/
function isArcMeasurable(words, sceneCount) {
  if (words >= STORY.ARC_MIN_WORDS) return true;
  return sceneCount >= STORY.ARC_MIN_SCENES && words >= STORY.ARC_MIN_WORDS_STRUCTURED;
}

/* ---------- Karakter gelişimi (TASK-05) ----------

   Spec dört gösterge sayıyor: öğrenme, davranış değişimi, karar verme,
   duygu gösterme. Motor bunları metinde arar.

   Neden konum önemli: karakter gelişimi hikâyenin SONUNA doğru
   yoğunlaşmalı. Bütün kavrayış ilk paragrafta olursa yolculuk yok
   demektir. Bu yüzden hikâyeyi üçe bölüp son üçte biri ayrıca ölçüyoruz.

   Ölçülemezlik: metin çok kısaysa (ARC_MIN_WORDS altı) karakter arkı
   aramak anlamsız — kategori puanlanmaz, ağırlıktan düşülür. */
function analyzeCharacter(scenes, sb) {
  const issues = [];
  let score = 100;

  const texts = scenes.map(s => String(s.voiceText || s.paragraph || ''));
  const joined = texts.join(' ');
  const words = wordCount(joined);

  if (!isArcMeasurable(words, scenes.length)) {
    /*
      Ölçülemez ama SESSİZ DEĞİL.

      TASK-01'de ölçülemeyen kategori ağırlıktan düşülür ve hiçbir şey
      söylenmez — ses için doğru: seslendirme yokluğu var olanın kalite
      kusuru değil, sonra eklenebilir.

      Karakter arkı farklı. "Ark kuracak kadar uzun değil" anlatı
      açısından bir BULGUDUR. Sessizce atlarsak 30 kelimelik bir hikâye,
      ölçülüp iyi puan alan uzun bir hikâyeden daha yüksek genel puan
      alır — sıralama tersine döner.

      Karar: PUAN DÜŞÜRME (kısa form bilinçli bir seçim olabilir), ama
      kullanıcıya neden ölçülmediğini söyle. Böylece hem kısa videolar
      haksızca cezalandırılmaz hem de puanın neyi kapsamadığı görünür.
    */
    issues.push(mkIssue({
      category: 'character', scene: null, at: null,
      code: 'char-tooshort', severity: 'info',
      title: 'Karakter gelişimi ölçülemedi',
      detail: 'Hikâye ' + words + ' kelime. Karakter arkı için en az ' +
        STORY.ARC_MIN_WORDS + ' kelime ya da ' + STORY.ARC_MIN_SCENES +
        ' sahne gerekiyor. Bu puan karakter gelişimini kapsamıyor.',
      recommendation: 'Kısa form videoda bu normaldir. Daha uzun bir anlatı planlıyorsan hikâyeyi genişlet.',
      gain: 0
    }));
    return { score: null, issues, stats: { words, measurable: false } };
  }

  const decisions = countTermHits(joined, DECISION_TERMS);
  const learning  = countTermHits(joined, LEARNING_TERMS);
  const changes   = countTermHits(joined, CHANGE_TERMS);
  const emotions  = countTermHits(joined, EMOTION_TERMS);

  const signals = decisions.count + learning.count + changes.count;
  const per100 = (signals / words) * 100;

  /* Hiç gelişim sinyali yok: karakter olayları yaşıyor ama değişmiyor. */
  if (signals === 0) {
    score -= 42;
    issues.push(mkIssue({
      category: 'character', scene: null, at: null, code: 'char-static', severity: 'warn',
      title: 'Karakter gelişmiyor',
      detail: 'Metinde karar verme, öğrenme ya da değişim işareti bulunmuyor. Karakter olayları yaşıyor ama aynı kalıyor.',
      recommendation: 'Karakterin bir karar aldığı ya da bir şey anladığı bir an ekle.',
      gain: 13
    }));
  } else if (signals < STORY.CHAR_MIN_SIGNALS || per100 < STORY.CHAR_SIGNAL_PER_100) {
    score -= 18;
    issues.push(mkIssue({
      category: 'character', scene: null, at: null, code: 'char-thin', severity: 'tip',
      title: 'Karakter gelişimi zayıf',
      detail: 'Yalnızca ' + signals + ' gelişim işareti var. Hikâye uzunluğuna göre az.',
      recommendation: 'Karakterin neden öyle davrandığını gösteren bir an daha ekle.',
      gain: 7
    }));
  }

  /* Karar yok ama olay var: edilgen karakter.
     Ayrı uyarı çünkü çözümü farklı — karakterin seçim yapması gerek. */
  if (signals > 0 && decisions.count === 0) {
    score -= 14;
    issues.push(mkIssue({
      category: 'character', scene: null, at: null, code: 'char-passive', severity: 'tip',
      title: 'Karakter edilgen',
      detail: 'Karakter olaylara tepki veriyor ama kendi kararını verdiği bir an yok.',
      recommendation: 'Karakterin iki yol arasında seçim yaptığı bir sahne ekle.',
      gain: 8
    }));
  }

  /* Duygu göstermiyor: okur bağ kuramaz. */
  if (emotions.count === 0) {
    score -= 16;
    issues.push(mkIssue({
      category: 'character', scene: null, at: null, code: 'char-noemotion', severity: 'tip',
      title: 'Karakterin duygusu görünmüyor',
      detail: 'Metinde karakterin ne hissettiğini gösteren bir ifade yok.',
      recommendation: 'Dönüm noktalarında karakterin hissini bir cümleyle ver.',
      gain: 7
    }));
  }

  /* Arkın konumu: gelişim son üçte birde yoğunlaşmalı. */
  if (signals >= STORY.CHAR_MIN_SIGNALS && scenes.length >= 3) {
    const third = Math.max(1, Math.floor(scenes.length / 3));
    const lastThird = texts.slice(-third).join(' ');
    const lateSignals =
      countTermHits(lastThird, DECISION_TERMS).count +
      countTermHits(lastThird, LEARNING_TERMS).count +
      countTermHits(lastThird, CHANGE_TERMS).count;

    if (lateSignals === 0) {
      score -= 12;
      issues.push(mkIssue({
        category: 'character', scene: scenes.length, at: null,
        code: 'char-earlyarc', severity: 'tip',
        title: 'Gelişim erken bitiyor',
        detail: 'Karakter gelişimi hikâyenin son bölümünde durmuş. Kapanışta bir kavrayış ya da karar yok.',
        recommendation: 'Son sahnelere karakterin değiştiğini gösteren bir an ekle.',
        gain: 6
      }));
    }
  }

  return {
    score: clampScore(score), issues,
    stats: {
      words, signals, per100: +per100.toFixed(2),
      decisions: decisions.count, learning: learning.count,
      changes: changes.count, emotions: emotions.count
    }
  };
}

/* ---------- Dünya kurma (TASK-05) ----------

   Spec altı eksen sayıyor: mekân, atmosfer, nesne, büyü, teknoloji,
   tarihsel ayrıntı. Motor bunları sayar ve hikâye uzunluğuna oranlar.

   Neden orana bakıyoruz: 2000 kelimelik hikâyede 3 mekân sözcüğü az,
   80 kelimelik hikâyede yeterli. Ham sayı yanıltıcı olurdu. */
function analyzeWorld(scenes) {
  const issues = [];
  let score = 100;

  const joined = scenes.map(s => String(s.voiceText || s.paragraph || '')).join(' ');
  const words = wordCount(joined);

  /* Dünya için eşik karakterden düşük — bkz. STORY yorumu.
     Ölçülemezlik burada da sessiz geçmez; bkz. char-tooshort gerekçesi. */
  if (words < STORY.WORLD_MIN_WORDS) {
    issues.push(mkIssue({
      category: 'world', scene: null, at: null,
      code: 'world-tooshort', severity: 'info',
      title: 'Dünya kurma ölçülemedi',
      detail: 'Hikâye ' + words + ' kelime. Çevre zenginliği için en az ' +
        STORY.WORLD_MIN_WORDS + ' kelime gerekiyor. Bu puan dünya kurmayı kapsamıyor.',
      recommendation: 'Kısa form videoda bu normaldir.',
      gain: 0
    }));
    return { score: null, issues, stats: { words, measurable: false } };
  }

  const locations  = countTermHits(joined, LOCATION_TERMS);
  const atmosphere = countTermHits(joined, ATMOSPHERE_TERMS);
  const objects    = countTermHits(joined, OBJECT_TERMS);
  const sensory    = countTermHits(joined, SENSORY_TERMS);

  const domains = {};
  for (const [k, terms] of Object.entries(DOMAIN_TERMS)) {
    domains[k] = countTermHits(joined, terms).count;
  }
  const domainTotal = Object.values(domains).reduce((a, b) => a + b, 0);

  const elements = locations.count + atmosphere.count + objects.count + domainTotal;
  const per100 = (elements / words) * 100;

  if (locations.count < STORY.WORLD_MIN_LOCATIONS) {
    score -= 30;
    issues.push(mkIssue({
      category: 'world', scene: null, at: null, code: 'world-nowhere', severity: 'warn',
      title: 'Hikâye hiçbir yerde geçmiyor',
      detail: 'Metinde mekân belirten bir sözcük yok. İzleyici olayın nerede olduğunu bilmiyor.',
      recommendation: 'Sahnenin geçtiği yeri bir öbekle tanımla.',
      gain: 11
    }));
  }

  if (elements < STORY.WORLD_MIN_ELEMENTS) {
    score -= 25;
    issues.push(mkIssue({
      category: 'world', scene: null, at: null, code: 'world-bare', severity: 'warn',
      title: 'Dünya çıplak',
      detail: 'Mekân, atmosfer ve nesne için toplam ' + elements + ' işaret var. Sahne boşlukta geçiyor gibi.',
      recommendation: 'Bir mekân, bir hava koşulu ve bir nesne ekle.',
      gain: 10
    }));
  } else if (per100 < STORY.WORLD_ELEMENT_PER_100) {
    score -= 14;
    issues.push(mkIssue({
      category: 'world', scene: null, at: null, code: 'world-thin', severity: 'tip',
      title: 'Dünya seyrek',
      detail: 'Hikâye uzunluğuna göre çevre ayrıntısı az (100 kelimede ' + per100.toFixed(1) + ' öğe).',
      recommendation: 'Mekânı hissedilir kılan bir iki ayrıntı ekle.',
      gain: 6
    }));
  }

  if (atmosphere.count === 0) {
    score -= 12;
    issues.push(mkIssue({
      category: 'world', scene: null, at: null, code: 'world-noatmo', severity: 'tip',
      title: 'Atmosfer yok',
      detail: 'Işık, hava, ses ya da sıcaklık gibi bir atmosfer ipucu bulunmuyor.',
      recommendation: 'Sahneye bir hava koşulu ya da ışık durumu ekle.',
      gain: 6
    }));
  }

  if (sensory.count === 0 && words > 150) {
    score -= 8;
    issues.push(mkIssue({
      category: 'world', scene: null, at: null, code: 'world-nosense', severity: 'info',
      title: 'Görsel dışı duyu yok',
      detail: 'Anlatım yalnızca görsel. Koku, ses ya da dokunma ayrıntısı yok.',
      recommendation: 'Bir sahnede sesi ya da kokuyu tarif et.',
      gain: 4
    }));
  }

  return {
    score: clampScore(score), issues,
    stats: {
      words, elements, per100: +per100.toFixed(2),
      locations: locations.count, atmosphere: atmosphere.count,
      objects: objects.count, sensory: sensory.count, domains
    }
  };
}

/* ---------- Duygu eğrisi (TASK-05, Adım 2) ----------

   Her sahne için duygu yönü ve şiddeti hesaplar.

   valence  −1 (dip) … +1 (zirve)
   tension   0 … 1   (gerilim ayrı ölçülür: gerilim hikâyeyi ileri iter,
                      keder durdurur. Doruk noktası gerilimle bulunur.)
   intensity 0 … 1   (duygu yoğunluğu — kelime başına duygu terimi)

   Neden sahne bazlı: tek bir genel duygu puanı eğri çizemez. "Hikâye
   duygusal" demek yetmez; nerede yükselip nerede düştüğünü görmek gerek.
   Düz eğri = izleyici için monoton, spec'in özellikle uyarı istediği durum. */
export function buildEmotionCurve(scenes) {
  const list = Array.isArray(scenes) ? scenes : [];

  return list.map((s, i) => {
    const text = String(s.voiceText || s.paragraph || '');
    const words = wordCount(text);

    const pos = countTermHits(text, POSITIVE_EMOTIONS).count;
    const neg = countTermHits(text, NEGATIVE_EMOTIONS).count;
    const ten = countTermHits(text, TENSION_EMOTIONS).count;

    const total = pos + neg + ten;
    /* Gerilim değerliği aşağı çeker ama kederden hafif: gerilim
       merak uyandırır, keder çöker. 0.6 katsayısı bu farkı taşır. */
    const valence = total === 0 ? 0
      : +((pos - neg - ten * 0.6) / total).toFixed(3);

    /*
      GERİLİM: iki ayrı değer, iki ayrı iş.

      tensionLevel — 0..1 arası, GÖRÜNTÜLEME için. Arayüz bar çizecek,
        sınırlı aralık gerekiyor.

      tensionRaw — TAVANI YOK, KARŞILAŞTIRMA için. Doruk noktası
        sahneler arası gerilim farkıyla bulunuyor; tavana vuran değer
        ayrımı yok eder. İlk sürümde tek değer kullanmıştım ve 1 gerilim
        terimli sahne ile 3 terimli sahne aynı çıkıyordu — doruk yanlış
        sahneyi işaret ediyordu.
    */
    const density = words === 0 ? 0 : ten / words;
    const tensionRaw = +(ten * (1 + density)).toFixed(3);

    return {
      scene: i + 1,
      words,
      positive: pos,
      negative: neg,
      tension: ten,
      valence,
      tensionLevel: +Math.min(1, density * 4).toFixed(3),
      tensionRaw,
      intensity: words === 0 ? 0 : +Math.min(1, (total / words) * 10).toFixed(3)
    };
  });
}

/* Eğrinin genliği: en yüksek ve en düşük değerlik arasındaki fark.
   Duygu taşıyan sahne yoksa null döner — 0 demek yanıltıcı olurdu
   ("eğri düz" ile "duygu hiç yok" farklı şeyler). */
function curveRange(curve) {
  const withEmotion = curve.filter(c => c.positive + c.negative + c.tension > 0);
  if (withEmotion.length < 2) return null;
  const vals = withEmotion.map(c => c.valence);
  return +(Math.max(...vals) - Math.min(...vals)).toFixed(3);
}

/* ---------- Dramatik yapı (TASK-05, Adım 2) ----------

   Sahnelere anlatı evresi etiketi verir ve yapı bulgularını çıkarır.

   YAKLAŞIM: konum + sinyal.
     Konum evrenin çerçevesini verir (kanca başta, çözüm sonda).
     Sinyal (çatışma/çözüm terimleri) içeriği doğrular.

     Yalnızca konuma bakmak yanlış olurdu: 10 sahnelik hikâyenin 6.
     sahnesi "çatışma" konumunda olabilir ama içinde hiç çatışma
     yoksa etiketlemek yanıltıcı olur. Motor ikisini birleştirir.

   DORUK: en yüksek gerilimli sahne. Konumu da denetlenir — doruk
   hikâyenin ilk yarısındaysa yapı ters, sonuna dayanmışsa çözüme
   yer kalmamış. */
export function detectStructure(scenes, curve) {
  const list = Array.isArray(scenes) ? scenes : [];
  const n = list.length;
  if (n === 0) return { phases: [], climax: null, findings: [], measurable: false };

  if (n < STORY.STRUCT_MIN_SCENES) {
    return { phases: [], climax: null, findings: ['too-few-scenes'], measurable: false };
  }

  const texts = list.map(s => String(s.voiceText || s.paragraph || ''));
  const conflict = texts.map(t => countTermHits(t, CONFLICT_TERMS).count);
  const resolution = texts.map(t => countTermHits(t, RESOLUTION_TERMS).count);

  /* Doruk: en yüksek gerilim. tensionRaw kullanılır (tavansız) —
     tensionLevel görüntüleme için sıkıştırılmış, karşılaştırmada
     ayrımı yok eder. Eşitlikte çatışma sinyali fazla olan, o da
     eşitse daha sonraki sahne kazanır (doruk sona yakın olur). */
  let climaxIdx = 0, best = -1;
  for (let i = 0; i < n; i++) {
    const t = (curve[i]?.tensionRaw || 0) + conflict[i] * 0.15;
    if (t >= best) { best = t; climaxIdx = i; }
  }
  const hasTension = best > 0;
  const climaxPos = n === 1 ? 0 : climaxIdx / (n - 1);

  /* Evre etiketleri: konum çerçevesi + sinyal doğrulaması */
  const phases = list.map((s, i) => {
    const pos = n === 1 ? 0 : i / (n - 1);
    let phase;

    if (i === 0) phase = 'hook';
    else if (hasTension && i === climaxIdx) phase = 'climax';
    else if (pos >= 0.85) phase = 'resolution';
    else if (pos < 0.30) phase = 'setup';
    else if (conflict[i] > 0) phase = 'conflict';
    else phase = 'rising';

    /* Çözüm sinyali taşıyan geç sahne, çatışma etiketi almamalı */
    if (phase === 'conflict' && resolution[i] > conflict[i] && pos > 0.7) {
      phase = 'resolution';
    }

    return {
      scene: i + 1, phase, pos: +pos.toFixed(2),
      conflict: conflict[i], resolution: resolution[i]
    };
  });

  const findings = [];
  const totalConflict = conflict.reduce((a, b) => a + b, 0);
  const conflictScenes = conflict.filter(c => c > 0).length;
  const totalResolution = resolution.reduce((a, b) => a + b, 0);

  if (conflictScenes < STORY.CONFLICT_MIN_SCENES) findings.push('no-conflict');
  if (totalConflict > 0 && totalResolution === 0) findings.push('no-resolution');
  if (hasTension && climaxPos < STORY.CLIMAX_MIN_POS) findings.push('early-climax');
  if (hasTension && climaxPos > STORY.CLIMAX_MAX_POS) findings.push('late-climax');
  if (!phases.some(p => p.phase === 'resolution')) findings.push('missing-resolution-phase');

  return {
    phases,
    climax: hasTension ? { scene: climaxIdx + 1, pos: +climaxPos.toFixed(2) } : null,
    findings,
    measurable: true,
    stats: { totalConflict, conflictScenes, totalResolution }
  };
}

/* ---------- Tutundurma tahmini (TASK-05, Adım 3) ----------

   DÜRÜSTLÜK: Bu bir YAPISAL TAHMİN, izleyici verisi DEĞİL.

   Elimizde gerçek izlenme istatistiği yok. Spec "0-30sn %98" gibi
   rakamlar gösteriyor ama böyle bir kesinlik iddia etmek yanlış olur —
   kullanıcı bunu ölçülmüş veri sanır ve yayın kararı verir.

   Motorun yaptığı: yapıdan çıkan RİSKİ hesaplamak. Uzun sahne, zayıf
   açılış, düz duygu eğrisi izlenmeyi düşüren bilinen etkenler. Bunları
   taban bir düşüş eğrisine uyguluyoruz.

   Çıktı `basis: 'structural'` ve `confidence` alanı taşıyor; arayüz
   bunu "tahmin" olarak sunacak, ölçüm olarak değil.

   Taban eğri kısa video platformlarının bilinen davranışını yansıtır:
   ilk saniyelerde dik düşüş, sonra yatay seyir. */
export function predictRetention(tl, curve, cats, opts) {
  const scenes = Array.isArray(tl) ? tl : [];
  if (!scenes.length) {
    return { buckets: [], dropPoints: [], basis: 'structural', confidence: 'none' };
  }

  const total = scenes[scenes.length - 1]?.end || 0;
  const hookScore = Number.isFinite(cats?.hook?.score) ? cats.hook.score : 70;
  const curveRangeVal = cats?.emotion?.stats?.curveRange;
  const flatCurve = curveRangeVal !== null && curveRangeVal !== undefined &&
                    curveRangeVal < STORY.CURVE_FLAT_RANGE;

  let keep = 1;
  const buckets = [];

  for (const b of RETENTION.BUCKETS) {
    if (b.from >= total) break;

    /* Bu dilime düşen sahneler */
    const inBucket = scenes.filter(s => s.at < Math.min(b.to, total) && s.end > b.from);
    const longInBucket = inBucket.filter(s => s.dur > HEALTH.SCENE_MAX).length;

    let factor = b.baseKeep;

    /* İlk dilim açılışa duyarlı: zayıf kanca burada vurur.
       hookScore 100 → ceza yok, 0 → HOOK_WEIGHT kadar ek düşüş. */
    if (b.from === 0) {
      factor -= (1 - hookScore / 100) * RETENTION.HOOK_WEIGHT;
    }

    factor -= longInBucket * RETENTION.LONG_SCENE_PENALTY;
    if (flatCurve) factor -= RETENTION.FLAT_CURVE_PENALTY;

    keep = Math.max(RETENTION.MIN_KEEP, keep * Math.max(0.4, factor));

    buckets.push({
      from: b.from,
      to: b.to === Infinity ? Math.ceil(total) : b.to,
      keep: +keep.toFixed(3),
      pct: Math.round(keep * 100),
      longScenes: longInBucket
    });
  }

  /* Düşüş noktaları: yapısal riski en yüksek sahneler.
     Sebep de veriliyor — "sahne 14 riskli" tek başına işe yaramaz,
     kullanıcı ne yapacağını bilmeli. */
  const dropPoints = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const reasons = [];

    if (s.dur > HEALTH.SCENE_MAX) reasons.push('long-scene');
    if (!s.hasMedia) reasons.push('no-visual');
    const c = curve?.[i];
    if (c && c.positive + c.negative + c.tension === 0 && s.dur > 6) {
      reasons.push('flat-emotion');
    }

    if (reasons.length) {
      dropPoints.push({
        scene: s.scene,
        at: s.at,
        dur: s.dur,
        reasons,
        /* İki ve üzeri sebep birleşince risk ciddi: uzun VE görselsiz
           sahne izleyicinin ayrıldığı klasik noktadır. */
        severity: reasons.length >= 2 ? 'warn' : 'tip'
      });
    }
  }
  dropPoints.sort((a, b) => b.reasons.length - a.reasons.length || b.dur - a.dur);

  /* Güven: tahmin ne kadar sağlam? Gerçek ses süresi varsa daha güvenilir. */
  const estimatedCount = scenes.filter(s => s.estimated).length;
  const confidence = estimatedCount === 0 ? 'medium'
    : estimatedCount === scenes.length ? 'low' : 'low-medium';

  return {
    buckets,
    dropPoints: dropPoints.slice(0, 5),
    basis: 'structural',
    confidence,
    note: 'estimate-not-measurement'
  };
}

/* ---------- Tür filtresi (TASK-05, Adım 3) ----------

   Uyarıları türe göre süzer. İki işlem:
     bastır  — o türde YANLIŞ olan uyarı listeden çıkarılır
     yükselt — o türde DAHA CİDDİ olan uyarının seviyesi bir kademe artar

   Bastırılan uyarının cezası da geri verilmeli; aksi halde puan düşük
   kalır ama kullanıcı sebebini göremez. Bu yüzden filtre PUANLAMA
   ÖNCESİ değil, kategori analizinden SONRA ama puan hesabından ÖNCE
   uygulanır — cezayı geri ekliyoruz.
*/
const SEVERITY_UP = { info: 'tip', tip: 'warn', warn: 'critical', critical: 'critical' };

function applyGenreProfile(cats, family) {
  const suppress = new Set(family.suppress || []);
  const elevate = new Set(family.elevate || []);
  const skip = new Set(family.skipCategories || []);

  const out = {};
  for (const [key, cat] of Object.entries(cats)) {
    /* Türde geçersiz kategori: hiç ölçülmemiş sayılır.
       Mevcut "ölçülemeyen kategori ağırlıktan düşülür" mekanizması
       devreye girer ve kapsam raporunda görünür. */
    if (skip.has(key)) {
      out[key] = {
        score: null,
        issues: [],
        stats: { ...(cat.stats || {}), skippedByGenre: family.key }
      };
      continue;
    }

    let score = cat.score;
    const issues = [];

    for (const issue of cat.issues || []) {
      if (suppress.has(issue.code)) {
        /* Bastırılan uyarının cezasını geri ver: gain alanı beklenen
           kazancı taşıyor, ceza da o mertebede. Tam ters çevirme
           mümkün değil (ceza ile gain aynı sayı değil) ama gain'i
           geri eklemek puanı doğru yöne taşır ve haksız cezayı azaltır. */
        if (Number.isFinite(score) && issue.gain) {
          score = clampScore(score + issue.gain);
        }
        continue;
      }
      if (elevate.has(issue.code)) {
        issues.push({ ...issue, severity: SEVERITY_UP[issue.severity] || issue.severity,
                      elevatedByGenre: family.key });
        continue;
      }
      issues.push(issue);
    }

    out[key] = { ...cat, score, issues };
  }
  return out;
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

  /* Duygu eğrisi ve dramatik yapı önce hesaplanır; birden çok
     kategori bunları okuyor (story, emotion, ileride retention).
     Tek kez hesaplayıp paylaşmak hem hızlı hem tutarlı. */
  const curve = buildEmotionCurve(scenes);
  const structure = detectStructure(scenes, curve);

  const cats = {};
  cats.hook = analyzeHook(tl, scenes);
  cats.pacing = analyzePacing(tl);
  cats.visual = analyzeVisual(tl, scenes);
  cats.voice = analyzeVoice(tl, scenes);
  cats.story = analyzeStory(tl, scenes, sb, structure);
  cats.emotion = analyzeEmotion(scenes, curve);
  cats.character = analyzeCharacter(scenes, sb);
  cats.world = analyzeWorld(scenes);
  cats.retention = analyzeRetention(tl, cats);

  /* TÜR FARKINDALIĞI — kategori analizleri bitti, puanlama başlamadan
     önce türe göre süz. Korku hikâyesinde "baştan sona karanlık"
     uyarısı yanlış; belgeselde karakter arkı aramak haksız. */
  const family = genreFamily(sb?.genre);
  const filtered = applyGenreProfile(cats, family);

  const scores = {};
  for (const k of CATEGORY_KEYS) {
    const v = filtered[k]?.score;
    if (Number.isFinite(v)) scores[k] = v;
  }

  const issues = sortIssues(Object.values(filtered).flatMap(c => c.issues || []));
  const overall = overallScore(scores);

  /* Tutundurma tahmini: filtrelenmiş kategorileri okur (tür bastırması
     sonrası hook puanı değişmiş olabilir). */
  const retention = predictRetention(tl, curve, filtered, { family });

  return {
    ...base,
    overall,
    stars: starsOf(overall),
    scores,
    issues,
    timeline: timelineNotes(tl, issues),
    /* Anlatı katmanları raporda ayrı alanlar olarak taşınır — arayüz
       bunları çizecek (Adım 5). scores/issues yapısına dokunulmadı. */
    /* Kapsam: puanın kaç kategoriyi gerçekten ölçtüğü.
       Ölçülemeyen kategori ağırlıktan düşülür, bu da kısa hikâyelere
       yapay avantaj verir; kapsam bunu görünür kılar. */
    coverage: measurementCoverage(scores),
    /* Tür bilgisi raporda taşınır: arayüz "bu bir korku hikâyesi olarak
       değerlendirildi" diyebilsin, kullanıcı neden bazı uyarıları
       görmediğini anlasın. */
    genre: {
      label: sb?.genre || null,
      family: family.key,
      familyLabel: family.label
    },
    retention,
    emotionCurve: curve,
    narrative: {
      phases: structure.phases,
      climax: structure.climax,
      findings: structure.findings,
      measurable: structure.measurable
    },
    stats: {
      scenes: scenes.length,
      totalDur: total,
      estimated,
      ...Object.fromEntries(Object.entries(filtered).map(([k, v]) => [k, v.stats || {}]))
    }
  };
}
