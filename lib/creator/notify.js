import { normalizeStatus } from './state';
import { staleTasks } from './live';
import { workflowStatus } from './suggest';
import { dominant } from './memory';

/*
  CREATOR WORKSPACE — bildirim sistemi.

  Sprint 5 / TASK-04, Adım 1.

  Spec: "Bildirim sistemi oluştur. Bildirimler Workspace içinde
  yönetilmeli."

  ---------------------------------------------------------------
  TÜRETİLEN BİLDİRİM, SAKLANAN DEĞİL

  Klasik bildirim sistemi olayları bir kuyruğa yazar ve okundu/okunmadı
  durumu tutar. Burada onu YAPMIYORUZ. Sebebi:

    • Bildirimlerin hepsi mevcut durumdan ÇIKARILABİLİYOR. "3 adım
      engelli" bilgisi workflow'da zaten var; ayrıca kaydetmek aynı
      gerçeği iki yerde tutmak olur ve ikisi ayrışır.

    • Saklanan kuyruk bayatlar. "Storyboard tamamlandı" bildirimi
      kullanıcı onu geri açtıktan sonra da durur ve yanlış bilgi verir.

  Türetilen bildirim her zaman GÜNCEL durumu yansıtıyor. Kullanıcı bir
  sorunu çözünce bildirim kendiliğinden kayboluyor.

  Tek saklanan şey: kullanıcının KAPATTIĞI bildirimler (dismissed).
  O da bir kimlik listesi — içerik değil.
  ---------------------------------------------------------------

  METİN YOK, ANAHTAR VAR
  TASK-02'deki günlük kararının aynısı: bildirim i18n anahtarı ve veri
  taşıyor, hazır cümle değil. Dil değişince eski bildirimler yanlış
  dilde kalmasın.
*/

export const NOTIFY_VERSION = 1;

/* Önem sırası — Workspace'te bu sırayla gösterilecek.
   Düşük sayı = daha acil. */
export const LEVELS = {
  problem: 0,   // bir şey bozuk, düzeltilmeli
  action:  1,   // yapılacak bir iş var
  info:    2    // bilgi, aksiyon gerekmiyor
};

/* Aynı anda kaç bildirim gösterilir. Sınırsız liste, bildirim
   sisteminin amacını (dikkati yönlendirmek) yok eder. */
export const MAX_VISIBLE = 5;

function n(id, level, kind, data) {
  return { id, level, kind, data: data || {} };
}

/*
  ---------- BİLDİRİMLERİ TÜRET ----------

  Girdi:
    sessions   — tüm oturumlar
    active     — açık oturum (varsa)
    memory     — Creator Memory (varsa)
    dismissed  — kullanıcının kapattığı bildirim kimlikleri

  Çıkış: önem sırasına dizilmiş bildirim listesi

  Her bildirimin kimliği DETERMİNİSTİK: aynı durum aynı kimliği üretir.
  Kullanıcı kapattığında tekrar açılmıyor; durum değişince kimlik de
  değişiyor ve yeni bildirim geliyor.
*/
/*
  ---------- GÜNLÜK ÖNCELİK ----------

  Sprint 6 / TASK-05, Adım 4.

  Seviye (problem > action > info) tek başına yetmiyor. Uzun aradan
  dönen kullanıcıya "hafıza 2 çıkarım için onayını bekliyor"
  göstermek, "3 haftadır bekleyen videon var" demekten önce gelmemeli.

  GÜN BAĞLAMI seviyeyi EZMİYOR, İÇİNDE sıralıyor. Bir problem her
  zaman bir bilgiden önce gelir; ama iki `action` arasında bugüne
  daha yakın olan öne çıkar.
*/
const DAY_BOOST = {
  /* Uzun aradan dönende: işe dönmek her şeyden önemli */
  'unfinished-project': -0.4,
  'stale-work': -0.3,
  'stuck': -0.3,
  /* Bugün anlamlı olanlar */
  'next-step': -0.2,
  /* Aradan sonra bunlar bekleyebilir — kullanıcı önce işine dönsün */
  'memory-proposals': 0.4,
  'known-genre': 0.5,
  'project-suggestion': 0.3
};

/*
  Dönüş aralığına göre ağırlık.

  `gap` yoksa (aynı gün) sıralama değişmiyor — normal kullanımda
  seviye yeterli.
*/
function dayWeight(kind, gap) {
  const base = LEVELS[kind] ?? 9;
  if (!gap || gap.band === 'same-day' || gap.band === 'recent') return 0;
  return DAY_BOOST[kind] ?? 0;
}

export function buildNotifications({ sessions, active, memory, proposals,
                                     projects, dismissed, gap }) {
  const out = [];
  const list = Array.isArray(sessions) ? sessions : [];
  const skip = new Set(dismissed || []);

  /* --- Aktif oturumdaki sorunlar --- */
  if (active?.workflow) {
    const st = workflowStatus(active);
    const stale = staleTasks(active);

    if (stale.length) {
      out.push(n('stale:' + active.id + ':' + stale.map(s => s.key).join(','),
        'problem', 'stale-work',
        { count: stale.length, tasks: stale.map(s => ({ key: s.key, label: s.label })) }));
    }

    if (st.stuck) {
      out.push(n('stuck:' + active.id, 'problem', 'stuck',
        { blocked: st.blocked }));
    }

    if (st.complete) {
      out.push(n('done:' + active.id, 'info', 'plan-complete',
        { title: active.title }));
    } else if (st.suggestion?.task) {
      out.push(n('next:' + active.id + ':' + st.suggestion.task.key,
        'action', 'next-step',
        {
          taskKey: st.suggestion.task.key,
          label: st.suggestion.task.label,
          route: st.suggestion.task.route,
          reason: st.suggestion.reason
        }));
    }
  }

  /* --- Yarım kalan diğer planlar --- */
  const unfinished = list.filter(s => {
    if (s.id === active?.id) return false;
    const st = workflowStatus(s);
    return st.doable > 0 && !st.complete;
  });

  if (unfinished.length) {
    /* Tek tek değil, TOPLU bildiriyoruz. Beş yarım plan varsa beş
       bildirim göstermek dikkati dağıtır. */
    const newest = unfinished.sort((a, b) =>
      (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0];
    out.push(n('unfinished:' + newest.id, 'action', 'unfinished-plans',
      { count: unfinished.length, title: newest.title, id: newest.id }));
  }

  /* --- Hafızadan gelen bilgiler --- */
  if (memory) {
    const genre = dominant(memory.content?.genres);
    if (genre?.key && genre.confidence >= 0.7) {
      out.push(n('mem:genre:' + genre.key, 'info', 'known-genre',
        { genre: genre.key, count: genre.count, total: genre.total }));
    }

  }

  /* Onay bekleyen çıkarımlar — AYRI parametre.

     İlk sürümde `memory.__proposals` olarak hafızaya iliştirilmişti.
     Öneriler türetilmiş veri; hafızanın parçası değiller ve oraya
     yazılırlarsa veritabanına sızarlar. */
  if (Array.isArray(proposals) && proposals.length) {
    out.push(n('mem:proposals:' + proposals.map(p => p.field).join(','),
      'action', 'memory-proposals', { count: proposals.length }));
  }

  /*
    --- GERÇEK PROJELERDEN ---

    TASK-05 Adım 5: Workspace şimdiye kadar yalnızca Creator OS
    oturumlarını biliyordu. Kullanıcı modüllerden doğrudan video
    ürettiyse o iş burada hiç görünmüyordu.

    `projects` = episodes tablosundan türetilmiş özetler.
  */
  const unfinishedProjects = (projects?.unfinished || []);
  if (unfinishedProjects.length) {
    /* Oturumu olmayan yarım işler — oturumlular zaten yukarıda
       bildirildi, iki kez söylemeyelim. */
    const withoutSession = unfinishedProjects.filter(p =>
      !list.some(s => s.episodeId === p.id));
    if (withoutSession.length) {
      const top = withoutSession[0];
      out.push(n('proj:' + top.id, 'action', 'unfinished-project',
        { id: top.id, title: top.title, status: top.status,
          idleDays: top.idleDays, count: withoutSession.length }));
    }
  }

  /* Proje önerileri — dayanağıyla birlikte */
  const sug = (projects?.suggestions || [])[0];
  if (sug) {
    out.push(n('sug:' + sug.kind + ':' + sug.sourceId, 'info', 'project-suggestion',
      { kind: sug.kind, title: sug.sourceTitle, id: sug.sourceId }));
  }

  /* --- Hiç plan yoksa --- */
  if (!list.length && !(projects?.total)) {
    out.push(n('empty', 'info', 'no-plans', {}));
  }

  /*
    SIRALAMA: seviye + gün bağlamı.

    Ağırlık ±0.5 aralığında — bir seviye sınırını (1.0) asla
    aşamıyor. Yani bir `info` hiçbir zaman bir `action`'ın önüne
    geçmiyor; yalnızca kendi seviyesi içinde yer değiştiriyor.

    Bu bilinçli: gün bağlamı bir tercih, aciliyet değil.
  */
  const ranked = out
    .filter(x => !skip.has(x.id))
    .map(x => ({
      x,
      score: (LEVELS[x.level] ?? 9) + dayWeight(x.kind, gap)
    }))
    .sort((a, b) => a.score - b.score)
    .map(r => r.x);

  /*
    BİLDİRİM YORGUNLUĞU

    Uzun aradan dönen kullanıcıya beş bildirim birden göstermek
    bunaltıcı. Aradan sonra daha az gösteriyoruz — kullanıcı önce
    işine dönsün, sistem sonra konuşsun.
  */
  const limit = (gap?.band === 'away' || gap?.band === 'long')
    ? Math.min(MAX_VISIBLE, 2)
    : MAX_VISIBLE;

  return ranked.slice(0, limit);
}

/* Kapatılan bildirim kimliklerini yönet. Kimlik listesi — içerik yok. */
export function dismiss(dismissed, id) {
  const set = new Set(dismissed || []);
  set.add(id);
  /* Sınırsız büyümesin: 100 kimlik yeter, eskiler zaten geçersiz
     (durum değişince kimlik de değişiyor). */
  return [...set].slice(-100);
}

export function clearDismissed() {
  return [];
}

/* Bildirim sayacı — Workspace rozetinde gösterilecek.
   Yalnızca aksiyon gerektirenler sayılıyor; bilgi bildirimleri
   rozet üretmemeli, yoksa rozet hep dolu görünür. */
export function actionCount(notifications) {
  return (notifications || []).filter(x =>
    x.level === 'problem' || x.level === 'action').length;
}
