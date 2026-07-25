import {
  PROMPT_CAT_KEYS, PROMPT_THRESH, emptyPromptReport, promptClamp,
  promptOverall, promptStars, promptSortIssues
} from './model';
import {
  CINEMATIC_TERMS, LIGHTING_TERMS, EMOTION_TERMS, MOTION_TERMS,
  DETAIL_TERMS, STYLE_TERMS, GENERATOR_PROFILES, countTermHits
} from './vocab';

/*
  PROMPT KALİTE ANALİZİ — kural tabanlı, deterministik.

  Sprint 4 / TASK-03.

  Bir sahnenin PROMPT KATMANLARINI birleştirip 6 kategoride ölçer.
  AI yok, kredi yok, hızlı: aynı girdi her zaman aynı raporu üretir.

  Katmanlar:
    Sahnedeki 7 alan (imagePrompt, videoPrompt, negativePrompt,
    stylePrompt, cameraPrompt, motionPrompt, lightingPrompt) tek
    metinde toplanır ve değerlendirilir. Yaratıcı ne yazdıysa; motor
    hangi alana yazıldığına bakmadan bütününü ölçer.

  Neden bütün prompt:
    Kullanıcılar sinema terimini kamera alanına da imagePrompt'a da
    yazıyor; hareketi motionPrompt'ta da videoPrompt'ta da tanımlıyor.
    Ayrı ayrı puanlamak sahte cezaya yol açar. Detay birinden geldiyse
    diğerinden geldi sayılır.

  Girdi:
    scene   — sahne nesnesi (7 prompt alanı içerir)
    context — { kind, style, generator, previousChars, sceneIndex }
              kind: 'image' | 'video' (motor uyarlamaları)
              style: 'pixar' | 'anime' | ... | null
              generator: 'flow' | 'runway' | ... | null
              previousChars: önceki sahnelerin karakter özellikleri
                (tutarlılık için — {name -> {colors, clothes, hair}})
              sceneIndex: 0-tabanlı sıra
*/

/* Sahnenin tüm prompt katmanlarını tek metinde topla.
   Önce başlıklı, arayüzde göstermek için değil; motor için tek düzlem. */
export function combinePromptLayers(scene) {
  const layers = [
    scene?.imagePrompt || '',
    scene?.videoPrompt || '',
    scene?.stylePrompt || '',
    scene?.cameraPrompt || '',
    scene?.motionPrompt || '',
    scene?.lightingPrompt || ''
    // negativePrompt hariç: o "olmasın" listesidir, kalite ölçümüne
    // dahil edilirse yanlış artı verir ("dark" negativePrompt'ta olduğu
    // için sistem "aydınlık" sayabilir).
  ];
  return layers.filter(Boolean).join(' \n ').trim();
}

function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

/* Karşılaştırılabilir karakter özellikleri çıkar (tutarlılık için).
   Renk, giysi, saç niteliği gibi ipuçlarını yakalar. Regex bilinçli
   olarak dar tutuldu — false positive tutarlılık uyarısı, uyarısızlıktan
   daha zararlı. */
export function extractCharacterHints(text) {
  const t = String(text || '').toLowerCase();
  const hints = {};

  // Renkler (nesneye bağlı: "red jacket", "kırmızı ceket")
  const colorNouns = [
    ['jacket', 'ceket'], ['shirt', 'gömlek'], ['dress', 'elbise'],
    ['coat', 'palto'], ['pants', 'pantolon'], ['skirt', 'etek'],
    ['hat', 'şapka'], ['scarf', 'atkı'], ['hair', 'saç'], ['eyes', 'göz']
  ].flat();
  const colors = [
    'red', 'blue', 'green', 'yellow', 'black', 'white', 'brown', 'gray', 'grey',
    'purple', 'pink', 'orange', 'gold', 'silver', 'kırmızı', 'mavi', 'yeşil',
    'sarı', 'siyah', 'beyaz', 'kahverengi', 'gri', 'mor', 'pembe', 'turuncu',
    'altın', 'gümüş'
  ];
  for (const noun of colorNouns) {
    for (const color of colors) {
      // "red jacket" or "jacket red" — iki yönlü kontrol
      const patterns = [color + ' ' + noun, noun + ' ' + color];
      for (const p of patterns) {
        if (t.includes(p)) {
          hints[noun] = hints[noun] || new Set();
          hints[noun].add(color);
        }
      }
    }
  }

  // Set'leri diziye çevir (JSON'a girmesi için)
  const out = {};
  for (const [k, v] of Object.entries(hints)) out[k] = [...v];
  return out;
}

/* İki karakter özellik kümesi arasında çelişki var mı? */
function findInconsistencies(prev, curr) {
  const conflicts = [];
  for (const noun of Object.keys(curr)) {
    if (!prev[noun]) continue;
    // Aynı nesnenin farklı renkleri: en az bir renk eşleşmiyorsa çelişki
    const overlap = curr[noun].some(c => prev[noun].includes(c));
    if (!overlap) {
      conflicts.push({
        noun,
        was: prev[noun],
        now: curr[noun]
      });
    }
  }
  return conflicts;
}

/* ---------- Kategori analizleri ---------- */

function analyzeDetail(text, kind) {
  const issues = [];
  let score = 100;
  const w = wordCount(text);

  if (w === 0) {
    return { score: null, issues, stats: { words: 0 } };
  }

  if (w < PROMPT_THRESH.MIN_WORDS) {
    score -= 40;
    issues.push(mk({
      category: 'detail', code: 'detail-short', severity: 'critical',
      title: 'Prompt çok kısa',
      detail: 'Sadece ' + w + ' kelime. Model neyi çizeceğini seçmek zorunda kalır, sonuç rastgele olur.',
      recommendation: 'Karakter, mekân, ışık ve atmosfer için birer cümle ekle.',
      gain: 18
    }));
  } else if (w < PROMPT_THRESH.IDEAL_MIN) {
    score -= 15;
    issues.push(mk({
      category: 'detail', code: 'detail-thin', severity: 'tip',
      title: 'Prompt biraz cılız',
      detail: 'Sadece ' + w + ' kelime. Daha zengin bir tarifle sonuç kararlı çıkar.',
      recommendation: 'Işık, mekân ya da doku için bir katman daha ekle.',
      gain: 6
    }));
  } else if (w > PROMPT_THRESH.MAX_WORDS) {
    score -= 10;
    issues.push(mk({
      category: 'detail', code: 'detail-bloat', severity: 'tip',
      title: 'Prompt çok uzun',
      detail: 'Kelime sayısı ' + w + '. Bazı modeller bu uzunlukta odağı dağıtır.',
      recommendation: 'Öz olmayan cümleleri çıkar, en güçlü tanımı öne al.',
      gain: 4
    }));
  }

  const detail = countTermHits(text, DETAIL_TERMS);
  const lighting = countTermHits(text, LIGHTING_TERMS);
  const detailScore = detail.count + lighting.count;

  if (detailScore < PROMPT_THRESH.MIN_DETAIL_HITS) {
    score -= 22;
    issues.push(mk({
      category: 'detail', code: 'detail-generic', severity: 'warn',
      title: 'Somut ayrıntı az',
      detail: 'Karakter, giysi, doku, hava, ışık için somut bir ipucu bulamadım.',
      recommendation: 'En az bir tane karakter özelliği ve bir ışık koşulu ekle.',
      gain: 12
    }));
  }

  // Çevre yokluğu
  const envKeys = ['forest', 'city', 'room', 'street', 'sky', 'mountain', 'ocean',
                   'orman', 'şehir', 'oda', 'sokak', 'gökyüzü', 'dağ', 'deniz'];
  const env = countTermHits(text, envKeys);
  if (env.count === 0 && kind === 'image') {
    score -= 6;
    issues.push(mk({
      category: 'detail', code: 'detail-noenv', severity: 'info',
      title: 'Mekân belirsiz',
      detail: 'Prompt mekânı işaret eden bir kelime içermiyor.',
      recommendation: 'Sahnenin geçtiği yeri kısa bir öbekle ekle.',
      gain: 5
    }));
  }

  return {
    score: promptClamp(score), issues,
    stats: { words: w, detailHits: detail.count, lightingHits: lighting.count }
  };
}

function analyzeCinematic(text) {
  const issues = [];
  let score = 100;
  if (!text) return { score: null, issues, stats: {} };

  const hits = countTermHits(text, CINEMATIC_TERMS);

  if (hits.count < PROMPT_THRESH.MIN_CINEMA_HITS) {
    /* Kadraj yoksa model varsayılan orta plana düşer; yönetmen kararı
       kaybolur. Bu, sonucu doğrudan etkileyen bir eksiklik. */
    score -= 55;
    issues.push(mk({
      category: 'cinematic', code: 'cinema-missing', severity: 'warn',
      title: 'Sinematik dil yok',
      detail: 'Kamera açısı, kadraj ya da lens için bir ipucu yok. Model varsayılana düşer.',
      recommendation: 'Wide shot, close-up, low angle gibi bir kadraj belirt.',
      gain: 13
    }));
  } else if (hits.count === 1) {
    score -= 12;
  }

  return { score: promptClamp(score), issues, stats: { hits: hits.count, terms: hits.hits.slice(0, 4) } };
}

function analyzeEmotion(text) {
  const issues = [];
  let score = 100;
  if (!text) return { score: null, issues, stats: {} };

  const hits = countTermHits(text, EMOTION_TERMS);
  if (hits.count === 0) {
    /* Duygu yokluğu gerçek bir eksiklik: model nötr, cansız bir kare
       üretir. Ceza hafif kalırsa 5 kelimelik boş prompt 80 puan alır. */
    score -= 45;
    issues.push(mk({
      category: 'emotion', code: 'emo-flat', severity: 'tip',
      title: 'Duygu tarif edilmemiş',
      detail: 'Karakterin ya da sahnenin duygusu belirsiz. Model nötr bir ifade üretir.',
      recommendation: 'Örneğin "melankolik", "kararlı", "gizemli" gibi bir sıfat ekle.',
      gain: 9
    }));
  }
  return { score: promptClamp(score), issues, stats: { hits: hits.count } };
}

function analyzeMotion(text, kind) {
  const issues = [];
  let score = 100;
  if (!text) return { score: null, issues, stats: {} };

  const hits = countTermHits(text, MOTION_TERMS);

  if (kind === 'video') {
    if (hits.count < PROMPT_THRESH.MIN_MOTION_HITS) {
      score -= 45;
      issues.push(mk({
        category: 'motion', code: 'motion-missing', severity: 'warn',
        title: 'Video için hareket tarifi yok',
        detail: 'Video üretimi hareket ister; prompt sabit bir kare tarif ediyor.',
        recommendation: 'Karakter hareketi (yürüyor, dönüyor) ya da kamera hareketi (dolly, pan) ekle.',
        gain: 14
      }));
    }
    return { score: promptClamp(score), issues, stats: { hits: hits.count, terms: hits.hits.slice(0, 4) } };
  }

  /*
    DURAĞAN GÖRSEL: hareket zorunlu değil.

    Hareket varsa artı değer katar, yoksa bu kategori ÖLÇÜLMEZ (null).
    Küçük bir ceza vermek yanlış olurdu: 97 puan gibi sahte bir yüksek
    değer genel ortalamayı yukarı çeker ve zayıf prompt iyi görünür.
  */
  if (hits.count === 0) {
    return { score: null, issues, stats: { hits: 0, measurable: false } };
  }
  return { score: promptClamp(score), issues, stats: { hits: hits.count, terms: hits.hits.slice(0, 4) } };
}

function analyzeConsistency(text, ctx) {
  const issues = [];
  let score = 100;
  if (!text) return { score: null, issues, stats: {}, characterHints: {} };

  const characterHints = extractCharacterHints(text);

  /*
    ÖLÇÜLEBİLİRLİK KONTROLÜ.

    Tutarlılık ancak karşılaştıracak bir şey varsa ölçülebilir:
    ya kilitli bir stil, ya önceki sahnelerden gelen karakter ipuçları.
    İkisi de yoksa kategori PUANLANMAZ (null) — yoksa 5 kelimelik boş
    bir prompt "tutarlılık 100" alır ve genel puanı haksızca yukarı çeker.
    TASK-01'deki "ölçülemeyen kategori ağırlıktan düşülür" kuralının
    aynısı.
  */
  const hasStyleLock = !!(ctx?.style && STYLE_TERMS[ctx.style]);
  const hasPrevious = !!(ctx?.previousChars && Object.keys(ctx.previousChars).length);
  if (!hasStyleLock && !hasPrevious) {
    return { score: null, issues, stats: { measurable: false }, characterHints };
  }

  // Stil kilidi
  if (hasStyleLock) {
    const s = countTermHits(text, STYLE_TERMS[ctx.style]);
    if (s.count === 0) {
      score -= 25;
      issues.push(mk({
        category: 'consistency', code: 'style-drift', severity: 'warn',
        title: 'Stil kilidi ile uyumsuz',
        detail: 'Kilitli stil "' + ctx.style + '" ama prompt bu stilin sözcüklerinden hiçbirini içermiyor.',
        recommendation: 'Prompt sonuna stil etiketini ekle: "' +
          STYLE_TERMS[ctx.style][0] + '".',
        gain: 12
      }));
    }
  }

  // Karakter tutarlılığı (önceki sahnelerdeki ipuçlarına karşı)
  if (hasPrevious) {
    const conflicts = findInconsistencies(ctx.previousChars, characterHints);
    if (conflicts.length) {
      score -= Math.min(30, conflicts.length * 12);
      const first = conflicts[0];
      issues.push(mk({
        category: 'consistency', code: 'char-drift', severity: 'warn',
        title: 'Karakter tutarsızlığı',
        detail: 'Önceki sahnelerde ' + first.noun + ' için "' + first.was.join('/') +
          '" kullanılmıştı; bu sahnede "' + first.now.join('/') + '".',
        recommendation: 'Karakter kartını referans al ya da önceki tanımı koru.',
        gain: 9
      }));
    }
  }

  return {
    score: promptClamp(score), issues,
    stats: { conflicts: 0 },
    characterHints
  };
}

function analyzeCompatibility(text, ctx) {
  const issues = [];
  let score = 100;
  if (!text) return { score: null, issues, stats: {} };

  const gen = ctx?.generator && GENERATOR_PROFILES[ctx.generator];
  if (!gen) {
    // Üretici seçilmemişse ölçmüyoruz — 100 varsayımı yanıltıcı olur
    return { score: null, issues, stats: {} };
  }

  const w = wordCount(text);
  const { idealLength } = gen;

  if (w < idealLength.min) {
    score -= 20;
    issues.push(mk({
      category: 'compatibility', code: 'compat-short', severity: 'tip',
      title: gen.label + ' için prompt kısa',
      detail: gen.label + ' ' + idealLength.min + '-' + idealLength.max +
        ' kelime aralığında en iyi sonucu verir; ' + w + ' kelime var.',
      recommendation: 'Prompt\'u ' + idealLength.min + ' kelimeye çıkar.',
      gain: 7
    }));
  } else if (w > idealLength.max) {
    score -= 15;
    issues.push(mk({
      category: 'compatibility', code: 'compat-long', severity: 'tip',
      title: gen.label + ' için prompt uzun',
      detail: gen.label + ' ' + idealLength.min + '-' + idealLength.max +
        ' kelime aralığında en iyi sonucu verir; ' + w + ' kelime var.',
      recommendation: 'En güçlü tarifi başa al, gerisini kısalt.',
      gain: 5
    }));
  }

  // Hareket odaklı üreticide fiil yoksa uyar
  if (gen.prefersAction) {
    const hits = countTermHits(text, MOTION_TERMS);
    if (hits.count === 0) {
      score -= 15;
      issues.push(mk({
        category: 'compatibility', code: 'compat-noaction', severity: 'warn',
        title: gen.label + ' hareket bekliyor',
        detail: 'Bu üretici en iyi sonucu fiil ağırlıklı promptlarda verir.',
        recommendation: 'Bir hareket ya da kamera aksiyonu ekle.',
        gain: 8
      }));
    }
  }

  // Görsel etiket odaklı üreticide çok cümleli düz anlatım ceza
  if (gen.prefersVisual) {
    const sentences = String(text).split(/[.!?…]+/).filter(s => s.trim().split(/\s+/).length > 2).length;
    if (sentences > 3) {
      score -= 10;
      issues.push(mk({
        category: 'compatibility', code: 'compat-verbose', severity: 'tip',
        title: gen.label + ' etiket biçimini sever',
        detail: 'Prompt uzun cümlelerden oluşuyor; ' + gen.label + ' virgülle ayrılmış görsel etiketleri tercih eder.',
        recommendation: 'Cümleleri virgülle ayrılmış görsel etiketlere böl.',
        gain: 5
      }));
    }
  }

  return { score: promptClamp(score), issues, stats: { generator: ctx.generator, words: w } };
}

/* ---------- Ana giriş ---------- */

function mk(o) {
  return {
    id: (o.layer || 'p') + ':' + (o.scene ?? 0) + ':' + o.code,
    layer: o.layer || 'prompt',
    scene: o.scene ?? null,
    severity: o.severity,
    category: o.category,
    code: o.code,
    title: o.title,
    detail: o.detail,
    recommendation: o.recommendation,
    gain: o.gain || 0
  };
}

export function analyzePrompt(scene, context) {
  const text = combinePromptLayers(scene);
  const kind = context?.kind || scene?.media || 'image';

  const base = emptyPromptReport({ createdAt: new Date().toISOString() });

  if (!text || wordCount(text) === 0) {
    return {
      ...base,
      overall: 0,
      stars: 0,
      scores: {},
      issues: [mk({
        category: 'detail', code: 'prompt-empty', severity: 'critical',
        title: 'Prompt boş',
        detail: 'Bu sahnenin promptu yok.',
        recommendation: 'Prompt üretimini çalıştır ya da elle gir.',
        gain: 25
      })],
      stats: { words: 0 }
    };
  }

  const cats = {};
  cats.detail        = analyzeDetail(text, kind);
  cats.cinematic     = analyzeCinematic(text);
  cats.emotion       = analyzeEmotion(text);
  cats.motion        = analyzeMotion(text, kind);
  cats.consistency   = analyzeConsistency(text, context);
  cats.compatibility = analyzeCompatibility(text, context);

  const scores = {};
  for (const k of PROMPT_CAT_KEYS) {
    const v = cats[k]?.score;
    if (Number.isFinite(v)) scores[k] = v;
  }

  const allIssues = promptSortIssues(
    Object.values(cats).flatMap(c => c.issues || [])
  );
  const overall = promptOverall(scores);

  return {
    ...base,
    overall,
    stars: promptStars(overall),
    scores,
    issues: allIssues,
    stats: {
      words: wordCount(text),
      kind,
      ...Object.fromEntries(Object.entries(cats).map(([k, v]) => [k, v.stats || {}]))
    },
    characterHints: cats.consistency.characterHints || {}
  };
}

/* ---------- Storyboard bütünü ----------
   Storyboard'daki tüm sahneleri sırayla analiz eder; her sahnede
   ÖNCEKİ karakter ipuçlarını taşıyarak tutarlılık takip eder. */
export function analyzeStoryboardPrompts(sb, context) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  if (!scenes.length) {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      perScene: [],
      overall: 0,
      stats: { scenes: 0, empty: 0, weak: 0 }
    };
  }

  const perScene = [];
  const prevChars = {};   // birikimli karakter özellikleri

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const ctx = {
      ...context,
      sceneIndex: i,
      previousChars: { ...prevChars }
    };
    const rep = analyzePrompt(s, ctx);
    perScene.push({ scene: i + 1, report: rep });

    // Bu sahnenin karakter ipuçlarını birikime ekle
    for (const [k, v] of Object.entries(rep.characterHints || {})) {
      prevChars[k] = prevChars[k] || [];
      for (const c of v) if (!prevChars[k].includes(c)) prevChars[k].push(c);
    }
  }

  // Genel puan: sahne raporlarının aritmetik ortalaması
  const overallSum = perScene.reduce((a, x) => a + (x.report.overall || 0), 0);
  const overall = perScene.length ? Math.round(overallSum / perScene.length) : 0;

  const empty = perScene.filter(x => (x.report.stats?.words || 0) === 0).length;
  const weak = perScene.filter(x => (x.report.overall || 0) < 60).length;

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    perScene,
    overall,
    stats: { scenes: scenes.length, empty, weak }
  };
}
