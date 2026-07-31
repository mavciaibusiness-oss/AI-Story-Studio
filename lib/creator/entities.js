import { emptyMemory } from './memory';

/*
  CREATOR OS — Kanal, Marka, Hedef yönetimi.

  Sprint 5 / TASK-03, Adım 4 (ikinci parça).

  Hafızanın GÖZLEMLENEMEYEN kısmı. Kanal adı, marka rengi, uzun vadeli
  hedef — bunları çıkaramayız, kullanıcı söylemeli.

  ---------------------------------------------------------------
  NEDEN AYRI DOSYA

  manager.js türetilmiş hafızayı yönetiyor: gözlem, budama, çift
  sayma. Bunlar tamamen farklı bir iş: kullanıcının girdiği kayıtların
  CRUD'u. Aynı dosyaya koymak iki farklı sorumluluğu karıştırırdı.

  ---------------------------------------------------------------
  SERBEST METİN BURADA MEŞRU

  memory.js'te sayaç anahtarlarına uzun metin yasak (prompt sızmasın).
  Burada durum farklı: kullanıcı marka sloganını KENDİ yazıyor, biz
  gözlemlemiyoruz. Yasak, gözlemin metin ezberlememesiyle ilgili.

  Yine de sınır var — kötü niyet ya da kaza ile devasa veri
  yazılmasın.
  ---------------------------------------------------------------
*/

export const ENTITY_VERSION = 1;

/* Alan sınırları. Cömert ama sınırsız değil. */
const LIMITS = {
  short: 120,       // isim, font, slogan
  long: 400,        // hedef kitle, marka sesi
  listItem: 40,     // renk kodu, yasak kelime
  listLength: 30,   // kaç renk / kaç yasak kelime
  maxChannels: 20,
  maxBrands: 10,
  maxGoals: 20
};

export { LIMITS as ENTITY_LIMITS };

function id(prefix) {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return prefix + '-' + crypto.randomUUID().slice(0, 8);
    }
  } catch {}
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function text(v, max) {
  return String(v ?? '').trim().slice(0, max);
}

function list(v, maxItems, maxLen) {
  if (!Array.isArray(v)) return [];
  return v.map(x => text(x, maxLen)).filter(Boolean).slice(0, maxItems);
}

/* ---------- KANALLAR ---------- */

const CHANNEL_FIELDS = ['name', 'topic', 'audience', 'language',
                        'frequency', 'avgDuration', 'thumbStyle', 'titleStyle'];

export function normalizeChannel(input) {
  return {
    id: input?.id || id('ch'),
    name: text(input?.name, LIMITS.short),
    topic: text(input?.topic, LIMITS.short),
    audience: text(input?.audience, LIMITS.long),
    language: text(input?.language, LIMITS.short),
    frequency: text(input?.frequency, LIMITS.short),
    /* Sayı bekliyoruz ama metin de gelebilir ("8-12 dakika").
       Zorlamıyoruz — kullanıcı nasıl düşünüyorsa öyle yazsın. */
    avgDuration: text(input?.avgDuration, LIMITS.short),
    thumbStyle: text(input?.thumbStyle, LIMITS.long),
    titleStyle: text(input?.titleStyle, LIMITS.long),
    createdAt: input?.createdAt || new Date().toISOString()
  };
}

export function addChannel(memory, input) {
  const m = memory || emptyMemory();
  const list0 = m.channels || [];
  if (list0.length >= LIMITS.maxChannels) {
    return { memory: m, error: 'limit-reached', limit: LIMITS.maxChannels };
  }
  const ch = normalizeChannel(input);
  if (!ch.name) return { memory: m, error: 'name-required' };

  return {
    memory: { ...m, channels: [...list0, ch], updatedAt: new Date().toISOString() },
    error: null, channel: ch
  };
}

export function updateChannel(memory, channelId, patch) {
  const m = memory || emptyMemory();
  const i = (m.channels || []).findIndex(c => c.id === channelId);
  if (i === -1) return { memory: m, error: 'not-found' };

  /* Yalnızca bilinen alanlar güncellenir; bilinmeyen sessizce
     yutulmuyor, hata dönüyor. */
  const unknown = Object.keys(patch || {})
    .filter(k => !CHANNEL_FIELDS.includes(k) && k !== 'id');
  if (unknown.length) return { memory: m, error: 'unknown-field', fields: unknown };

  const next = [...m.channels];
  next[i] = normalizeChannel({ ...next[i], ...patch, id: channelId });
  if (!next[i].name) return { memory: m, error: 'name-required' };

  return {
    memory: { ...m, channels: next, updatedAt: new Date().toISOString() },
    error: null, channel: next[i]
  };
}

export function removeChannel(memory, channelId) {
  const m = memory || emptyMemory();
  const next = (m.channels || []).filter(c => c.id !== channelId);
  if (next.length === (m.channels || []).length) {
    return { memory: m, error: 'not-found' };
  }
  return {
    memory: { ...m, channels: next, updatedAt: new Date().toISOString() },
    error: null
  };
}

/* ---------- MARKALAR ---------- */

const BRAND_FIELDS = ['name', 'colors', 'font', 'slogan', 'voice',
                      'bannedWords', 'preferredWords'];

export function normalizeBrand(input) {
  return {
    id: input?.id || id('br'),
    name: text(input?.name, LIMITS.short),
    colors: list(input?.colors, LIMITS.listLength, LIMITS.listItem),
    font: text(input?.font, LIMITS.short),
    slogan: text(input?.slogan, LIMITS.short),
    voice: text(input?.voice, LIMITS.long),
    /* Yasak kelimeler üretimde işe yarayacak: prompt ve metin
       üretiminde bunlardan kaçınılacak (Sprint-6). */
    bannedWords: list(input?.bannedWords, LIMITS.listLength, LIMITS.listItem),
    preferredWords: list(input?.preferredWords, LIMITS.listLength, LIMITS.listItem),
    createdAt: input?.createdAt || new Date().toISOString()
  };
}

export function addBrand(memory, input) {
  const m = memory || emptyMemory();
  const list0 = m.brands || [];
  if (list0.length >= LIMITS.maxBrands) {
    return { memory: m, error: 'limit-reached', limit: LIMITS.maxBrands };
  }
  const br = normalizeBrand(input);
  if (!br.name) return { memory: m, error: 'name-required' };

  return {
    memory: { ...m, brands: [...list0, br], updatedAt: new Date().toISOString() },
    error: null, brand: br
  };
}

export function updateBrand(memory, brandId, patch) {
  const m = memory || emptyMemory();
  const i = (m.brands || []).findIndex(b => b.id === brandId);
  if (i === -1) return { memory: m, error: 'not-found' };

  const unknown = Object.keys(patch || {})
    .filter(k => !BRAND_FIELDS.includes(k) && k !== 'id');
  if (unknown.length) return { memory: m, error: 'unknown-field', fields: unknown };

  const next = [...m.brands];
  next[i] = normalizeBrand({ ...next[i], ...patch, id: brandId });
  if (!next[i].name) return { memory: m, error: 'name-required' };

  return {
    memory: { ...m, brands: next, updatedAt: new Date().toISOString() },
    error: null, brand: next[i]
  };
}

export function removeBrand(memory, brandId) {
  const m = memory || emptyMemory();
  const next = (m.brands || []).filter(b => b.id !== brandId);
  if (next.length === (m.brands || []).length) {
    return { memory: m, error: 'not-found' };
  }
  return {
    memory: { ...m, brands: next, updatedAt: new Date().toISOString() },
    error: null
  };
}

/* ---------- HEDEFLER ---------- */

export function normalizeGoal(input) {
  return {
    id: input?.id || id('go'),
    text: text(input?.text, LIMITS.long),
    /* Hedef ölçülebilir olabilir ("100.000 abone") ama olmayabilir de
       ("marka oluşturmak"). Zorlamıyoruz. */
    target: text(input?.target, LIMITS.short),
    done: !!input?.done,
    createdAt: input?.createdAt || new Date().toISOString()
  };
}

export function addGoal(memory, input) {
  const m = memory || emptyMemory();
  const list0 = m.goals || [];
  if (list0.length >= LIMITS.maxGoals) {
    return { memory: m, error: 'limit-reached', limit: LIMITS.maxGoals };
  }
  const g = normalizeGoal(input);
  if (!g.text) return { memory: m, error: 'text-required' };

  return {
    memory: { ...m, goals: [...list0, g], updatedAt: new Date().toISOString() },
    error: null, goal: g
  };
}

export function updateGoal(memory, goalId, patch) {
  const m = memory || emptyMemory();
  const i = (m.goals || []).findIndex(g => g.id === goalId);
  if (i === -1) return { memory: m, error: 'not-found' };

  const next = [...m.goals];
  next[i] = normalizeGoal({ ...next[i], ...patch, id: goalId });
  if (!next[i].text) return { memory: m, error: 'text-required' };

  return {
    memory: { ...m, goals: next, updatedAt: new Date().toISOString() },
    error: null, goal: next[i]
  };
}

export function removeGoal(memory, goalId) {
  const m = memory || emptyMemory();
  const next = (m.goals || []).filter(g => g.id !== goalId);
  if (next.length === (m.goals || []).length) {
    return { memory: m, error: 'not-found' };
  }
  return {
    memory: { ...m, goals: next, updatedAt: new Date().toISOString() },
    error: null
  };
}

/* ---------- ÖZET ---------- */
export function entitySummary(memory) {
  const m = memory || emptyMemory();
  return {
    channels: (m.channels || []).length,
    brands: (m.brands || []).length,
    goals: (m.goals || []).length,
    openGoals: (m.goals || []).filter(g => !g.done).length,
    /* Marka kuralları üretimde kullanılacak — kaç kural var */
    bannedWords: (m.brands || []).reduce((a, b) => a + (b.bannedWords?.length || 0), 0),
    preferredWords: (m.brands || []).reduce((a, b) => a + (b.preferredWords?.length || 0), 0)
  };
}
