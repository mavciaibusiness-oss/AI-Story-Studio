/*
  AI DIRECTOR — karar modeli.

  Sprint 4 / TASK-06.

  MİMARİ: Director yeni bir ANALİZ motoru DEĞİL. Beş mevcut motorun
  çıktısını okuyup PRODÜKSİYON KARARINA çeviren orkestrasyon katmanı.

    TASK-01 Video Health   → 9 kategori puanı, bulgular
    TASK-02 Timeline       → sahne süreleri, kısa/uzun uyarıları
    TASK-03 Prompt Quality → sahne başına prompt puanı
    TASK-04 Scene Plan     → bölme/birleşme, sahne tipleri, geçişler
    TASK-05 Story Health   → duygu eğrisi, anlatı evreleri, izlenme tahmini

  Spec'in bağımlılık listesi de tam bunu söylüyor. Director'un ürettiği
  yeni bilgi: kamera, hareket ve ses yönlendirmesi — bunlar hiçbir
  motorda yok.

  ÜÇ DÜRÜSTLÜK KARARI:

  1. GÜVEN UYDURULMAZ.
     Spec "Confidence 97%" gösteriyor. Böyle bir sayıyı nereden
     bulacağız? Güven gerçek bir şeyden türetilmeli:
       - kaç bağımsız motor aynı sahneyi işaretledi (mutabakat)
       - süre gerçek mi tahmin mi (veri kalitesi)
       - sinyalin gücü (eşiği ne kadar aştı)
     Türetilen değer ve neye dayandığı birlikte taşınır.

  2. PUAN FARKI YÜZDE DEĞİLDİR.
     Spec "Retention +9%" diyor. Motorlarımızın `gain` değerleri PUAN
     farkı tahmini — izlenme yüzdesi değil. İkisini karıştırmak
     kullanıcıyı yanıltır. impact.metric hangi ölçekte olduğunu söyler.

  3. "SÜREKLİ İZLEME" İSTEK ÜZERİNEDİR.
     Spec "continuously monitors" diyor. Arka plan iş altyapımız yok.
     Kullanıcı analiz istediğinde çalışır. Yalan söylemek yerine
     dürüst davranıyoruz.
*/

export const DIRECTOR_VERSION = 1;

/* ---------- Karar türleri ----------

   Spec'in "Director Decisions" listesi. Her karar bir KIND'a bağlı;
   kind arayüzde gruplamayı ve filtrelemeyi sağlar.

   NOT — TASK-04 ile karışmasın:
     TASK-04 SAHNELER ARASI geçiş önerir (kesme, kararma, çapraz).
     TASK-06 SAHNE İÇİ kamera önerir (yakınlaş, kaydır, geniş plan).
     Farklı eksenler; birleştirmek ikisini de bozar.
*/
export const DIRECTOR_KINDS = {
  camera:  { key: 'camera',  label: { tr: 'Kamera',   en: 'Camera' } },
  motion:  { key: 'motion',  label: { tr: 'Hareket',  en: 'Motion' } },
  voice:   { key: 'voice',   label: { tr: 'Ses',      en: 'Voice' } },
  visual:  { key: 'visual',  label: { tr: 'Görsel',   en: 'Visual' } },
  pacing:  { key: 'pacing',  label: { tr: 'Ritim',    en: 'Pacing' } },
  story:   { key: 'story',   label: { tr: 'Hikâye',   en: 'Story' } },
  hook:    { key: 'hook',    label: { tr: 'Açılış',   en: 'Hook' } },
  ending:  { key: 'ending',  label: { tr: 'Kapanış',  en: 'Ending' } }
};

export const KIND_KEYS = Object.keys(DIRECTOR_KINDS);

/* ---------- Eylemler ----------
   `auto` alanı önemli: bazı öneriler tek tıkla uygulanabilir (prompt'a
   kamera terimi eklemek), bazıları kullanıcının kendi yapması gereken
   işler (yeni görsel üretmek). Arayüz buna göre düğme gösterir —
   "Uygula" düğmesi hiçbir şey yapmıyorsa güven kaybı olur. */
export const DIRECTOR_ACTIONS = {
  // Kamera — prompt'a terim eklenerek uygulanabilir
  'camera-closeup':   { kind: 'camera', auto: true,  term: 'close up' },
  'camera-wide':      { kind: 'camera', auto: true,  term: 'wide shot' },
  'camera-push':      { kind: 'camera', auto: true,  term: 'slow push in' },
  'camera-pull':      { kind: 'camera', auto: true,  term: 'slow pull back' },
  'camera-pan':       { kind: 'camera', auto: true,  term: 'slow pan' },
  'camera-low':       { kind: 'camera', auto: true,  term: 'low angle' },
  'camera-high':      { kind: 'camera', auto: true,  term: 'high angle' },
  'camera-tracking':  { kind: 'camera', auto: true,  term: 'tracking shot' },

  // Hareket — sahnenin medya tipini değiştirir
  'motion-to-video':  { kind: 'motion', auto: true },
  'motion-to-image':  { kind: 'motion', auto: true },
  'motion-add-terms': { kind: 'motion', auto: true },

  // Ses — kullanıcı yeniden kaydetmeli, otomatik uygulanamaz
  'voice-slower':     { kind: 'voice',  auto: false },
  'voice-faster':     { kind: 'voice',  auto: false },
  'voice-pause':      { kind: 'voice',  auto: false },

  // Görsel — yeni asset üretimi gerekir
  'visual-replace':   { kind: 'visual', auto: false },
  'visual-add':       { kind: 'visual', auto: false },
  'visual-vary':      { kind: 'visual', auto: false },

  // Ritim ve hikâye — TASK-04/TASK-05 araçlarına yönlendirir
  'pacing-split':     { kind: 'pacing', auto: false },
  'pacing-merge':     { kind: 'pacing', auto: false },
  'story-rewrite':    { kind: 'story',  auto: false },
  'hook-strengthen':  { kind: 'hook',   auto: false },
  'ending-strengthen':{ kind: 'ending', auto: false }
};

export const ACTION_KEYS = Object.keys(DIRECTOR_ACTIONS);

/* ---------- Etki ölçekleri ----------
   Bir önerinin neyi ne kadar iyileştireceği. metric ÖLÇEĞİ söyler;
   puan farkını yüzde gibi sunmamak için gerekli. */
export const IMPACT_METRICS = {
  score:     { key: 'score',     label: { tr: 'sağlık puanı', en: 'health score' } },
  retention: { key: 'retention', label: { tr: 'izlenme tahmini', en: 'retention estimate' } },
  prompt:    { key: 'prompt',    label: { tr: 'prompt puanı', en: 'prompt score' } }
};

/* ---------- Güven türetimi ----------

   Güven ÜÇ gerçek girdiden hesaplanır:

     agreement  — kaç bağımsız motor aynı sahneyi/sorunu işaretledi.
                  İki motor aynı şeyi söylüyorsa daha güvenilir.
     dataQuality— süre gerçek ses dosyasından mı, metinden tahmin mi.
                  Tahmine dayalı karar daha kırılgan.
     strength   — sinyal eşiği ne kadar aştı (0..1). Sınırda bir değer
                  ile katbekat aşan bir değer aynı güveni hak etmez.

   Ağırlıklar: mutabakat en belirleyici çünkü bağımsız doğrulama
   tek motorun kendi eşiğinden daha güçlü kanıttır.
*/
export function deriveConfidence({ agreement = 1, dataQuality = 'estimated', strength = 0.5 }) {
  const agreementScore = Math.min(1, (agreement - 1) * 0.35 + 0.45);
  const qualityScore = dataQuality === 'measured' ? 1
    : dataQuality === 'partial' ? 0.7 : 0.5;
  const strengthScore = Math.max(0, Math.min(1, strength));

  const raw = agreementScore * 0.45 + qualityScore * 0.30 + strengthScore * 0.25;
  const value = Math.max(0.2, Math.min(0.95, raw));

  return {
    value: +value.toFixed(2),
    /* Tavan bilinçli olarak 0.95: kural motoru hiçbir zaman %100 emin
       olamaz. Spec'in "%97" gibi rakamları yanıltıcı olurdu. */
    basis: { agreement, dataQuality, strength: +strengthScore.toFixed(2) }
  };
}

/* Güvenin sözel karşılığı — arayüz yüzde yerine bunu gösterebilir. */
export function confidenceBand(value) {
  if (value >= 0.8) return 'high';
  if (value >= 0.6) return 'medium';
  if (value >= 0.4) return 'low';
  return 'weak';
}

/* ---------- Öneri oluşturucu ---------- */
export function makeRecommendation(o) {
  const action = DIRECTOR_ACTIONS[o.action];
  const conf = deriveConfidence(o.confidence || {});
  return {
    id: (o.action || 'rec') + ':' + (o.scene ?? 'all'),
    action: o.action,
    kind: action?.kind || o.kind || 'story',
    auto: action?.auto ?? false,
    scene: Number.isInteger(o.scene) ? o.scene : null,
    at: Number.isFinite(o.at) ? o.at : null,
    title: o.title,
    reason: o.reason,
    /* Etki: hangi ölçekte, kaç birim. basis her zaman 'rule-estimate' —
       ölçüm değil, kural motorunun beklentisi. */
    impact: o.impact ? {
      metric: o.impact.metric || 'score',
      points: o.impact.points || 0,
      basis: 'rule-estimate'
    } : null,
    confidence: conf.value,
    confidenceBand: confidenceBand(conf.value),
    confidenceBasis: conf.basis,
    /* Hangi motorlar bu öneriyi destekliyor — şeffaflık ve mutabakat
       hesabı için. */
    sources: o.sources || [],
    /* Uygulanabilirse nasıl: prompt terimi mi, medya tipi mi, elle mi */
    apply: o.apply || null
  };
}

/* ---------- Sıralama ----------
   Kullanıcı en çok fark yaratacak öneriyi önce görmeli.

   Sıra: etki × güven → sonra kind ağırlığı → sonra sahne sırası.
   Etkiyi tek başına almak yanlış olurdu: yüksek etkili ama düşük
   güvenli bir öneri, orta etkili kesin bir öneriden önce gelmemeli. */
const KIND_WEIGHT = {
  hook: 1.15, ending: 1.05, story: 1.10, pacing: 1.0,
  visual: 1.0, motion: 0.95, camera: 0.90, voice: 0.90
};

export function sortRecommendations(recs) {
  const score = (r) => {
    const pts = r.impact?.points || 1;
    return pts * r.confidence * (KIND_WEIGHT[r.kind] || 1);
  };
  return [...(recs || [])].sort((a, b) => {
    const d = score(b) - score(a);
    if (Math.abs(d) > 0.01) return d;
    return (a.scene ?? 999) - (b.scene ?? 999);
  });
}

/* ---------- Özet ---------- */
export function summarizeRecommendations(recs) {
  const list = recs || [];
  const byKind = {};
  for (const k of KIND_KEYS) byKind[k] = 0;
  let autoCount = 0, rawPoints = 0;

  for (const r of list) {
    if (byKind[r.kind] !== undefined) byKind[r.kind]++;
    if (r.auto) autoCount++;
    rawPoints += (r.impact?.points || 0);
  }

  return {
    total: list.length,
    auto: autoCount,
    manual: list.length - autoCount,
    byKind,
    /* rawPoints ham toplam (şeffaflık için), projectedPoints gerçekçi
       beklenti. İkisini birlikte veriyoruz ki arayüz hangisini
       gösterdiğini bilsin. */
    rawPoints,
    projectedPoints: projectPoints(list),
    avgConfidence: list.length
      ? +(list.reduce((a, r) => a + r.confidence, 0) / list.length).toFixed(2)
      : 0
  };
}

/*
  ÖNGÖRÜLEN KAZANÇ — çifte sayımı önleyerek.

  NAİF TOPLAMA NEDEN YANLIŞ:
    "Sahne 3 video olarak üret" (+8) ve "Sahne 3 çok uzun" (+6) aynı
    sahnenin aynı temel sorununu işaret ediyor: sahne uzun ve durağan.
    Birini düzeltmek diğerini büyük ölçüde çözer. Toplamak 14 puan
    vaat etmek olur — kullanıcı uygular, 6 puan alır, güvenini yitirir.

  YAKLAŞIM — iki kademeli azalan getiri:
    1. Sahne içinde: en yüksek kazanç tam sayılır, aynı sahnedeki
       diğerleri ağır şekilde iskonto edilir (0.30). Aynı sahneyi
       düzeltmek büyük ölçüde tek iştir.
    2. Sahneler arası: her sonraki sahne 0.75 katsayıyla. Farklı
       sahneler daha bağımsız ama videonun bütünü aynı izleyiciyi
       yoruyor; tam toplamak yine abartı olur.

  ÜST SINIR:
    Kural motoru "100/100 olacak" diyemez. Öngörü mevcut puanın
    üstüne en fazla PROJECTION_CAP puan ekler ve arayüz bunu
    "beklenen" olarak, kesin değil, sunar.
*/
export const PROJECTION_CAP = 18;

function projectPoints(list) {
  if (!list?.length) return 0;

  /* Sahneye göre grupla; sahnesi olmayanlar ayrı kovada */
  const byScene = new Map();
  for (const r of list) {
    const key = Number.isInteger(r.scene) ? r.scene : 'global';
    (byScene.get(key) || byScene.set(key, []).get(key)).push(r);
  }

  /* Her sahne için tek etkili değer: en yüksek + kalanların iskontosu */
  const perScene = [];
  for (const [, group] of byScene) {
    const pts = group.map(r => r.impact?.points || 0).sort((a, b) => b - a);
    let v = pts[0] || 0;
    for (let i = 1; i < pts.length; i++) v += pts[i] * 0.30;
    perScene.push(v);
  }

  /* Sahneler arası azalan getiri */
  perScene.sort((a, b) => b - a);
  let acc = 0, factor = 1;
  for (const v of perScene) { acc += v * factor; factor *= 0.75; }

  return Math.min(PROJECTION_CAP, Math.round(acc));
}
