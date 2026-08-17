import { clampScore } from './model';

/*
  TEKNİK ÖLÇÜM — video dosyasından.

  ---------------------------------------------------------------
  NEDEN BU MODÜL VAR

  Sağlık motorunun 9 kategorisinin 7'si SENARYO METNİ gerektiriyor:
  hikâye, açılış, duygu, karakter, dünya, ses, tutundurma. Dış
  videoda metin olmadığı için kapsam %12'de kalıyordu ve genel puan
  hiç verilemiyordu.

  Kullanıcı haklıydı: "ölçülemedi" mesajı çıkmaz sokak.

  Ama çözüm eldeki 2 kategoriden puan uydurmak DEĞİL — video
  dosyasından GERÇEKTEN ölçülebilen yeni kategoriler eklemek.

  Buradaki üç kategori tamamen dosyadan geliyor:
    technical  — çözünürlük, süre, en-boy oranı tutarlılığı
    platform   — hedef platforma uygunluk
    audio      — ses var mı (kalitesi DEĞİL, o ölçülmüyor)
  ---------------------------------------------------------------

  UYDURMA YOK

  Ölçülemeyen bir şey için puan üretmiyorum. `known: false` dönen
  her alan arayüzde CTA'ya dönüşüyor: "şunu ekle, şu analiz açılır".
*/

export const TECH_VERSION = 1;

/*
  Platform kuralları — gerçek platform sınırları, tercih değil.

  `maxSec`: platformun kabul ettiği en uzun süre
  `aspect`: beklenen en-boy oranı
  `minH`:   altında kalite düşük görünen yükseklik
*/
export const PLATFORM_RULES = {
  shorts: { maxSec: 60, aspect: 9 / 16, minH: 1080, label: { tr: 'YouTube Shorts', en: 'YouTube Shorts' } },
  tiktok: { maxSec: 180, aspect: 9 / 16, minH: 1080, label: { tr: 'TikTok', en: 'TikTok' } },
  reels: { maxSec: 90, aspect: 9 / 16, minH: 1080, label: { tr: 'Instagram Reels', en: 'Instagram Reels' } },
  youtube: { maxSec: null, aspect: 16 / 9, minH: 1080, label: { tr: 'YouTube', en: 'YouTube' } },
  documentary: { maxSec: null, aspect: 16 / 9, minH: 1080, label: { tr: 'Belgesel', en: 'Documentary' } },
  podcast: { maxSec: null, aspect: 1, minH: 720, label: { tr: 'Podcast', en: 'Podcast' } }
};

/* En-boy oranından platform tahmini. Kullanıcı söylemediyse. */
/*
  En-boy oranı. `probeVideo` yalnızca width/height veriyor —
  `aspect` alanı yok. Burada türetiyoruz.

  BU BİR HATAYDI: eskiden `info.aspect` okunuyordu ve o alan hiç
  var olmadığı için guessPlatform HER ZAMAN null dönüyordu. Yani
  platform kategorisi hiç ölçülmüyordu.
*/
export function aspectOf(info) {
  const w = Number(info?.width), h = Number(info?.height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0) return null;
  return w / h;
}

export function guessPlatform(info) {
  const a = Number.isFinite(info?.aspect) ? info.aspect : aspectOf(info);
  if (!Number.isFinite(a)) return null;
  if (a < 0.75) return 'shorts';        // dikey
  if (a > 1.5) return 'youtube';        // yatay
  return 'podcast';                     // kare civarı
}

/*
  ---------- TEKNİK KALİTE ----------

  Çözünürlük ve süre tutarlılığı. Hepsi dosyadan.
*/
export function technicalScore(info) {
  if (!info || !Number.isFinite(info.duration)) {
    return { known: false, need: 'video' };
  }

  const issues = [];
  let score = 100;

  const h = Number(info.height) || 0;
  const w = Number(info.width) || 0;

  if (!h || !w) {
    /* Çözünürlük okunamadıysa teknik puan verilmiyor — uydurma
       yerine eksik bildirimi. */
    return { known: false, need: 'resolution' };
  }

  /* Çözünürlük: 1080 taban, 720 kabul edilebilir, altı düşük */
  if (h < 480) { score -= 45; issues.push('res-very-low'); }
  else if (h < 720) { score -= 28; issues.push('res-low'); }
  else if (h < 1080) { score -= 12; issues.push('res-sub-hd'); }

  /* Süre: 5 saniyeden kısa video "video" değil */
  if (info.duration < 5) { score -= 30; issues.push('too-short'); }
  else if (info.duration < 10) { score -= 10; issues.push('very-short'); }

  /* Dosya boyutu / süre oranı çok düşükse ağır sıkıştırma
     işareti. Bitrate'i doğrudan okuyamıyoruz ama bu oran
     gösterge. */
  if (info.size > 0 && info.duration > 0) {
    const kbps = (info.size * 8) / info.duration / 1000;
    if (kbps < 500) { score -= 20; issues.push('heavy-compression'); }
    else if (kbps < 1200) { score -= 8; issues.push('light-compression'); }
  }

  return {
    known: true,
    score: clampScore(score),
    issues,
    /* Ölçülemeyenler açıkça bildiriliyor — sessizce atlanmıyor */
    notMeasured: ['fps', 'bitrate', 'colorDepth']
  };
}

/*
  ---------- PLATFORM UYGUNLUĞU ----------

  `target` verilmezse en-boy oranından tahmin ediliyor; tahmin
  olduğu `guessed: true` ile bildiriliyor.
*/
export function platformScore(info, target) {
  /* aspect alanı yok — width/height'tan türetiliyor (aspectOf) */
  const aspect = Number.isFinite(info?.aspect) ? info.aspect : aspectOf(info);
  if (!info || !Number.isFinite(aspect)) {
    return { known: false, need: 'video' };
  }

  const guessed = !target;
  const key = target || guessPlatform(info);
  const rule = PLATFORM_RULES[key];
  if (!rule) return { known: false, need: 'platform' };

  const issues = [];
  let score = 100;

  /* En-boy oranı sapması: %10'a kadar tolerans (kenar kırpma) */
  const drift = Math.abs(aspect - rule.aspect) / rule.aspect;
  if (drift > 0.25) { score -= 40; issues.push('aspect-wrong'); }
  else if (drift > 0.10) { score -= 18; issues.push('aspect-off'); }

  /* Süre sınırı: platform kuralı, tercih değil */
  if (rule.maxSec && info.duration > rule.maxSec) {
    score -= 35; issues.push('too-long');
  }

  /* Çözünürlük platformun beklediğinin altında */
  if (rule.minH && Number(info.height) < rule.minH) {
    score -= 15; issues.push('below-platform-res');
  }

  return {
    known: true,
    score: clampScore(score),
    platform: key,
    platformLabel: rule.label,
    guessed,
    issues
  };
}

/*
  ---------- SES VARLIĞI ----------

  Kullanıcı kararı: "şimdilik ses var/yok yeterli".

  Ses KALİTESİ ölçülmüyor — seviye, gürültü, kırpılma yok.
  `notMeasured` bunu söylüyor; arayüz "ses kalitesi analizi için
  ..." diye CTA gösterebilir ama sahte puan vermiyor.
*/
export function audioScore(info) {
  const has = info?.hasAudio;
  if (has === undefined || has === null) {
    return { known: false, need: 'audio-probe' };
  }
  if (!has) {
    /* Sessiz video: bu bir ölçüm, eksik veri değil. Sesli
       platformlarda ciddi sorun. */
    return {
      known: true, score: 20, issues: ['no-audio'],
      notMeasured: ['loudness', 'clipping', 'noise']
    };
  }
  /*
    Ses var. Kalitesini bilmediğimiz için TAM PUAN VERMİYORUZ —
    "var" ile "iyi" farklı şeyler. 70: ses mevcut, kalitesi
    doğrulanmadı.
  */
  return {
    known: true, score: 70, issues: [],
    notMeasured: ['loudness', 'clipping', 'noise']
  };
}

/*
  ---------- HEPSİ BİRDEN ----------

  Girdi:  info (probeVideo çıktısı) · target (platform, isteğe bağlı)
  Çıkış:  { scores, issues, needs }

  `needs`: hangi veri eksik ve hangi analizi açacak. Arayüz bunu
  CTA'ya çeviriyor — "ölçülemedi" değil, "şunu ekle".
*/
export function measureTechnical(info, target) {
  const tech = technicalScore(info);
  const plat = platformScore(info, target);
  const audio = audioScore(info);

  const scores = {};
  const issues = [];
  const needs = [];

  if (tech.known) { scores.technical = tech.score; issues.push(...tech.issues.map(c => ({ cat: 'technical', code: c }))); }
  else needs.push({ cat: 'technical', need: tech.need });

  if (plat.known) {
    scores.platform = plat.score;
    issues.push(...plat.issues.map(c => ({ cat: 'platform', code: c })));
  } else needs.push({ cat: 'platform', need: plat.need });

  if (audio.known) { scores.audio = audio.score; issues.push(...audio.issues.map(c => ({ cat: 'audio', code: c }))); }
  else needs.push({ cat: 'audio', need: audio.need });

  return {
    scores,
    issues,
    needs,
    platform: plat.known ? { key: plat.platform, label: plat.platformLabel, guessed: plat.guessed } : null,
    notMeasured: [
      ...(tech.notMeasured || []),
      ...(audio.notMeasured || [])
    ]
  };
}

/*
  ---------- EKSİK VERİ = CTA, HATA DEĞİL ----------

  Kullanıcı kararı: "kullanıcı hiçbir zaman 'ölçülemedi' mesajıyla
  baş başa bırakılmasın. Eksik veri bir HATA değil, kullanıcıyı bir
  sonraki adıma götüren bir CTA olmalı."

  Bu fonksiyon "neyi ölçemedim" listesini "ne verirsen ne açılır"
  listesine çeviriyor.

  ---------------------------------------------------------------
  UYDURMUYORUZ

  Puan yalnızca GERÇEKTEN ölçülen kategorilerden çıkıyor. Eksik
  kategoriler puana 0 olarak GİRMİYOR — kapsam dışı kalıyorlar.

  Yani "Teknik 91 · Platform 88 · Görsel 84 · Ritim 22 · Ses 76"
  varsa puan bu beşinin ağırlıklı ortalaması. Senaryo eklenince
  yeniden hesaplanıyor ve puan DEĞİŞEBİLİR — bu dürüstlük.
  ---------------------------------------------------------------
*/

/* Hangi veri hangi kategorileri açıyor */
export const DATA_UNLOCKS = {
  script: {
    key: 'script',
    unlocks: ['hook', 'story', 'emotion', 'character', 'world', 'voice', 'retention'],
    route: '/studio/senaryo'
  },
  platform: {
    key: 'platform',
    unlocks: ['platform'],
    route: null            /* sayfada seçilir, başka yere gitmez */
  },
  audio: {
    key: 'audio',
    unlocks: ['audio'],
    route: null            /* videoyu sesli yükle */
  }
};

/*
  Eksik veriyi CTA'ya çevir.

  Girdi:
    scores  — ölçülen kategoriler { key: puan }
    info    — video üstverisi
    target  — seçilen platform (varsa)

  Çıkış: CTA listesi. Boş dizi = her şey ölçüldü.

  SIRA ÖNEMLİ: en çok kategori açan istek başta. Kullanıcı bir
  şey yapacaksa en verimli olanı yapsın.
*/
export function missingDataCTAs({ scores, info, target }) {
  const have = new Set(Object.keys(scores || {}));
  const out = [];

  /* Senaryo — 7 kategori açıyor, en değerli istek */
  const scriptMissing = DATA_UNLOCKS.script.unlocks.filter(k => !have.has(k));
  if (scriptMissing.length) {
    out.push({
      kind: 'script',
      unlocks: scriptMissing,
      count: scriptMissing.length,
      route: DATA_UNLOCKS.script.route
    });
  }

  /* Platform — kullanıcı hedefini söylemediyse tahmin ettik.
     Tahmin gerçek ölçüm değil; onaylatmak istiyoruz. */
  if (!target && info) {
    out.push({
      kind: 'platform',
      unlocks: ['platform'],
      count: 1,
      guessed: guessPlatform(info),
      route: null
    });
  }

  /* Ses — videoda ses yoksa kategori ölçülemedi */
  if (!have.has('audio') || info?.hasAudio === false) {
    out.push({ kind: 'audio', unlocks: ['audio'], count: 1, route: null });
  }

  return out.sort((a, b) => b.count - a.count);
}

/*
  ---------- PUAN NEYE DAYANIYOR ----------

  Kullanıcı kararı: "puanın neye dayandığı küçük yazıyla görünsün".

  Ölçülen kategori sayısı ve toplam ağırlık yüzdesi. Kullanıcı
  puanın ne kadar sağlam olduğunu görüyor.
*/
export function scoreBasis(scores, allCategories) {
  const measured = Object.keys(scores || {});
  const cats = allCategories || [];
  const weightSum = cats
    .filter(c => measured.includes(c.key))
    .reduce((a, c) => a + (c.weight || 0), 0);

  return {
    measured: measured.length,
    total: cats.length,
    weightPct: Math.round(weightSum * 100)
  };
}
