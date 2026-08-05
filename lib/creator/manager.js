import { emptyMemory, mergeObservations, dominant, cleanKey,
         setProfileField, isCritical, LEARN, CRITICAL } from './memory';
import { observeStoryboard, observeGenerators, observeSession,
         observeDirectorActions, combine, emptyObservation } from './derive';

/*
  CREATOR OS — Creator Memory: Manager.

  Sprint 5 / TASK-03, Adım 2.

  Adım 1 modeli ve türetme motorunu kurdu ama kimse çağırmıyordu.
  Bu dosya öğrenmeyi YÖNETİYOR:

    • hangi kaynağın gözlemlendiğini takip eder (çift sayma yok)
    • kritik tercihler için ÖNERİ üretir, uygulamaz
    • silme işlemlerini yapar (tek kayıt, kategori, tümü)
    • hafızanın sınırsız büyümesini engeller

  ---------------------------------------------------------------
  ÇİFT SAYMA SORUNU

  Kullanıcı Creator OS'u her açtığında aynı 12 bölümü yeniden
  gözlemlersek, üçüncü açılışta "36 korku videosu yapmış" deriz.
  İstatistik çöpe gider ve güven sahte biçimde yükselir.

  Çözüm: her kaynağın kimliği `observed` listesinde tutuluyor.
  Bölüm ve oturum kimlikle, üretici raporları ve yönetmen kararları
  ZAMAN DAMGASIYLA (satır kimliği yok, ama created_at var).
  ---------------------------------------------------------------
*/

export const MANAGER_VERSION = 1;

/* Kaç kaynak kimliği saklanır. Bölüm sayısı büyüyebilir; sınırsız
   liste hafızayı şişirir. En yeniler tutuluyor — eski bölümler zaten
   sayılmış ve tekrar gözleme girmeleri olası değil. */
export const MAX_OBSERVED = 400;

/* Bir sayaç tablosunda en fazla kaç anahtar. Kullanıcı yüzlerce
   farklı stil yazarsa tablo şişer. En çok kullanılanlar kalıyor. */
export const MAX_KEYS = 60;

/* Gözlem takip yapısı — hafızaya eklenen ek bölüm. */
function emptyObserved() {
  return {
    episodes: [],        // bölüm kimlikleri
    sessions: [],        // oturum kimlikleri
    generatorsUpTo: null, // ISO zaman — bundan sonrası işlenecek
    directorUpTo: null
  };
}

export function ensureObserved(memory) {
  const m = memory || emptyMemory();
  if (m.observed) return m;
  return { ...m, observed: emptyObserved() };
}

/*
  ---------- ÖĞRENME ----------

  Girdi:
    memory   — mevcut hafıza
    sources  — { episodes[], sessions[], generators[], directorActions[] }

  Yalnızca YENİ kaynaklar işlenir. Zaten gözlemlenmiş olanlar atlanır.

  Çıkış: { memory, learned, proposals }
    learned    — bu turda kaç kaynak işlendi
    proposals  — kritik tercih önerileri (UYGULANMADI, onay bekliyor)
*/
export function learn(memory, sources) {
  const m = ensureObserved(memory);
  const obs = m.observed;
  const src = sources || {};

  const seenEp = new Set(obs.episodes || []);
  const seenSe = new Set(obs.sessions || []);

  const observations = [];
  const newEpisodes = [];
  const newSessions = [];

  /* --- Bölümler --- */
  for (const ep of (src.episodes || [])) {
    const id = ep?.id;
    if (!id || seenEp.has(id)) continue;
    const o = observeStoryboard(ep.storyboard);
    /* Boş bölüm gözlem üretmedi — kimliğini yine de işaretliyoruz ki
       her seferinde tekrar bakmayalım. Bölüm sonra dolarsa? O zaman
       kaçırırız. Bilinçli değiş tokuş: yeniden bakmak için `forget`
       fonksiyonu var. */
    if (o.content.samples > 0) observations.push(o);
    newEpisodes.push(id);
  }

  /* --- Oturumlar --- */
  for (const s of (src.sessions || [])) {
    const id = s?.id;
    if (!id || seenSe.has(id)) continue;
    const o = observeSession(s);
    /*
      Sprint-6 TASK-02: NİYET de sayılıyor.

      Eskiden yalnızca `workflow.samples > 0` kapısı vardı — plan
      kurulmuş ama henüz iş yapılmamışsa oturum atlanıyordu ve
      niyet KAYBOLUYORDU.

      Kullanıcının ne istediği, henüz çalışmaya başlamamış olsa da
      geçerli bir sinyal. İki koşuldan biri yeterli.
    */
    if (o.workflow.samples > 0 || o.intents.samples > 0) observations.push(o);
    newSessions.push(id);
  }

  /* --- Üretici raporları (zaman damgalı) --- */
  const gRows = filterNewer(src.generators, obs.generatorsUpTo);
  if (gRows.length) observations.push(observeGenerators(gRows));

  /* --- Yönetmen kararları (zaman damgalı) --- */
  const dRows = filterNewer(src.directorActions, obs.directorUpTo);
  if (dRows.length) observations.push(observeDirectorActions(dRows));

  if (!observations.length && !newEpisodes.length && !newSessions.length) {
    return {
      memory: m,
      learned: { episodes: 0, sessions: 0, generators: 0, director: 0 },
      proposals: buildProposals(m)
    };
  }

  let next = mergeObservations(m, combine(observations));

  next = {
    ...next,
    observed: {
      episodes: capList([...(obs.episodes || []), ...newEpisodes]),
      sessions: capList([...(obs.sessions || []), ...newSessions]),
      generatorsUpTo: latestTime(gRows, obs.generatorsUpTo),
      directorUpTo: latestTime(dRows, obs.directorUpTo)
    }
  };

  next = pruneMemory(next);

  return {
    memory: next,
    learned: {
      episodes: newEpisodes.length,
      sessions: newSessions.length,
      generators: gRows.length,
      director: dRows.length
    },
    proposals: buildProposals(next)
  };
}

/* Zaman damgasından sonrasını süz. Damga yoksa hepsi yeni. */
function filterNewer(rows, since) {
  const list = Array.isArray(rows) ? rows : [];
  if (!since) return list;
  return list.filter(r => {
    const t = r?.created_at || r?.createdAt;
    return t ? String(t) > String(since) : false;
  });
}

function latestTime(rows, current) {
  let best = current || null;
  for (const r of (rows || [])) {
    const t = r?.created_at || r?.createdAt;
    if (t && (!best || String(t) > String(best))) best = String(t);
  }
  return best;
}

function capList(list) {
  const arr = [...new Set(list)];
  return arr.length <= MAX_OBSERVED ? arr : arr.slice(-MAX_OBSERVED);
}

/*
  ---------- BUDAMA ----------

  Sayaç tabloları sınırsız büyüyemez. En çok kullanılan MAX_KEYS
  anahtar kalıyor.

  Neden en çoklar: baskın tercih hesabı zaten büyük sayılara bakıyor;
  bir kez kullanılmış bir stil düşerse sonuç değişmez. Ama toplam
  örnek sayısı KORUNUYOR — yoksa güven hesabı bozulur.
*/
export function pruneMemory(memory) {
  const m = memory || emptyMemory();
  const prune = (t) => {
    const e = Object.entries(t || {});
    if (e.length <= MAX_KEYS) return t || {};
    return Object.fromEntries(
      e.sort((a, b) => b[1] - a[1]).slice(0, MAX_KEYS));
  };

  return {
    ...m,
    content: { ...m.content,
      formats: prune(m.content?.formats), genres: prune(m.content?.genres) },
    style: { ...m.style, styles: prune(m.style?.styles) },
    tools: { ...m.tools, generators: prune(m.tools?.generators) },
    workflow: { ...m.workflow,
      transitions: prune(m.workflow?.transitions),
      skipped: prune(m.workflow?.skipped),
      added: prune(m.workflow?.added) },
    feedback: { ...m.feedback,
      accepted: prune(m.feedback?.accepted),
      rejected: prune(m.feedback?.rejected) }
  };
}

/*
  ---------- KRİTİK TERCİH ÖNERİLERİ ----------

  Spec: "Kullanıcı onayı olmadan kritik tercih değiştirilmez."

  Gözlem güçlü bir sinyal veriyorsa ÖNERİ üretiyoruz — uygulamıyoruz.
  Kullanıcı kabul ederse `stated` alana yazılır.

  Yalnızca kullanıcı O ALANI HİÇ DOLDURMAMIŞSA öneriyoruz. Doldurmuşsa
  susmak doğru: kullanıcı bilerek yazmış, her açılışta "değiştirmek
  ister misin" diye sormak bunaltıcı olur.
*/
export function buildProposals(memory) {
  const m = memory || emptyMemory();
  const out = [];

  /* Dil için öneri YOK — hafızada dil alanı da yok.
     Üretim dili profiles.settings.prodLang'da tutuluyor ve Ayarlar
     sayfasından değiştiriliyor. Tek kaynak. */

  /* Yaratıcı türü: baskın format ve türden çıkarılabilir. */
  if (!m.profile?.creatorType) {
    const fmt = dominant(m.content?.formats);
    if (fmt?.key && fmt.confidence >= 0.6) {
      const type = CREATOR_TYPE_BY_FORMAT[fmt.key];
      if (type) {
        out.push({
          field: 'creatorType',
          value: type,
          basis: 'format',
          evidence: { key: fmt.key, count: fmt.count, total: fmt.total },
          confidence: fmt.confidence,
          critical: isCritical('creatorType')
        });
      }
    }
  }

  /* Seviye: kaç bölüm üretmiş + kaç farklı modül kullanmış.
     Kaba ama dürüst bir ölçü; öneri olarak sunuluyor. */
  if (!m.profile?.level) {
    const n = m.content?.samples || 0;
    if (n >= LEARN.STRONG_SAMPLES) {
      out.push({
        field: 'level',
        value: n >= 25 ? 'advanced' : 'intermediate',
        basis: 'volume',
        evidence: { episodes: n },
        /* Güven kasten düşük: üretim sayısı beceri ölçüsü değil.
           Kullanıcı onaylamadan hiçbir şey değişmiyor zaten. */
        confidence: 0.5,
        critical: isCritical('level')
      });
    }
  }

  return out;
}

const CREATOR_TYPE_BY_FORMAT = {
  youtube: 'youtuber',
  shorts: 'shortform',
  tiktok: 'shortform',
  reels: 'shortform',
  documentary: 'documentarian',
  podcast: 'podcaster'
};

/*
  Öneriyi kabul et — kritik alan ancak buradan yazılır.

  `reject` de kaydediliyor: aynı öneriyi tekrar tekrar sunmamak için.
*/
export function acceptProposal(memory, field, value) {
  const m = ensureObserved(memory);
  const r = setProfileField(m, field, value);
  if (r.error) return { memory: m, error: r.error };
  return { memory: r.memory, error: null };
}

export function rejectProposal(memory, field) {
  const m = ensureObserved(memory);
  const rejected = [...new Set([...(m.rejectedProposals || []), field])];
  return { ...m, rejectedProposals: rejected, updatedAt: new Date().toISOString() };
}

/* Reddedilen öneriler tekrar sunulmuyor. */
export function activeProposals(memory) {
  const m = memory || emptyMemory();
  const rejected = new Set(m.rejectedProposals || []);
  return buildProposals(m).filter(p => !rejected.has(p.field));
}

/*
  ---------- SİLME ----------

  Spec: "Tek kayıt silme, Kategori silme, Memory Reset"

  Silinen şey GERİ GELMEMELİ. Sorun: kaynak hâlâ duruyor, bir sonraki
  öğrenmede yeniden gözlemlenir.

  Bu yüzden `forgetKey` yalnızca sayacı silmiyor, kaynağı da
  "gözlemlendi" işaretli bırakıyor — böylece tekrar sayılmıyor.
  Kullanıcı sildiyse bir daha görmek istemiyor demektir.
*/
const SECTIONS = {
  'content.formats':      m => m.content.formats,
  'content.genres':       m => m.content.genres,
  'style.styles':         m => m.style.styles,
  'tools.generators':     m => m.tools.generators,
  'workflow.transitions': m => m.workflow.transitions,
  'workflow.skipped':     m => m.workflow.skipped,
  'workflow.added':       m => m.workflow.added,
  'feedback.accepted':    m => m.feedback.accepted,
  'feedback.rejected':    m => m.feedback.rejected
};

export const SECTION_KEYS = Object.keys(SECTIONS);

/* Tek kayıt sil */
export function forgetKey(memory, section, key) {
  const m = ensureObserved(memory);
  if (!SECTIONS[section]) return { memory: m, error: 'unknown-section' };

  const k = cleanKey(key);
  if (!k) return { memory: m, error: 'invalid-key' };

  const [group, table] = section.split('.');
  const current = { ...(m[group]?.[table] || {}) };
  if (!(k in current)) return { memory: m, error: 'not-found' };

  const removed = current[k];
  delete current[k];

  return {
    memory: {
      ...m,
      [group]: {
        ...m[group],
        [table]: current,
        /* Örnek sayısını da düşürüyoruz — yoksa güven hesabı silinen
           veriyi hâlâ sayar ve şişik kalır. */
        samples: Math.max(0, (m[group]?.samples || 0) - removed)
      },
      updatedAt: new Date().toISOString()
    },
    error: null,
    removed
  };
}

/* Kategori sil — tüm bölüm sıfırlanır */
export function forgetSection(memory, group) {
  const m = ensureObserved(memory);
  const fresh = emptyMemory();
  if (!(group in fresh) || ['profile', 'version', 'createdAt', 'updatedAt'].includes(group)) {
    return { memory: m, error: 'unknown-section' };
  }
  return {
    memory: { ...m, [group]: fresh[group], updatedAt: new Date().toISOString() },
    error: null
  };
}

/*
  Tümünü sıfırla.

  `keepStated`: kullanıcının kendi girdiği bilgiler korunsun mu?
  Varsayılan HAYIR — "Memory Reset" temiz sayfa demek. Ama kullanıcı
  yalnızca öğrenilenleri silmek isteyebilir; seçenek sunuyoruz.
*/
export function resetMemory(memory, opts) {
  const fresh = emptyMemory();
  if (!opts?.keepStated) return ensureObserved(fresh);

  const m = memory || fresh;
  return ensureObserved({
    ...fresh,
    profile: m.profile,
    channels: m.channels,
    brands: m.brands,
    goals: m.goals,
    createdAt: m.createdAt || fresh.createdAt
  });
}

/*
  ---------- DURUM ----------

  Arayüz için: neyi ne kadar öğrendik, ne zaman.
*/
export function managerStatus(memory) {
  const m = ensureObserved(memory);
  const obs = m.observed || emptyObserved();

  return {
    observedEpisodes: (obs.episodes || []).length,
    observedSessions: (obs.sessions || []).length,
    generatorsUpTo: obs.generatorsUpTo,
    directorUpTo: obs.directorUpTo,
    proposals: activeProposals(m).length,
    /* Tablo doluluk oranı — arayüz "budama yakın" diyebilsin */
    keyCount: SECTION_KEYS.reduce((a, s) => {
      const [g, t] = s.split('.');
      return a + Object.keys(m[g]?.[t] || {}).length;
    }, 0),
    updatedAt: m.updatedAt || null
  };
}
