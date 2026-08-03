import { classifyIntent } from '@/lib/creator/intent';
import { buildWorkflow } from '@/lib/creator/workflow';

/*
  LANDING — dönüşümlü örnek istekler.

  Sprint 6 / TASK-01, Adım 1.

  ---------------------------------------------------------------
  TEMEL KURAL (kullanıcının koyduğu)

    "Kullanıcıya hiçbir zaman uydurma veri gösterilmeyecek.
     Canlı değilse söyleyeceğiz. Hazır değilse göstermeyeceğiz.
     Gerçek veri geldiğinde otomatik çalışacak."

  Spec landing'de "Bugün trend olan 8 niş" ve "Son 24 saatte
  yükselen içerikler" istiyordu. TREND VERİSİ YOK — YouTube Data
  API / Google Trends entegrasyonu Sprint-6'nın ilgili tasklarında
  gelecek.

  Landing'de uydurma trend göstermek ürünün İLK İZLENİMİNİ yalan
  üzerine kurar. Kullanıcı tıklayıp gerçek olmadığını anlarsa geri
  kalan her şeye güveni sarsılır.

  Bunun yerine: Creator OS'un GERÇEKTEN çalıştırabildiği istekler
  dönüşümlü gösteriliyor.
  ---------------------------------------------------------------

  HER ÖRNEK DOĞRULANIYOR

  Aşağıdaki listeyi elle yazmadım — her cümleyi Intent Engine'den
  geçirip yol haritası kurulabildiğini test ettim.

  Kullanıcının önerdiği sekiz örnekten ÜÇÜ çalışmıyordu:

    "YouTube kanalımı analiz et"          → 0/3 görev
    "Rakiplerimi araştır"                 → 0/2 görev
    "Kanalım için yeni video fikirleri"   → 0/3 görev

  Intent Engine onları TANIYOR ama karşılık gelen akışlar tamamen
  Sprint-6 görevlerinden oluşuyor. Kullanıcı tıklarsa BOŞ yol
  haritası görürdü — tam da "hazır değilse gösterme" kuralının
  yasakladığı şey.

  Yerlerine gerçekten çalışan akışlar konuldu. Analiz akışları
  Sprint-6'da hazır olunca buraya eklenecek.
*/

export const LANDING_VERSION = 1;

/*
  Örnek istekler. Her biri test edilmiş: Intent Engine tanıyor ve
  buildWorkflow en az bir yapılabilir görev üretiyor.

  `intent` alanı beklenen niyeti taşıyor — `verifyExamples()` bunu
  doğruluyor, sessizce bozulmasın.
*/
export const EXAMPLES = [
  { tr: 'YouTube kanalım için korku videosu hazırla',
    en: 'Make a horror video for my YouTube channel',
    intent: 'video.horror' },
  { tr: 'Shorts serisi üretmek istiyorum',
    en: 'I want to produce a Shorts series',
    intent: 'video.shorts' },
  { tr: 'Bu ürüne reklam videosu hazırla',
    en: 'Make an ad video for this product',
    intent: 'ad.product' },
  { tr: 'Çocuklar için masal videosu üret',
    en: 'Create a bedtime story video for kids',
    intent: 'video.kids' },
  { tr: 'Bu videoyu analiz edip geliştir',
    en: 'Analyse this video and improve it',
    intent: 'improve.video' },
  { tr: 'Etsy mağazam için içerik hazırla',
    en: 'Create content for my Etsy shop',
    intent: 'ad.etsy' },
  { tr: 'Instagram Reels üret',
    en: 'Produce Instagram Reels',
    intent: 'video.reels' },
  { tr: 'Belgesel tarzı bir video oluştur',
    en: 'Create a documentary-style video',
    intent: 'video.documentary' }
];

/*
  ---------- DOĞRULAMA ----------

  Her örneğin gerçekten çalıştığını kontrol eder. Test bunu
  çağırıyor; bir niyet tanımı değişip örnek bozulursa yakalanır.

  Çıkış: [{ text, ok, intent, expected, doable, reason }]
*/
export function verifyExamples(locale) {
  const loc = locale || 'tr';
  return EXAMPLES.map(e => {
    const text = e[loc] || e.tr;
    const r = classifyIntent(text);
    const wf = buildWorkflow(r);
    const doable = (wf?.tasks || []).filter(t => !t.future).length;

    let reason = null;
    if (r.intent !== e.intent) reason = 'intent-mismatch';
    else if (wf?.available === false) reason = 'workflow-unavailable';
    else if (doable === 0) reason = 'no-doable-tasks';

    return {
      text, ok: reason === null, intent: r.intent, expected: e.intent,
      doable, total: (wf?.tasks || []).length, reason
    };
  });
}

/*
  ---------- DÖNÜŞÜMLÜ GÖSTERİM ----------

  Spec: "AI önerileri sürekli değişir. Landing canlı görünmelidir."

  Canlılık gerçek: liste dönüyor ve her öğe gerçekten çalışıyor.
  Sahte bir "şu an trend" iddiası yok.

  DETERMİNİSTİK DEĞİL, ama SUNUCU-İSTEMCİ UYUMSUZLUĞU da olmamalı:
  Next.js sunucuda ve istemcide farklı sonuç üretirse hydration
  hatası çıkar. Bu yüzden başlangıç dilimi sabit; dönüş yalnızca
  istemcide, ilk render'dan SONRA başlıyor.
*/
export const ROTATE_MS = 3600;
export const VISIBLE = 4;

export function sliceAt(index, locale) {
  const loc = locale || 'tr';
  const n = EXAMPLES.length;
  const start = ((index % n) + n) % n;
  const out = [];
  for (let i = 0; i < Math.min(VISIBLE, n); i++) {
    const e = EXAMPLES[(start + i) % n];
    out.push({ text: e[loc] || e.tr, intent: e.intent });
  }
  return out;
}

/*
  ---------- AI'IN YAPTIĞI İŞLER ----------

  Spec'in "Güven Bölümü" listesi. Ama on iki maddenin hepsi doğru
  değil — bazıları henüz yok.

  Her madde `ready` bayrağı taşıyor. Arayüz yalnızca hazır olanları
  gösteriyor; olmayanları GİZLİYOR (kullanıcının kuralı: "hazır
  değilse göstermeyeceğiz").

  Sprint-6'da analiz akışları gelince `ready: true` yapılacak ve
  otomatik görünecekler.
*/
export const CAPABILITIES = [
  { key: 'script',      ready: true },   // /studio/senaryo
  { key: 'scenes',      ready: true },   // /studio/storyboard
  { key: 'images',      ready: true },   // /studio/gorseller
  { key: 'prompts',     ready: true },   // /studio/promptlar
  { key: 'video',       ready: true },   // /studio/atolye
  { key: 'voice',       ready: true },   // /studio/seslendirme
  { key: 'subtitles',   ready: true },   // /studio/altyazi
  { key: 'format',      ready: true },   // storyboard.format
  { key: 'youtube',     ready: true },   // /studio/youtube
  { key: 'health',      ready: true },   // /studio/saglik
  { key: 'director',    ready: true },   // /studio/yonetmen
  { key: 'memory',      ready: true },   // /studio/hafiza
  /* Henüz yok — Sprint-6'da gerçek API verisiyle gelecek */
  { key: 'competitors', ready: false },
  { key: 'trends',      ready: false }
];

export function readyCapabilities() {
  return CAPABILITIES.filter(c => c.ready);
}

export function pendingCapabilities() {
  return CAPABILITIES.filter(c => !c.ready);
}

/*
  ---------- GÜNLÜK KULLANIM ----------

  Spec'in "Sabah / Öğlen / Akşam / Hafta Sonu" kartları.

  DİKKAT: "Sabah bugünün trendleri" trend verisi gerektiriyor —
  yok. O kart `ready: false`.

  Geri kalanlar gerçek: Workspace sıradaki adımı söylüyor (TASK-04),
  Dashboard performans raporu veriyor (TASK-06), hafıza öneri
  üretiyor (TASK-03).
*/
export const DAILY = [
  { key: 'morning',  ready: false, needs: 'trends' },
  { key: 'midday',   ready: true,  route: '/studio/creator' },
  { key: 'evening',  ready: true,  route: '/studio' },
  { key: 'weekend',  ready: false, needs: 'niche-explorer' }
];

export function readyDaily() {
  return DAILY.filter(d => d.ready);
}
