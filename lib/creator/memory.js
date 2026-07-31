/*
  CREATOR OS — Creator Memory: veri modeli.

  Sprint 5 / TASK-03, Adım 1.

  ---------------------------------------------------------------
  ÖNCE ANALİZ (spec'in ilk kuralı)

  Spec'in istediği hafızanın ÇOĞU zaten uygulamada üretiliyor:

    Content Profile   → episodes.storyboard.format / genre
    Style Profile     → storyboard.style
    AI Preference     → prompt_reports.generator (migration v6)
    Workflow Profile  → oturum olay günlüğü (lib/creator/live.js)
    Feedback Memory   → director_actions (migration v9) + olay günlüğü
    Project Memory    → episodes tablosu
    Creator Profile   → profiles.settings (zaten var, Ayarlar yazıyor)

  Bunları kullanıcıya SORMAK, spec'in kendi amacını çiğnerdi:
  "kullanıcıyı tekrar tekrar aynı ayarları yapmaktan kurtaran".

  Yeni olan yalnızca üçü: Channel, Brand, Goals. Onlar gözlemlenemez,
  kullanıcı söylemeli.

  Bu yüzden model iki tür bilgi ayırıyor:

    stated   — kullanıcı söyledi. Değiştirmek için onayı gerekir.
    derived  — biz gözlemledik. Sayı ve güvenle birlikte tutulur.

  Türetilmiş bir bilgi, söylenmiş olanın ÜSTÜNE YAZMAZ. Kullanıcı
  "dilim İngilizce" dediyse, on Türkçe video üretmesi bunu
  değiştirmez — belki başka bir kanal için üretiyordur.
  ---------------------------------------------------------------

  GİZLİLİK — spec'in yasakları yapısal olarak uygulanıyor:

    "chat mesajlarını ezberlemez"
    "prompt geçmişini ezberlemez"
    "kullanıcı konuşmalarını saklamaz"

  Türetilmiş bölümler SERBEST METİN TUTMUYOR — yalnızca anahtar ve
  sayaç. `{ Korku: 8, Çocuk: 4 }` gibi. Prompt metni, senaryo, konuşma
  buraya yazılamaz çünkü yazılacak alan yok.

  Serbest metin yalnızca kullanıcının kendi girdiği alanlarda
  (kanal adı, marka sloganı) ve orada da kullanıcı yazdığı için sorun
  değil.
*/

export const MEMORY_VERSION = 1;

/*
  GÜVEN EŞİKLERİ — kaç örnekten sonra "biliyoruz" diyebiliriz?

  TASK-06'da öğrendiğimiz ilke: güven gerçek bir şeyden türemeli.
  Bir kullanıcı tek korku videosu yaptıysa "korku tercih ediyor"
  demek desteklenmez.

  MIN_SAMPLES: bu sayının altında hiç iddia yok.
  STRONG:      bu sayının üstünde güçlü sinyal.
*/
export const LEARN = {
  MIN_SAMPLES: 3,
  STRONG_SAMPLES: 8,
  /* Baskınlık: en çok kullanılan seçenek toplamın bu oranını
     geçmezse "tercihi var" demiyoruz. %40 eşiği, üç seçenek
     arasında anlamlı bir öne çıkış demek. */
  DOMINANCE: 0.4
};

/*
  KRİTİK TERCİHLER — kullanıcı onayı olmadan değiştirilemez.

  Spec: "Kullanıcı onayı olmadan kritik tercih değiştirilmez."

  Bunlar üretimi doğrudan etkiliyor; yanlış öğrenme pahalıya patlar.
  Öğrenme motoru bunlar için ÖNERİ üretir, uygulamaz.
*/
export const CRITICAL = ['language', 'creatorType', 'level', 'primaryGoal'];

/* ---------- Boş hafıza ---------- */
export function emptyMemory(patch) {
  return {
    version: MEMORY_VERSION,

    /* --- KULLANICI SÖYLEDİ (stated) --- */
    profile: {
      name: '',
      creatorType: '',        // 'youtuber' | 'marketer' | 'educator' | …
      level: '',              // 'beginner' | 'intermediate' | 'advanced'
      primaryGoal: '',
      language: ''            // boşsa profiles.settings.prodLang kullanılır
    },
    channels: [],             // { id, name, topic, audience, language,
                              //   frequency, avgDuration, thumbStyle, titleStyle }
    brands: [],               // { id, name, colors[], font, slogan, voice,
                              //   bannedWords[], preferredWords[] }
    goals: [],                // { id, text, target, createdAt }

    /* --- BİZ GÖZLEMLEDİK (derived) ---
       Hepsi sayaç tablosu: { anahtar: adet }. Serbest metin yok. */
    content: { formats: {}, genres: {}, samples: 0 },
    style:   { styles: {}, samples: 0 },
    tools:   { generators: {}, samples: 0 },
    workflow: {
      /* Görev sırası tercihleri: hangi görevi hangisinden önce yapıyor */
      transitions: {},        // { 'script>storyboard': 5 }
      skipped: {},            // { characters: 3 }  — hep atladıkları
      added: {},              // { shorts: 2 }      — hep ekledikleri
      samples: 0
    },
    feedback: {
      accepted: {},           // { 'camera-closeup': 4 }
      rejected: {},           // { 'voice-slow': 2 }
      samples: 0
    },

    /* --- İZ --- */
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(patch || {})
  };
}

/* ---------- Sayaç yardımcıları ---------- */

/* Bir sayaç tablosuna ekle. Anahtar temizleniyor: serbest metin
   sızmasın diye uzunluk ve biçim sınırı var. */
export function bump(table, key, n) {
  const k = cleanKey(key);
  if (!k) return table;
  return { ...table, [k]: (table?.[k] || 0) + (n || 1) };
}

/* Anahtar temizliği — gizlilik koruması.

   Sayaç anahtarları KISA olmalı: tür adı, format, araç adı. Uzun bir
   dize gelirse bu bir prompt ya da cümle olabilir; kabul etmiyoruz.
   Spec'in "prompt geçmişini ezberlemez" kuralı burada uygulanıyor. */
const MAX_KEY = 48;
export function cleanKey(key) {
  const s = String(key ?? '').trim();
  if (!s) return null;
  if (s.length > MAX_KEY) return null;      // cümle/prompt olabilir
  if (s.split(/\s+/).length > 4) return null;
  return s;
}

/*
  ---------- BASKIN TERCİH ----------

  Bir sayaç tablosundan "tercihi bu" çıkarımı.

  Üç koşul birden:
    • yeterli örnek var mı (MIN_SAMPLES)
    • bir seçenek yeterince öne çıkmış mı (DOMINANCE)
    • ikinciden anlamlı farkla önde mi

  Hiçbiri sağlanmazsa `null` döner — "bilmiyoruz" demek, uydurmaktan
  iyidir.
*/
export function dominant(table, opts) {
  const cfg = { ...LEARN, ...(opts || {}) };
  const entries = Object.entries(table || {}).filter(([, v]) => v > 0);
  if (!entries.length) return null;

  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (total < cfg.MIN_SAMPLES) {
    return { key: null, total, confidence: 0, reason: 'not-enough-samples' };
  }

  entries.sort((a, b) => b[1] - a[1]);
  const [topKey, topCount] = entries[0];
  const share = topCount / total;

  if (share < cfg.DOMINANCE) {
    return { key: null, total, confidence: 0, reason: 'no-clear-preference' };
  }

  /*
    GÜVEN — iki gerçek girdiden:
      örneklem  — kaç gözlem var (STRONG_SAMPLES'da doyuyor)
      baskınlık — ne kadar öne çıkmış

    Tavan 0.9: gözlem her zaman eksik kalır, kullanıcı yarın başka
    bir şey üretebilir. "Kesin" diyemeyiz.
  */
  const sampleScore = Math.min(1, total / cfg.STRONG_SAMPLES);
  const confidence = Math.min(0.9, share * 0.6 + sampleScore * 0.4);

  return {
    key: topKey,
    count: topCount,
    total,
    share: +share.toFixed(2),
    confidence: +confidence.toFixed(2),
    reason: 'ok'
  };
}

/* Sıralı liste — arayüz "en çok kullandıkların" göstersin. */
export function ranked(table, limit) {
  return Object.entries(table || {})
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit || 5)
    .map(([key, count]) => ({ key, count }));
}

/*
  ---------- BİRLEŞTİRME ----------

  Yeni gözlemleri mevcut hafızaya kat.

  KURAL: `stated` alanlara DOKUNULMAZ. Türetilmiş gözlem, kullanıcının
  söylediğini ezemez.

  Bu, spec'in "kullanıcı onayı olmadan kritik tercih değiştirilmez"
  kuralının yapısal uygulaması: merge fonksiyonu stated alanları
  hiç ellemiyor, dolayısıyla yanlışlıkla ezmek mümkün değil.
*/
export function mergeObservations(memory, obs) {
  const m = memory || emptyMemory();
  if (!obs) return m;

  return {
    ...m,
    content: {
      formats: mergeCounts(m.content?.formats, obs.content?.formats),
      genres:  mergeCounts(m.content?.genres,  obs.content?.genres),
      samples: (m.content?.samples || 0) + (obs.content?.samples || 0)
    },
    style: {
      styles:  mergeCounts(m.style?.styles, obs.style?.styles),
      samples: (m.style?.samples || 0) + (obs.style?.samples || 0)
    },
    tools: {
      generators: mergeCounts(m.tools?.generators, obs.tools?.generators),
      samples: (m.tools?.samples || 0) + (obs.tools?.samples || 0)
    },
    workflow: {
      transitions: mergeCounts(m.workflow?.transitions, obs.workflow?.transitions),
      skipped:     mergeCounts(m.workflow?.skipped,     obs.workflow?.skipped),
      added:       mergeCounts(m.workflow?.added,       obs.workflow?.added),
      samples: (m.workflow?.samples || 0) + (obs.workflow?.samples || 0)
    },
    feedback: {
      accepted: mergeCounts(m.feedback?.accepted, obs.feedback?.accepted),
      rejected: mergeCounts(m.feedback?.rejected, obs.feedback?.rejected),
      samples: (m.feedback?.samples || 0) + (obs.feedback?.samples || 0)
    },
    updatedAt: new Date().toISOString()
  };
}

function mergeCounts(a, b) {
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b || {})) {
    const key = cleanKey(k);
    if (!key) continue;
    out[key] = (out[key] || 0) + (Number(v) || 0);
  }
  return out;
}

/*
  ---------- KULLANICI BİLDİRİMİ ----------

  Kullanıcı bir tercih söyledi. Türetilmiş olanın aksine bu doğrudan
  yazılıyor — ama yalnızca tanımlı alanlara.

  Bilinmeyen alan sessizce yutulmuyor: `unknown-field` ile dönüyor.
  Sessiz yutma, kullanıcının "kaydettim" sanıp kaybetmesine yol açar.
*/
const PROFILE_FIELDS = ['name', 'creatorType', 'level', 'primaryGoal', 'language'];
const MAX_TEXT = 200;

export function setProfileField(memory, field, value) {
  const m = memory || emptyMemory();
  if (!PROFILE_FIELDS.includes(field)) {
    return { memory: m, error: 'unknown-field' };
  }
  const v = String(value ?? '').trim().slice(0, MAX_TEXT);
  return {
    memory: {
      ...m,
      profile: { ...m.profile, [field]: v },
      updatedAt: new Date().toISOString()
    },
    error: null
  };
}

/* Kritik tercih mi — arayüz onay istemeli. */
export function isCritical(field) {
  return CRITICAL.includes(field);
}

/*
  ---------- ÖZET ----------

  Hafızanın "ne biliyoruz" görünümü. Öneri motorları bunu okuyacak.

  Bilinmeyeni `null` bırakıyoruz. Boş bir tercih uydurmaktansa
  "henüz bilmiyoruz" demek doğru — TASK-07'de öğrendiğimiz ders.
*/
export function summarize(memory) {
  const m = memory || emptyMemory();

  return {
    /* Söylenmiş — doğrudan */
    stated: {
      name: m.profile?.name || null,
      creatorType: m.profile?.creatorType || null,
      level: m.profile?.level || null,
      primaryGoal: m.profile?.primaryGoal || null,
      language: m.profile?.language || null,
      channels: (m.channels || []).length,
      brands: (m.brands || []).length,
      goals: (m.goals || []).length
    },
    /* Gözlemlenmiş — güvenle birlikte */
    learned: {
      format: dominant(m.content?.formats),
      genre: dominant(m.content?.genres),
      style: dominant(m.style?.styles),
      generator: dominant(m.tools?.generators)
    },
    /* Sıralı listeler */
    top: {
      formats: ranked(m.content?.formats, 3),
      genres: ranked(m.content?.genres, 3),
      styles: ranked(m.style?.styles, 3),
      generators: ranked(m.tools?.generators, 3),
      alwaysSkipped: ranked(m.workflow?.skipped, 3),
      alwaysAdded: ranked(m.workflow?.added, 3)
    },
    samples: {
      content: m.content?.samples || 0,
      style: m.style?.samples || 0,
      tools: m.tools?.samples || 0,
      workflow: m.workflow?.samples || 0,
      feedback: m.feedback?.samples || 0
    },
    /* Hafıza işe yarar hale geldi mi — arayüz "henüz öğreniyorum"
       diyebilsin. */
    ready: (m.content?.samples || 0) >= LEARN.MIN_SAMPLES,
    updatedAt: m.updatedAt || null
  };
}

/*
  ---------- GİZLİLİK DOĞRULAMASI ----------

  Hafızada yasaklı içerik var mı? Test ve kaydetme öncesi kontrol.

  Spec'in üç yasağı: chat mesajı, prompt geçmişi, konuşma. Hepsi
  "uzun serbest metin" biçiminde görünür. Sayaç anahtarlarında uzun
  metin bulursak bir yerde sızıntı var demektir.
*/
export function auditPrivacy(memory) {
  const m = memory || {};
  const problems = [];

  const tables = [
    ['content.formats', m.content?.formats],
    ['content.genres', m.content?.genres],
    ['style.styles', m.style?.styles],
    ['tools.generators', m.tools?.generators],
    ['workflow.transitions', m.workflow?.transitions],
    ['workflow.skipped', m.workflow?.skipped],
    ['workflow.added', m.workflow?.added],
    ['feedback.accepted', m.feedback?.accepted],
    ['feedback.rejected', m.feedback?.rejected]
  ];

  for (const [name, table] of tables) {
    for (const key of Object.keys(table || {})) {
      if (key.length > MAX_KEY || key.split(/\s+/).length > 4) {
        problems.push({ where: name, key: key.slice(0, 30) + '…' });
      }
    }
  }
  return problems;
}
