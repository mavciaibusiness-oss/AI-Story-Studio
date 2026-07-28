/*
  VIDEO REBUILDER — çözümleme algoritmaları.

  Sprint 4 / TASK-07, Adım 1.

  MİMARİ AYRIMI — NEDEN İKİ KATMAN:
    Bu dosya SAF algoritma: piksel dizisi girer, imza çıkar; imza dizisi
    girer, sahne sınırı çıkar. Tarayıcı API'si yok, DOM yok, canvas yok.
    Böylece Node'da test edilebiliyor.

    Piksel okuma (video seek + canvas + getImageData) ayrı bir ince
    sarmalayıcıda (lib/rebuild/extract.js, Adım 1'in ikinci parçası).
    Karıştırsaydık algoritmaları hiç test edemezdik.

  GİZLİLİK:
    Her şey kullanıcının makinesinde çalışır. Video sunucuya gitmez —
    ürünün açılış sayfasındaki söz bu ve TASK-07 onu bozmuyor.

  NE ÖLÇÜLEBİLİR, NE ÖLÇÜLEMEZ:
    Piksellerden çıkan: sahne sınırı, süre, görsel tekrar, durağanlık.
    Piksellerden ÇIKMAYAN: hikâye, duygu, karakter, anlatım hızı —
    bunlar metin ister. Kullanıcı senaryoyu verirse (Adım 2) altı motor
    da çalışır; vermezse arayüz neyin ölçülmediğini açıkça söyler.
*/

/* ---------- Algısal hash (dHash) ----------

   NEDEN dHash, aHash DEĞİL:
     aHash (ortalama hash) parlaklık değişimine duyarlı — aynı sahnede
     ışık azalınca hash değişir ve sahte sahne sınırı üretir.
     dHash komşu pikselleri KARŞILAŞTIRIR, mutlak değere bakmaz;
     parlaklık kayması bit deseni değiştirmez.

   9×8 gri tonlama → her satırda 8 karşılaştırma → 64 bit.
*/
export const HASH_W = 9;
export const HASH_H = 8;
export const HASH_BITS = (HASH_W - 1) * HASH_H;   // 64

/*
  RGBA piksel dizisinden dHash üret.

  pixels: Uint8ClampedArray (RGBA, canvas getImageData formatı)
  w, h:   kaynak boyutu (HASH_W × HASH_H'ye küçültülmüş olmalı)

  Dönüş: 64 elemanlı 0/1 dizisi. BigInt yerine dizi: karşılaştırma
  daha okunur ve BigInt tarayıcı uyumluluğu dert olmasın.
*/
export function dHashFromPixels(pixels, w, h) {
  if (!pixels || w !== HASH_W || h !== HASH_H) return null;

  /* Gri tonlama — insan gözü yeşile daha duyarlı, ITU-R BT.601 ağırlıkları */
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    gray[i] = pixels[p] * 0.299 + pixels[p + 1] * 0.587 + pixels[p + 2] * 0.114;
  }

  const bits = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w - 1; x++) {
      bits.push(gray[y * w + x] > gray[y * w + x + 1] ? 1 : 0);
    }
  }
  return bits;
}

/* İki hash arasındaki Hamming uzaklığı (kaç bit farklı).
   0 = birebir aynı, 64 = tamamen ters. */
export function hammingDistance(a, b) {
  if (!a || !b || a.length !== b.length) return HASH_BITS;
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

/* Benzerlik 0..1 — uzaklığın tersi, arayüzde yüzde göstermek için. */
export function hashSimilarity(a, b) {
  const d = hammingDistance(a, b);
  return +(1 - d / HASH_BITS).toFixed(3);
}

/* ---------- Renk histogramı ----------

   dHash yapıya bakar, renge bakmaz. İki farklı sahne aynı yapıda
   olabilir (iki manzara, benzer ufuk çizgisi) ama renkleri bambaşka.
   Histogram bu durumu yakalar; ikisini birlikte kullanmak tek başına
   birinden daha az yanılıyor. */
export const HIST_BINS = 8;   // kanal başına

export function histogramFromPixels(pixels) {
  if (!pixels) return null;
  const hist = new Float32Array(HIST_BINS * 3);
  const n = pixels.length / 4;
  const scale = HIST_BINS / 256;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    hist[Math.min(HIST_BINS - 1, (pixels[p] * scale) | 0)]++;
    hist[HIST_BINS + Math.min(HIST_BINS - 1, (pixels[p + 1] * scale) | 0)]++;
    hist[HIST_BINS * 2 + Math.min(HIST_BINS - 1, (pixels[p + 2] * scale) | 0)]++;
  }
  /* Normalize: kare boyutundan bağımsız karşılaştırma */
  for (let i = 0; i < hist.length; i++) hist[i] /= n;
  return Array.from(hist);
}

/* Histogram farkı 0..1 — Bhattacharyya yerine basit L1/2, yeterli
   ayrım veriyor ve hesabı ucuz (uzun videoda binlerce kare). */
export function histogramDistance(a, b) {
  if (!a || !b || a.length !== b.length) return 1;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return Math.min(1, sum / 6);   // 3 kanal × maks 2 → /6
}

/* ---------- Eşikler ---------- */
export const SHOT = {
  /* Kare imzaları arası bu uzaklığın üstü sahne değişimi sayılır.
     64 bitlik hash'te 18: aynı sahnede hareket 0-10 arası kalır,
     farklı sahne genelde 20+ verir. 18 aradaki güvenli bant. */
  HASH_CUT: 18,
  /* Histogram desteği: hash sınırdaysa renk farkı kararı verir. */
  HIST_CUT: 0.28,
  /* Mutlak alt sınır. Gerçek minimum bundan da büyük olabilir:
     detectShots örnekleme aralığının iki katını taban alıyor
     (örnekleme teoremi — aralıktan kısa sahneyi göremeyiz). */
  MIN_SHOT_SEC: 0.4,
  /* Durağanlık: sahne içindeki kareler bu uzaklığın altındaysa
     görsel durağan (tek kare) sayılır. */
  STATIC_MAX: 4,
  /* Tekrar: iki sahnenin temsilci karesi bu uzaklığın altındaysa
     aynı görsel tekrar kullanılmış demektir. */
  REPEAT_MAX: 8,
  /* Siyah kare: ortalama parlaklık bu eşiğin altı. Açılış/kapanış
     kararmalarını sahne sanmamak için. */
  BLACK_LUMA: 18
};

/* ---------- Sahne sınırı tespiti ----------

   Girdi: örneklenmiş kare imzaları
     [{ t, hash, hist, luma }]

   Çıkış: sahne listesi
     [{ index, start, end, dur, frames, repHash, static, black, cutType }]

   İki tür sınır aranır:
     ani kesme  — ardışık iki kare arasında büyük sıçrama
     yumuşak geçiş — birkaç kare boyunca biriken değişim

   Yumuşak geçişi ayrı ele almak gerekiyor: kararmada her adım küçük
   olduğu için ani kesme eşiği hiç tetiklenmez ve iki sahne tek sahne
   sanılır.
*/
export function detectShots(frames, opts) {
  const list = Array.isArray(frames) ? frames.filter(f => f && f.hash) : [];
  if (list.length === 0) return [];

  const cfg = { ...SHOT, ...(opts || {}) };
  const total = list[list.length - 1].t;

  /*
    MİNİMUM SAHNE UZUNLUĞU — ÖRNEKLEME ARALIĞINDAN TÜRETİLİR.

    İlk sürümde sabit 0.4 saniyeydi ve filtre HİÇ ÇALIŞMIYORDU:
    0.5 saniyede örnekleme yapıldığında her kesme 0.5 >= 0.4 testini
    geçiyordu. Sonuç: 40 saniyelik videoda 51 sahne — her örnek kendi
    sahnesi oldu.

    Doğru sınır bir örnekleme argümanı: iki örnek arasını göremediğimiz
    için, örnekleme aralığının İKİ KATINDAN kısa bir sahneyi güvenilir
    ayırt edemeyiz. Eşik buradan gelmeli.

    Aralık verilmezse ardışık kare zamanlarından çıkarılır — çağıran
    taraf söylemeyi unutsa bile doğru davranış.
  */
  const interval = cfg.interval || inferInterval(list);
  const minShot = Math.max(cfg.MIN_SHOT_SEC, interval * 2);

  if (list.length === 1) {
    return [makeShot(0, list, 0, 0, total || 0, 'single', cfg)];
  }

  /* 1) Sınır adayları — YALNIZCA ANİ KESME.

     YUMUŞAK GEÇİŞ SEZGİSİ KALDIRILDI. Neden:

       İlk sürümde 4 karelik pencerede birikimli değişim eşiği vardı.
       Kalibrasyonda 40 saniyelik videoda 13 sahne buldu (beklenen 4-6) —
       çünkü %22 hareketli bir aksiyon sahnesinde ardışık kare farkları
       zaten büyük ve pencere toplamı eşiği kolayca aşıyor. Sezgi
       "sürekli hareket" ile "iki sahne arası kararma" arasını
       ayıramıyordu.

       Ayırt edici sinyal şu olurdu: gerçek kararma YENİ BİR KARARLI
       duruma varır, hareket temel görüntü etrafında salınır. Ama
       0.5-2 saniyelik örneklemede yarım saniyelik bir dissolve TEK
       örneğe düşüyor — görmek örnekleme sınırı gereği mümkün değil.

     SONUÇ: yalnızca ani kesme aranıyor. Bedeli: uzun bir dissolve iki
     sahneyi tek sahne olarak birleştirebilir. Bu, hareketli görüntüyü
     13 hayalet sahneye bölmekten çok daha az zararlı — aksi halde
     Director o hayalet sahnelere "böl" önerirdi.

     Arayüz bu sınırı kullanıcıya söylüyor (Adım 4). */
  const cuts = [];
  for (let i = 1; i < list.length; i++) {
    const dh = hammingDistance(list[i - 1].hash, list[i].hash);
    const dc = histogramDistance(list[i - 1].hist, list[i].hist);

    if (dh >= cfg.HASH_CUT || (dh >= cfg.HASH_CUT * 0.7 && dc >= cfg.HIST_CUT)) {
      cuts.push({ i, type: 'cut' });
    }
  }

  /* 2) Çok kısa sahneleri ele — örnekleme gürültüsü */
  const kept = [];
  let prevIdx = 0;
  for (const c of cuts) {
    const startT = list[prevIdx].t;
    const cutT = list[c.i].t;
    if (cutT - startT >= minShot) {
      kept.push(c);
      prevIdx = c.i;
    }
  }

  /* 3) Sahneleri kur */
  const shots = [];
  let startIdx = 0;
  for (let s = 0; s <= kept.length; s++) {
    const endIdx = s < kept.length ? kept[s].i - 1 : list.length - 1;
    if (endIdx < startIdx) continue;
    const startT = list[startIdx].t;
    const endT = s < kept.length ? list[kept[s].i].t : (total || list[endIdx].t);
    const cutType = s < kept.length ? kept[s].type : 'end';
    shots.push(makeShot(shots.length, list.slice(startIdx, endIdx + 1),
      startIdx, startT, endT, cutType, cfg));
    startIdx = s < kept.length ? kept[s].i : startIdx;
  }

  return shots;
}

/* Örnekleme aralığını kare zamanlarından çıkar — çağıran taraf
   söylemeyi unutsa bile minimum sahne eşiği doğru hesaplansın.
   Medyan kullanılıyor: tek bir atlanmış kare ortalamayı bozmasın. */
function inferInterval(list) {
  if (list.length < 2) return 0.5;
  const gaps = [];
  for (let i = 1; i < list.length; i++) {
    const g = list[i].t - list[i - 1].t;
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return 0.5;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function makeShot(index, frames, frameStart, start, end, cutType, cfg) {
  const dur = Math.max(0, +(end - start).toFixed(2));

  /* Temsilci kare: ortadaki. Baştaki geçiş artığı taşıyabilir,
     sondaki bir sonrakine kaçmış olabilir. */
  const mid = frames[Math.floor(frames.length / 2)] || frames[0];

  /* Durağanlık: sahne içindeki en büyük kare farkı.

     TEK KARELİ SAHNEDE ÖLÇÜLEMEZ. İlk sürümde maxDelta 0 çıkıyor ve
     sahne "durağan" işaretleniyordu — ama hareket ÖLÇÜLEMEDİ demektir,
     durağan demek değil. Bu ayrım önemli: Director durağan sahneye
     "video yap" öneriyor; ölçülemeyen sahneye öneri yapmamalı. */
  const measurable = frames.length >= 2;
  let maxDelta = 0;
  for (let i = 1; i < frames.length; i++) {
    const d = hammingDistance(frames[i - 1].hash, frames[i].hash);
    if (d > maxDelta) maxDelta = d;
  }

  const avgLuma = frames.reduce((a, f) => a + (f.luma || 0), 0) / (frames.length || 1);

  return {
    index,
    start: +start.toFixed(2),
    end: +end.toFixed(2),
    dur,
    frameCount: frames.length,
    frameStart,
    repHash: mid?.hash || null,
    repHist: mid?.hist || null,
    repTime: mid?.t ?? start,
    maxDelta: measurable ? maxDelta : null,
    /* Durağan = görsel hiç değişmiyor. Yükleyen kişi tek bir resmi
       ekranda tutmuş demektir; Director "video yap" önerebilir.
       null = ölçülemedi (tek kare), false değil. */
    static: measurable ? maxDelta <= cfg.STATIC_MAX : null,
    motionMeasurable: measurable,
    /* Siyah/karanlık sahne: genelde açılış-kapanış kararması, içerik değil */
    black: avgLuma <= cfg.BLACK_LUMA,
    avgLuma: +avgLuma.toFixed(1),
    cutType
  };
}

/* ---------- Tekrarlayan görseller ----------

   Aynı görselin birden çok sahnede kullanılması izleyiciye "aynı
   kareyi tekrar görüyorum" hissi verir. Video Health'in
   `visual-repeat` bulgusunun piksel karşılığı.

   Dönüş: [{ shots: [i, j, ...], similarity }]
   Gruplar: birbirine benzeyen sahneler tek grupta toplanır.
*/
export function findRepeatedShots(shots, opts) {
  const cfg = { ...SHOT, ...(opts || {}) };
  const list = Array.isArray(shots) ? shots.filter(s => s.repHash && !s.black) : [];
  const groups = [];
  const assigned = new Set();

  for (let i = 0; i < list.length; i++) {
    if (assigned.has(list[i].index)) continue;
    const group = [list[i].index];
    let minSim = 1;

    for (let j = i + 1; j < list.length; j++) {
      if (assigned.has(list[j].index)) continue;
      const d = hammingDistance(list[i].repHash, list[j].repHash);
      if (d <= cfg.REPEAT_MAX) {
        group.push(list[j].index);
        assigned.add(list[j].index);
        const sim = 1 - d / HASH_BITS;
        if (sim < minSim) minSim = sim;
      }
    }

    if (group.length > 1) {
      assigned.add(list[i].index);
      groups.push({ shots: group, similarity: +minSim.toFixed(3) });
    }
  }
  return groups;
}

/* ---------- Örnekleme aralığı ----------

   Uzun videoda her kareyi okumak tarayıcıyı kilitler. Aralık süreye
   göre ayarlanır: kısa videoda hassas, uzun videoda pratik.

   Bu bir ödünleşim ve kullanıcıya söylenmeli: 1 saniyelik örneklemede
   0.4 saniyelik bir kesme kaçabilir. Arayüz hassasiyeti bildirir.
*/
export function sampleInterval(durationSec) {
  const d = Number(durationSec) || 0;
  if (d <= 60) return 0.25;
  if (d <= 300) return 0.5;
  if (d <= 900) return 1.0;
  return 2.0;
}

/* Kaç kare okunacak — arayüz ilerleme çubuğu için bilmek ister. */
export function estimateFrameCount(durationSec) {
  const iv = sampleInterval(durationSec);
  return Math.max(1, Math.ceil((Number(durationSec) || 0) / iv));
}

/* ---------- Özet ---------- */
export function summarizeShots(shots, totalDur) {
  const list = Array.isArray(shots) ? shots : [];
  if (!list.length) {
    return { count: 0, avgDur: 0, staticCount: 0, blackCount: 0,
             shortest: 0, longest: 0, coverage: 0 };
  }
  const durs = list.map(s => s.dur);
  const sum = durs.reduce((a, b) => a + b, 0);
  return {
    count: list.length,
    avgDur: +(sum / list.length).toFixed(2),
    staticCount: list.filter(s => s.static === true).length,
    /* Ölçülemeyen sahne sayısı — arayüz "N sahnede hareket ölçülemedi"
       diyebilsin. Sessizce durağan saymaktan iyidir. */
    unmeasuredCount: list.filter(s => s.static === null).length,
    blackCount: list.filter(s => s.black).length,
    shortest: +Math.min(...durs).toFixed(2),
    longest: +Math.max(...durs).toFixed(2),
    /* Sahnelerin toplamı video süresini karşılıyor mu? Karşılamıyorsa
       örnekleme eksik kalmış demektir — arayüz uyarabilsin. */
    coverage: totalDur > 0 ? +(sum / totalDur).toFixed(3) : 0
  };
}
