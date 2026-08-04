/*
  CREATOR OS — Intent Engine.

  Sprint 5 / TASK-01, Adım 1.

  Kullanıcı tek cümle yazıyor: "Youtube kanalım için korku videosu
  hazırlamak istiyorum." Bu motor o cümleden NİYETİ çıkarıyor.

  NEDEN KURAL MOTORU, AI DEĞİL:
    Sprint-4 boyunca kurduğumuz desen: kural motoru omurga, AI isteğe
    bağlı katman. Burada da aynısı ve nedenleri güçlü:

      • Deterministik — aynı cümle her zaman aynı niyeti verir.
        Kullanıcı "neden bu sefer başka şey anladı" demez.
      • Anahtar gerektirmez — ANTHROPIC_API_KEY yoksa da çalışır.
        Giriş ekranı ürünün ilk teması; AI'ye bağlı olmamalı.
      • Ücretsiz — her giriş cümlesi için kredi harcamak saçma olurdu.
      • Test edilebilir — 15+ niyetin hepsi doğrulanabiliyor.

    AI katmanı (Adım 2'de) yalnızca kural motoru KARARSIZ kaldığında
    devreye girecek.

  TÜRKÇE ÖZEL DURUM:
    Sondan eklemeli dil. "kanalım", "kanalımı", "kanalıma" hepsi
    "kanal" kökünden. Tam kelime eşleşmesi çok şey kaçırır, alt dize
    eşleşmesi yanlış eşleşir ("ev" → "cevap", TASK-05'te yaşadık).
    Çözüm: kelime BAŞI eşleşmesi — kök kelime başında geçmeli, ek
    alabilir.
*/

export const INTENT_VERSION = 1;

/* Türkçe harf katlama — 'KANAL' ile 'kanal' eşleşsin.
   TASK-05'teki genreFamily ile aynı sorun ve aynı çözüm. */
const FOLD = { 'ı':'i','İ':'i','ş':'s','Ş':'s','ğ':'g','Ğ':'g',
               'ü':'u','Ü':'u','ö':'o','Ö':'o','ç':'c','Ç':'c',
               'â':'a','Â':'a','î':'i','Î':'i','û':'u','Û':'u' };

export function fold(text) {
  return String(text || '')
    .replace(/[ıİşŞğĞüÜöÖçÇâÂîÎûÛ]/g, ch => FOLD[ch] || ch)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/* Terim metinde KELİME BAŞINDA geçiyor mu?
   "kanalim" içinde "kanal" ✓ (ek almış kök)
   "cevap"   içinde "ev"    ✗ (harften sonra)
   TASK-05'te countTermHits için kurduğum kuralın aynısı. */
export function hasTerm(folded, term) {
  const t = fold(term);
  if (!t) return false;
  let from = 0;
  while (true) {
    const i = folded.indexOf(t, from);
    if (i === -1) return false;
    const prev = i === 0 ? '' : folded[i - 1];
    if (i === 0 || !/[a-z0-9]/.test(prev)) return true;
    from = i + 1;
  }
}

function countTerms(folded, terms) {
  let n = 0;
  const hits = [];
  for (const t of terms || []) {
    if (hasTerm(folded, t)) { n++; hits.push(t); }
  }
  return { n, hits };
}

/*
  ---------- NİYET TANIMLARI ----------

  Her niyet:
    key         — kimlik
    label       — kullanıcıya görünen ad (TR/EN)
    must        — bu terimlerden en az biri geçmeli (yoksa aday değil)
    boost       — geçerse puan artar
    block       — geçerse bu niyet elenir (karışmayı önler)
    weight      — taban ağırlık; yakın adaylar arasında öncelik
    needsInput  — bu niyet ek girdi ister (link, dosya)

  BLOCK NEDEN GEREKLİ:
    "Youtube kanalımı analiz et" ile "Youtube kanalım için video
    hazırla" aynı kelimeleri paylaşıyor. Ayıran şey EYLEM: analiz mi
    üretim mi. block listesi bu ayrımı kuruyor.
*/

const CREATE = ['hazirla', 'olustur', 'uret', 'yap', 'cek', 'kur', 'yaz',
                'create', 'make', 'build', 'generate', 'produce'];
const ANALYZE = ['analiz', 'incele', 'degerlendir', 'bak', 'kontrol', 'tara',
                 'analyse', 'analyze', 'review', 'audit', 'check'];
const IMPROVE = ['gelistir', 'iyilestir', 'duzelt', 'guclendir', 'toparla',
                 'improve', 'enhance', 'fix', 'polish', 'optimize', 'optimiz'];

export const INTENTS = [
  /* ---- Üretim: platform odaklı ---- */
  {
    key: 'video.youtube',
    dimension: 'platform',
    label: { tr: 'YouTube videosu', en: 'YouTube video' },
    must: ['youtube', 'yt'],
    boost: [...CREATE, 'video', 'kanal', 'bolum', 'icerik'],
    block: [...ANALYZE, ...IMPROVE, 'shorts', 'short'],
    weight: 1.0
  },
  {
    key: 'video.shorts',
    dimension: 'platform',
    label: { tr: 'YouTube Shorts', en: 'YouTube Shorts' },
    must: ['shorts', 'short'],
    boost: [...CREATE, 'youtube', 'dikey', 'kisa'],
    block: [...ANALYZE],
    weight: 1.15   // 'shorts' çok belirgin bir sinyal
  },
  {
    key: 'video.reels',
    dimension: 'platform',
    label: { tr: 'Instagram Reels', en: 'Instagram Reels' },
    must: ['reels', 'reel', 'instagram', 'insta'],
    boost: [...CREATE, 'dikey', 'kisa'],
    block: [...ANALYZE],
    weight: 1.15
  },
  {
    key: 'video.tiktok',
    dimension: 'platform',
    label: { tr: 'TikTok videosu', en: 'TikTok video' },
    must: ['tiktok', 'tik tok'],
    boost: [...CREATE, 'dikey', 'kisa'],
    block: [...ANALYZE],
    weight: 1.15
  },

  /* ---- Üretim: tür odaklı ---- */
  {
    key: 'video.horror',
    dimension: 'genre',
    label: { tr: 'Korku videosu', en: 'Horror video' },
    must: ['korku', 'gerilim', 'urperti', 'horror', 'scary', 'creepy'],
    boost: [...CREATE, 'video', 'hikaye', 'gece', 'karanlik'],
    block: [...ANALYZE],
    weight: 1.2    // tür sinyali platformdan güçlü
  },
  {
    key: 'video.kids',
    dimension: 'genre',
    label: { tr: 'Çocuk hikâyesi', en: 'Children\'s story' },
    must: ['cocuk', 'masal', 'children', 'kids', 'fairy tale', 'bedtime'],
    boost: [...CREATE, 'hikaye', 'story', 'uyku'],
    block: [...ANALYZE],
    weight: 1.2
  },
  {
    key: 'video.documentary',
    dimension: 'genre',
    label: { tr: 'Belgesel', en: 'Documentary' },
    must: ['belgesel', 'documentary', 'docu'],
    boost: [...CREATE, 'tarih', 'bilim', 'doga', 'anlat'],
    block: [...ANALYZE],
    weight: 1.2
  },
  {
    /*
      EĞİTİM VİDEOSU — Sprint-6 TASK-02'de eklendi.

      Spec'in `education` niyeti. Akışı MEVCUT görevlerle kuruluyor:
      senaryo, storyboard, promptlar, görseller, ses, altyazı. Yeni
      görev türü gerekmiyor — bu yüzden `ready` işaretine ihtiyacı yok.

      `block` listesinde 'cocuk' var: "çocuklar için eğitici video"
      daha çok çocuk içeriği; o niyet daha uygun bir akış kuruyor.
    */
    key: 'video.education',
    dimension: 'genre',
    label: { tr: 'Eğitim videosu', en: 'Educational video' },
    must: ['egitim', 'ders', 'ogret', 'tutorial', 'nasil yapilir',
           'education', 'teach', 'lesson', 'course', 'kurs'],
    boost: [...CREATE, 'video', 'anlat'],
    block: [...ANALYZE, 'cocuk', 'korku', 'reklam'],
    weight: 0.9
  },
  {
    /*
      MARKA İÇERİĞİ — Sprint-6 TASK-02'de eklendi.

      Spec'in `branding` niyeti. Ticari akışa yakın ama ürün
      tanıtımından farklı: tek bir ürünü değil markanın kendisini
      anlatıyor.

      Creator Memory'deki marka kayıtları (TASK-03) burada işe
      yarayacak — renkler, slogan, yasak kelimeler. O bağlantı
      Sprint-6'nın ilerleyen tasklarında kurulacak.
    */
    key: 'ad.brand',
    dimension: 'commerce',
    label: { tr: 'Marka içeriği', en: 'Brand content' },
    must: ['marka', 'brand', 'kurumsal', 'sirket tanit', 'imaj',
           'branding', 'corporate'],
    boost: [...CREATE, 'video', 'tanit'],
    block: [...ANALYZE, 'urun tanit'],
    weight: 0.88
  },
  {
    key: 'video.story',
    dimension: 'genre',
    label: { tr: 'Hikâye videosu', en: 'Story video' },
    must: ['hikaye', 'story', 'masal anlat', 'anlati'],
    boost: [...CREATE, 'video'],
    block: [...ANALYZE, 'cocuk', 'korku', 'belgesel'],
    weight: 0.85   // genel; daha belirgin türler öne geçsin
  },
  {
    /*
      TABAN NİYET — "video hazırla" gibi tür/platform belirtmeyen istek.

      Spec kuralı: "Kullanıcı hiçbir zaman boş ekran görmesin."
      Tür de platform da söylenmemişse niyet tanınmadı deyip boş
      dönmek o kuralı çiğner. Bunun yerine genel video üretimi
      workflow'u kuruluyor ve arayüz eksik bilgiyi soruyor.

      Boyutu 'fallback' — EN DÜŞÜK öncelik. İlk sürümde 'genre'
      yazmıştım ve somut platform sinyalini bastırıyordu:
      "Youtube kanalım için video hazırla" → video.generic çıkıyordu,
      oysa kullanıcı YouTube dedi. Yer tutucu bir tür, gerçek bir
      sinyali yenmemeli.
    */
    key: 'video.generic',
    dimension: 'fallback',
    label: { tr: 'Video üretimi', en: 'Video production' },
    must: ['video', 'klip', 'film', 'icerik', 'clip'],
    boost: [...CREATE],
    block: [...ANALYZE, ...IMPROVE],
    weight: 0.5
  },

  /* ---- Ticari üretim ---- */
  {
    key: 'ad.product',
    dimension: 'commerce',
    label: { tr: 'Ürün tanıtım videosu', en: 'Product promo video' },
    must: ['reklam', 'tanitim', 'urun', 'satis', 'pazarlama',
           'ad ', 'advert', 'promo', 'product', 'commercial'],
    boost: [...CREATE, 'video', 'musteri', 'marka'],
    block: [...ANALYZE, 'etsy', 'shopify', 'amazon'],
    weight: 1.0
  },
  {
    key: 'ad.etsy',
    dimension: 'commerce',
    label: { tr: 'Etsy ürün tanıtımı', en: 'Etsy product promo' },
    must: ['etsy'],
    boost: [...CREATE, 'urun', 'magaza', 'tanitim', 'reklam'],
    block: [...ANALYZE],
    weight: 1.25,
    needsInput: 'link'
  },
  {
    key: 'ad.shopify',
    dimension: 'commerce',
    label: { tr: 'Shopify mağaza reklamı', en: 'Shopify store ad' },
    must: ['shopify'],
    boost: [...CREATE, 'magaza', 'urun', 'reklam'],
    block: [...ANALYZE],
    weight: 1.25,
    needsInput: 'link'
  },

  /* ---- Analiz ---- */
  {
    key: 'analyze.channel',
    dimension: 'action',
    label: { tr: 'Kanal analizi', en: 'Channel analysis' },
    must: ['kanal', 'channel'],
    boost: [...ANALYZE, 'youtube', 'abone', 'performans', 'buyu'],
    block: [...CREATE],
    weight: 1.1
  },
  {
    key: 'analyze.competitor',
    dimension: 'action',
    label: { tr: 'Rakip analizi', en: 'Competitor analysis' },
    must: ['rakip', 'rakib', 'competitor', 'rival'],
    boost: [...ANALYZE, 'kanal', 'karsilastir'],
    block: [],
    weight: 1.3
  },
  {
    key: 'analyze.site',
    dimension: 'action',
    label: { tr: 'Site analizi', en: 'Website analysis' },
    must: ['site', 'website', 'web sitesi', 'internet sitesi', 'sayfa'],
    boost: [...ANALYZE, 'link', 'url'],
    block: [...CREATE],
    weight: 1.1,
    needsInput: 'link'
  },

  /* ---- İyileştirme ---- */
  {
    key: 'improve.video',
    dimension: 'action',
    label: { tr: 'Videoyu geliştir', en: 'Improve this video' },
    must: [...IMPROVE, 'yeniden kur', 'rebuild'],
    boost: ['video', 'bu videomu', 'mevcut', 'yayinladigim', 'eski'],
    block: ['kanal', 'site', 'rakip'],
    weight: 1.15
  },
  {
    key: 'improve.health',
    dimension: 'action',
    label: { tr: 'Video sağlık kontrolü', en: 'Video health check' },
    must: ['saglik', 'health', 'sorun var mi', 'neyi yanlis', 'eksik ne'],
    boost: [...ANALYZE, 'video', 'puan'],
    block: [],
    weight: 1.2
  }
];

export const INTENT_KEYS = INTENTS.map(i => i.key);

/* ---------- Sınıflandırma ----------

   BOYUT AYRIMI — niyetler her zaman rakip değil.

   "Youtube kanalım için korku videosu hazırla" cümlesinde hem
   `video.youtube` hem `video.horror` eşleşiyor. İlk sürümde bunlar
   yarışıyordu ve youtube 5.0 – 4.8 ile kazanıyordu.

   Ama bunlar RAKİP DEĞİL: kullanıcı YouTube'da yayınlanacak bir
   KORKU videosu istiyor. Tür içeriği belirler, platform biçimi.
   Birini seçmek diğerini kaybetmek olur; workflow eksik kurulur.

   Dört boyut:
     action   — analiz / iyileştirme. Ayrı bir iş; varsa O kazanır.
     genre    — korku, çocuk, belgesel. Üretimde ASIL niyet.
     commerce — etsy, shopify, ürün reklamı. Kendi başına bir iş.
     platform — youtube, shorts, reels, tiktok. Üretimde DEĞİŞTİRİCİ.

   Öncelik: action > commerce > genre > platform
   Kazanan `intent`, aynı cümledeki diğer boyutlar `modifiers`.
*/
const DIMENSION_PRIORITY = {
  action: 4,      // analiz/iyileştirme — bambaşka bir iş
  commerce: 3,    // ticari üretim — kendi akışı var
  genre: 2,       // tür — üretimde asıl niyet
  platform: 1,    // platform — üretimde değiştirici
  fallback: 0     // hiçbir belirgin sinyal yoksa
};

export function classifyIntent(text, opts) {
  const raw = String(text || '').trim();
  const folded = fold(raw);

  const empty = {
    intent: null, confidence: 0, candidates: [], modifiers: {},
    ambiguous: false, text: raw, needsInput: null
  };
  if (!folded || folded.length < 3) return empty;

  const scored = [];
  for (const def of INTENTS) {
    const must = countTerms(folded, def.must);
    if (must.n === 0) continue;

    const blocked = countTerms(folded, def.block);
    if (blocked.n > 0) continue;

    const boost = countTerms(folded, def.boost);
    const score = (must.n * 2 + boost.n) * (def.weight || 1);

    scored.push({
      key: def.key,
      label: def.label,
      dimension: def.dimension,
      score: +score.toFixed(2),
      hits: [...must.hits, ...boost.hits],
      needsInput: def.needsInput || null
    });
  }

  if (!scored.length) return empty;

  /* Önce boyut önceliği, sonra puan. Aynı boyutta puan karar verir. */
  scored.sort((a, b) => {
    const d = (DIMENSION_PRIORITY[b.dimension] || 0) - (DIMENSION_PRIORITY[a.dimension] || 0);
    if (d) return d;
    return b.score - a.score;
  });

  const top = scored[0];

  /* Değiştiriciler: kazanandan FARKLI boyutlardaki en iyi adaylar.
     Workflow bunları kullanacak — örneğin platform 'shorts' ise
     dikey format ve kısa süre kuralları devreye girer. */
  const modifiers = {};
  for (const c of scored) {
    if (c.dimension === top.dimension) continue;
    /* fallback bir bilgi taşımıyor — "video" kelimesinin geçmesi
       değiştirici sayılmaz. Listede görünmesi gürültü olurdu. */
    if (c.dimension === 'fallback') continue;
    if (!modifiers[c.dimension]) modifiers[c.dimension] = c.key;
  }

  /* Kararsızlık AYNI BOYUT içinde ölçülür — farklı boyuttaki bir aday
     rakip değil, tamamlayıcı. */
  const sameDim = scored.filter(c => c.dimension === top.dimension);
  const second = sameDim[1];
  const separation = second ? (top.score - second.score) / top.score : 1;

  /*
    GÜVEN — gerçek bir şeyden türetiliyor (TASK-06 dersi).

      ayrışma  — aynı boyutta en iyi aday ikinciden ne kadar önde
      kanıt    — kaç terim eşleşti
      destek   — başka boyutlar da eşleşti mi? "Youtube için korku
                 videosu" iki boyutta eşleşiyor; tek boyutta eşleşen
                 cümleden daha net bir istek.

    Tavan 0.95: kural motoru "kesinlikle bu" diyemez.
  */
  const evidence = Math.min(1, top.hits.length / 4);
  const support = Math.min(1, Object.keys(modifiers).length / 2);
  const confidence = Math.min(0.95, Math.max(0.15,
    separation * 0.45 + evidence * 0.35 + support * 0.20));

  const ambiguous = !!second && separation < 0.2;

  return {
    intent: top.key,
    label: top.label,
    dimension: top.dimension,
    confidence: +confidence.toFixed(2),
    /* Değiştiriciler: { platform: 'video.youtube', genre: 'video.horror' } */
    modifiers,
    /* Aynı boyuttaki adaylar — kararsızlıkta arayüz seçenek sunacak */
    candidates: sameDim.slice(0, 3),
    ambiguous,
    matched: top.hits,
    needsInput: top.needsInput,
    text: raw,
    source: 'rules'
  };
}

/* Niyet tanımını anahtardan bul — arayüz ve workflow builder için. */
export function intentByKey(key) {
  return INTENTS.find(i => i.key === key) || null;
}

/* ---------- Hazır örnekler ----------
   Spec'in "Hazır Örnekler" bölümü. Giriş ekranında gösterilecek.
   Her örnek gerçekten tanınan bir niyete karşılık gelmeli — test
   bunu doğruluyor. Tanınmayan örnek göstermek kullanıcıyı yanıltır. */
export const EXAMPLE_PROMPTS = [
  { tr: 'YouTube kanalım için yeni korku videosu hazırlamak istiyorum',
    en: 'I want to make a new horror video for my YouTube channel' },
  { tr: 'Yeni Shorts üret',
    en: 'Create a new Shorts' },
  { tr: 'Ürünüm için reklam videosu hazırla',
    en: 'Make a promo video for my product' },
  { tr: 'Bu videomu geliştir',
    en: 'Improve this video of mine' },
  { tr: 'Yeni çocuk hikâyesi oluştur',
    en: 'Create a new children\'s story' },
  { tr: 'YouTube kanalımı analiz et',
    en: 'Analyse my YouTube channel' }
];
