import { buildTimeline, estimateSpokenDuration, wordCount, TIMING } from '@/lib/timeline';
import { MOTION_TERMS, EMOTION_TERMS, countTermHits } from '@/lib/prompt/vocab';

/*
  DYNAMIC SCENE SYSTEM — planlama motoru.

  Sprint 4 / TASK-04. Kural tabanlı, deterministik, AI'siz, kredisiz.

  MİMARİ KARARI — NEDEN TEŞHİS DEĞİL PLAN:

    TASK-01 (Video Health) "sahne 5 çok uzun" der.
    TASK-02 (Timeline) süreyi hesaplar.
    Bu modül aynı verileri okur ve TEŞHİSİ EYLEME çevirir:
    "sahne 5'i 3. cümleden ikiye böl, parçalar 6.2 ve 5.8 saniye olur".

    Duplikasyon yok: süre hesabı lib/timeline'dan, terim sözlükleri
    lib/prompt/vocab'dan geliyor. Bu modül yalnızca KARAR üretir.

  AI'NİN YERİ:
    Kural motoru bölme noktasını cümle sınırlarından seçer — güvenli
    ve öngörülebilir. AI katmanı (adım 2) bu noktaları anlatı
    kırılmalarına göre iyileştirir. Kurallar olmadan da plan çalışır;
    AI süslemedir. TASK-01/02/03'teki ayrımın aynısı.

  RENDER NOTU:
    Geçiş önerileri üretilir ve saklanır, ancak mevcut render motoru
    crossfade'i GLOBAL bir seçenek olarak destekler; sahne başına geçiş
    henüz uygulanmaz. Öneriler kullanıcıya yol gösterir ve ileride
    motor desteklediğinde hazır bekler.
*/

/* ---------- Sahne tipleri ---------- */
export const SCENE_TYPES = {
  opening:    { key: 'opening',    ideal: [4, 8],   label: { tr: 'Açılış',  en: 'Opening' } },
  dialogue:   { key: 'dialogue',   ideal: [5, 10],  label: { tr: 'Anlatım', en: 'Dialogue' } },
  action:     { key: 'action',     ideal: [2.5, 6], label: { tr: 'Aksiyon', en: 'Action' } },
  emotional:  { key: 'emotional',  ideal: [6, 12],  label: { tr: 'Duygu',   en: 'Emotional' } },
  transition: { key: 'transition', ideal: [1.5, 4], label: { tr: 'Geçiş',   en: 'Transition' } },
  ending:     { key: 'ending',     ideal: [6, 12],  label: { tr: 'Kapanış', en: 'Ending' } }
};

export const SCENE_TYPE_KEYS = Object.keys(SCENE_TYPES);

/* ---------- Geçiş türleri ----------
   Sahne duygusuna göre önerilir. Değerler render motoruna ileride
   eşlenecek; şimdilik öneri olarak saklanır. */
export const TRANSITIONS = {
  cut:       { key: 'cut',       label: { tr: 'Kesme',        en: 'Cut' } },
  fade:      { key: 'fade',      label: { tr: 'Kararma',      en: 'Fade' } },
  crossfade: { key: 'crossfade', label: { tr: 'Çapraz geçiş', en: 'Cross fade' } },
  zoom:      { key: 'zoom',      label: { tr: 'Yakınlaşma',   en: 'Zoom' } },
  pan:       { key: 'pan',       label: { tr: 'Kaydırma',     en: 'Pan' } },
  slide:     { key: 'slide',     label: { tr: 'Sürgü',        en: 'Slide' } },
  push:      { key: 'push',      label: { tr: 'Kamera içeri', en: 'Camera push' } },
  pull:      { key: 'pull',      label: { tr: 'Kamera geri',  en: 'Camera pull' } }
};

/* ---------- Planlama eşikleri ---------- */
export const PLAN = {
  SPLIT_OVER: 12.0,     // bu süreden uzun sahne bölünmeye aday (TIMING.WARN_LONG ile aynı)
  MERGE_UNDER: 2.0,     // bu süreden kısa sahne birleşmeye aday (TIMING.WARN_SHORT ile aynı)
  TARGET_MIN: 4.0,      // bölünen parçaların hedeflediği alt sınır
  TARGET_MAX: 9.0,      // hedeflenen üst sınır
  MERGE_MAX: 10.0,      // birleşme sonrası bu süreyi aşmasın
  MIN_SENTENCES_TO_SPLIT: 2,   // tek cümleli sahne bölünmez
  ACTION_DENSITY: 0.04,        // hareket terimi / kelime oranı eşiği
  EMOTION_DENSITY: 0.035       // duygu terimi / kelime oranı eşiği
};

/* ---------- Cümle ayırma ----------
   Bölme noktası cümle sınırında olmalı; kelime ortasından bölmek
   metni bozar. Kısaltmalar ("Dr.", "vb.") yanlış bölmeye yol açmasın
   diye tek harfli ve bilinen kısaltmalar korunur. */
const ABBREV = ['dr', 'sn', 'vb', 'vs', 'bkz', 'örn', 'mr', 'mrs', 'ms', 'prof', 'st'];

export function splitSentences(text) {
  const t = String(text || '').trim();
  if (!t) return [];

  const out = [];
  let buf = '';
  const chars = [...t];

  for (let i = 0; i < chars.length; i++) {
    buf += chars[i];
    if (!/[.!?…]/.test(chars[i])) continue;

    // Ardışık noktalama tek sınır sayılır ("?!", "...")
    while (i + 1 < chars.length && /[.!?…]/.test(chars[i + 1])) { buf += chars[++i]; }

    // Kısaltma kontrolü: son kelime bilinen bir kısaltma mı?
    const lastWord = buf.trim().split(/\s+/).pop().replace(/[.!?…]+$/, '').toLowerCase();
    if (ABBREV.includes(lastWord) || lastWord.length === 1) continue;

    const s = buf.trim();
    if (s) out.push(s);
    buf = '';
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

/*
  Cümle içi öbek ayırma — cümle sınırı yetmediğinde kullanılır.

  NEDEN GEREKLİ:
    Tek bir cümle hedef üst sınırı aşabilir. Örnek:
    "Adam koşarak sokağa çıktı, arkasına bakmadan ilerledi, rüzgâr
     paltosunu savurdu ve köşeyi hızla döndü."
    Bu 11+ saniye ve dört ayrı eylem taşıyor. Yalnızca cümle
    sınırından bölersek bu parça büyük kalır ve TASK-04'ün çözmek
    istediği sorun sürer.

    İnsan kurgucu burayı virgülden böler. Motor da bunu yapar —
    ama YALNIZCA cümle tek başına sınırı aştığında. Kısa cümleleri
    virgülden bölmek metni gereksiz parçalar.
*/
export function splitClauses(sentence) {
  const t = String(sentence || '').trim();
  if (!t) return [];

  // Virgül, noktalı virgül, tire ve "ve/and" bağlacından sonra böl.
  // Ayırıcı önceki öbekte kalır ki metin okunur kalsın.
  const parts = t.split(/(?<=[,;])\s+|\s+—\s+|\s+--\s+/).map(s => s.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [t];
}

/* ---------- Sahne tipi sınıflandırma ----------
   Konum + terim yoğunluğu. AI'siz, açıklanabilir.

   Sıra önemli: açılış ve kapanış konumla belirlenir (kesin), ortadaki
   sahneler içerikle. Çok kısa ve içeriği zayıf sahne "geçiş" sayılır. */
export function classifyScene(scene, index, total, dur) {
  const text = String(scene?.voiceText || scene?.paragraph || '').trim();
  const words = wordCount(text);

  if (index === 0) return 'opening';
  if (index === total - 1 && total > 1) return 'ending';

  // İçeriği çok az ve kısa sahne: bağlayıcı
  if (words < 8 && dur > 0 && dur < PLAN.MERGE_UNDER * 1.6) return 'transition';

  if (words === 0) return 'transition';

  const motion = countTermHits(text, MOTION_TERMS).count;
  const emotion = countTermHits(text, EMOTION_TERMS).count;
  const motionD = motion / words;
  const emotionD = emotion / words;

  // Hareket baskınsa aksiyon, duygu baskınsa duygusal.
  // Eşitlikte duygu kazanır: duygusal sahne yanlış hızlandırılırsa
  // izleyici üzerindeki etkisi kaybolur, tersi daha az zararlı.
  if (motionD >= PLAN.ACTION_DENSITY && motionD > emotionD) return 'action';
  if (emotionD >= PLAN.EMOTION_DENSITY) return 'emotional';

  return 'dialogue';
}

/* ---------- Geçiş önerisi ----------
   Çıkan ve giren sahnenin tipine göre. Sinema dilinde yerleşik
   kurallar: aksiyon arası kesme, duygu arası yumuşak geçiş. */
export function recommendTransition(fromType, toType) {
  if (fromType === 'opening') return 'push';       // açılıştan içeri gir
  if (toType === 'ending') return 'crossfade';     // kapanışa yumuşak
  if (fromType === 'action' && toType === 'action') return 'cut';
  if (fromType === 'action' || toType === 'action') return 'cut';
  if (fromType === 'emotional' && toType === 'emotional') return 'crossfade';
  if (fromType === 'emotional') return 'fade';
  if (fromType === 'transition' || toType === 'transition') return 'fade';
  if (fromType === 'dialogue' && toType === 'dialogue') return 'cut';
  return 'crossfade';
}

/* ---------- Bölme planı ----------
   Uzun sahneyi cümle sınırlarından parçalara ayırır. Her parça
   TARGET_MIN..TARGET_MAX arasında kalmayı hedefler.

   Algoritma: cümleleri sırayla biriktir; birikmiş süre TARGET_MAX'i
   aşacaksa yeni parça başlat. Son parça çok kısa kalırsa öncekiyle
   birleştir — sonu sarkan bölme, bölmemekten kötüdür. */
/*
  Bölme birimlerini hesapla — cümleler, gerekiyorsa öbekler.

  Dışa açık çünkü AI iyileştirme katmanı (refine.js) AYNI birimler
  üzerinde çalışmak zorunda. Farklı birim listesi kullanılsa AI'nin
  verdiği indeksler kayar ve metin bozulur. Tek doğruluk kaynağı.
*/
export function splitUnits(text, currentDur) {
  const sentences = splitSentences(text);
  if (!sentences.length) return [];

  const estTotal = sentences.reduce((a, s) => a + estimateSpokenDuration(s), 0);
  const scale = currentDur > 0 && estTotal > 0 ? currentDur / estTotal : 1;

  const units = [];
  for (const s of sentences) {
    const d = estimateSpokenDuration(s) * scale;
    if (d > PLAN.TARGET_MAX) {
      const clauses = splitClauses(s);
      if (clauses.length > 1) { units.push(...clauses); continue; }
    }
    units.push(s);
  }
  return units;
}

export function planSceneSplit(text, currentDur) {
  const sentences = splitSentences(text);
  if (!sentences.length) return null;

  /* Gerçek ses süresi biliniyorsa parça sürelerini ona göre ölçekle:
     tahmin toplamı gerçek süreyle uyuşmayabilir, oran korunur. */
  const estTotal = sentences.reduce((a, s) => a + estimateSpokenDuration(s), 0);
  const scale = currentDur > 0 && estTotal > 0 ? currentDur / estTotal : 1;

  const units = splitUnits(text, currentDur);

  if (units.length < PLAN.MIN_SENTENCES_TO_SPLIT) return null;

  const pieces = [];
  let buf = [], bufDur = 0;

  for (const u of units) {
    const d = estimateSpokenDuration(u) * scale;
    if (bufDur > 0 && bufDur + d > PLAN.TARGET_MAX) {
      pieces.push({ text: buf.join(' '), dur: +bufDur.toFixed(2) });
      buf = [u]; bufDur = d;
    } else {
      buf.push(u); bufDur += d;
    }
  }
  if (buf.length) pieces.push({ text: buf.join(' '), dur: +bufDur.toFixed(2) });

  // Son parça çok kısaysa öncekine kat
  if (pieces.length > 1) {
    const last = pieces[pieces.length - 1];
    if (last.dur < PLAN.MERGE_UNDER) {
      const prev = pieces[pieces.length - 2];
      prev.text = prev.text + ' ' + last.text;
      prev.dur = +(prev.dur + last.dur).toFixed(2);
      pieces.pop();
    }
  }

  return pieces.length > 1 ? pieces : null;
}

/* ---------- Ana planlayıcı ---------- */
export function planStoryboard(sb) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];

  if (!scenes.length) {
    return {
      version: 1,
      createdAt: new Date().toISOString(),
      source: 'rules',
      current: { scenes: 0, total: 0, avgDur: 0 },
      recommended: { scenes: 0, avgDur: 0, total: 0 },
      types: [],
      splits: [],
      merges: [],
      transitions: [],
      notes: ['empty']
    };
  }

  const tl = buildTimeline(sb);

  /* 1) Tip sınıflandırma */
  const types = tl.scenes.map((t, i) =>
    ({ scene: t.scene, type: classifyScene(scenes[i], i, scenes.length, t.dur) }));

  /* 2) Bölme adayları — süresi eşiği aşan sahneler.
        Tip bazlı ideal üst sınır da dikkate alınır: duygusal sahne
        12 saniye kalabilir, aksiyon sahnesi 6'yı aşmamalı. */
  const splits = [];
  for (let i = 0; i < tl.scenes.length; i++) {
    const t = tl.scenes[i];
    if (!t.hasDur) continue;
    const type = types[i].type;
    const idealMax = SCENE_TYPES[type]?.ideal?.[1] ?? PLAN.TARGET_MAX;
    const limit = Math.max(PLAN.SPLIT_OVER, idealMax);
    if (t.dur <= limit) continue;

    const text = String(scenes[i].voiceText || scenes[i].paragraph || '');
    const pieces = planSceneSplit(text, t.dur);
    if (!pieces) {
      // Bölünemiyor (tek cümle) — kullanıcıya nedenini söyle
      splits.push({
        scene: t.scene, dur: t.dur, type, pieces: null,
        reason: 'single-sentence',
        gain: 0
      });
      continue;
    }
    splits.push({
      scene: t.scene, dur: t.dur, type, pieces,
      reason: 'too-long',
      gain: pieces.length - 1,       // kaç yeni sahne eklenecek
      /* Bölmeden sonra hâlâ hedefi aşan parça kaldıysa bildir.
         Sessizce geçmek yanlış olurdu: kullanıcı bölmeyi uygulayıp
         sorunun sürdüğünü görünce güvenini yitirir. Tek uzun cümle
         öbeklere de ayrılamıyorsa metni elle kısaltması gerekir. */
      stillLong: pieces.filter(p => p.dur > PLAN.TARGET_MAX).length
    });
  }

  /* 3) Birleşme adayları — ardışık kısa sahneler.
        Bir sahne yalnızca bir kez birleşmeye girer; zincirleme
        birleşme (3 sahne → 1) tek adımda yapılmaz, ikinci analizde
        yakalanır. Böylece kullanıcı ne olduğunu izleyebilir. */
  const merges = [];
  const usedInMerge = new Set();
  for (let i = 0; i < tl.scenes.length - 1; i++) {
    const a = tl.scenes[i], b = tl.scenes[i + 1];
    if (usedInMerge.has(a.scene) || usedInMerge.has(b.scene)) continue;
    if (!a.hasDur || !b.hasDur) continue;
    if (a.dur >= PLAN.MERGE_UNDER && b.dur >= PLAN.MERGE_UNDER) continue;

    const combined = +(a.dur + b.dur).toFixed(2);
    if (combined > PLAN.MERGE_MAX) continue;

    // Açılış ve kapanış korunur: hikâyenin çerçevesi bozulmasın
    const ta = types[i].type, tb = types[i + 1].type;
    if (ta === 'opening' || tb === 'ending') continue;

    merges.push({
      scenes: [a.scene, b.scene],
      durs: [a.dur, b.dur],
      combined,
      reason: 'too-short',
      gain: 1                        // kaç sahne azalacak
    });
    usedInMerge.add(a.scene);
    usedInMerge.add(b.scene);
  }

  /* 4) Geçiş önerileri — sahne çiftleri arası */
  const transitions = [];
  for (let i = 0; i < types.length - 1; i++) {
    transitions.push({
      from: types[i].scene,
      to: types[i + 1].scene,
      transition: recommendTransition(types[i].type, types[i + 1].type)
    });
  }

  /* 5) Önerilen yapı — plan uygulanırsa ne olur */
  const addedByCount = splits.reduce((a, s) => a + (s.gain || 0), 0);
  const removedByCount = merges.reduce((a, m) => a + (m.gain || 0), 0);
  const recommendedCount = Math.max(1, scenes.length + addedByCount - removedByCount);

  // Toplam süre değişmez (aynı metin, aynı ses) — sahne başına düşen değişir
  const totalDur = tl.total;
  const recAvg = recommendedCount > 0 ? totalDur / recommendedCount : 0;

  /* 6) Notlar — kullanıcıya ne söylenecek */
  const notes = [];
  if (tl.estimated) notes.push('estimated');
  if (tl.warnings.missingText.length) notes.push('missing-text');
  if (!splits.length && !merges.length) notes.push('balanced');

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    source: 'rules',
    current: {
      scenes: scenes.length,
      total: totalDur,
      avgDur: tl.stats.avgDur,
      sdDur: tl.stats.sdDur
    },
    recommended: {
      scenes: recommendedCount,
      avgDur: +recAvg.toFixed(2),
      total: totalDur
    },
    types,
    splits,
    merges,
    transitions,
    estimated: tl.estimated,
    notes
  };
}

/* ---------- Planı uygula ----------
   Saf fonksiyon: yeni sahne dizisi döner, girdiyi değiştirmez.

   Sıra önemli: ÖNCE birleşmeler, SONRA bölmeler. Tersi olursa
   bölünen parçaların numaraları kayar ve birleşme hedefleri şaşar.
   Her iki listede de orijinal sahne numaraları kullanıldığı için
   tek geçişte, orijinal indeksler üzerinden çalışıyoruz.

   selection: { splits: [sceneNo], merges: [[a,b]] } — kullanıcı hangi
   önerileri kabul ettiyse yalnızca onlar uygulanır (Professional mod).
   Verilmezse tüm plan uygulanır (Beginner mod).
*/
export function applyPlan(sb, plan, selection) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  if (!scenes.length || !plan) return scenes;

  const wantSplit = selection?.splits
    ? new Set(selection.splits)
    : new Set(plan.splits.filter(s => s.pieces).map(s => s.scene));

  const wantMerge = selection?.merges
    ? new Set(selection.merges.map(m => m.join('-')))
    : new Set(plan.merges.map(m => m.scenes.join('-')));

  const splitMap = new Map(plan.splits.filter(s => s.pieces).map(s => [s.scene, s]));
  const mergeMap = new Map(plan.merges.map(m => [m.scenes[0], m]));

  const out = [];
  let i = 0;

  while (i < scenes.length) {
    const sceneNo = i + 1;
    const scene = scenes[i];

    // Birleşme: bu sahne bir çiftin ilkiyse ve kabul edilmişse
    const merge = mergeMap.get(sceneNo);
    if (merge && wantMerge.has(merge.scenes.join('-')) && i + 1 < scenes.length) {
      const next = scenes[i + 1];
      const joinText = (a, b) => [a, b].filter(Boolean).join(' ').trim();
      out.push({
        ...scene,
        paragraph: joinText(scene.paragraph, next.paragraph),
        voiceText: joinText(scene.voiceText, next.voiceText),
        subtitle: joinText(scene.subtitle, next.subtitle),
        /* Ses dosyaları birleştirilemez (ikisi ayrı kayıt). Süreleri
           toplanır ama voice referansı ilkinde kalır; kullanıcı
           seslendirmeyi yeniden yüklemek zorunda kalmasın diye
           uyarı notu bırakıyoruz. */
        voiceDuration: (Number(scene.voiceDuration) || 0) + (Number(next.voiceDuration) || 0) || undefined,
        _mergedFrom: [sceneNo, sceneNo + 1],
        _needsVoiceRerecord: !!(scene.voice && next.voice)
      });
      i += 2;
      continue;
    }

    // Bölme: bu sahne bölünecekse
    const split = splitMap.get(sceneNo);
    if (split && wantSplit.has(sceneNo)) {
      for (let p = 0; p < split.pieces.length; p++) {
        const piece = split.pieces[p];
        out.push({
          ...scene,
          paragraph: piece.text,
          voiceText: piece.text,
          subtitle: '',
          /* Ses tek dosyaydı; parçalara bölünmesi ayrı bir işlem
             (engine.sliceAudioToWav). Burada süre tahmini taşınır,
             ses referansı yalnızca ilk parçada kalır. */
          voice: p === 0 ? scene.voice : null,
          voiceDuration: piece.dur,
          _splitFrom: sceneNo,
          _splitIndex: p,
          _needsVoiceSlice: !!scene.voice
        });
      }
      i += 1;
      continue;
    }

    out.push({ ...scene });
    i += 1;
  }

  // Sahne numaralarını yeniden ver
  return out.map((s, idx) => ({ ...s, scene: idx + 1 }));
}
