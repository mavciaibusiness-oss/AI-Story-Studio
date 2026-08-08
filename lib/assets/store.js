'use client';

/*
  AI CONTEXT — kalıcı depolama.

  Sprint 6 / TASK-08, Adım 1.

  ---------------------------------------------------------------
  NEDEN IndexedDB

  Kullanıcı kararı: "İlk sürümden itibaren kullanıcı dosyalarının
  sayfa yenilense bile kaybolmasını istemiyorum. Kullanıcı teknik
  detay görmeyecek."

  `sessionStorage` blob saklayamaz (string, ~5MB). Bellekte tutmak
  sayfa yenilenince kaybeder — ve kullanıcı bunu FARK ETMEZ, boş
  bağlamla çalışmaya devam eder.

  IndexedDB blob'ları kalıcı tutuyor. Uyarı göstermeye gerek yok
  çünkü kaybolmuyor.

  ---------------------------------------------------------------
  STORAGE'A GEÇİŞ İÇİN ARAYÜZ

  Bu dosya dört işlem sunuyor: put, get, list, remove.

  Supabase Storage geldiğinde aynı imzayla bir sürücü yazılacak ve
  ÇAĞIRAN TARAF DEĞİŞMEYECEK. Arayüz bugünden ona göre tasarlandı:

    • Hepsi async (Storage zaten async olacak)
    • Blob yerine kimlik döndürüyor (URL'ler geçici)
    • `list` yalnızca üstveri (blob'lar isteğe bağlı yükleniyor)

  Bu yüzden bileşenler `getUrl(id)` çağırıyor, blob'u doğrudan
  tutmuyorlar.
*/

const DB_NAME = 'creator-os';
const DB_VERSION = 1;
const STORE = 'assets';

/* Açık bağlantıyı yeniden kullanıyoruz — her işlemde açmak
   yavaş ve gereksiz. */
let dbPromise = null;

function openDB() {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('no-indexeddb'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: 'id' });
        /* Oturuma göre listeleme — bir plana ait varlıklar */
        s.createIndex('sessionId', 'sessionId', { unique: false });
        s.createIndex('addedAt', 'addedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('open-failed'));
  });
  return dbPromise;
}

function tx(mode) {
  return openDB().then(db => db.transaction(STORE, mode).objectStore(STORE));
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/*
  ---------- KAYDET ----------

  Üstveri + blob birlikte. Blob'u ayrı tutmak iki işlem demek ve
  yarıda kalırsa tutarsız kayıt bırakır.
*/
export async function putAsset(asset, blob, sessionId) {
  try {
    const store = await tx('readwrite');
    await wrap(store.put({
      ...asset,
      sessionId: sessionId || null,
      blob: blob || null
    }));
    return { ok: true };
  } catch (e) {
    /* Kota dolmuş ya da IndexedDB kapalı (gizli mod).
       Çağıran taraf kullanıcıya teknik hata GÖSTERMİYOR —
       varlık listede kalıyor, yalnızca kalıcı olmuyor. */
    return { ok: false, reason: String(e?.message || e) };
  }
}

/* ---------- ÜSTVERİ LİSTESİ ----------

   Blob'lar DÖNMÜYOR: bir oturumda 20 görsel varsa hepsini belleğe
   almak gereksiz. Arayüz gerekeni `getUrl` ile istiyor. */
export async function listAssets(sessionId) {
  try {
    const store = await tx('readonly');
    const all = await wrap(store.getAll());
    return (all || [])
      .filter(r => !sessionId || r.sessionId === sessionId)
      .map(({ blob, ...meta }) => meta)
      .sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)));
  } catch {
    return [];
  }
}

/*
  ---------- GÖRÜNTÜLEME ADRESİ ----------

  Blob'dan geçici URL üretiyor. Storage'a geçince aynı fonksiyon
  imzalı bir adres döndürecek — çağıran taraf değişmeyecek.

  ÜRETİLEN URL'LER SERBEST BIRAKILMALI: `revokeUrl` çağrılmazsa
  bellek sızar. Bileşen sökülürken çağırıyor.
*/
const urlCache = new Map();

export async function getUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  try {
    const store = await tx('readonly');
    const rec = await wrap(store.get(id));
    if (!rec?.blob) return null;
    const url = URL.createObjectURL(rec.blob);
    urlCache.set(id, url);
    return url;
  } catch {
    return null;
  }
}

export function revokeUrl(id) {
  const url = urlCache.get(id);
  if (!url) return;
  try { URL.revokeObjectURL(url); } catch { /* zaten serbest */ }
  urlCache.delete(id);
}

export function revokeAll() {
  for (const id of [...urlCache.keys()]) revokeUrl(id);
}

/*
  ---------- OTURUMA BAĞLA ----------

  Sprint 6 / TASK-08, Adım 3.

  Kullanıcı önce dosyayı ekliyor, sonra ne isteyeceğini yazıyor.
  Yani varlıklar plan kurulmadan ÖNCE eklenmiş oluyor ve
  `sessionId` null kalıyor.

  Plan kurulunca bağlıyoruz: o plana ait varlıklar artık onunla
  yaşıyor, onunla siliniyor.

  YALNIZCA BAĞSIZ OLANLAR: başka bir plana ait varlıkları
  çalmıyoruz. Kullanıcı iki plan arasında geçiş yaparken eski
  planın dosyaları yenisine geçmemeli.
*/
export async function attachToSession(sessionId, ids) {
  if (!sessionId) return { ok: false, attached: 0 };
  try {
    const store = await tx('readwrite');
    const all = await wrap(store.getAll());
    let n = 0;
    for (const rec of (all || [])) {
      /* Zaten bir plana bağlıysa dokunmuyoruz */
      if (rec.sessionId) continue;
      /* Kimlik listesi verildiyse yalnızca onlar */
      if (Array.isArray(ids) && ids.length && !ids.includes(rec.id)) continue;
      await wrap(store.put({ ...rec, sessionId }));
      n++;
    }
    return { ok: true, attached: n };
  } catch {
    return { ok: false, attached: 0 };
  }
}

/*
  ---------- BAĞSIZ VARLIKLAR ----------

  Henüz bir plana bağlanmamış olanlar. Composer bunları
  gösteriyor: kullanıcı yazmadan önce eklediği dosyalar.
*/
export async function listLoose() {
  try {
    const store = await tx('readonly');
    const all = await wrap(store.getAll());
    return (all || [])
      .filter(r => !r.sessionId)
      .map(({ blob, ...meta }) => meta)
      .sort((a, b) => String(a.addedAt).localeCompare(String(b.addedAt)));
  } catch {
    return [];
  }
}

/* ---------- SİL ---------- */
export async function removeAsset(id) {
  revokeUrl(id);
  try {
    const store = await tx('readwrite');
    await wrap(store.delete(id));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/*
  ---------- OTURUMU TEMİZLE ----------

  Kullanıcı bir planı sildiğinde varlıkları da gitmeli — yoksa
  IndexedDB sınırsız büyür ve kullanıcının sildiğini sandığı
  dosyalar durmaya devam eder.
*/
export async function clearSession(sessionId) {
  try {
    const store = await tx('readwrite');
    const all = await wrap(store.getAll());
    let n = 0;
    for (const r of (all || [])) {
      if (sessionId && r.sessionId !== sessionId) continue;
      revokeUrl(r.id);
      await wrap(store.delete(r.id));
      n++;
    }
    return { ok: true, removed: n };
  } catch {
    return { ok: false, removed: 0 };
  }
}

/*
  ---------- KULLANILABİLİR Mİ ----------

  Gizli sekmede ya da eski tarayıcıda IndexedDB kapalı olabilir.
  Arayüz buna göre davranıyor — ama kullanıcıya teknik mesaj
  göstermiyor, sadece varlıklar oturum boyunca yaşıyor.
*/
export async function isAvailable() {
  try { await openDB(); return true; } catch { return false; }
}
