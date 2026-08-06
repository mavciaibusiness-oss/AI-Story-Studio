import { projectSummary, STATUSES } from '@/lib/project/model';
import { workflowStatus } from '@/lib/creator/suggest';
import { dominant } from '@/lib/creator/memory';

/*
  CREATOR DASHBOARD — veri motoru.

  Sprint 5 / TASK-06, Adım 1.

  ---------------------------------------------------------------
  ROL AYRIMI (kullanıcının kararı)

    /studio/creator  → Workspace: "şimdi ne yapıyorum"
    /studio          → Dashboard: "genel olarak nerede duruyorum"

  Spec Dashboard'u "günlük çalışma merkezi" diye tarif ediyor ama o
  Workspace'in işi. Harfiyen uygulasaydım Workspace'in kopyasını
  yapmış olurdum — kullanıcının açıkça yasakladığı şey
  ("Dashboard ile yarışan üçüncü ekran oluşturulmayacak").

  Dashboard GERİYE bakıyor: bu hafta ne ürettim, nerede duruyorum,
  hedeflerime ne kadar yaklaştım. Workspace İLERİYE bakıyor: sıradaki
  adım ne.
  ---------------------------------------------------------------

  BU DOSYA VERİTABANINA ERİŞMİYOR

  Saf dönüşüm: satırlar girer, özet çıkar. Sorguları API atıyor
  (Adım 2). Test edilebilir kalıyor.

  ATLANAN BÖLÜMLER (kullanıcının kararı: Sprint-6):
    • Trend önerileri/bildirimleri — dış veri kaynağı yok
    • Render ve Storage kullanımı — ölçülmüyor
*/

export const DASHBOARD_VERSION = 1;

/* Hafta = son 7 gün. Takvim haftası değil: pazartesi sabahı
   "bu hafta 0 video" görmek moral bozucu ve yanıltıcı. */
export const WEEK_DAYS = 7;

/*
  Format → üretim kategorisi. Spec'in istediği dört kategori.
  FORMATS listesindeki gerçek anahtarlara dayanıyor.

  TEK KAYNAK: Creator Intelligence Adım 5'te lib/intel/stats.js'e
  ikinci bir kopya yazmıştım — Adım 6'da birleştirildi. İki yerde
  farklı sayarsak Dashboard'ın "bu hafta" ve "bugüne kadar"
  bölümleri çelişirdi.

  Sprint-5'te memory.profile.language ile aynı sorunu yaşamıştık.
*/
export const CATEGORY = {
  youtube: 'video', documentary: 'video', podcast: 'video',
  shorts: 'shorts', tiktok: 'shorts', reels: 'shorts',
  square: 'ad'
};

export const CATEGORY_KEYS = ['video', 'shorts', 'ad', 'other'];

export function categoryOf(format) {
  return CATEGORY[format] || 'other';
}

function inWindow(iso, days) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  return (Date.now() - t) / 86400000 <= days;
}

/*
  ---------- CREATOR SUMMARY ----------

  Spec: "Bugünkü durum · Tamamlanan · Devam eden · Bekleyen"

  DÜRÜSTLÜK NOTU: "bugünkü durum" diye ayrı bir şey uydurmuyoruz.
  Kullanıcının bugün ne kadar çalışacağını bilmiyoruz (TASK-04'te de
  aynı kararı vermiştik). Gerçek olanı söylüyoruz: kaç iş bitti, kaç
  tanesi sürüyor, kaç tanesi bekliyor.
*/
export function creatorSummary({ episodes, sessions }) {
  const eps = (episodes || []).map(projectSummary);

  let done = 0, active = 0, waiting = 0;
  for (const p of eps) {
    if (STATUSES[p.status]?.terminal) { done++; continue; }
    if (p.status === 'idea') { waiting++; continue; }
    /* Son 3 günde dokunulmuşsa "devam eden", değilse "bekleyen".
       Bir işi bırakmakla üstünde çalışmak farklı şeyler. */
    if (inWindow(p.updatedAt, 3)) active++;
    else waiting++;
  }

  /* Creator OS planlarının durumu */
  const plans = (sessions || []).map(s => workflowStatus(s));
  const openPlans = plans.filter(p => p.doable > 0 && !p.complete).length;
  const blockedSteps = plans.reduce((a, p) => a + (p.blocked || 0), 0);

  return {
    total: eps.length,
    done, active, waiting,
    openPlans,
    blockedSteps,
    /* Bugün dokunulan işler — gerçek ölçüm, hedef değil */
    touchedToday: eps.filter(p => inWindow(p.updatedAt, 1)).length
  };
}

/*
  ---------- PRODUCTIVITY ----------

  Spec: "Bu hafta üretilen video / shorts / reklam / storyboard"

  İKİ SAYI AYRI TUTULUYOR:
    started   — bu hafta başlanan (created_at)
    completed — bu hafta tamamlanan (ready/published + updated_at)

  Tek sayı vermek yanıltıcı olurdu: 5 video başlatıp hiçbirini
  bitirmemek ile 5 video bitirmek aynı şey değil.
*/
export function productivity({ episodes, days }) {
  const win = days ?? WEEK_DAYS;
  const eps = (episodes || []).map(projectSummary);

  const empty = () => ({ started: 0, completed: 0 });
  const out = { video: empty(), shorts: empty(), ad: empty(), other: empty() };
  let storyboards = 0, scenes = 0;

  for (const p of eps) {
    const cat = CATEGORY[p.format] || 'other';

    if (inWindow(p.createdAt, win)) {
      out[cat].started++;
      /* Storyboard sayısı: bu hafta sahne kurulmuş bölümler.
         Spec ayrı bir kategori istiyor ama storyboard bir FORMAT
         değil, üretim aşaması — ayrı sayıyoruz. */
      if (p.scenes > 0) { storyboards++; scenes += p.scenes; }
    }
    if (STATUSES[p.status]?.terminal && inWindow(p.updatedAt, win)) {
      out[cat].completed++;
    }
  }

  const totals = Object.values(out).reduce(
    (a, v) => ({ started: a.started + v.started, completed: a.completed + v.completed }),
    { started: 0, completed: 0 });

  return {
    days: win,
    byCategory: out,
    storyboards,
    scenes,
    totals,
    /* Önceki haftayla kıyas — sadece veri varsa.
       "Geçen haftaya göre %40 artış" demek için geçen haftanın
       gerçekten olması gerekir. */
    empty: totals.started === 0 && totals.completed === 0
  };
}

/*
  ---------- AI INSIGHTS ----------

  Spec: "AI Director önerileri · Creator Memory önerileri ·
  Trend önerileri · Risk uyarıları"

  TREND ATLANDI (kullanıcının kararı): dış veri kaynağı yok,
  uydurma trend göstermek yanıltıcı olur. Sprint-6'da.

  Kaynaklar mevcut motorlardan geliyor — yeni öneri sistemi
  yazmıyoruz.
*/
export function aiInsights({ projectSuggestions, memoryProposals, memory, summary }) {
  const out = [];

  /* Proje önerileri (TASK-05) */
  for (const s of (projectSuggestions || []).slice(0, 3)) {
    out.push({
      kind: 'project', type: s.kind,
      title: s.sourceTitle, id: s.sourceId, basis: s.basis
    });
  }

  /* Hafıza çıkarımları (TASK-03) — onay bekleyenler */
  if ((memoryProposals || []).length) {
    out.push({
      kind: 'memory', type: 'proposals',
      count: memoryProposals.length,
      fields: memoryProposals.map(p => p.field)
    });
  }

  /* Hafızadan gözlem — kullanıcı kendini tanısın */
  const genre = dominant(memory?.content?.genres);
  if (genre?.key && genre.confidence >= 0.7) {
    out.push({
      kind: 'memory', type: 'known-genre',
      genre: genre.key, count: genre.count, total: genre.total
    });
  }

  /* RİSK UYARILARI — gerçek sorunlardan, tahminden değil */
  const risks = [];
  if (summary?.blockedSteps > 0) {
    risks.push({ type: 'blocked-steps', count: summary.blockedSteps });
  }
  if (summary?.waiting > 0 && summary.active === 0) {
    /* Hiçbir işe dokunulmuyor ama bekleyen var — durma riski */
    risks.push({ type: 'all-idle', count: summary.waiting });
  }
  for (const r of risks) out.push({ kind: 'risk', ...r });

  return out;
}

/*
  ---------- GOALS ----------

  Spec: "Uzun vadeli hedefler · ilerleme · tamamlanma yüzdesi"

  İLERLEME SORUNU: hedefler serbest metin ("100.000 abone").
  Sistemin bunu ölçmesi mümkün değil — abone sayısını bilmiyoruz.

  Uydurma bir yüzde göstermek yerine ÖLÇEBİLDİĞİMİZİ gösteriyoruz:
  kaç hedef tamamlandı olarak işaretlendi. Kullanıcı kendi
  işaretliyor; biz onun kararını sayıyoruz.
*/
export function goalProgress(memory) {
  const goals = memory?.goals || [];
  if (!goals.length) return { total: 0, done: 0, open: 0, percent: null, items: [] };

  const done = goals.filter(g => g.done).length;
  return {
    total: goals.length,
    done,
    open: goals.length - done,
    percent: Math.round((done / goals.length) * 100),
    items: goals.slice(0, 5).map(g => ({
      id: g.id, text: g.text, target: g.target || null, done: !!g.done,
      /* Ölçülemez olduğunu açıkça taşıyoruz — arayüz yüzde çubuğu
         göstermesin, sadece işaretli/işaretsiz. */
      measurable: false
    }))
  };
}

/*
  ---------- RECENT ACTIVITY ----------

  Spec: "Son işlemler · son projeler · son export · son upload"

  EXPORT VE UPLOAD KAYDEDİLMİYOR: render tarayıcıda çalışıyor ve
  indirme kaydı tutulmuyor; YouTube yükleme entegrasyonu yok.
  Uydurmuyoruz — gösterebildiğimiz gerçek olaylar bunlar:

    • sürüm kayıtları (v7/v8/v9 snapshot'ları)
    • son güncellenen projeler
*/
export function recentActivity({ episodes, versions, limit }) {
  const max = limit ?? 8;
  const out = [];

  for (const v of (versions || [])) {
    out.push({
      kind: 'version', at: v.at, versionKind: v.kind,
      title: v.projectTitle || null, scene: v.scene ?? null
    });
  }

  for (const ep of (episodes || []).slice(0, 5)) {
    const p = projectSummary(ep);
    out.push({
      kind: 'project', at: p.updatedAt, title: p.title, status: p.status
    });
  }

  return out
    .filter(x => x.at)
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, max);
}

/*
  ---------- WORKSPACE HEALTH ----------

  Spec: "Creator Workspace sağlıklı mı · eksik modül var mı ·
  çalışmayan görev var mı"

  Bu bir SİSTEM sağlığı değil, KULLANICI durumu kontrolü. Gerçekten
  bakabileceğimiz şeyler:

    • migration eksikse hafıza/sürüm kapalı
    • tıkanmış planlar
    • eskimiş iş
*/
export function workspaceHealth({ sessions, memoryEnabled, versionsAvailable }) {
  const issues = [];

  if (memoryEnabled === false) {
    issues.push({ type: 'memory-off', severity: 'warn' });
  }
  if (versionsAvailable === false) {
    issues.push({ type: 'versions-off', severity: 'info' });
  }

  const plans = (sessions || []).map(s => ({ s, st: workflowStatus(s) }));
  const stuck = plans.filter(x => x.st.stuck);
  if (stuck.length) {
    issues.push({ type: 'stuck-plans', severity: 'warn', count: stuck.length });
  }
  const stale = plans.filter(x => (x.st.stale || []).length);
  if (stale.length) {
    issues.push({ type: 'stale-work', severity: 'warn', count: stale.length });
  }

  /*
    ENGELLİ ADIMLAR — kalibrasyonda yakalandı.

    İlk sürümde yalnızca `stuck` planlara bakıyordum. Ama bir plan
    tıkanmamış olabilir (yapılacak başka adım var) ve yine de çok
    sayıda engelli adım taşıyabilir. Özet "7 engelli adım" derken
    sağlık "sorun yok" diyordu — iki bölüm birbiriyle çelişiyordu.

    Tıkanma kadar acil değil (bilgi seviyesi), ama görünmesi gerek.
  */
  const blocked = plans.reduce((a, x) => a + (x.st.blocked || 0), 0);
  if (blocked > 0 && !stuck.length) {
    issues.push({ type: 'blocked-steps', severity: 'info', count: blocked });
  }

  return {
    healthy: issues.length === 0,
    issues,
    /* Kaç plan izleniyor — bağlam için */
    plans: plans.length
  };
}

/*
  ---------- CREDITS ----------

  Spec: "Kredi kullanımı · AI kullanımı · Render kullanımı ·
  Storage kullanımı"

  RENDER VE STORAGE ATLANDI (kullanıcının kararı): ölçülmüyor.
  Render tarayıcıda çalışıyor, depolama takibi yok.

  Kredi ve AI kullanımı gerçek: profiles.credits ve plan.
*/
export function creditStatus(profile) {
  const credits = profile?.credits;
  const plan = profile?.plan || 'free';
  const vip = credits === null || credits === undefined;

  return {
    plan,
    credits: vip ? null : credits,
    /* VIP'te kredi düşülmüyor — sınırsız demek, sıfır değil */
    unlimited: vip,
    /* Ölçülmeyen boyutlar açıkça bildiriliyor (Sprint-6) */
    notMeasured: ['render', 'storage']
  };
}

/*
  ---------- DYNAMIC DASHBOARD ----------

  Spec: "YouTube üreticisi ile Reklam ajansı aynı ekranı görmemeli."

  TASK-04'teki widget kararının aynısı: hafızadan türetiyoruz ama
  ABARTMIYORUZ. Bölüm sırası değişiyor, bölümler kaybolmuyor —
  kullanıcı aradığını bulamazsa kişiselleştirme zarar verir.
*/
export const SECTIONS = ['summary', 'productivity', 'insights', 'goals',
                         'activity', 'health', 'credits',
                         /* Creator Intelligence Adım 5 */
                         'lifetime', 'habits', 'memHealth'];

/*
  ---------- GRUPLAMA ----------

  Sprint 6 / TASK-07.

  On bölüm alt alta çok uzun. Ama sorun SAYI değil, hepsinin AYNI
  ÖNEMDE görünmesi.

  Kullanıcı Dashboard'a iki farklı soruyla geliyor:

    GÜNLÜK  — "bugün ne oldu, ne bekliyor?"
    ARŞİV   — "genel olarak nerede duruyorum?"

  İkincisi haftada bir bakılan bir şey. Her gün önüne çıkması
  gürültü.

  ÇÖZÜM: günlük olanlar açık, arşiv katlanmış. Silmiyoruz — bilgi
  duruyor, sadece istendiğinde açılıyor.
*/
export const SECTION_GROUPS = {
  /* Her gün anlamlı: bugün ne oldu, ne bekliyor, ne bozuk */
  daily: ['summary', 'insights', 'health', 'productivity'],
  /* Haftada bir bakılır: geçmiş, alışkanlık, kaynak */
  archive: ['lifetime', 'habits', 'activity', 'goals', 'credits', 'memHealth']
};

export function groupOf(key) {
  if (SECTION_GROUPS.daily.includes(key)) return 'daily';
  return 'archive';
}

/*
  Sıralanmış bölümleri gruplara ayırır. Arayüz iki liste alıyor:
  biri açık, biri katlanmış.
*/
export function groupSections(order) {
  const list = Array.isArray(order) && order.length ? order : SECTIONS;
  const daily = [], archive = [];
  for (const k of list) (groupOf(k) === 'daily' ? daily : archive).push(k);
  return { daily, archive };
}

export function sectionOrder(memory, summary) {
  const weight = {
    summary: 100, productivity: 90, insights: 80,
    goals: 50, activity: 60, health: 40, credits: 30,
    /* Toplam üretim gurur verici bir sayı — üretim raporunun
       hemen altında. Alışkanlıklar bilgilendirici ama günlük
       karara etki etmiyor, aşağıda. */
    lifetime: 70, habits: 45, memHealth: 35
  };

  /* Hedefi olan kullanıcıda hedefler öne */
  if ((memory?.goals || []).some(g => !g.done)) weight.goals += 25;

  /* Kısa form üreticisi hızlı çalışıyor — üretim sayıları daha
     anlamlı */
  const fmt = dominant(memory?.content?.formats);
  if (['shorts', 'tiktok', 'reels'].includes(fmt?.key)) weight.productivity += 10;

  /* Sorun varsa sağlık öne çıksın */
  if (summary?.blockedSteps > 0) weight.health += 40;

  return SECTIONS.slice().sort((a, b) => weight[b] - weight[a]);
}
