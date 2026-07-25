/*
  ANLATI SÖZLÜKLERİ — Story Health.

  Sprint 4 / TASK-05. Karakter gelişimi ve dünya kurma ölçümü için
  terim listeleri.

  NEDEN AYRI DOSYA:
    lib/prompt/vocab.js görsel prompt sözlüğüdür (kadraj, lens, üretici
    profilleri). Buradaki terimler ANLATI alanına ait: karar verme,
    öğrenme, mekân, atmosfer. İki alan karışmasın.

    Ortak olan tek liste EMOTION_TERMS — duygu hem prompt'ta hem
    hikâyede aynı şeyi ifade ediyor. Onu kopyalamıyoruz, prompt/vocab'dan
    içe alıyoruz. (lib/prompt/vocab.js zamanla ortak sözlük evine
    dönüştü; adı biraz yanıltıcı ama yeniden adlandırmanın maliyeti
    kazancından fazla — origin'deki üç modül ona bağlı.)

  ÖLÇÜM FELSEFESİ:
    Bu listeler "iyi hikâye" tanımı değil, hikâyede belirli anlatı
    hamlelerinin VAR OLUP OLMADIĞININ göstergesi. Karar veren bir
    karakter mutlaka iyi bir karakter değildir; ama hiç karar vermeyen
    karakter gelişmiyor demektir. Motor bunu ölçer, yargılamaz.
*/

/* ---------- Karar verme ----------
   Karakterin edilgen değil etken olduğunun göstergesi. */
export const DECISION_TERMS = [
  // Türkçe
  'karar verdi', 'karar verir', 'karar vermiş', 'seçti', 'seçer', 'seçmek zorunda',
  'vazgeçti', 'razı oldu', 'kabul etti', 'reddetti', 'söz verdi',
  'and içti', 'yemin etti', 'niyetlendi', 'kararlıydı', 'kararlaştırdı',
  'yola çıktı', 'geri döndü', 'peşine düştü', 'bırakmaya karar',

  // İngilizce
  'decided', 'decides', 'chose', 'chooses', 'choice', 'made up his mind',
  'made up her mind', 'resolved', 'vowed', 'promised', 'refused',
  'accepted', 'agreed', 'gave up', 'set out', 'turned back'
];

/* ---------- Öğrenme ve kavrayış ----------
   Karakter hikâye boyunca bir şey anlıyor mu? */
export const LEARNING_TERMS = [
  // Türkçe
  'anladı', 'anlar', 'anlamıştı', 'kavradı', 'fark etti', 'farkına vardı',
  'öğrendi', 'öğrenir', 'keşfetti', 'keşfeder', 'gördü ki', 'meğer',
  'aslında', 'demek ki', 'o anda anladı', 'gerçeği', 'sırrı çözdü',
  'artık biliyordu', 'idrak etti',

  // İngilizce
  'realized', 'realizes', 'understood', 'understands', 'learned', 'learns',
  'discovered', 'discovers', 'found out', 'came to know', 'the truth',
  'the secret', 'it turned out', 'suddenly knew', 'grasped'
];

/* ---------- Değişim ----------
   Karakterin başladığı yerden farklı bir yere gelmesi. */
export const CHANGE_TERMS = [
  // Türkçe
  'değişti', 'değişmişti', 'artık', 'bir daha', 'eskisi gibi değil',
  'ilk kez', 'ilk defa', 'artık korkmuyordu', 'başka biri',
  'dönüştü', 'büyüdü', 'olgunlaştı', 'güçlendi', 'affetti',
  'vazgeçmedi', 'cesaret buldu', 'öğrendiğiyle',

  // İngilizce
  'changed', 'no longer', 'never again', 'for the first time',
  'became', 'transformed', 'grew', 'matured', 'forgave',
  'found courage', 'stronger than', 'different person'
];

/* ---------- Çatışma ----------
   Hikâyenin motoru. Yokluğu düz anlatı demektir. */
export const CONFLICT_TERMS = [
  // Türkçe
  'ama', 'fakat', 'ancak', 'oysa', 'ne yazık ki', 'birden',
  'aniden', 'tam o sırada', 'beklenmedik', 'sorun', 'tehlike',
  'engel', 'kaybetti', 'başaramadı', 'yetişemedi', 'çok geçti',
  'karşı koydu', 'savaştı', 'kaçtı', 'saklandı', 'yakalandı',
  'tehdit', 'korktu', 'yalnız kaldı',

  // İngilizce
  'but', 'however', 'unfortunately', 'suddenly', 'just then',
  'unexpected', 'problem', 'danger', 'obstacle', 'failed',
  'too late', 'fought', 'escaped', 'hid', 'caught', 'threat',
  'trapped', 'lost', 'alone'
];

/* ---------- Çözüm ----------
   Kapanışın gerçekten kapanıp kapanmadığı. */
export const RESOLUTION_TERMS = [
  // Türkçe
  'sonunda', 'nihayet', 'böylece', 'artık huzurla', 'mutlu',
  'kurtardı', 'kurtuldu', 'başardı', 'buldu', 'kavuştu',
  'affetti', 'barıştı', 'eve döndü', 'her şey yerine oturdu',
  'o günden sonra', 'bir daha asla',

  // İngilizce
  'finally', 'at last', 'in the end', 'saved', 'rescued',
  'succeeded', 'found', 'reunited', 'made peace', 'went home',
  'from that day', 'happily', 'peace'
];

/* ---------- Mekân ----------
   Dünya kurmanın omurgası: hikâye nerede geçiyor? */
export const LOCATION_TERMS = [
  // Doğa
  'orman', 'dağ', 'deniz', 'göl', 'nehir', 'çöl', 'vadi', 'mağara',
  'ada', 'kıyı', 'tepe', 'ova', 'bahçe', 'tarla', 'kayalık',
  'forest', 'mountain', 'sea', 'ocean', 'lake', 'river', 'desert',
  'valley', 'cave', 'island', 'shore', 'hill', 'garden', 'field', 'cliff',

  // Yerleşim
  'şehir', 'kasaba', 'köy', 'sokak', 'meydan', 'pazar', 'liman',
  'city', 'town', 'village', 'street', 'square', 'market', 'harbor',

  // Yapı
  'ev', 'oda', 'mutfak', 'salon', 'kule', 'kale', 'saray', 'tapınak',
  'kütüphane', 'okul', 'han', 'köprü', 'kapı', 'merdiven', 'çatı',
  'mahzen', 'tavan arası', 'atölye', 'dükkân',
  'house', 'room', 'kitchen', 'hall', 'tower', 'castle', 'palace',
  'temple', 'library', 'school', 'inn', 'bridge', 'cellar', 'attic',
  'workshop', 'shop',

  // Araç / uzay
  'gemi', 'tren', 'uçak', 'araba', 'kayık', 'uzay gemisi', 'istasyon',
  'ship', 'train', 'plane', 'car', 'boat', 'spaceship', 'station'
];

/* ---------- Atmosfer ----------
   Mekânı hissedilir kılan katman. */
export const ATMOSPHERE_TERMS = [
  // Türkçe
  'sis', 'yağmur', 'kar', 'rüzgâr', 'fırtına', 'gökgürültüsü',
  'sessizlik', 'gürültü', 'karanlık', 'aydınlık', 'gölge', 'ışık',
  'soğuk', 'sıcak', 'nemli', 'kuru', 'toz', 'duman', 'koku',
  'şafak', 'alacakaranlık', 'gece yarısı', 'öğle', 'mevsim',
  'kalabalık', 'ıssız', 'terk edilmiş',

  // İngilizce
  'fog', 'mist', 'rain', 'snow', 'wind', 'storm', 'thunder',
  'silence', 'noise', 'darkness', 'shadow', 'light',
  'cold', 'warm', 'humid', 'dry', 'dust', 'smoke', 'scent', 'smell',
  'dawn', 'twilight', 'midnight', 'noon', 'season',
  'crowded', 'deserted', 'abandoned'
];

/* ---------- Nesne ----------
   Hikâyede iş gören şeyler. */
export const OBJECT_TERMS = [
  // Türkçe
  'mektup', 'kitap', 'harita', 'anahtar', 'kutu', 'sandık', 'yüzük',
  'kolye', 'ayna', 'mum', 'fener', 'kılıç', 'yay', 'kalkan',
  'çanta', 'ip', 'bıçak', 'saat', 'fotoğraf', 'defter', 'kalem',
  'kristal', 'taş', 'madalyon', 'asa', 'şişe', 'kadeh',

  // İngilizce
  'letter', 'book', 'map', 'key', 'box', 'chest', 'ring',
  'necklace', 'mirror', 'candle', 'lantern', 'sword', 'bow', 'shield',
  'bag', 'rope', 'knife', 'clock', 'photograph', 'notebook', 'pen',
  'crystal', 'stone', 'medallion', 'staff', 'bottle', 'cup'
];

/* ---------- Alan terimleri ----------
   Türe özgü dünya zenginliği: büyü, teknoloji, tarih. */
export const DOMAIN_TERMS = {
  magic: [
    'büyü', 'büyücü', 'tılsım', 'sihir', 'sihirli', 'iksir', 'lanet',
    'kehanet', 'peri', 'ejder', 'canlandı', 'uçtu', 'görünmez',
    'magic', 'magical', 'wizard', 'witch', 'spell', 'potion', 'curse',
    'prophecy', 'fairy', 'dragon', 'enchanted', 'invisible'
  ],
  tech: [
    'robot', 'makine', 'motor', 'ekran', 'devre', 'yapay zekâ',
    'uydu', 'lazer', 'kod', 'veri', 'sinyal', 'reaktör', 'hologram',
    'robot', 'machine', 'engine', 'screen', 'circuit', 'artificial intelligence',
    'satellite', 'laser', 'code', 'data', 'signal', 'reactor', 'hologram'
  ],
  history: [
    'kral', 'kraliçe', 'prens', 'prenses', 'şövalye', 'imparator',
    'yüzyıl', 'antik', 'kadim', 'efsane', 'tarih', 'savaş', 'kabile',
    'king', 'queen', 'prince', 'princess', 'knight', 'emperor',
    'century', 'ancient', 'legend', 'history', 'war', 'tribe'
  ],
  nature: [
    'ağaç', 'çiçek', 'kuş', 'kelebek', 'kurt', 'tavşan', 'geyik',
    'yaprak', 'kök', 'tohum', 'arı', 'balık', 'at',
    'tree', 'flower', 'bird', 'butterfly', 'wolf', 'rabbit', 'deer',
    'leaf', 'root', 'seed', 'bee', 'fish', 'horse'
  ]
};

/* ---------- Duyusal ayrıntı ----------
   Görsel dışı duyular anlatıyı somutlaştırır. */
export const SENSORY_TERMS = [
  'koku', 'kokuyordu', 'tat', 'tadı', 'ses', 'sesi', 'dokunuş',
  'sıcaklık', 'yumuşak', 'pürüzlü', 'ıslak', 'ağır', 'hafif',
  'tatlı', 'ekşi', 'acı', 'tuzlu', 'çıtırtı', 'uğultu', 'fısıltı',
  'smell', 'scent', 'taste', 'sound', 'touch', 'texture',
  'soft', 'rough', 'wet', 'heavy', 'light', 'sweet', 'sour',
  'bitter', 'salty', 'crackle', 'hum', 'whisper'
];

/* ---------- Duygu değerliği (valence) ----------

   Duygu eğrisi için duyguları yön olarak ayırmak gerekiyor. EMOTION_TERMS
   (prompt/vocab) düz bir liste — "mutlu" ile "korkmuş" aynı kovada.
   Eğri çizmek için yön şart: hikâye yukarı mı gidiyor, aşağı mı?

   Üç kova:
     POSITIVE  — rahatlama, sevinç, umut (eğri yukarı)
     NEGATIVE  — keder, öfke, yalnızlık (eğri aşağı)
     TENSION   — korku, gerilim, merak (aşağı ama FARKLI: gerilim
                 hikâyeyi ileri iter, keder durdurur. Doruk noktası
                 gerilimle ölçülür, kederle değil.)

   Bir terim iki kovada olmamalı; test bunu doğruluyor. */
export const POSITIVE_EMOTIONS = [
  'mutlu', 'sevinçli', 'neşeli', 'huzurlu', 'sakin', 'rahat', 'umutlu',
  'kararlı', 'gururlu', 'cesur', 'güvenli', 'şükran', 'minnettar',
  'heyecanlı', 'coşkulu', 'sevgi', 'şefkat', 'gülümsedi', 'güldü',
  'rahatladı', 'kavuştu', 'başardı', 'kurtuldu',
  'happy', 'joyful', 'cheerful', 'peaceful', 'serene', 'calm', 'relieved',
  'hopeful', 'determined', 'proud', 'brave', 'confident', 'grateful',
  'excited', 'triumphant', 'victorious', 'inspired', 'uplifting',
  'tender', 'smiled', 'laughed', 'relief'
];

export const NEGATIVE_EMOTIONS = [
  'üzgün', 'kederli', 'hüzünlü', 'melankolik', 'yalnız', 'ıssız',
  'öfkeli', 'kızgın', 'sinirli', 'kırgın', 'pişman', 'utandı',
  'çaresiz', 'umutsuz', 'yorgun', 'bitkin', 'ağladı', 'gözleri doldu',
  'kaybetti', 'başaramadı', 'nostalji', 'özledi',
  'sad', 'sorrowful', 'melancholy', 'melancholic', 'lonely', 'lonesome',
  'angry', 'furious', 'enraged', 'frustrated', 'regret', 'ashamed',
  'helpless', 'hopeless', 'weary', 'exhausted', 'cried', 'wept',
  'grief', 'nostalgic', 'wistful', 'lost'
];

export const TENSION_EMOTIONS = [
  'korktu', 'korkmuş', 'korku', 'ürktü', 'dehşet', 'panik',
  'endişeli', 'kaygılı', 'gergin', 'tedirgin', 'huzursuz',
  'şaşkın', 'şaşırdı', 'irkildi', 'meraklı', 'merak',
  'gizemli', 'esrarengiz', 'tehlike', 'tehdit', 'kuşku',
  'fear', 'scared', 'terrified', 'afraid', 'dread', 'panic',
  'anxious', 'nervous', 'worried', 'uneasy', 'tense', 'tension',
  'suspenseful', 'ominous', 'foreboding', 'surprised', 'shocked',
  'stunned', 'curious', 'curiosity', 'mysterious', 'mystery',
  'eerie', 'haunting', 'danger', 'threat', 'suspicion'
];

/* ---------- Anlatı evreleri ----------

   Spec'in "Story Timeline" bölümü: Hook → Adventure → Conflict →
   Climax → Resolution → Ending.

   TASK-04'ün SCENE_TYPES'ı İLE KARIŞTIRILMAMALI:
     SCENE_TYPES  = kurgu işlevi. "Bu bir aksiyon sahnesi" → nasıl kesilecek.
     NARRATIVE_PHASES = anlatı evresi. "Bu doruk noktası" → arkta nerede.

   Aynı sahne hem 'action' (kurgu) hem 'climax' (anlatı) olabilir; ikisi
   farklı eksen. Birleştirmek ikisini de bozardı.

   idealShare: hikâyenin yüzde kaçını kaplaması beklenir (kabaca). */
export const NARRATIVE_PHASES = {
  hook:       { key: 'hook',       order: 0, idealShare: [0.05, 0.15], label: { tr: 'Kanca',    en: 'Hook' } },
  setup:      { key: 'setup',      order: 1, idealShare: [0.10, 0.30], label: { tr: 'Kurulum',  en: 'Setup' } },
  rising:     { key: 'rising',     order: 2, idealShare: [0.20, 0.40], label: { tr: 'Gelişme',  en: 'Rising' } },
  conflict:   { key: 'conflict',   order: 3, idealShare: [0.15, 0.35], label: { tr: 'Çatışma',  en: 'Conflict' } },
  climax:     { key: 'climax',     order: 4, idealShare: [0.05, 0.20], label: { tr: 'Doruk',    en: 'Climax' } },
  resolution: { key: 'resolution', order: 5, idealShare: [0.10, 0.25], label: { tr: 'Çözüm',    en: 'Resolution' } }
};

export const PHASE_KEYS = Object.keys(NARRATIVE_PHASES);

/* ---------- Tür farkındalığı (TASK-05, Adım 3) ----------

   Spec farklı türlerin farklı ölçütlerle değerlendirilmesini istiyor.
   Uygulamada 38 tür var (lib/storyboard.js GENRES); her biri için ayrı
   profil yazmak sürdürülemez ve gereksiz — "Korku" ile "Gerilim" aynı
   değerlendirme mantığını paylaşıyor.

   Bu yüzden türler ANLATI AİLELERİNE gruplanıyor. Aile, kuralların
   nasıl uygulanacağını belirler.

   NEDEN AĞIRLIK DEĞİŞTİRMİYORUM:
     Türe göre kategori ağırlığı değiştirmek puanları karşılaştırılamaz
     kılar — kullanıcı korku videosunda 90, çocuk videosunda 85 görür ve
     aynı ölçekte sanır. Onun yerine:
       skipCategories — o türde geçersiz kategori ÖLÇÜLMEZ (mevcut
                        "ölçülemeyen kategori ağırlıktan düşülür"
                        mekanizması kullanılır, kapsam raporlanır)
       suppress       — o türde YANLIŞ olan uyarı verilmez
       elevate        — o türde DAHA CİDDİ olan uyarının seviyesi yükselir
     Böylece puan ölçeği sabit kalır, yalnızca neyin kusur sayıldığı değişir.
*/

export const GENRE_FAMILIES = {
  /* Karanlık anlatı: gerilim beklenir, kapanış muğlak kalabilir. */
  dark: {
    key: 'dark',
    label: { tr: 'Karanlık anlatı', en: 'Dark narrative' },
    genres: ['korku', 'gerilim', 'suç', 'dedektif', 'gizem'],
    skipCategories: [],
    /* Baştan sona karanlık olmak korku türünde kusur değil, tür gereği.
       Muğlak kapanış da meşru bir tercih. */
    suppress: ['emo-relentless', 'story-unresolved'],
    elevate: [],
    expectResolution: false,
    expectPositiveEnding: false
  },

  /* Çocuk anlatısı: çözüm ZORUNLU, kapanış olumlu olmalı. */
  children: {
    key: 'children',
    label: { tr: 'Çocuk anlatısı', en: 'Children' },
    genres: ['çocuk', 'masal'],
    skipCategories: [],
    suppress: [],
    /* Çocuk hikâyesinde çözümsüz kapanış ciddi bir sorundur. */
    elevate: ['story-unresolved', 'emo-relentless'],
    expectResolution: true,
    expectPositiveEnding: true
  },

  /* Bilgi anlatısı: karakter arkı ve dramatik çatışma aranmaz.
     Yapı bilgi akışıdır, dramatik yay değil. */
  factual: {
    key: 'factual',
    label: { tr: 'Bilgi anlatısı', en: 'Factual' },
    genres: ['belgesel', 'eğitim', 'haber', 'film özeti', 'kitap özeti',
             'teknoloji', 'finans', 'iş dünyası', 'sağlık', 'yapay zekâ'],
    /* Karakter gelişimi bir belgeselde beklenmez; ölçmeye kalkmak
       haksız ceza olur. Dünya kurma da kurgu ölçütü. */
    skipCategories: ['character', 'world'],
    suppress: ['story-noconflict', 'story-unresolved', 'emo-nostakes',
               'char-static', 'char-passive', 'world-nowhere', 'world-bare'],
    elevate: [],
    expectResolution: false,
    expectPositiveEnding: false
  },

  /* Komedi: gerilim düşük, olumlu ton beklenir. */
  comedy: {
    key: 'comedy',
    label: { tr: 'Komedi', en: 'Comedy' },
    genres: ['komedi'],
    skipCategories: [],
    suppress: ['emo-nostakes', 'story-noconflict'],
    elevate: [],
    expectResolution: true,
    expectPositiveEnding: true
  },

  /* Duygusal anlatı: çatışma içseldir, gerilim düşük olabilir.
     Karakter arkı en önemli boyut. */
  emotional: {
    key: 'emotional',
    label: { tr: 'Duygusal anlatı', en: 'Emotional' },
    genres: ['dram', 'romantik', 'motivasyon'],
    skipCategories: [],
    /* İçsel çatışma sözcük düzeyinde görünmeyebilir; ceza vermek yerine
       karakter arkına bakılır. */
    suppress: ['story-noconflict'],
    elevate: ['char-static'],
    expectResolution: true,
    expectPositiveEnding: false
  },

  /* Kısa form: kanca her şeydir, ark beklenmez. */
  shortform: {
    key: 'shortform',
    label: { tr: 'Kısa form', en: 'Short form' },
    genres: ['tiktok', 'instagram reel'],
    skipCategories: ['character'],
    suppress: ['story-noconflict', 'story-unresolved', 'char-static',
               'char-tooshort', 'story-thin'],
    elevate: ['hook-flat', 'hook-long', 'hook-empty'],
    expectResolution: false,
    expectPositiveEnding: false
  },

  /* Yaşam tarzı / gündelik içerik: gevşek yapı, ark aranmaz. */
  lifestyle: {
    key: 'lifestyle',
    label: { tr: 'Yaşam içeriği', en: 'Lifestyle' },
    genres: ['gezi', 'yemek', 'spor', 'müzik', 'hayvanlar', 'podcast',
             'youtube video'],
    skipCategories: ['character'],
    suppress: ['story-noconflict', 'story-unresolved', 'char-static',
               'char-passive', 'emo-nostakes'],
    elevate: [],
    expectResolution: false,
    expectPositiveEnding: false
  },

  /* Varsayılan: tam dramatik yapı beklenir. */
  drama: {
    key: 'drama',
    label: { tr: 'Kurgu anlatı', en: 'Fiction' },
    genres: ['macera', 'fantastik', 'bilim kurgu', 'anime', 'uzay',
             'cyberpunk', 'mitoloji', 'tarih'],
    skipCategories: [],
    suppress: [],
    elevate: [],
    expectResolution: true,
    expectPositiveEnding: false
  }
};

export const FAMILY_KEYS = Object.keys(GENRE_FAMILIES);

/* Türkçe harf katlama — tür etiketleri kullanıcıya dönük biçimde
   ('Çocuk', 'İş Dünyası') ama eşleştirme ASCII üzerinden yapılmalı.
   Aksi halde 'ÇOCUK' ile 'Çocuk' eşleşmez. */
const FOLD = { 'ı':'i','İ':'i','ş':'s','Ş':'s','ğ':'g','Ğ':'g',
               'ü':'u','Ü':'u','ö':'o','Ö':'o','ç':'c','Ç':'c',
               'â':'a','Â':'a','î':'i','Î':'i','û':'u','Û':'u' };

function foldGenre(label) {
  return String(label || '').trim()
    .replace(/[ıİşŞğĞüÜöÖçÇâÂîÎûÛ]/g, ch => FOLD[ch] || ch)
    .toLowerCase();
}

/* Tür etiketi → aile. Eşleştirme haritası bir kez kurulur.

   Eşlenmeyen tür 'drama' (varsayılan) sayılır: bilmediğimiz bir türde
   en güvenli davranış tam dramatik yapı beklemek. Kural bastırmak
   yanlış olurdu — kullanıcı uyarı almazsa sorunu hiç göremez. */
const GENRE_TO_FAMILY = (() => {
  const map = {};
  for (const fam of Object.values(GENRE_FAMILIES)) {
    for (const g of fam.genres) map[foldGenre(g)] = fam.key;
  }
  return map;
})();

export function genreFamily(genreLabel) {
  const key = GENRE_TO_FAMILY[foldGenre(genreLabel)];
  return key ? GENRE_FAMILIES[key] : GENRE_FAMILIES.drama;
}

/* ---------- Tutundurma tahmini eşikleri ----------

   DÜRÜSTLÜK NOTU: bu bir YAPISAL TAHMİN, izleyici verisi değil.
   Elimizde gerçek izlenme istatistiği yok. Motor yalnızca yapıdan
   çıkan riski hesaplıyor. Arayüz bunu "tahmin" olarak sunacak ve
   kesin yüzde iddiası etmeyecek.

   Zaman dilimleri spec'ten (0-30sn, 30-60sn, 1-3dk, 3-10dk).
   Taban düşüş eğrisi kısa video platformlarının bilinen davranışını
   yansıtır: ilk saniyelerde dik düşüş, sonra yatay seyir. */
export const RETENTION = {
  BUCKETS: [
    { from: 0,   to: 30,  baseKeep: 0.80 },
    { from: 30,  to: 60,  baseKeep: 0.92 },
    { from: 60,  to: 180, baseKeep: 0.90 },
    { from: 180, to: 600, baseKeep: 0.88 },
    { from: 600, to: Infinity, baseKeep: 0.85 }
  ],
  HOOK_WEIGHT: 0.25,        // açılış puanının ilk dilime etkisi
  LONG_SCENE_PENALTY: 0.04, // dilim içindeki her uzun sahne için
  FLAT_CURVE_PENALTY: 0.05, // düz duygu eğrisi için
  MIN_KEEP: 0.35            // tahmin bunun altına inmez (anlamsız olur)
};

/* ---------- Eşikler ---------- */
export const STORY = {
  // Karakter: 100 kelimede beklenen en az gelişim sinyali
  CHAR_SIGNAL_PER_100: 0.8,
  CHAR_MIN_SIGNALS: 2,          // hikâye boyunca en az bu kadar sinyal

  // Dünya: 100 kelimede beklenen en az farklı dünya öğesi
  WORLD_ELEMENT_PER_100: 1.5,
  WORLD_MIN_LOCATIONS: 1,
  WORLD_MIN_ELEMENTS: 3,

  /*
    Ölçülebilirlik eşikleri — karakter ve dünya AYRI.

    KARAKTER: iki yoldan ölçülebilir hale gelir.
      (a) 45+ kelime — metin tek başına yeterli
      (b) 3+ sahne ve 25+ kelime — yazar vuruşları kendisi ayırmış

    Neden iki yol: kelime sayısı dile bağlıdır. Türkçe sondan eklemeli,
    aynı ark İngilizce'nin üçte iki kelimesiyle kurulur. Tek eşik ya
    Türkçe'de erken kapanır ya İngilizce'de gürültü üretir. Sahne sayısı
    dilden bağımsız bir yapı sinyali — birlikte kullanılınca ikisi de
    doğru davranır.

    DÜNYA (25 kelime): dünya kurma uzunluk istemez. "Ormanda yürüdü,
    sis vardı" dört kelimede hem mekânı hem atmosferi veriyor. İki
    kategoriye aynı eşiği koymak, kısa videolarda dünya ölçümünü
    gereksiz yere kapatırdı.
  */
  ARC_MIN_WORDS: 45,               // yapısız metinde karakter için alt sınır
  ARC_MIN_SCENES: 3,               // ark için en az vuruş sayısı
  ARC_MIN_WORDS_STRUCTURED: 25,    // 3+ sahne varsa yeterli kelime
  WORLD_MIN_WORDS: 25,             // dünya kurma için alt sınır

  /* Dramatik yapı ve duygu eğrisi (Adım 2) */
  STRUCT_MIN_SCENES: 3,            // altında yapı analizi anlamsız
  CURVE_FLAT_RANGE: 0.25,          // eğri genliği bunun altındaysa düz
  CLIMAX_MIN_POS: 0.45,            // doruk hikâyenin bu oranından önce olmamalı
  CLIMAX_MAX_POS: 0.95,            // ve bundan sonra da olmamalı (çözüme yer kalsın)
  CONFLICT_MIN_SCENES: 1           // en az bir sahnede çatışma olmalı
};
