/*
  PROMPT QUALITY — sözlükler.

  Sprint 4 / TASK-03. Bu dosya kural tabanlı prompt kalite motorunun
  bilgi tabanıdır. Terim listeleri; motor bunlara bakarak prompt'un
  hangi boyutlarda yeterli olduğunu ÖLÇER (AI değil, sözlük).

  Neden ayrı dosya:
    - Sözlükler zamanla büyür (yeni sinema deyişleri, yeni stiller)
    - Motor kodu değişmeden sözlük genişletilebilir
    - Test edilebilir sabit veri; motor mantığı ayrı test edilir
    - i18n yok — bunlar İngilizce ve Türkçe prompt kelimeleri.
      Prompt üreticileri her iki dili de karışık kullanır; TR/EN ayrı
      liste tutmak yanlış olur.

  Uyarı:
    Regex için önce kelime kaçırma yapılır. Terimler "close up",
    "close-up", "closeup" gibi varyasyonları örter — arayan zaten
    yapıyor, sözlükte tek biçim yeter.
*/

/* ---------- Sinematik dil ----------
   Kamera açısı, kadraj, alan derinliği, lens, hareket. */
export const CINEMATIC_TERMS = [
  // Kadraj
  'wide shot', 'wide angle', 'medium shot', 'close up', 'close-up', 'extreme close',
  'establishing shot', 'over the shoulder', 'over-the-shoulder',
  'aerial shot', 'birds eye', 'top down', 'top-down', 'low angle', 'high angle',
  'dutch angle', 'tilted angle', 'point of view', 'pov shot',
  'geniş plan', 'yakın plan', 'orta plan', 'genel plan', 'kuş bakışı',

  // Lens ve odak
  'depth of field', 'shallow depth', 'bokeh', 'rack focus', 'focus pull',
  'wide angle lens', 'telephoto', '35mm', '50mm', '85mm', 'anamorphic',
  'lens flare', 'chromatic aberration',

  // Kamera hareketi
  'dolly', 'tracking shot', 'pan shot', 'tilt shot', 'crane shot',
  'handheld', 'steadicam', 'gimbal', 'zoom in', 'zoom out',
  'push in', 'pull back', 'orbit shot',

  // Kompozisyon
  'rule of thirds', 'leading lines', 'symmetrical', 'centered composition',
  'foreground', 'background', 'silhouette', 'framing',

  // Genel sinema
  'cinematic', 'cinematic lighting', 'film still', 'movie scene',
  'sinematik', 'sinema kalitesi'
];

/* ---------- Işık ---------- */
export const LIGHTING_TERMS = [
  'golden hour', 'blue hour', 'sunset', 'sunrise', 'dawn', 'dusk',
  'volumetric lighting', 'volumetric light', 'god rays', 'sun rays',
  'rim light', 'rim lighting', 'backlit', 'backlighting', 'silhouette',
  'soft light', 'hard light', 'dramatic lighting', 'cinematic lighting',
  'natural light', 'studio lighting', 'neon', 'neon light',
  'candlelight', 'firelight', 'moonlight', 'starlight',
  'harsh shadow', 'soft shadow', 'chiaroscuro',
  'overexposed', 'underexposed', 'high key', 'low key',
  'ambient light', 'ambient occlusion',
  'altın saat', 'gün batımı', 'gün doğumu', 'mum ışığı', 'ay ışığı',
  'yumuşak ışık', 'sert ışık', 'dramatik ışık', 'doğal ışık'
];

/* ---------- Duygu ---------- */
export const EMOTION_TERMS = [
  // İngilizce
  'happy', 'joyful', 'excited', 'cheerful', 'peaceful', 'serene', 'calm',
  'sad', 'melancholy', 'grief', 'sorrowful', 'lonely', 'lonesome',
  'fear', 'scared', 'terrified', 'anxious', 'nervous', 'worried',
  'angry', 'furious', 'enraged', 'frustrated',
  'wonder', 'awe', 'amazed', 'astonished', 'curious', 'curiosity',
  'mysterious', 'mystery', 'enigmatic', 'eerie', 'haunting',
  'tense', 'tension', 'suspenseful', 'ominous', 'foreboding',
  'romantic', 'tender', 'intimate', 'nostalgic',
  'triumphant', 'victorious', 'proud', 'determined', 'resolute',
  'hopeful', 'inspired', 'uplifting',
  'melancholic', 'wistful', 'contemplative', 'thoughtful',
  'shocked', 'surprised', 'stunned',

  // Türkçe
  'mutlu', 'sevinçli', 'huzurlu', 'sakin',
  'üzgün', 'kederli', 'yalnız', 'melankolik',
  'korkmuş', 'endişeli', 'gergin',
  'öfkeli', 'kızgın',
  'şaşkın', 'meraklı', 'hayret',
  'gizemli', 'esrarengiz',
  'romantik', 'tutkulu', 'içten',
  'umutlu', 'kararlı'
];

/* ---------- Hareket ---------- */
export const MOTION_TERMS = [
  // Karakter hareketi
  'walking', 'running', 'jumping', 'flying', 'falling', 'climbing', 'dancing',
  'crawling', 'floating', 'swimming', 'sprinting', 'leaping',
  'turning', 'spinning', 'twirling', 'rotating',
  'looking', 'staring', 'glancing', 'watching', 'gazing',
  'reaching', 'grabbing', 'holding', 'lifting', 'throwing',
  'sitting down', 'standing up', 'kneeling',

  // Kamera hareketi (bkz. cinematic)
  'camera moves', 'camera pans', 'camera tracks',
  'slow motion', 'fast motion', 'time lapse', 'timelapse',

  // Partikül / doğa
  'wind blowing', 'wind sweeps', 'leaves falling', 'petals falling',
  'rain falling', 'snow falling', 'snowflakes', 'dust particles',
  'smoke rising', 'smoke drifting', 'fog rolling', 'mist swirling',
  'water flowing', 'waves crashing', 'ripples', 'splash',
  'fire flickering', 'flames dancing', 'sparks flying',
  'birds flying', 'flock of birds',

  // Türkçe
  'yürüyor', 'koşuyor', 'uçuyor', 'zıplıyor', 'dönüyor', 'bakıyor',
  'rüzgar', 'yağmur', 'kar', 'duman', 'sis', 'dalga',
  'yavaş çekim', 'hızlandırılmış'
];

/* ---------- Detay göstergeleri ---------- */
export const DETAIL_TERMS = [
  // Karakter tanımı
  'wearing', 'dressed in', 'hair', 'eyes', 'skin', 'face', 'expression',
  'clothing', 'outfit', 'attire', 'costume',
  'giyiyor', 'giyimli', 'saç', 'göz', 'yüz', 'ifade',

  // Doku ve malzeme
  'texture', 'material', 'fabric', 'leather', 'silk', 'wool', 'cotton',
  'metal', 'wood', 'stone', 'glass', 'crystal',
  'doku', 'kumaş', 'deri', 'ipek', 'yün', 'metal', 'ahşap', 'taş', 'cam',

  // Çevre
  'environment', 'landscape', 'atmosphere', 'ambiance',
  'weather', 'sky', 'clouds', 'sun', 'moon', 'stars',
  'çevre', 'manzara', 'atmosfer', 'hava', 'gökyüzü', 'bulut', 'güneş', 'ay',

  // Kalite belirteçleri (bunlar gerekli değil ama detay artırır)
  'detailed', 'ultra detailed', 'highly detailed', 'intricate',
  'sharp focus', 'high resolution', '4k', '8k', 'photorealistic',
  'ayrıntılı', 'detaylı', 'yüksek çözünürlük'
];

/* ---------- Stil belirteçleri ----------
   Style Lock için: seçilen stille tutarlılığı ölçmek. */
export const STYLE_TERMS = {
  pixar:        ['pixar', 'pixar-style', 'pixar quality', '3d animation', 'stylized 3d'],
  disney:       ['disney', 'disney-style', 'classic animation', 'hand-drawn'],
  anime:        ['anime', 'manga', 'studio ghibli', 'japanese animation', 'cel shading', 'shonen'],
  realistic:    ['realistic', 'lifelike', 'natural', 'documentary style'],
  photorealistic:['photorealistic', 'photoreal', 'hyperrealistic', 'photo-realistic', 'ultra realistic'],
  comic:        ['comic', 'comic book', 'graphic novel', 'cartoon', 'ink drawing'],
  clay:         ['clay', 'claymation', 'stop motion', 'plasticine'],
  lowpoly:      ['low poly', 'low-poly', 'lowpoly', 'geometric', 'faceted'],
  cinematic:    ['cinematic', 'film still', 'movie still', 'hollywood'],
  watercolor:   ['watercolor', 'watercolour', 'painted', 'illustration'],
  oilpainting:  ['oil painting', 'oil paint', 'classical painting', 'renaissance'],
  cyberpunk:    ['cyberpunk', 'neon noir', 'blade runner', 'futuristic city', 'synthwave'],
  pixelart:     ['pixel art', 'pixelart', '8-bit', '16-bit', 'retro game'],
  noir:         ['noir', 'film noir', 'black and white', 'monochrome', 'high contrast shadow'],
  sketch:       ['pencil sketch', 'charcoal', 'graphite', 'hand sketch', 'line drawing'],
  vector:       ['vector art', 'vector illustration', 'flat vector', 'svg style'],
  flat:         ['flat illustration', 'flat design', 'minimal illustration', 'flat color'],
  papercut:     ['paper cut', 'papercut', 'layered paper', 'kirigami', 'paper craft'],
  concept:      ['concept art', 'fantasy concept', 'matte painting', 'key art'],
  retro80s:     ['retro 80s', '1980s', 'vhs aesthetic', 'synthwave', 'vaporwave']
};

/* ---------- Üretici uyumluluğu -----------
   Her modelin sevdiği prompt biçimi farklı; sözcük varlığı kadar
   uzunluk, ton ve yapı da önemli. Bu sabitler prompt uyumluluğunu
   ölçmek için kullanılır. */
export const GENERATOR_PROFILES = {
  flow: {
    label: 'Google Flow',
    idealLength: { min: 80, max: 260 },   // kelime
    prefersNatural: true,                  // düz anlatım
    prefersAction: false,
    prefersVisual: false,
    supports: ['image', 'video']
  },
  runway: {
    label: 'Runway',
    idealLength: { min: 40, max: 140 },
    prefersNatural: false,
    prefersAction: true,                   // hareket odaklı
    prefersVisual: false,
    supports: ['video']
  },
  pika: {
    label: 'Pika',
    idealLength: { min: 20, max: 100 },
    prefersNatural: false,
    prefersAction: true,
    prefersVisual: false,
    supports: ['video']
  },
  luma: {
    label: 'Luma',
    idealLength: { min: 30, max: 120 },
    prefersNatural: true,
    prefersAction: true,
    prefersVisual: false,
    supports: ['video']
  },
  midjourney: {
    label: 'Midjourney',
    idealLength: { min: 15, max: 90 },
    prefersNatural: false,
    prefersAction: false,
    prefersVisual: true,                   // görsel etiket odaklı
    supports: ['image']
  },
  sd: {
    label: 'Stable Diffusion',
    idealLength: { min: 20, max: 120 },
    prefersNatural: false,
    prefersAction: false,
    prefersVisual: true,
    supports: ['image']
  },
  flux: {
    label: 'Flux',
    idealLength: { min: 40, max: 160 },
    prefersNatural: true,                  // doğal cümle sever
    prefersAction: false,
    prefersVisual: false,
    supports: ['image']
  },
  seaart: {
    label: 'SeaArt',
    idealLength: { min: 20, max: 100 },
    prefersNatural: false,
    prefersAction: false,
    prefersVisual: true,
    supports: ['image']
  },
  leonardo: {
    label: 'Leonardo',
    idealLength: { min: 20, max: 110 },
    prefersNatural: false,
    prefersAction: false,
    prefersVisual: true,
    supports: ['image']
  },
  openai: {
    label: 'OpenAI Images',
    idealLength: { min: 25, max: 150 },
    prefersNatural: true,               // doğal dil tarifini iyi anlar
    prefersAction: false,
    prefersVisual: false,
    supports: ['image']
  },
  kling: {
    label: 'Kling',
    idealLength: { min: 25, max: 110 },
    prefersNatural: false,
    prefersAction: true,                // video: hareket odaklı
    prefersVisual: false,
    supports: ['video']
  },
  veo: {
    label: 'Veo',
    idealLength: { min: 50, max: 200 },
    prefersNatural: true,               // uzun betimleyici anlatım
    prefersAction: true,
    prefersVisual: false,
    supports: ['video']
  }
};

export const GENERATOR_KEYS = Object.keys(GENERATOR_PROFILES);

/* ---------- Stil etiketi → stil anahtarı ----------
   Arayüzdeki stil listesi Türkçe etiketler taşır (STYLES, lib/storyboard.js);
   sözlükteki STYLE_TERMS anahtarları İngilizce. Style Lock'un çalışması için
   ikisini eşlemek gerekiyor.

   Eşlenmeyen etiket null döner: o durumda stil kilidi ÖLÇÜLMEZ. Yanlış
   eşleme, ölçmemekten daha zararlı olurdu — kullanıcı hiç yazmadığı bir
   stille uyumsuzluk uyarısı alırdı. */

/*
  Etiket normalleştirme — Türkçe karakter katlama.

  NEDEN toLowerCase() YETMEZ:
    JavaScript'in varsayılan toLowerCase()'i 'I' harfini 'i' yapar,
    Türkçe'de ise 'I' → 'ı' olmalı. Yani 'PIXAR TARZI' → 'pixar tarzi'
    döner ama anahtar 'pixar tarzı' (noktasız ı). Eşleşme kaçar.

    toLocaleLowerCase('tr') bunu düzeltir ama İngilizce anahtarları bozar:
    'PHOTOREALISTIC' → 'photorealıstıc'. İki dilli sözlükte kullanılamaz.

  ÇÖZÜM: Türkçe'ye özgü harfleri ASCII karşılığına katla. Böylece 'ı' ve
  'i' aynı şeye normalleşir; hangi dilden gelirse gelsin eşleşme tutar.
*/
const TR_FOLD = { 'ı': 'i', 'İ': 'i', 'ş': 's', 'Ş': 's', 'ğ': 'g', 'Ğ': 'g',
                  'ü': 'u', 'Ü': 'u', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c',
                  'â': 'a', 'Â': 'a', 'î': 'i', 'Î': 'i', 'û': 'u', 'Û': 'u' };

function normalizeLabel(label) {
  return String(label || '')
    .trim()
    .replace(/[ıİşŞğĞüÜöÖçÇâÂîÎûÛ]/g, ch => TR_FOLD[ch] || ch)
    .toLowerCase();
}

/* Anahtarlar normalleştirilmiş biçimde yazılır — noktasız ı yok. */
const STYLE_LABEL_MAP = {
  'sinematik gercekci': 'cinematic',
  '3d animasyon': 'pixar',
  'pixar tarzi': 'pixar',
  'disney tarzi': 'disney',
  'anime': 'anime',
  'cyberpunk': 'cyberpunk',
  'suluboya': 'watercolor',
  'yagli boya': 'oilpainting',
  'duz illustrasyon': 'flat',
  'kagit kesme': 'papercut',
  'piksel sanat': 'pixelart',
  'noir': 'noir',
  'belgesel fotograf': 'photorealistic',
  'retro 80ler': 'retro80s',
  'fantastik konsept': 'concept',
  'kara kalem': 'sketch',
  'vektor': 'vector',
  'claymation': 'clay',

  // İngilizce etiketler de kabul edilir (ileride liste değişirse)
  'pixar': 'pixar', 'disney': 'disney', 'realistic': 'realistic',
  'photorealistic': 'photorealistic', 'comic': 'comic', 'clay': 'clay',
  'low poly': 'lowpoly', 'cinematic': 'cinematic', 'watercolor': 'watercolor',
  'oil painting': 'oilpainting', 'pixel art': 'pixelart', 'sketch': 'sketch',
  'vector': 'vector', 'flat': 'flat', 'concept art': 'concept'
};

export function styleKeyFromLabel(label) {
  if (!label) return null;
  const key = STYLE_LABEL_MAP[normalizeLabel(label)];
  return key && STYLE_TERMS[key] ? key : null;
}

/* ---------- Üretici etiketi → profil anahtarı ----------
   Prompt sayfasındaki TARGETS listesi kullanıcıya dönük etiketler taşır;
   profiller kısa anahtarlarla saklanır. Eşlenmeyen etiket null döner ve
   uyumluluk kategorisi ölçülmez — yanlış profille ölçmekten iyidir. */
const GENERATOR_LABEL_MAP = {
  'google flow': 'flow',
  'midjourney': 'midjourney',
  'flux': 'flux',
  'seaart': 'seaart',
  'leonardo': 'leonardo',
  'stable diffusion': 'sd',
  'openai images': 'openai',
  'runway': 'runway',
  'kling': 'kling',
  'veo': 'veo',
  'pika': 'pika',
  'luma': 'luma'
};

export function generatorKeyFromLabel(label) {
  if (!label) return null;
  const key = GENERATOR_LABEL_MAP[normalizeLabel(label)];
  return key && GENERATOR_PROFILES[key] ? key : null;
}

/* ---------- Yardımcı ----------
   Bir prompt'ta bir terim listesi kaç kez geçiyor?
   Kelime sınırı gevşek: "wide angle" tam ibare olarak bulunur;
   "walking" ise "walking away" içinde de bulunur. Regex değil,
   düşük gürültülü substring taraması yapıyoruz — hız için.
*/
export function countTermHits(text, terms) {
  if (!text || !terms?.length) return { count: 0, hits: [] };
  const lower = String(text).toLowerCase();
  const hits = [];
  const seen = new Set();
  for (const term of terms) {
    const t = term.toLowerCase();
    if (seen.has(t)) continue;
    if (lower.includes(t)) { hits.push(term); seen.add(t); }
  }
  return { count: hits.length, hits };
}
