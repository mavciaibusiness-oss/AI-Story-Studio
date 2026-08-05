/*
  CREATOR INTELLIGENCE — davranış sinyalleri ve puanlama.

  Sprint 6 / TASK-03, Adım 1.

  ---------------------------------------------------------------
  PUANLAMA OLAY ADINDAN, SATIRDAN DEĞİL

  Kullanıcı kararı: "scoring mantığı event isminden ayrılabilir
  tasarlansın. İleride ağırlıklar değiştirilebilir olmalı."

  `user_actions.weight` sütunu var ama puanlama onu OKUMUYOR.
  Ağırlıklar burada, `WEIGHTS` haritasında. Değiştirirsek tüm
  geçmiş yeniden değerlenir — satıra yazılmış ağırlık dondurulmuş
  olurdu.
  ---------------------------------------------------------------

  BU DOSYA VERİTABANINA ERİŞMİYOR

  Saf dönüşüm: olay satırları girer, puan çıkar. Sorguları API
  atıyor. Test edilebilir kalıyor.
*/

export const INTEL_VERSION = 1;

/*
  ---------- TANINAN EYLEMLER ----------

  Her biri kullanıcının GERÇEKTEN yaptığı bir şey. Uydurma sinyal
  yok; hepsi arayüzde var olan bir etkileşime karşılık geliyor.
*/
export const ACTIONS = [
  'copy',      // prompt kopyalandı — en güçlü kullanım sinyali
  'reuse',     // aynı prompt tekrar kopyalandı
  'complete',  // sahne medyayla doldu
  'render',    // sahne nihai videoya girdi
  'accept',    // AI önerisi kabul edildi
  'reject',    // AI önerisi reddedildi
  'edit',      // kullanıcı elle değiştirdi
  'skip'       // atlandı / kullanılmadı
];

/*
  ---------- AĞIRLIKLAR ----------

  Bunlar BAŞLANGIÇ DEĞERLERİ. Gerçek kullanım verisiyle kalibre
  edilmediler; "doğru" olduklarını iddia etmiyorum.

  Mantık:
    Kopyalama en güçlü olumlu sinyal — kullanıcı prompt'u gerçekten
    kullanmaya götürdü.

    AI yeniden yazımının REDDİ olumlu: mevcut prompt zaten yeterliymiş.
    KABULÜ olumsuz: mevcut prompt zayıfmış.

    Elle düzenleme en güçlü olumsuz sinyal — ilk hali işe yaramamış.
*/
export const WEIGHTS = {
  copy:     3,
  reuse:    2,
  complete: 2,
  render:   2,
  reject:   1,
  accept:  -1,
  edit:    -2,
  skip:    -1
};

/* Puan hesaplanması için gereken en az sinyal. Tek kopyalamadan
   "bu senin en iyi promptun" demek uydurmadır. */
export const MIN_SIGNALS = 3;

/* 30 günden eski sinyaller yarı ağırlıkla sayılıyor. Kullanıcının
   tarzı değişir; iki yıl önce beğendiği prompt bugünü temsil
   etmeyebilir. */
export const RECENCY_DAYS = 30;
export const RECENCY_FACTOR = 0.5;

/*
  ---------- HASH NORMALİZASYONU ----------

  Aynı prompt'un iki kayda bölünmemesi için.

  NE YAPILIYOR:
    • Küçük harf (Türkçe-duyarlı: İ→i, I→ı)
    • Çoklu boşluk → tek boşluk
    • Baş/son kırpma
    • Sondaki noktalama at

  NE YAPILMIYOR:
    • Kelime sırası değiştirilmiyor
    • Eşanlamlı birleştirme yok

  "kırmızı araba" ile "araba kırmızı" FARKLI promptlar — sıra
  görsel üreticilerde anlam taşıyor. Birleştirmek kullanıcının
  kasıtlı tercihini silmek olurdu.
*/
export function normalizePrompt(text) {
  return String(text || '')
    /* Türkçe küçük harf: JS'in toLowerCase'i İ→i̇ (noktalı) yapıyor */
    .replace(/İ/g, 'i').replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:]+$/, '');
}

/*
  SHA-256'nın ilk 16 hex karakteri.

  Tarayıcıda ve Node'da aynı sonucu vermesi gerekiyor — Web Crypto
  ikisinde de var. Senkron bir hash gerekseydi kendi fonksiyonumuzu
  yazmak zorunda kalırdık; async kabul edilebilir.
*/
export async function promptHash(text) {
  const norm = normalizePrompt(text);
  if (!norm) return null;
  const data = new TextEncoder().encode(norm);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/*
  ---------- SİNYAL ÖZETİ ----------

  Girdi: bir hedefe ait user_actions satırları
  Çıkış: { signals, uses, score, scored, byAction }

  `score` null olabilir — eşik altında puan YOK.
*/
export function summarizeSignals(rows, now) {
  const list = Array.isArray(rows) ? rows : [];
  const ref = now ?? Date.now();

  const byAction = {};
  let raw = 0, uses = 0, counted = 0;
  let lastUsed = null;

  for (const r of list) {
    const action = String(r?.action || '');
    if (!ACTIONS.includes(action)) continue;   // bilinmeyen eylem atlanıyor

    byAction[action] = (byAction[action] || 0) + 1;
    counted++;

    if (action === 'copy' || action === 'reuse') {
      uses++;
      const t = r.created_at ? new Date(r.created_at).getTime() : null;
      if (t && (!lastUsed || t > lastUsed)) lastUsed = t;
    }

    /* Ağırlık OLAY ADINDAN — satırdaki weight okunmuyor */
    const w = WEIGHTS[action] ?? 0;

    /* Tazelik: eski sinyaller yarı ağırlıkta */
    let factor = 1;
    if (r.created_at) {
      const days = (ref - new Date(r.created_at).getTime()) / 86400000;
      if (Number.isFinite(days) && days > RECENCY_DAYS) factor = RECENCY_FACTOR;
    }
    raw += w * factor;
  }

  /*
    Taban 50: puanlar ortadan başlıyor. Tek olumsuz sinyalle bir
    prompt "0 puan" olmamalı.

    Tavan 90: hiçbir gözlem "kesin" değil (Sprint-5 `dominant`
    kararının aynısı).
  */
  const scored = counted >= MIN_SIGNALS;
  const score = scored
    ? Math.max(0, Math.min(90, Math.round(50 + raw * 4)))
    : null;

  return {
    signals: counted,
    uses,
    score,
    scored,
    byAction,
    lastUsedAt: lastUsed ? new Date(lastUsed).toISOString() : null,
    minSignals: MIN_SIGNALS
  };
}

/*
  ---------- KAYIT İÇİN SATIR HAZIRLA ----------

  API'nin yazacağı satır. `weight` denetim için ekleniyor —
  puanlama onu okumuyor (yukarıdaki nota bak).
*/
export function buildActionRow({ userId, targetKind, targetId, action,
                                 episodeId, sceneIndex, meta }) {
  if (!userId || !targetKind || !targetId) return null;
  if (!ACTIONS.includes(action)) return null;

  return {
    user_id: userId,
    target_kind: String(targetKind),
    target_id: String(targetId).slice(0, 200),
    action,
    episode_id: episodeId || null,
    scene_index: Number.isInteger(sceneIndex) ? sceneIndex : null,
    weight: WEIGHTS[action] ?? 0,
    meta: meta && typeof meta === 'object' ? meta : {}
  };
}

/*
  ---------- ÇALIŞMA SAATİ ----------

  Spec maddesi 3: "Sabah mı çalışıyor? Akşam mı?"

  user_actions.created_at bunu ölçüyor — yeni veri toplamıyoruz.

  DİLİM SEÇİMİ: dört blok. Daha ince ayrım (saat bazlı) yanıltıcı
  olurdu — kullanıcı 13:59'da mı 14:01'de mi çalıştığı anlam
  taşımıyor.

  YETERSİZ VERİDE null: en az 10 sinyal olmadan "sen sabahçısın"
  demek uydurma.
*/
export const HOUR_BLOCKS = [
  { key: 'morning',   from: 6,  to: 12 },
  { key: 'afternoon', from: 12, to: 18 },
  { key: 'evening',   from: 18, to: 23 },
  { key: 'night',     from: 23, to: 6 }
];

export const MIN_HOUR_SAMPLES = 10;

export function workingHours(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const counts = {};
  let total = 0;

  for (const r of list) {
    if (!r?.created_at) continue;
    const d = new Date(r.created_at);
    const h = d.getHours();
    if (!Number.isFinite(h)) continue;
    const block = HOUR_BLOCKS.find(b => b.from < b.to
      ? (h >= b.from && h < b.to)
      : (h >= b.from || h < b.to));
    if (!block) continue;
    counts[block.key] = (counts[block.key] || 0) + 1;
    total++;
  }

  if (total < MIN_HOUR_SAMPLES) {
    return { known: false, total, minSamples: MIN_HOUR_SAMPLES, counts };
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const [topKey, topCount] = sorted[0] || [];
  const share = topCount / total;

  /* Baskın dilim yoksa "belirli bir saati yok" — bu da bir bilgi */
  return {
    known: true,
    total,
    counts,
    dominant: share >= 0.4 ? topKey : null,
    share: +share.toFixed(2)
  };
}


/*
  ---------- BUDAMA ----------

  Olay tablosu sınırsız büyüyemez. Tasarım dokümanındaki karar:
  kullanıcı başına son 10.000 kayıt, 180 günden eski olanlar silinir.

  ÖZET KAYBOLMUYOR: silinen olayların katkısı prompt_history'de
  zaten saklanmış durumda (signal_count, use_count, score). Ham
  olaylar yalnızca yeniden hesaplama ve denetim için duruyor.

  Bu, TASK-03'teki `pruneMemory` kararının aynısı.
*/
export const MAX_ACTIONS = 10000;
export const MAX_AGE_DAYS = 180;

/*
  Hangi kayıtların silineceğini SEÇER, silmez. Silme API'nin işi —
  bu dosya veritabanına erişmiyor.

  Girdi: { id, created_at } satırları (en yeni başta)
  Çıkış: silinecek id listesi
*/
export function pruneTargets(rows, opts) {
  const list = Array.isArray(rows) ? rows : [];
  const max = opts?.max ?? MAX_ACTIONS;
  const maxAge = opts?.maxAgeDays ?? MAX_AGE_DAYS;
  const now = opts?.now ?? Date.now();
  const cutoff = now - maxAge * 86400000;

  const doomed = [];
  list.forEach((r, i) => {
    if (!r?.id) return;
    /* Sayı sınırı: en yeni `max` kayıt kalıyor */
    if (i >= max) { doomed.push(r.id); return; }
    /* Yaş sınırı */
    const t = r.created_at ? new Date(r.created_at).getTime() : null;
    if (t && t < cutoff) doomed.push(r.id);
  });
  return doomed;
}

/*
  ---------- PUAN GÜNCELLEME KARARI ----------

  Her sinyalde puanı yeniden hesaplamak gereksiz sorgu demek.
  Ne zaman hesaplanmalı?

    • Eşiği yeni geçtiyse (ilk kez puanlanabilir hale geldi)
    • Her 5 sinyalde bir (ara güncelleme)

  Aksi halde eski puan kalıyor — biraz eskimiş olması, her
  kopyalamada ek sorgu atmaktan iyidir.
*/
export const RESCORE_EVERY = 5;

export function shouldRescore(signalCount) {
  const n = Number(signalCount) || 0;
  if (n === MIN_SIGNALS) return true;          // eşiği yeni geçti
  if (n > MIN_SIGNALS && n % RESCORE_EVERY === 0) return true;
  return false;
}
