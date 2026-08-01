import { EXAMPLE_PROMPTS, INTENTS, intentByKey } from './intent';
import { dominant, LEARN } from './memory';

/*
  CREATOR WORKSPACE — kişiselleştirilmiş hızlı başlangıç.

  Sprint 5 / TASK-04, Adım 4.

  Spec: "Her kullanıcı aynı ekranı görmeyecek. YouTube üreticisi ile
  E-Ticaret kullanıcısı aynı Workspace'e sahip olmamalı."

  Adım 2'de Quick Actions sabit örnek listesiydi (EXAMPLE_PROMPTS).
  Bu dosya onu kullanıcıya göre kuruyor.

  ---------------------------------------------------------------
  CÜMLELER ÜRETİLİYOR, EZBERLENMİYOR

  Kullanıcının geçmiş cümlelerini saklayıp göstermek cazip. YAPMIYORUZ:

    • Creator Memory'nin yasağı bu (TASK-03): "kullanıcı konuşmalarını
      saklamaz". Quick Actions'ta göstermek o yasağı dolanmak olur.

    • Eski cümle bayatlar. "Korku videosu hazırla" dediği plan yarım
      kaldıysa aynı cümleyi tekrar önermek yardımcı değil.

  Bunun yerine hafızadaki TERCİHLERDEN (tür, format) yeni cümleler
  KURULUYOR. Sonuç aynı derecede kişisel ama hiçbir konuşma
  saklanmıyor.
  ---------------------------------------------------------------

  DENEYİM SEVİYESİ

  Yeni kullanıcı ile 50 video yapmış kullanıcı aynı öneriyi görmemeli:

    yeni      → basit, tek adımlı işler ("Yeni video hazırla")
    deneyimli → kendi türünde ("Yeni korku videosu hazırla") +
                analiz/iyileştirme işleri

  Seviye ÜRETİM SAYISINDAN çıkarılıyor — kullanıcıya sorulmuyor.
*/

export const QUICK_VERSION = 1;

/* Kaç hızlı işlem gösterilir. Spec: "Kullanıcı 20 seçenek arasında
   bırakılmamalıdır." Altı yeterli, fazlası menüye dönüşür. */
export const MAX_QUICK = 6;

/* Deneyim eşiği — kaç bölümden sonra "deneyimli" sayılıyor.
   LEARN.STRONG_SAMPLES ile aynı: hafıza o noktada güvenilir hale
   geliyor, öneriler de o zaman kişiselleşmeli. */
export const EXPERIENCED = LEARN.STRONG_SAMPLES;

/*
  Tür + platform → cümle şablonu.

  Metin BURADA değil: i18n anahtarı ve parça adları dönüyor, arayüz
  cümleyi kuruyor. Dil değişince öneriler de değişsin.
*/
const TEMPLATES = {
  'genre+platform': 'quick.genrePlatform',   // "YouTube için yeni korku videosu"
  'genre':          'quick.genre',           // "Yeni korku videosu hazırla"
  'platform':       'quick.platform',        // "Yeni Shorts üret"
  'improve':        'quick.improve',         // "Son videomu geliştir"
  'analyze':        'quick.analyze',         // "Kanalımı analiz et"
  'generic':        'quick.generic'          // "Yeni video hazırla"
};

/* Niyet anahtarından etiket — arayüz cümleyi kurarken kullanacak. */
function labelOf(key, locale) {
  const d = intentByKey(key);
  return d ? (d.label[locale] || d.label.tr) : null;
}

/*
  ---------- HIZLI İŞLEMLERİ KUR ----------

  Girdi: { memory, sessions, locale }
  Çıkış: [{ id, template, parts, intent }]

    template — i18n anahtarı
    parts    — şablona doldurulacak değerler
    intent   — bu işlem hangi niyete karşılık geliyor (test için)

  Hafıza yoksa EXAMPLE_PROMPTS'a düşüyoruz — Adım 2'deki davranış.
  Yeni kullanıcı boş ekran görmemeli.
*/
export function buildQuickActions({ memory, sessions, locale }) {
  const loc = locale || 'tr';
  const episodes = memory?.content?.samples || 0;
  const experienced = episodes >= EXPERIENCED;

  /* Hafıza yok ya da çok az veri → sabit örnekler.
     Uydurma kişiselleştirme yapmaktansa iyi bir varsayılan. */
  if (!memory || episodes < LEARN.MIN_SAMPLES) {
    return {
      items: EXAMPLE_PROMPTS.slice(0, MAX_QUICK).map((e, i) => ({
        id: 'ex' + i, template: null, text: e[loc] || e.tr, intent: null
      })),
      source: 'defaults',
      experienced: false
    };
  }

  const genre = dominant(memory.content?.genres);
  const format = dominant(memory.content?.formats);
  const items = [];

  /* 1. En güçlü sinyal: tür + platform birlikte */
  if (genre?.key && format?.key && genre.confidence >= 0.6) {
    items.push({
      id: 'gp',
      template: TEMPLATES['genre+platform'],
      parts: { genre: genre.key, platform: formatLabel(format.key, loc) },
      intent: genreIntent(genre.key)
    });
  }

  /* 2. Yalnızca tür */
  if (genre?.key) {
    items.push({
      id: 'g',
      template: TEMPLATES.genre,
      parts: { genre: genre.key },
      intent: genreIntent(genre.key)
    });
  }

  /* 3. İkinci sık kullanılan format — çeşitlilik için.
     Hep aynı iki öneriyi göstermek Workspace'i durağan yapar. */
  const formats = Object.entries(memory.content?.formats || {})
    .sort((a, b) => b[1] - a[1]);
  if (formats[1]) {
    items.push({
      id: 'p2',
      template: TEMPLATES.platform,
      parts: { platform: formatLabel(formats[1][0], loc) },
      intent: platformIntent(formats[1][0])
    });
  }

  /* 4. Deneyimliye analiz ve iyileştirme.

     Yeni kullanıcıya "kanalını analiz et" demek erken: analiz edecek
     bir geçmişi yok ve o akışın çoğu Sprint-6'da. */
  if (experienced) {
    items.push({
      id: 'imp', template: TEMPLATES.improve, parts: {},
      intent: 'improve.video'
    });
    if ((memory.channels || []).length > 0) {
      items.push({
        id: 'an', template: TEMPLATES.analyze, parts: {},
        intent: 'analyze.channel'
      });
    }
  }

  /* 5. Her zaman genel bir seçenek — kullanıcı başka bir şey
     yapmak isteyebilir ve hafıza onu kısıtlamamalı. */
  items.push({ id: 'gen', template: TEMPLATES.generic, parts: {}, intent: 'video.generic' });

  return {
    items: items.slice(0, MAX_QUICK),
    source: 'memory',
    experienced
  };
}

/* Format anahtarını okunur ada çevir — mevcut niyet etiketlerinden. */
function formatLabel(fmt, locale) {
  const map = {
    youtube: 'video.youtube', shorts: 'video.shorts',
    tiktok: 'video.tiktok', reels: 'video.reels'
  };
  return labelOf(map[fmt], locale) || fmt;
}

/* Tür adından niyet anahtarı — cümle tıklanınca doğru akış kurulsun. */
function genreIntent(genre) {
  const g = String(genre || '').toLowerCase();
  if (g.includes('korku') || g.includes('gerilim')) return 'video.horror';
  if (g.includes('çocuk') || g.includes('cocuk') || g.includes('masal')) return 'video.kids';
  if (g.includes('belgesel')) return 'video.documentary';
  return 'video.story';
}

function platformIntent(fmt) {
  return { youtube: 'video.youtube', shorts: 'video.shorts',
           tiktok: 'video.tiktok', reels: 'video.reels' }[fmt] || 'video.generic';
}

/*
  ---------- İLK EKRAN ----------

  Spec: "Workspace boş görünmeyecek."

  Yeni kullanıcı ile deneyimli kullanıcının ilk ekranı farklı olmalı:

    yeni       → ne yapabileceğini anlatan yönlendirme
    deneyimli  → doğrudan işe dönüş, açıklama yok

  Açıklama metnini deneyimli kullanıcıya her gün göstermek can
  sıkıcıdır; o zaten ne yapacağını biliyor.
*/
export function onboardingState({ memory, sessions }) {
  const episodes = memory?.content?.samples || 0;
  const plans = (sessions || []).length;

  if (plans === 0 && episodes === 0) {
    return { stage: 'first-time', showGuide: true };
  }
  if (episodes < LEARN.MIN_SAMPLES) {
    return { stage: 'learning', showGuide: true, episodes };
  }
  if (episodes < EXPERIENCED) {
    return { stage: 'regular', showGuide: false, episodes };
  }
  return { stage: 'experienced', showGuide: false, episodes };
}
