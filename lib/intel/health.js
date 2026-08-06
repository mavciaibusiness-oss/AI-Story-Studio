/*
  CREATOR INTELLIGENCE — hafıza sağlığı.

  Sprint 6 / Creator Intelligence, Adım 6.

  Spec maddesi 13: Creator OS uyarı verir —
    "Marka tonu değişti."
    "Logo güncel değil."
    "Eski CTA kullanılıyor."

  ---------------------------------------------------------------
  ÜÇÜNDEN İKİSİ ÖLÇÜLEBİLİR

  "Logo güncel değil" — LOGO YÜKLEME YOK. Depolama akışı gelene
  kadar (TASK-09) bir logonun güncel olup olmadığını bilemeyiz.
  Bu uyarı ÜRETİLMİYOR.

  "Marka tonu değişti" — marka kaydı değişebiliyor, kayıt tarihi
  var. Kullanıcı markasını güncelledikten SONRA eski projelerin
  o tonla üretilmediğini söyleyebiliriz.

  "Eski CTA kullanılıyor" — CTA alanı marka kaydında yok (slogan
  var). Slogan üzerinden aynı mantık kurulabilir.
  ---------------------------------------------------------------

  UYARI DEĞİL, GÖZLEM

  Bunlar "yanlış yapıyorsun" demiyor. Kullanıcı markasını bilinçli
  güncellemiş olabilir ve eski projeleri öyle bırakmak isteyebilir.

  Söylediğimiz: "bu proje marka güncellemenden önce üretildi."
  Karar kullanıcının.
*/

export const HEALTH_VERSION = 1;

/*
  Marka kaydı güncellendikten sonra üretilen projeler "uyumlu"
  sayılıyor. ÖNCE üretilenler için gözlem çıkıyor.

  TOLERANS: aynı gün üretilenler sayılmıyor. Kullanıcı markasını
  kurup hemen üretime geçmiş olabilir; saat farkına takılmak
  gereksiz gürültü olur.
*/
export const SAME_DAY_MS = 86400000;

/*
  ---------- MARKA GÜNCELLİĞİ ----------

  Girdi:
    brands   — memory.brands
    episodes — proje özetleri (createdAt taşıyan)

  Çıkış: gözlem listesi. Boş dizi = söylenecek bir şey yok.
*/
export function brandDrift({ brands, episodes }) {
  const list = Array.isArray(brands) ? brands : [];
  const eps = Array.isArray(episodes) ? episodes : [];
  if (!list.length || !eps.length) return [];

  const out = [];
  for (const br of list) {
    /*
      `updatedAt` yoksa `createdAt` kullanılıyor. Marka hiç
      güncellenmemişse kayıt tarihinden önceki projeler zaten
      marka yokken üretilmiş demektir — bu da geçerli bir gözlem.
    */
    const stamp = br?.updatedAt || br?.createdAt;
    if (!stamp) continue;
    const t = new Date(stamp).getTime();
    if (!Number.isFinite(t)) continue;

    const older = eps.filter(e => {
      const et = e?.createdAt ? new Date(e.createdAt).getTime() : null;
      if (!Number.isFinite(et)) return false;
      /* Aynı gün toleransı */
      return et < t - SAME_DAY_MS;
    });

    if (!older.length) continue;

    out.push({
      kind: 'brand-drift',
      brandId: br.id,
      brandName: br.name || null,
      /* Kaç proje marka güncellemesinden önce üretildi */
      count: older.length,
      updatedAt: new Date(t).toISOString(),
      /* En yenisi — kullanıcı ilk oraya bakmak isteyebilir */
      latestId: older
        .slice()
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]?.id || null
    });
  }
  return out;
}

/*
  ---------- EKSİK MARKA BİLGİSİ ----------

  Marka kaydı var ama alanları boş. Bu bir "hata" değil — kullanıcı
  sonra doldurmayı planlıyor olabilir. Ama üretimde kullanılamayacak
  bir marka kaydı sessizce durmamalı.

  Yalnızca ÜRETİMDE İŞE YARAYAN alanlara bakıyoruz. `voice` (ton)
  ve `bannedWords` prompt üretimini etkiliyor; `font` şu an
  hiçbir yerde kullanılmıyor, onu eksik saymak yanlış olur.
*/
const USEFUL_FIELDS = ['voice', 'colors', 'bannedWords', 'slogan'];

export function brandGaps(brands) {
  const list = Array.isArray(brands) ? brands : [];
  const out = [];

  for (const br of list) {
    const missing = USEFUL_FIELDS.filter(f => {
      const v = br?.[f];
      if (Array.isArray(v)) return v.length === 0;
      return !v;
    });
    /* Hepsi boşsa kayıt henüz kurulmamış — tek tek saymak yerine
       bunu söylüyoruz */
    if (missing.length === USEFUL_FIELDS.length) {
      out.push({ kind: 'brand-empty', brandId: br.id, brandName: br.name || null });
    } else if (missing.length) {
      out.push({
        kind: 'brand-gaps', brandId: br.id, brandName: br.name || null,
        missing
      });
    }
  }
  return out;
}

/*
  ---------- HAFIZA SAĞLIĞI ÖZETİ ----------

  Tüm gözlemler tek yerde. Arayüz bunu gösterecek.

  ÖLÇÜLMEYENLER açıkça bildiriliyor: logo ve CTA. Spec istiyor ama
  altyapı yok — gizlemek yerine söylüyoruz.
*/
export function memoryHealth({ brands, episodes }) {
  const items = [
    ...brandDrift({ brands, episodes }),
    ...brandGaps(brands)
  ];

  return {
    items,
    healthy: items.length === 0,
    /* Marka kaydı hiç yoksa "sağlıklı" demek yanıltıcı — söyleyecek
       bir şey yok demek. Arayüz bölümü hiç göstermesin. */
    hasBrands: Array.isArray(brands) && brands.length > 0,
    notMeasured: ['logo', 'cta']
  };
}
