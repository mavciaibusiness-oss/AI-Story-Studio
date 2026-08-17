import { buildTimeline } from '@/lib/timeline';
/* R1: kullanılıyordu ama import edilmemişti */
import { unfinishedSessions } from '@/lib/creator/session';
import { suggestNext } from '@/lib/creator/suggest';

/*
  SMART PROJECT MANAGER — proje modeli.

  Sprint 5 / TASK-05, Adım 1.

  ---------------------------------------------------------------
  ÖNCE ANALİZ (spec: "var olan mimari kullanılacak")

  Spec'in istediklerinin çoğu zaten var, ama dağınık:

    proje durumu    → episodes.status (jsonb) — ama sadece
                      {story:true} yazılıyor, hiç OKUNMUYOR
    zaman çizelgesi → oturum olay günlüğü (lib/creator/live.js)
    snapshot        → v7 scene_plans, v8 story_rewrites,
                      v9 director_actions — üçünde de var
    yarım kalanlar  → unfinishedSessions()
    AI önerileri    → suggestNext()

  Yeni tablo AÇMIYORUZ. Durum storyboard'dan TÜRETİLİYOR.
  ---------------------------------------------------------------

  DURUM NEDEN TÜRETİLİYOR, SAKLANMIYOR

  `episodes.status` kolonu var ama güvenilmez: yalnızca hikâye
  sayfası yazıyor ({story:true}), diğer sayfalar yazmıyor. Yani
  kolon eksik veri taşıyor.

  Saklanan durum bir de BAYATLAR: kullanıcı storyboard'u silse
  status hâlâ "Ready" derdi.

  Türetilen durum her zaman doğru: storyboard'a bakıp "bu proje
  nerede" sorusunu anlık yanıtlıyor. Bedeli her okumada hesaplama —
  ucuz bir işlem.
*/

export const PROJECT_VERSION = 1;

/*
  Spec'in dokuz durumu. Sekizi türetilebiliyor; `failed` türetilemez
  (bir hata kaydı yok) — kullanıcı elle işaretlerse saklanacak.
*/
export const STATUSES = {
  idea:       { order: 0, terminal: false },
  planning:   { order: 1, terminal: false },
  generating: { order: 2, terminal: false },
  editing:    { order: 3, terminal: false },
  /* ready TERMINAL: iş bitti, kullanıcıyı "yarım kaldı" diye
     dürtmemeliyiz. Yayınlama ayrı bir karar, eksik iş değil. */
  ready:      { order: 4, terminal: true },
  published:  { order: 5, terminal: true },
  archived:   { order: 6, terminal: true },
  paused:     { order: 7, terminal: false },
  /* Türetilemez — üretim hatası kaydı tutulmuyor. Kullanıcı elle
     işaretlerse `episodes.status.manual` alanında saklanır. */
  failed:     { order: 8, terminal: true, manualOnly: true }
};

export const STATUS_KEYS = Object.keys(STATUSES);

/* Elle işaretlenebilen durumlar — türetme bunları ezmiyor.
   Kullanıcı "arşivlendi" dediyse storyboard doluluğu onu geri
   çeviremez. */
const MANUAL_WINS = ['archived', 'published', 'paused', 'failed'];

/*
  ---------- DURUMU TÜRET ----------

  Girdi: bölüm satırı (storyboard dahil)
  Çıkış: { status, derived, reason }

    derived: true  → storyboard'dan çıkarıldı
    derived: false → kullanıcı elle işaretlemiş
*/
export function deriveStatus(episode) {
  const manual = episode?.status?.manual;
  if (manual && MANUAL_WINS.includes(manual)) {
    return { status: manual, derived: false, reason: 'manual' };
  }

  const sb = episode?.storyboard;
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];

  /* Sahne yok → henüz fikir aşaması */
  if (!scenes.length) {
    /* Başlık kontrolü YALNIZCA storyboard'a bakıyor.

       `episode.title` her zaman dolu — veritabanı varsayılanı
       'Yeni Bölüm'. Onu "kullanıcı başlık yazdı" saymak her boş
       bölümü `planning` gösterirdi. */
    const hasTitle = !!String(sb?.title || '').trim();
    return {
      status: hasTitle ? 'planning' : 'idea',
      derived: true,
      reason: hasTitle ? 'has-title-no-scenes' : 'empty'
    };
  }

  /* Sahne var — kaçında ne hazır? */
  const withText = scenes.filter(s =>
    String(s?.paragraph || s?.voiceText || '').trim()).length;
  const withPrompt = scenes.filter(s =>
    String(s?.imagePrompt || s?.videoPrompt || '').trim()).length;
  const withMedia = scenes.filter(s => s?.image || s?.video).length;
  const withVoice = scenes.filter(s => s?.voice).length;

  const n = scenes.length;

  /* Kurgu çıktısı storyboard'da tutulmuyor (render tarayıcıda).
     "published" ve "ready" ayrımı için elle işaret gerekiyor —
     uydurmuyoruz. */
  if (withMedia === n && withVoice === n) {
    return { status: 'ready', derived: true, reason: 'all-media-and-voice' };
  }
  if (withMedia > 0 || withVoice > 0) {
    return { status: 'editing', derived: true, reason: 'media-in-progress' };
  }
  if (withPrompt > 0) {
    return { status: 'generating', derived: true, reason: 'prompts-written' };
  }
  if (withText > 0) {
    return { status: 'planning', derived: true, reason: 'text-written' };
  }
  return { status: 'planning', derived: true, reason: 'scenes-only' };
}

/*
  ---------- PROJE ÖZETİ ----------

  Bir bölümün ölçülebilir gerçekleri. Hepsi mevcut veriden.

  UYDURULMAYAN: izlenme sayısı, retention, tıklanma oranı.
  Bunlar için YouTube Analytics bağlantısı gerekiyor ve yok.
  Sprint-4 TASK-05'te de aynı sınırı çizmiştik.
*/
export function projectSummary(episode) {
  const sb = episode?.storyboard;
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  const st = deriveStatus(episode);

  let duration = null;
  if (scenes.length) {
    try {
      const tl = buildTimeline(sb);
      duration = { total: tl.total, estimated: tl.estimated };
    } catch { /* timeline kurulamadı */ }
  }

  /* Üretim süresi — ilk oluşturma ile son düzenleme arası.
     Gerçek "çalışma süresi" değil (kullanıcı arada başka iş yapmış
     olabilir); bunu adlandırmada belirtiyoruz: elapsed, not worked. */
  let elapsedDays = null;
  if (episode?.created_at && episode?.updated_at) {
    const ms = new Date(episode.updated_at) - new Date(episode.created_at);
    if (ms >= 0) elapsedDays = +(ms / 86400000).toFixed(1);
  }

  return {
    id: episode?.id || null,
    /* Başlık önceliği: storyboard > episode.

       episode.title veritabanı varsayılanı ('Yeni Bölüm') taşıyabilir
       ve çoğu zaman taşıyor — kullanıcı başlığı storyboard'da
       düzenliyor. Önce ona bakmazsak proje listesinde her şey
       "Yeni Bölüm" görünür. */
    title: String(sb?.title || '').trim() || episode?.title || '',
    status: st.status,
    statusDerived: st.derived,
    genre: sb?.genre || null,
    format: sb?.format || null,
    style: sb?.style || null,
    scenes: scenes.length,
    duration,
    elapsedDays,
    createdAt: episode?.created_at || null,
    updatedAt: episode?.updated_at || null,
    /* Sahne düzeyinde hazırlık — karşılaştırma ve ilerleme için */
    ready: {
      text: scenes.filter(s => String(s?.paragraph || s?.voiceText || '').trim()).length,
      prompts: scenes.filter(s => String(s?.imagePrompt || s?.videoPrompt || '').trim()).length,
      media: scenes.filter(s => s?.image || s?.video).length,
      voice: scenes.filter(s => s?.voice).length,
      total: scenes.length
    },
    /* Creator OS izi (TASK-01 Adım 5'te eklenmişti) */
    fromCreator: sb?.scratch?.mode === 'creator-os',
    creatorInput: sb?.scratch?.creatorInput || null
  };
}

/*
  ---------- ZAMAN ÇİZELGESİ ----------

  Spec'in örneği: "Story oluşturuldu → Storyboard tamamlandı →
  Video üretildi → Thumbnail oluşturuldu → Export edildi"

  KAYNAK SORUNU: bu olayların zamanı hiçbir yerde tutulmuyor.
  `episodes` yalnızca created_at ve updated_at taşıyor.

  İKİ SEÇENEK:
    a) Her adım için zaman damgası kolonu eklemek — yeni migration,
       ve geçmiş projeler için veri yine yok.
    b) Storyboard'un MEVCUT durumundan kilometre taşlarını çıkarmak —
       zaman yok ama SIRA ve DURUM var.

  (b) seçildi. "Ne zaman" diyemiyoruz ama "nereye kadar geldi"
  diyebiliyoruz. Zaman damgası uydurmaktansa yokluğunu söylemek
  doğru.

  Creator OS oturumu varsa GERÇEK zaman damgaları oradan geliyor
  (olay günlüğü) — o zaman `at` alanı doluyor.
*/
const MILESTONES = [
  { key: 'created',    test: () => true },
  { key: 'script',     test: (r) => r.text > 0 },
  { key: 'storyboard', test: (r) => r.total > 0 },
  { key: 'prompts',    test: (r) => r.prompts > 0 },
  { key: 'images',     test: (r) => r.media > 0 },
  { key: 'voice',      test: (r) => r.voice > 0 },
  { key: 'complete',   test: (r) => r.total > 0 && r.media === r.total && r.voice === r.total }
];

export function projectTimeline(episode, session) {
  const summary = projectSummary(episode);
  const r = summary.ready;

  /* Creator OS günlüğünden gerçek zaman damgaları — varsa */
  const logTimes = {};
  const log = Array.isArray(session?.log) ? session.log : [];
  for (const e of [...log].reverse()) {
    if (e.type === 'task.done' && e.taskKey && !logTimes[e.taskKey]) {
      logTimes[e.taskKey] = e.at;
    }
  }

  return MILESTONES.map(m => ({
    key: m.key,
    done: m.key === 'created' ? true : m.test(r),
    /* Zaman YALNIZCA gerçekten biliniyorsa. Bilinmiyorsa null —
       arayüz "tarih yok" diyecek, uydurma tarih göstermeyecek. */
    at: m.key === 'created' ? (episode?.created_at || null)
      : (logTimes[m.key] || null)
  }));
}

/*
  ---------- YARIM KALANLAR ----------

  Spec: "Creator OS yarım kalan projeleri otomatik bulmalı."

  Kriter: terminal durumda DEĞİL ve son düzenlemeden beri zaman
  geçmiş. Bugün üstünde çalıştığı projeyi "yarım kaldı" diye
  hatırlatmak rahatsız edici olur.
*/
export const STALE_DAYS = 1;

export function findUnfinished(episodes, opts) {
  const minDays = opts?.minDays ?? STALE_DAYS;
  const now = Date.now();

  return (episodes || [])
    .map(ep => ({ ep, s: projectSummary(ep) }))
    .filter(({ s, ep }) => {
      if (STATUSES[s.status]?.terminal) return false;
      if (s.status === 'idea') return false;   // hiç başlanmamış
      const last = ep?.updated_at ? new Date(ep.updated_at).getTime() : 0;
      if (!last) return false;
      return (now - last) / 86400000 >= minDays;
    })
    .sort((a, b) =>
      (b.ep.updated_at || '').localeCompare(a.ep.updated_at || ''))
    .map(({ s, ep }) => ({
      ...s,
      idleDays: +((now - new Date(ep.updated_at).getTime()) / 86400000).toFixed(1)
    }));
}

/* Duruma göre grupla — proje listesi için. */
export function groupByStatus(episodes) {
  const out = {};
  for (const k of STATUS_KEYS) out[k] = [];
  for (const ep of (episodes || [])) {
    const s = projectSummary(ep);
    (out[s.status] = out[s.status] || []).push(s);
  }
  return out;
}

/* Durum sayıları — Workspace panosu için. */
export function statusCounts(episodes) {
  const g = groupByStatus(episodes);
  const counts = {};
  let total = 0;
  for (const [k, v] of Object.entries(g)) {
    if (v.length) { counts[k] = v.length; total += v.length; }
  }
  return { counts, total };
}
