/*
  AI CONTEXT — varlık modeli.

  Sprint 6 / TASK-08, Adım 1.

  ---------------------------------------------------------------
  ÜÇ DURUM (kullanıcının kararı)

    attached  — kullanıcı ekledi, elimizde
    ready     — içeriği çözüldü, AI'a gönderilebilir
    supported — bu tür BU SÜRÜMDE işlenebiliyor mu

  `supported` statik bir yetenek: PDF eklenebiliyor ama bu sürümde
  okunamıyor. `ready` ise o TEK dosyanın durumu: görsel eklendi ama
  henüz okunmadı olabilir.

  AI HİÇBİR ZAMAN SESSİZCE YOK SAYMAZ. Desteklenmeyen bir dosya
  eklendiğinde bunu söylüyor — teknik hata dili kullanmadan.
  ---------------------------------------------------------------

  BU DOSYA TARAYICIYA ERİŞMİYOR

  Saf model: tür tanımları, durum hesabı, doğrulama. IndexedDB
  katmanı ayrı (store.js). Test edilebilir kalıyor.
*/

export const ASSET_VERSION = 1;

/*
  ---------- DESTEKLENEN TÜRLER ----------

  `ready: true`  → bu sürümde AI bağlamına giriyor
  `ready: false` → eklenebiliyor, "yakında" olarak gösteriliyor

  Yakında olanlar da EKLENEBİLİYOR. Kullanıcı PDF'ini şimdi
  ekleyip, destek geldiğinde tekrar yüklemek zorunda kalmasın.
*/
export const ASSET_TYPES = {
  image: {
    key: 'image', ready: true, kind: 'file',
    accept: 'image/*', multiple: true,
    maxBytes: 15 * 1024 * 1024
  },
  video: {
    key: 'video', ready: true, kind: 'file',
    accept: 'video/*', multiple: false,
    maxBytes: 200 * 1024 * 1024
  },
  logo: {
    key: 'logo', ready: true, kind: 'file',
    accept: 'image/*', multiple: false,
    maxBytes: 5 * 1024 * 1024
  },
  brand: {
    key: 'brand', ready: true, kind: 'file',
    accept: 'image/*', multiple: true,
    maxBytes: 15 * 1024 * 1024
  },
  audio: {
    key: 'audio', ready: true, kind: 'file',
    accept: 'audio/*', multiple: false,
    maxBytes: 50 * 1024 * 1024
  },

  /* --- Yakında --- */
  pdf: {
    key: 'pdf', ready: false, kind: 'file',
    accept: 'application/pdf', multiple: true,
    maxBytes: 25 * 1024 * 1024
  },
  docx: {
    key: 'docx', ready: false, kind: 'file',
    accept: '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    multiple: true, maxBytes: 25 * 1024 * 1024
  },
  website: {
    key: 'website', ready: false, kind: 'url'
  },
  youtube: {
    key: 'youtube', ready: false, kind: 'url'
  }
};

/* Arayüzün "+ Ekle" menüsünde göstereceği sıra. Hazır olanlar
   önce — kullanıcı çalışan şeyi arayarak bulmasın. */
export const TYPE_ORDER = ['image', 'video', 'logo', 'brand', 'audio',
                           'pdf', 'docx', 'website', 'youtube'];

export function typeOf(key) {
  return ASSET_TYPES[key] || null;
}

export function readyTypes() {
  return TYPE_ORDER.filter(k => ASSET_TYPES[k]?.ready);
}

export function comingTypes() {
  return TYPE_ORDER.filter(k => !ASSET_TYPES[k]?.ready);
}

/*
  ---------- DOSYADAN TÜR ÇIKAR ----------

  Kullanıcı sürükleyip bıraktığında hangi tür olduğunu MIME'dan
  anlıyoruz. Logo ve marka görseli de image — onları kullanıcı
  menüden seçerek ayırıyor.
*/
export function detectType(file) {
  const mime = String(file?.type || '').toLowerCase();
  const name = String(file?.name || '').toLowerCase();

  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (name.endsWith('.docx') || mime.includes('wordprocessingml')) return 'docx';
  return null;
}

/*
  ---------- URL TÜRÜ ----------

  YouTube ayrı bir tür: farklı işleniyor (video analizi) ve
  kullanıcı için farklı anlam taşıyor.
*/
const YT = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)/i;

export function detectUrlType(url) {
  const u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return null;
  return YT.test(u) ? 'youtube' : 'website';
}

/*
  ---------- VARLIK OLUŞTUR ----------

  `id` — kalıcı kimlik. IndexedDB anahtarı ve arayüz anahtarı.
  `state` — attached | ready | unsupported

  DİKKAT: `unsupported` bir HATA DEĞİL. Dosya duruyor, kullanıcı
  onu görüyor, destek geldiğinde çalışacak. Arayüz bunu "yakında"
  diye gösteriyor.
*/
export function makeAsset({ type, file, url, name }) {
  const t = typeOf(type);
  if (!t) return { error: 'unknown-type' };

  if (t.kind === 'file') {
    if (!file) return { error: 'file-required' };
    if (t.maxBytes && file.size > t.maxBytes) {
      return { error: 'too-large', maxBytes: t.maxBytes, size: file.size };
    }
  } else if (!url) {
    return { error: 'url-required' };
  }

  return {
    asset: {
      id: 'as-' + Date.now().toString(36) + '-' +
          Math.random().toString(36).slice(2, 8),
      type,
      name: name || file?.name || url || '',
      size: file?.size ?? null,
      mime: file?.type || null,
      url: t.kind === 'url' ? String(url).trim() : null,
      /* Hazır tür → doğrudan kullanılabilir.
         Yakında olan → eklendi ama bağlama girmiyor. */
      state: t.ready ? 'ready' : 'unsupported',
      addedAt: new Date().toISOString()
    }
  };
}

/*
  ---------- BAĞLAM ÖZETİ ----------

  AI'a ne gönderilebiliyor, ne gönderilemiyor.

  Bu, AI'ın "PDF'i ekledim ama içeriğini henüz okuyamıyorum"
  diyebilmesi için gereken veri. Sessiz yok sayma YOK.
*/
export function contextSummary(assets) {
  const list = Array.isArray(assets) ? assets : [];
  const usable = list.filter(a => a?.state === 'ready');
  const pending = list.filter(a => a?.state === 'unsupported');

  /* Tür bazlı sayım — arayüz "3 görsel, 1 PDF" diyebilsin */
  const byType = {};
  for (const a of list) {
    if (!a?.type) continue;
    byType[a.type] = (byType[a.type] || 0) + 1;
  }

  return {
    total: list.length,
    usable: usable.length,
    /* AI bunlardan bahsedecek — sessizce atlamayacak */
    pending: pending.map(a => ({ id: a.id, type: a.type, name: a.name })),
    byType,
    /* Hiç varlık yoksa arayüz bölümü hiç göstermesin */
    empty: list.length === 0
  };
}

/*
  ---------- BOYUT OKUNUR ----------

  Arayüz "12,4 MB" desin diye. Teknik dil değil, tanıdık birim.
*/
export function humanSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
