/*
  SAHNE SÜRESİ — kullanıcının üç kuralı.

  ---------------------------------------------------------------
  KULLANICI KARARI (2026-08)

    1. Sahne GÖRSELSE  → süre 5 saniye
    2. Sahne VİDEOYSA  → videonun kendi süresi
    3. Videonun kendi sesi varsa ve kullanıcı onu kullanmak
       isterse → o sahnede seslendirme GEREKMEZ

  Bu, sistemin yönünü tersine çeviriyor:

    ESKİDEN:  süre → sahne sayısı   (180 sn ÷ 7 = 26 sahne)
    ŞİMDİ:    sahne sayısı → süre   (26 sahne × 5 sn = 130 sn)

  Sahne sayısına AI karar veriyor (hikâyenin içeriğine göre);
  toplam süre sonuçta ortaya çıkıyor.
  ---------------------------------------------------------------

  BU DOSYA UYDURMUYOR

  Bir sahnenin videosu yoksa süresini bilemeyiz — o zaman görsel
  varsayımı (5 sn) geçerli. Video var ama süresi ölçülmemişse
  `known: false` dönüyor; arayüz "hesaplanıyor" diyebilir ama
  sahte bir sayı göstermez.
*/

export const SCENE_DURATION_VERSION = 1;

/*
  Görsel sahnenin süresi.

  5 saniye kullanıcının kararı. Kısa görsel dizisi hızlı ve
  izlenebilir; 7-8 saniye durağan bir görselde uzun geliyor.
*/
export const IMAGE_SCENE_SECONDS = 5;

/*
  Video sahnesinde süre sınırları.

  Ölçüm hatalarına karşı: 0.3 saniyeden kısa ya da 10 dakikadan
  uzun bir "sahne videosu" muhtemelen yanlış dosya.
*/
export const VIDEO_MIN = 0.3;
export const VIDEO_MAX = 600;

/*
  ---------- BİR SAHNENİN SÜRESİ ----------

  Çıkış: { seconds, source, known }

  source:
    'video'     — videonun ölçülmüş süresi
    'image'     — görsel varsayımı (5 sn)
    'voice'     — seslendirme ölçülmüş (video yok, ses uzun)
    'estimate'  — metinden tahmin (görsel sahnede ses metni uzunsa)
*/
export function sceneDuration(scene, opts) {
  const s = scene || {};
  const isVideo = s.media === 'video';

  /*
    ---- VİDEO SAHNESİ ----

    Videonun kendi süresi belirleyici. Kullanıcının kuralı:
    "sahneler video olarak verildiyse videonun süresi kadar
    olacak".
  */
  if (isVideo) {
    const vd = Number(s.videoDuration);
    if (Number.isFinite(vd) && vd >= VIDEO_MIN && vd <= VIDEO_MAX) {
      return { seconds: +vd.toFixed(2), source: 'video', known: true };
    }
    /*
      Video eklenmiş ama süresi ölçülmemiş. UYDURMUYORUZ —
      arayüz "ölçülüyor" diyecek, sahte sayı göstermeyecek.
    */
    return { seconds: 0, source: 'video', known: false };
  }

  /*
    ---- GÖRSEL SAHNESİ ----

    Varsayılan 5 saniye. AMA seslendirme daha uzunsa o kazanıyor:
    görsel 5 saniye kalıp ses 12 saniye sürerse video kırpılmış
    olur.

    Bu bir istisna değil, aynı kuralın devamı: sahne, içindeki en
    uzun şey kadar sürer.
  */
  const voiceSec = Number(s.voiceDuration);
  if (Number.isFinite(voiceSec) && voiceSec > IMAGE_SCENE_SECONDS) {
    return { seconds: +voiceSec.toFixed(2), source: 'voice', known: true };
  }

  /* Ses henüz üretilmemiş ama metin varsa tahmin — yalnızca
     5 saniyeyi aşarsa anlamlı */
  const est = Number(opts?.estimatedVoice);
  if (Number.isFinite(est) && est > IMAGE_SCENE_SECONDS) {
    return { seconds: +est.toFixed(2), source: 'estimate', known: true };
  }

  return { seconds: IMAGE_SCENE_SECONDS, source: 'image', known: true };
}

/*
  ---------- SESLENDİRME GEREKLİ Mİ ----------

  Kullanıcının üçüncü kuralı: "videonun kendi sesi varsa ve
  kullanıcı sahne videolarının sesini kullanmak isterse
  seslendirmeye gerek kalmayacak."

  ÜÇ KOŞUL BİRLİKTE:
    1. Sahne video
    2. Videoda ses var
    3. Kullanıcı o sesi kullanmak istiyor

  Üçüncüsü KULLANICININ KARARI — biz varsayamıyoruz. Videosu sesli
  diye seslendirmeyi kendi başımıza kapatmak, kullanıcının
  anlatım eklemek istediği bir sahneyi sessiz bırakmak olurdu.
*/
export function needsVoice(scene) {
  const s = scene || {};
  if (s.media !== 'video') return true;          // görselde her zaman gerekli
  if (!s.videoHasAudio) return true;             // sessiz video → anlatım gerekli
  /* `useVideoAudio` kullanıcının açık tercihi */
  return !s.useVideoAudio;
}

/*
  ---------- TOPLAM SÜRE ----------

  Sahne sayısı → süre. Eskiden tersiydi.
*/
export function totalDuration(scenes, opts) {
  const list = Array.isArray(scenes) ? scenes : [];
  let total = 0;
  let unknown = 0;
  const bySource = { video: 0, image: 0, voice: 0, estimate: 0 };

  for (const s of list) {
    const d = sceneDuration(s, opts?.per?.[s?.scene] || null);
    if (!d.known) { unknown++; continue; }
    total += d.seconds;
    bySource[d.source] = (bySource[d.source] || 0) + 1;
  }

  return {
    seconds: +total.toFixed(2),
    scenes: list.length,
    /* Süresi henüz ölçülmemiş sahne sayısı — arayüz "yaklaşık"
       diyebilsin */
    unknown,
    exact: unknown === 0,
    bySource
  };
}

/*
  ---------- SESLENDİRME İHTİYACI ÖZETİ ----------

  Kaç sahne seslendirme bekliyor, kaçı videonun sesini
  kullanıyor.

  Bu, yol haritasındaki "seslendirme" adımının gerekli olup
  olmadığını belirliyor: hiçbir sahne seslendirme istemiyorsa o
  adım atlanabilir.
*/
export function voiceNeed(scenes) {
  const list = Array.isArray(scenes) ? scenes : [];
  let need = 0, fromVideo = 0;

  for (const s of list) {
    if (needsVoice(s)) need++;
    else fromVideo++;
  }

  return {
    need,
    fromVideo,
    total: list.length,
    /* Tek bir sahne bile seslendirme istiyorsa adım gerekli */
    stepNeeded: need > 0
  };
}
