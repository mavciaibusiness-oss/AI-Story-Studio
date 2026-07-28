'use client';
import {
  HASH_W, HASH_H, dHashFromPixels, histogramFromPixels,
  sampleInterval, estimateFrameCount, detectShots, findRepeatedShots,
  summarizeShots
} from './analyze';

/*
  VIDEO REBUILDER — kare çıkarma (tarayıcı katmanı).

  Sprint 4 / TASK-07, Adım 1'in ikinci parçası.

  Bu dosya TARAYICIYA ÖZGÜ: video seek, canvas, getImageData.
  Algoritmalar analyze.js'te ve Node'da test edilebiliyor; burada
  yalnızca piksel okuma var. Karıştırmadım ki algoritmalar test
  edilebilir kalsın.

  GİZLİLİK: video hiçbir yere gitmiyor. createObjectURL ile yerel
  olarak açılıyor, kareler bellekte işleniyor, iş bitince URL geri
  veriliyor. Ürünün açılış sayfasındaki söz korunuyor.

  PERFORMANS GERÇEĞİ:
    Her kare için seek + decode + draw gerekiyor. Tarayıcıda seek
    ucuz değil — 10 dakikalık videoda 1 saniyelik örneklemede 600 seek
    eder, bu da onlarca saniye sürebilir.

    Bu yüzden:
      • örnekleme aralığı süreye göre ayarlanıyor (analyze.js)
      • ilerleme bildirimi var (kullanıcı donduğunu sanmasın)
      • iptal edilebilir (uzun sürerse vazgeçebilsin)
    Hızlı olduğunu iddia etmiyoruz; ne kadar süreceğini söylüyoruz.
*/

/* Video meta verisi — süre, boyut. Örnekleme planı buna göre kurulur. */
export function probeVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;

    const cleanup = () => URL.revokeObjectURL(url);

    v.onloadedmetadata = () => {
      const info = {
        duration: v.duration,
        width: v.videoWidth,
        height: v.videoHeight,
        aspect: v.videoWidth && v.videoHeight
          ? +(v.videoWidth / v.videoHeight).toFixed(4) : null,
        name: file.name,
        size: file.size,
        type: file.type
      };
      cleanup();
      if (!Number.isFinite(info.duration) || info.duration <= 0) {
        reject(new Error('Video süresi okunamadı. Dosya bozuk olabilir.'));
        return;
      }
      resolve(info);
    };
    v.onerror = () => {
      cleanup();
      reject(new Error('Video açılamadı. Desteklenen biçimler: MP4, MOV, WEBM, MKV.'));
    };
    v.src = url;
  });
}

/* Belirli bir ana git ve karenin hazır olmasını bekle.

   `seeked` olayı bazı tarayıcılarda kare çizilmeden önce tetikleniyor;
   requestVideoFrameCallback varsa onu kullanıyoruz (kare gerçekten
   hazır), yoksa küçük bir gecikmeyle telafi ediyoruz. */
function seekTo(video, t) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    const fail = () => { if (!done) { done = true; reject(new Error('seek failed')); } };

    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      if (typeof video.requestVideoFrameCallback === 'function') {
        video.requestVideoFrameCallback(() => finish());
        /* Bazı tarayıcılarda duraklatılmış videoda callback hiç
           gelmiyor; emniyet kemeri. */
        setTimeout(finish, 120);
      } else {
        setTimeout(finish, 60);
      }
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('error', fail, { once: true });
    try { video.currentTime = Math.max(0, t); } catch { fail(); }
  });
}

/*
  Videoyu tara ve sahne yapısını çıkar.

  opts:
    onProgress(done, total)  — ilerleme bildirimi
    signal                   — AbortSignal, iptal için
    interval                 — örnekleme aralığı (sn), verilmezse otomatik

  Dönüş:
    { info, shots, repeated, summary, sampling }

  Hata durumunda atar; çağıran taraf kullanıcıya söyler.
*/
export async function scanVideo(file, opts) {
  const info = await probeVideo(file);
  const interval = opts?.interval || sampleInterval(info.duration);
  const total = estimateFrameCount(info.duration);

  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;

  /* İki canvas: biri hash için minik (9×8), biri histogram için küçük.
     Histogram 9×8'de çok kaba kalıyor — 32×32 yeterli çözünürlük
     veriyor ve hâlâ ucuz. */
  const hc = document.createElement('canvas');
  hc.width = HASH_W; hc.height = HASH_H;
  const hctx = hc.getContext('2d', { willReadFrequently: true });

  const cc = document.createElement('canvas');
  cc.width = 32; cc.height = 32;
  const cctx = cc.getContext('2d', { willReadFrequently: true });

  const frames = [];

  try {
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error('Video yüklenemedi.'));
      video.src = url;
    });

    for (let i = 0; i < total; i++) {
      if (opts?.signal?.aborted) throw new Error('aborted');

      const t = Math.min(info.duration - 0.01, i * interval);
      try {
        await seekTo(video, t);
      } catch {
        /* Bu ana gidilemedi — kareyi atla, taramayı bitirme.
           Bozuk anahtar kare tüm analizi çöpe atmasın. */
        continue;
      }

      hctx.drawImage(video, 0, 0, HASH_W, HASH_H);
      const hashPixels = hctx.getImageData(0, 0, HASH_W, HASH_H).data;
      const hash = dHashFromPixels(hashPixels, HASH_W, HASH_H);

      cctx.drawImage(video, 0, 0, 32, 32);
      const colorPixels = cctx.getImageData(0, 0, 32, 32).data;
      const hist = histogramFromPixels(colorPixels);

      /* Ortalama parlaklık — siyah kare tespiti için */
      let luma = 0;
      for (let p = 0; p < colorPixels.length; p += 4) {
        luma += colorPixels[p] * 0.299 + colorPixels[p + 1] * 0.587
              + colorPixels[p + 2] * 0.114;
      }
      luma /= (colorPixels.length / 4);

      if (hash) frames.push({ t: +t.toFixed(3), hash, hist, luma });

      opts?.onProgress?.(i + 1, total);
    }
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }

  if (!frames.length) {
    throw new Error('Videodan hiç kare okunamadı. Dosya biçimi desteklenmiyor olabilir.');
  }

  const shots = detectShots(frames, {});
  const repeated = findRepeatedShots(shots, {});
  const summary = summarizeShots(shots, info.duration);

  return {
    info,
    shots,
    repeated,
    summary,
    /* Örnekleme bilgisi: hassasiyet sınırını kullanıcıya söylemek için.
       1 sn aralıkta 0.4 sn'lik bir kesme kaçabilir — bunu saklamak
       yanlış olur. */
    sampling: {
      interval,
      framesRead: frames.length,
      framesPlanned: total,
      /* Kaçabilecek en kısa sahne */
      minDetectable: +(interval * 2).toFixed(2)
    }
  };
}
