import { intentByKey } from '@/lib/creator/intent';
import { dominant } from '@/lib/creator/memory';
import { suggestSceneCount } from '@/lib/storyboard';

/*
  AI ÜRETİM KARARLARI — R5.

  ---------------------------------------------------------------
  KULLANICI SÖYLEMEDİYSE AI KARAR VERİR

  Ürün ilkesi: kullanıcı ne istediğini söyler, teknik üretim
  parametrelerini AI belirler.

  Eskiden `/studio/senaryo` altı ayrı ayar soruyordu: tür, süre,
  dil, görsel stil, format, sahne sayısı. Altısının da cevabı
  sistemde ZATEN VARDI:

    format  ← niyet (video.shorts → 9:16)
    tür     ← niyet (video.horror → Korku)
    süre    ← kullanıcı metni ("3 dakikalık") ya da formatın doğası
    stil    ← hafıza (style.styles)
    dil     ← hafıza (channels[].language) ya da arayüz dili
    sahne   ← suggestSceneCount(süre)

  ---------------------------------------------------------------
  KULLANICI SÖYLEDİYSE ONA SAYGI

  "3 dakikalık çocuk masalı" → süre kullanıcıdan gelir, AI
  üzerine yazmaz. Metinden çıkarılan her değer `source: 'user'`
  işaretli.

  Bu ayrım önemli: arayüz "AI planı" gösterirken kullanıcının
  kendi söylediğini "AI kararı" diye sunmamalı.
  ---------------------------------------------------------------

  BU DOSYA UYDURMUYOR

  Bilinmeyen bir şey varsa varsayılan kullanıyor ve `source`
  alanında bunu söylüyor. Arayüz isterse "varsayılan" olanları
  ayrı gösterebilir.
*/

export const DECISION_VERSION = 1;

/* Niyet → format eşlemesi. FORMATS listesindeki gerçek
   anahtarlara dayanıyor (lib/storyboard.js). */
const INTENT_FORMAT = {
  'video.shorts': 'shorts',
  'video.tiktok': 'tiktok',
  'video.reels': 'reels',
  'video.youtube': 'youtube',
  'video.documentary': 'documentary',
  'video.podcast': 'podcast'
};

/* Niyet → tür. GENRES listesindeki Türkçe adlar. */
const INTENT_GENRE = {
  'video.horror': 'Korku',
  'video.scifi': 'Bilim Kurgu',
  'video.kids': 'Çocuk',
  'video.education': 'Eğitim',
  'story.tale': 'Masal'
};

/*
  Formatın doğal süresi (saniye).

  Shorts 60 saniyeden uzun olamaz — bu bir tercih değil, platform
  kuralı. YouTube videosu için 180 makul bir başlangıç.
*/
const FORMAT_SECONDS = {
  shorts: 45, tiktok: 45, reels: 45,
  youtube: 180, documentary: 300, podcast: 120, custom: 180
};

/* Formatın üst sınırı — kullanıcı daha uzun istese bile platform
   kabul etmez. */
const FORMAT_MAX = { shorts: 60, tiktok: 180, reels: 90 };

/*
  ---------- KULLANICI METNİNDEN FORMAT ----------

  Kullanıcı platformu açıkça söylediyse o kazanır. Niyet
  "reklam" olabilir ama platform "Reels" — ikisi çelişmiyor.
*/
const TEXT_FORMAT = [
  [/\breels?\b|instagram/i, 'reels'],
  [/\bshorts?\b/i, 'shorts'],
  [/\btiktok\b/i, 'tiktok'],
  [/\byoutube\b|\byt\b/i, 'youtube'],
  [/\bbelgesel\b|documentary/i, 'documentary'],
  [/\bpodcast\b/i, 'podcast']
];

export function formatFromText(text) {
  const s = String(text || '');
  /* Shorts ve YouTube birlikte geçerse Shorts kazanır — daha
     belirleyici. Liste sırası bunu sağlıyor. */
  for (const [re, key] of TEXT_FORMAT) if (re.test(s)) return key;
  return null;
}

/*
  ---------- KULLANICI METNİNDEN SÜRE ----------

  "3 dakikalık", "90 saniyelik", "2 dk" gibi ifadeler.

  Bulamazsa null döner — o zaman format varsayılanı devreye girer.
*/
export function durationFromText(text) {
  const s = String(text || '').toLowerCase();

  const min = s.match(/(\d+(?:[.,]\d+)?)\s*(?:dakika|dakikalık|dk|minute|min)\b/);
  if (min) {
    const n = parseFloat(min[1].replace(',', '.'));
    if (Number.isFinite(n) && n > 0 && n <= 60) return Math.round(n * 60);
  }

  const sec = s.match(/(\d+)\s*(?:saniye|saniyelik|sn|second|sec)\b/);
  if (sec) {
    const n = parseInt(sec[1], 10);
    if (Number.isFinite(n) && n >= 5 && n <= 3600) return n;
  }
  return null;
}

/*
  ---------- KULLANICI METNİNDEN ADET ----------

  "5 adet Shorts", "3 video" — kaç parça üretilecek.

  Bu, sahne sayısından FARKLI bir şey: kullanıcı 5 ayrı video
  istiyor olabilir.
*/
export function countFromText(text) {
  const s = String(text || '').toLowerCase();
  /* "5 adet YouTube Shorts" — sayı ile tür arasında kelime
     olabilir (marka, platform adı). En fazla 3 kelime atlıyoruz;
     daha fazlası ilgisiz cümleleri eşleştirmeye başlar. */
  const m = s.match(/(\d+)\s*(?:adet|tane|parça)?\s*(?:\w+\s+){0,3}?(?:video|shorts|short|reels|reel|klip)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return (Number.isFinite(n) && n >= 1 && n <= 20) ? n : null;
}

/*
  ---------- ANA KARAR FONKSİYONU ----------

  Girdi:
    intentKey — classifyIntent sonucu
    text      — kullanıcının yazdığı cümle
    memory    — Creator Memory
    locale    — arayüz dili

  Çıkış: her alan için { value, source }
    source: 'user' | 'intent' | 'memory' | 'default'
*/
export function decideProduction({ intentKey, text, memory, locale }) {
  const out = {};

  /*
    --- FORMAT ---

    Sıra: metin > niyet > hafıza > varsayılan.

    METİN NİYETTEN ÖNCE geliyor: "Instagram Reels için ürün
    tanıtımı" cümlesinde niyet `ad.product` çıkıyor (doğru — bu
    bir reklam) ama format Reels. Niyete bakıp durursak
    hafızadaki Shorts'u kullanırdık ve kullanıcının açıkça
    söylediğini yok sayardık.
  */
  const textFmt = formatFromText(text);
  const fmt = textFmt || INTENT_FORMAT[intentKey];
  if (fmt) out.format = { value: fmt, source: textFmt ? 'user' : 'intent' };
  else {
    /* Hafızada baskın format varsa onu kullan — kullanıcı
       genelde Shorts üretiyorsa varsayılan o olsun. */
    const memFmt = dominant(memory?.content?.formats);
    out.format = memFmt?.key
      ? { value: memFmt.key, source: 'memory' }
      : { value: 'youtube', source: 'default' };
  }

  /* --- SÜRE: kullanıcı metni > format doğası --- */
  const userSec = durationFromText(text);
  const fmtKey = out.format.value;
  if (userSec) {
    /*
      Platform sınırı kullanıcıyı da bağlıyor: Shorts 60 sn'den
      uzun olamaz — bu bir tercih değil, platform kuralı.

      AMA: format HAFIZADAN geldiyse sınır uygulanmıyor.
      "3 dakikalık masal" diyen kullanıcı Shorts istemedi; hafıza
      öyle tahmin etti. Kullanıcının açık isteği, sistemin
      tahminine feda edilmemeli — bu durumda formatı süreye
      uyduruyoruz.
    */
    const cap = FORMAT_MAX[fmtKey];
    const fmtFromGuess = out.format.source === 'memory' || out.format.source === 'default';

    if (cap && userSec > cap && fmtFromGuess) {
      /* Tahmini format kullanıcının süresine uymuyor → formatı bırak */
      out.format = { value: 'youtube', source: 'derived' };
      out.duration = { value: userSec, source: 'user' };
    } else if (cap && userSec > cap) {
      out.duration = { value: cap, source: 'limit', asked: userSec };
    } else {
      out.duration = { value: userSec, source: 'user' };
    }
  } else {
    out.duration = { value: FORMAT_SECONDS[fmtKey] ?? 180, source: 'intent' };
  }

  /* --- SAHNE SAYISI: süreden türetiliyor --- */
  out.scenes = {
    value: suggestSceneCount(out.duration.value),
    source: 'derived'
  };

  /* --- TÜR: niyetten, yoksa hafızadan --- */
  const genre = INTENT_GENRE[intentKey];
  if (genre) out.genre = { value: genre, source: 'intent' };
  else {
    const memGenre = dominant(memory?.content?.genres);
    out.genre = memGenre?.key
      ? { value: memGenre.key, source: 'memory' }
      : { value: 'Macera', source: 'default' };
  }

  /* --- GÖRSEL STİL: hafızadan --- */
  const memStyle = dominant(memory?.style?.styles);
  out.style = memStyle?.key
    ? { value: memStyle.key, source: 'memory' }
    : { value: 'Sinematik gerçekçi', source: 'default' };

  /* --- DİL: kanal kaydı > arayüz dili --- */
  const chLang = (memory?.channels || []).find(c => c?.language)?.language;
  out.language = chLang
    ? { value: chLang, source: 'memory' }
    : { value: locale === 'en' ? 'İngilizce' : 'Türkçe', source: 'default' };

  /* --- ADET: kaç parça üretilecek --- */
  const n = countFromText(text);
  if (n) out.pieces = { value: n, source: 'user' };

  return out;
}

/*
  ---------- ÖZET SATIRI ----------

  Arayüzde "AI planı: 8 sahne · 60 sn · 9:16 · Türkçe" göstermek
  için. Düzenlenebilir form değil, sadece bilgi.

  `aspect` FORMATS listesinden geliyor.
*/
const ASPECT = {
  youtube: '16:9', shorts: '9:16', tiktok: '9:16', reels: '9:16',
  documentary: '16:9', podcast: '1:1', custom: '16:9'
};

export function decisionSummary(d) {
  if (!d) return null;
  const parts = [];
  if (d.pieces) parts.push({ key: 'pieces', value: d.pieces.value, source: d.pieces.source });
  if (d.scenes) parts.push({ key: 'scenes', value: d.scenes.value, source: d.scenes.source });
  if (d.duration) parts.push({ key: 'duration', value: d.duration.value, source: d.duration.source });
  if (d.format) parts.push({ key: 'aspect', value: ASPECT[d.format.value] || '16:9', source: d.format.source });
  if (d.genre) parts.push({ key: 'genre', value: d.genre.value, source: d.genre.source });
  if (d.style) parts.push({ key: 'style', value: d.style.value, source: d.style.source });
  if (d.language) parts.push({ key: 'language', value: d.language.value, source: d.language.source });
  return parts;
}

/*
  ---------- STORYBOARD'A UYGULA ----------

  Kararları mevcut storyboard nesnesine yazıyor. Böylece
  `/studio/senaryo` ve sonraki adımlar hazır parametrelerle
  açılıyor — kullanıcıya tekrar sorulmuyor.

  MEVCUT DEĞERLERİ EZMİYOR: kullanıcı daha önce bir şey
  ayarladıysa (eski akıştan gelen proje) ona dokunmuyoruz.
*/
export function applyDecisions(storyboard, d, opts) {
  const sb = storyboard || {};
  const force = !!opts?.force;
  const next = { ...sb };

  const set = (field, val) => {
    if (force || next[field] === undefined || next[field] === null || next[field] === '')
      next[field] = val;
  };

  if (d.format) set('format', d.format.value);
  if (d.duration) set('duration', d.duration.value);
  if (d.genre) set('genre', d.genre.value);
  if (d.style) set('style', d.style.value);
  if (d.language) set('language', d.language.value);

  /* Sahne sayısı storyboard'da bir alan değil — üretim sırasında
     kullanılıyor. Planla birlikte taşınması için ayrı alan. */
  if (d.scenes) next.plannedScenes = d.scenes.value;

  return next;
}
