/*
  TIMELINE ENGINE — ortak zaman motoru.

  Sprint 4 / TASK-02. Tek görev: bir storyboard'dan sahne bazlı zaman
  çizelgesi çıkarmak. AI yok, ağ yok, kredi yok, deterministik.

  Mimari kararı — NEDEN AYRI DOSYA:

    TASK-01 (Video Health) süreyi analyze.js içinde hesaplıyordu.
    TASK-02 aynı hesabı istiyordu; iki kopya birbirinden sapardı.
    Bu modül tek gerçek kaynak: hem sağlık raporu hem storyboard
    ve seslendirme sayfalarındaki Timeline Preview aynı sayıları
    kullanır. TASK-02 spec'indeki "kelime → süre + noktalama farkındalığı
    + kısa/uzun uyarısı" burada, ücretsiz kural motoru olarak yaşar.

    Spec "AI ayrıca noktalama analizi yapacak" diyor; bunu bilinçli
    olarak kural motoruna çektim. Sonuç aynı, maliyet sıfır, deterministik.

  KURALLAR:

    1. voiceDuration doluysa GERÇEK süre kullanılır — tahmin değil.
       (Kullanıcı seslendirmeyi yüklediğinde ölçüm hakikate döner.)
    2. Yoksa metinden tahmin: kelime sayısı + noktalama duraklamaları.
    3. Sahneler arasına ENGINE.SCENE_GAP eklenir (motor ile uyumlu).
    4. Toplam süreye VOICE_TAIL eklenir (kapanış payı).
    5. Bir sahnenin süresi bilinemiyorsa (metin de ses de yoksa) 0 döner
       ve `hasDur:false` işaretlenir; toplama katılmaz.
*/

/* Motor ile aynı ritim payları. render/engine ile tek doğruluk kaynağı. */
export const TIMING = {
  WPM: 150,          // ortalama anlatım hızı (kelime/dakika)
  MIN_SCENE: 1.5,    // metin varsa alt sınır
  SCENE_GAP: 0.25,   // sahneler arasındaki nefes
  VOICE_TAIL: 0.4,   // son sahnenin kuyruğu

  // Noktalama başına eklenen duraklama (saniye).
  // "Hayır." ≠ "Hayır..." ≠ "Hayır!" — TASK-02 spec.
  PAUSE: {
    period:    0.35,   // .
    comma:     0.15,   // ,
    exclaim:   0.40,   // !
    question:  0.40,   // ?
    ellipsis:  0.65,   // … veya ...
    dash:      0.25,   // — veya --
    colon:     0.20,   // : ;
    paragraph: 0.50    // paragraf sonu (\n\n)
  },

  // Uyarı eşikleri — sağlık motorunun HEALTH.SCENE_MIN/MAX ile aynı
  // ölçüyü kullanır. Değiştirmen gerekiyorsa iki dosyayı da güncelle.
  WARN_SHORT: 2.0,
  WARN_LONG: 12.0
};

/* ---------- Metin ölçümleri ---------- */

export function wordCount(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

/*
  Bir metin parçasını okumanın kaç saniye süreceğini tahmin et.

  Formül:
    süre = kelime / (WPM / 60) + noktalama duraklamaları

  Noktalama tekrar edilmez: "...", "?!", "??" gibi kombinasyonlar
  tek duraklama sayılır (regex mantığıyla, art arda gelen aynı grup
  tek eşleşme).
*/
export function estimateSpokenDuration(text) {
  const w = wordCount(text);
  if (w === 0) return 0;

  const base = (w / TIMING.WPM) * 60;
  /* Taban yalnızca kelime hızından gelen ham süreye uygulanır.
     Noktalama duraklaması bunun üzerine eklenir — yoksa "Hayır." ile
     "Hayır!" aynı sürede okunur ve TASK-02 spec'inin tam olarak
     ayırmak istediği fark kaybolur. */
  const spoken = Math.max(TIMING.MIN_SCENE, base);

  const t = String(text || '');
  const p = TIMING.PAUSE;

  // Üç noktayı önce yakala (nokta sayımını şişirmesin diye)
  const ellipsis = (t.match(/…|\.{3,}/g) || []).length;
  const cleaned  = t.replace(/…|\.{3,}/g, '');

  const periods   = (cleaned.match(/\./g)  || []).length;
  const commas    = (cleaned.match(/,/g)   || []).length;
  const exclaims  = (cleaned.match(/!/g)   || []).length;
  const questions = (cleaned.match(/\?/g)  || []).length;
  const dashes    = (cleaned.match(/—|--/g) || []).length;
  const colons    = (cleaned.match(/[:;]/g)|| []).length;
  const paras     = (cleaned.match(/\n\s*\n/g) || []).length;

  const pause =
    ellipsis  * p.ellipsis  +
    periods   * p.period    +
    commas    * p.comma     +
    exclaims  * p.exclaim   +
    questions * p.question  +
    dashes    * p.dash      +
    colons    * p.colon     +
    paras     * p.paragraph;

  return +(spoken + pause).toFixed(2);
}

/* ---------- Ana giriş: buildTimeline ----------

  Storyboard alır, sahne bazlı zaman çizelgesi ve özet üretir.

  Dönüş:
    {
      scenes:  [{ scene, at, end, dur, words, source, estimated, hasDur,
                  hasMedia, media, warning, warningLevel, text }],
      total,           // hesaplanabilen sahnelerin toplam süresi (sn)
      totalWithGap,    // aralardaki nefes payı dahil
      estimated,       // en az bir sahne tahminse true
      warnings: { short: [scene], long: [scene], missingText: [scene] },
      stats: { scenes, withVoice, withText, avgDur, sdDur }
    }
*/
export function buildTimeline(sb) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  const out = [];
  let cursor = 0;
  let anyEstimated = false;
  const short = [], long = [], missingText = [];

  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i] || {};
    const text = String(s.voiceText || s.paragraph || '').trim();
    const words = wordCount(text);

    // Süre kaynağı: gerçek > tahmin > yok
    let dur = 0;
    let source = 'unknown';
    let estimated = false;

    if (Number(s.voiceDuration) > 0) {
      dur = +Number(s.voiceDuration).toFixed(2);
      source = 'voice';
    } else if (words > 0) {
      dur = estimateSpokenDuration(text);
      source = 'estimate';
      estimated = true;
      anyEstimated = true;
    }

    const hasDur = dur > 0;
    const item = {
      scene: i + 1,
      at: +cursor.toFixed(2),
      end: hasDur ? +(cursor + dur).toFixed(2) : +cursor.toFixed(2),
      dur,
      words,
      source,
      estimated,
      hasDur,
      hasMedia: !!(s.image || s.video),
      media: s.media === 'video' ? 'video' : 'image',
      text: text.slice(0, 240),
      warning: null,
      warningLevel: null
    };

    if (!hasDur) {
      missingText.push(item.scene);
      item.warning = 'missingText';
      item.warningLevel = 'warn';
    } else if (dur < TIMING.WARN_SHORT) {
      short.push(item.scene);
      item.warning = 'short';
      item.warningLevel = 'tip';
    } else if (dur > TIMING.WARN_LONG) {
      long.push(item.scene);
      item.warning = 'long';
      item.warningLevel = 'warn';
    }

    out.push(item);
    if (hasDur) cursor += dur + (i < scenes.length - 1 ? TIMING.SCENE_GAP : 0);
  }

  const durs = out.filter(s => s.hasDur).map(s => s.dur);
  const total = out.reduce((a, s) => a + s.dur, 0);
  const avg = durs.length ? total / durs.length : 0;
  const variance = durs.length
    ? durs.reduce((a, d) => a + (d - avg) ** 2, 0) / durs.length : 0;

  return {
    scenes: out,
    total: +total.toFixed(2),
    totalWithGap: +cursor.toFixed(2),
    estimated: anyEstimated,
    warnings: { short, long, missingText },
    stats: {
      scenes: scenes.length,
      withVoice: scenes.filter(s => s.voice || Number(s.voiceDuration) > 0).length,
      withText: out.filter(s => s.words > 0).length,
      avgDur: +avg.toFixed(2),
      sdDur: +Math.sqrt(variance).toFixed(2)
    }
  };
}

/* ---------- Sunum yardımcıları ---------- */

/* 0:00 · 1:23 · 12:34 · 1:02:03 */
export function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? h + ':' + pad(m) + ':' + pad(r) : m + ':' + pad(r);
}
