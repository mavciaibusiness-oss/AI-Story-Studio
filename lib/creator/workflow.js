import { intentByKey } from './intent';

/*
  CREATOR OS — Workflow Builder.

  Sprint 5 / TASK-01, Adım 2.

  Adım 1 niyeti çıkardı. Bu dosya o niyetten YOL HARİTASI kuruyor:
  kullanıcı artık modül seçmiyor, sıralı bir görev listesi görüyor.

  ---------------------------------------------------------------
  EN ÖNEMLİ KURAL: ÖLÜ BAĞLANTI YOK

  Spec'in örnek workflow'ları Sprint-6 modüllerine dayanıyor
  (Kanal Analizi, Niche, Rakip Analizi, Ürün Analizi, Site Analizi).
  Ama aynı spec bunları bu sprintte YAPMAYACAĞIMIZI söylüyor.

  Yol haritasına tıklayınca hiçbir yere gitmeyen adım koymak
  kullanıcı güvenini kaybettirir — "bu ürün çalışmıyor" hissi verir.

  Çözüm: her görevin `route` alanı var ve GERÇEK bir sayfaya
  bakıyor. Sprint-6 görevleri `future: true` taşıyor: yol haritasında
  görünüyor (kullanıcı nereye gittiğimizi anlasın) ama tıklanamıyor
  ve "yakında" etiketi taşıyor.

  ROUTES sabiti uygulamada gerçekten var olan 18 rotadan türedi;
  test bunu doğruluyor. Uydurma rota eklenirse test patlar.
  ---------------------------------------------------------------
*/

export const WORKFLOW_VERSION = 1;

/* Uygulamada gerçekten var olan rotalar. Yeni görev eklerken
   buradan seçilmeli — test listeyi app/studio ile karşılaştırıyor. */
export const ROUTES = {
  projects:   '/studio/projeler',
  script:     '/studio/senaryo',
  story:      '/studio/hikaye',
  storyboard: '/studio/storyboard',
  characters: '/studio/karakterler',
  prompts:    '/studio/promptlar',
  images:     '/studio/gorseller',
  voice:      '/studio/seslendirme',
  edit:       '/studio/atolye',
  subtitles:  '/studio/altyazi',
  thumbnail:  '/studio/thumbnail',
  shorts:     '/studio/shorts',
  publish:    '/studio/youtube',
  health:     '/studio/saglik',
  director:   '/studio/yonetmen',
  rebuild:    '/studio/yeniden'
};

/*
  ---------- GÖREV KATALOĞU ----------

  Her görev bir kez tanımlanır, workflow'lar bunlardan kurulur.
  Tekrar yazmak yerine referans vermek: bir görevin adı değişirse
  tek yerde değişir.

  future: true  → Sprint-6'da gelecek, şimdilik tıklanamaz
  optional      → kullanıcı çıkarabilir (zorunlu değil)
  needs         → bu görev için gereken önkoşul
*/
export const TASKS = {
  /* --- Üretim hattı --- */
  script: {
    key: 'script', route: ROUTES.script,
    label: { tr: 'Senaryo', en: 'Script' },
    desc: { tr: 'Hikâyenin metnini yaz ya da AI ile üret',
            en: 'Write the story text or generate it with AI' }
  },
  storyboard: {
    key: 'storyboard', route: ROUTES.storyboard,
    label: { tr: 'Storyboard', en: 'Storyboard' },
    desc: { tr: 'Metni sahnelere böl',
            en: 'Split the text into scenes' }
  },
  characters: {
    key: 'characters', route: ROUTES.characters,
    label: { tr: 'Karakterler', en: 'Characters' },
    desc: { tr: 'Karakter tanımlarını kur, sahneler arası tutarlılık sağla',
            en: 'Define characters for cross-scene consistency' },
    optional: true
  },
  prompts: {
    key: 'prompts', route: ROUTES.prompts,
    label: { tr: 'Promptlar', en: 'Prompts' },
    desc: { tr: 'Her sahne için görsel üretim promptu hazırla',
            en: 'Prepare an image prompt for each scene' }
  },
  images: {
    key: 'images', route: ROUTES.images,
    label: { tr: 'Görseller', en: 'Images' },
    desc: { tr: 'Ürettiğin görselleri sahnelere yükle',
            en: 'Upload your generated visuals to the scenes' }
  },
  voice: {
    key: 'voice', route: ROUTES.voice,
    label: { tr: 'Seslendirme', en: 'Voiceover' },
    desc: { tr: 'Anlatım sesini ekle',
            en: 'Add the narration audio' }
  },
  edit: {
    key: 'edit', route: ROUTES.edit,
    label: { tr: 'Kurgu', en: 'Edit' },
    desc: { tr: 'Sahneleri birleştir, videoyu oluştur',
            en: 'Assemble the scenes into a video' }
  },
  subtitles: {
    key: 'subtitles', route: ROUTES.subtitles,
    label: { tr: 'Altyazı', en: 'Subtitles' },
    desc: { tr: 'Altyazı dosyasını üret',
            en: 'Generate the subtitle file' },
    optional: true
  },
  thumbnail: {
    key: 'thumbnail', route: ROUTES.thumbnail,
    label: { tr: 'Kapak görseli', en: 'Thumbnail' },
    desc: { tr: 'Tıklanma oranını belirleyen kapağı hazırla',
            en: 'Prepare the thumbnail that drives click-through' }
  },
  shorts: {
    key: 'shorts', route: ROUTES.shorts,
    label: { tr: 'Shorts kesiti', en: 'Shorts cut' },
    desc: { tr: 'Dikey kısa video kesitini çıkar',
            en: 'Extract the vertical short-form cut' }
  },
  publish: {
    key: 'publish', route: ROUTES.publish,
    label: { tr: 'YouTube optimizasyonu', en: 'YouTube optimisation' },
    desc: { tr: 'Başlık, açıklama ve etiketleri hazırla',
            en: 'Prepare title, description and tags' }
  },

  /* --- Zekâ katmanı (Sprint-4'te yapıldı) --- */
  health: {
    key: 'health', route: ROUTES.health,
    label: { tr: 'Sağlık kontrolü', en: 'Health check' },
    desc: { tr: 'Hikâye, ritim ve görsel kalitesini ölç',
            en: 'Measure story, pacing and visual quality' }
  },
  director: {
    key: 'director', route: ROUTES.director,
    label: { tr: 'AI Yönetmen', en: 'AI Director' },
    desc: { tr: 'Kamera, hareket ve ses kararlarını al',
            en: 'Get camera, motion and voice decisions' }
  },
  rebuild: {
    key: 'rebuild', route: ROUTES.rebuild,
    label: { tr: 'Video çözümleme', en: 'Video analysis' },
    desc: { tr: 'Yayınlanmış videoyu sahnelerine ayır',
            en: 'Break the published video into its shots' }
  },

  /* --- Sprint-6'da gelecek ---
     Yol haritasında GÖRÜNÜR ama tıklanamaz. Kullanıcı nereye
     gittiğimizi görsün ama boş bir sayfaya düşmesin. */
  channelAnalysis: {
    key: 'channelAnalysis', route: null, future: true,
    label: { tr: 'Kanal analizi', en: 'Channel analysis' },
    desc: { tr: 'Kanalın performansını ve izleyici davranışını incele',
            en: 'Review channel performance and audience behaviour' }
  },
  niche: {
    key: 'niche', route: null, future: true,
    label: { tr: 'Niş analizi', en: 'Niche analysis' },
    desc: { tr: 'Hangi konuda üretmen gerektiğini bul',
            en: 'Find what topic you should be producing' }
  },
  competitor: {
    key: 'competitor', route: null, future: true,
    label: { tr: 'Rakip analizi', en: 'Competitor analysis' },
    desc: { tr: 'Rakip kanalların ne yaptığını çöz',
            en: 'Understand what competing channels are doing' }
  },
  productAnalysis: {
    key: 'productAnalysis', route: null, future: true,
    label: { tr: 'Ürün analizi', en: 'Product analysis' },
    desc: { tr: 'Ürünün satış noktalarını çıkar',
            en: 'Extract the product\'s selling points' }
  },
  siteAnalysis: {
    key: 'siteAnalysis', route: null, future: true,
    label: { tr: 'Site analizi', en: 'Website analysis' },
    desc: { tr: 'Web sitesini ve içeriğini çözümle',
            en: 'Analyse the website and its content' }
  },
  adCopy: {
    key: 'adCopy', route: null, future: true,
    label: { tr: 'Reklam metni', en: 'Ad copy' },
    desc: { tr: 'Satış odaklı metinleri üret',
            en: 'Generate sales-focused copy' }
  },
  socialPack: {
    key: 'socialPack', route: null, future: true,
    label: { tr: 'Sosyal medya paketi', en: 'Social media pack' },
    desc: { tr: 'Platformlara göre paylaşım paketleri hazırla',
            en: 'Prepare per-platform sharing packs' }
  }
};

export const TASK_KEYS = Object.keys(TASKS);

/*
  ---------- WORKFLOW ŞABLONLARI ----------

  Niyet → görev sırası. Şablonlar TABAN; değiştiriciler bunları
  değiştiriyor (aşağıda).

  Spec: "Hiçbir workflow sabit değildir." Şablon başlangıç noktası,
  son hâli applyModifiers + kullanıcı düzenlemeleri belirliyor.
*/
const BASE_FLOWS = {
  /* Üretim — tür fark etmez, hat aynı */
  production: ['script', 'storyboard', 'characters', 'prompts',
               'images', 'voice', 'edit', 'subtitles', 'thumbnail'],

  /* Ticari üretim — analiz önde, satış metni sonda */
  commerce: ['productAnalysis', 'script', 'storyboard', 'prompts',
             'images', 'voice', 'edit', 'adCopy', 'socialPack'],

  /* Kanal analizi */
  channel: ['channelAnalysis', 'niche', 'competitor'],

  /* Site analizi */
  site: ['siteAnalysis'],

  /* Rakip analizi */
  rival: ['competitor', 'niche'],

  /* Video iyileştirme — spec'in "Video İyileştirme" örneği */
  improve: ['rebuild', 'health', 'director', 'storyboard', 'prompts', 'images', 'edit'],

  /* Sağlık kontrolü — hızlı yol */
  healthOnly: ['health', 'director']
};

/* Niyet → taban akış */
const INTENT_FLOW = {
  'video.youtube':      'production',
  'video.shorts':       'production',
  'video.reels':        'production',
  'video.tiktok':       'production',
  'video.horror':       'production',
  'video.kids':         'production',
  'video.documentary':  'production',
  'video.story':        'production',
  'video.generic':      'production',
  'ad.product':         'commerce',
  'ad.etsy':            'commerce',
  'ad.shopify':         'commerce',
  'analyze.channel':    'channel',
  'analyze.competitor': 'rival',
  'analyze.site':       'site',
  'improve.video':      'improve',
  'improve.health':     'healthOnly'
};

/*
  ---------- DEĞİŞTİRİCİLER ----------

  Adım 1'in `modifiers` çıktısı burada işe yarıyor. Platform üretim
  hattını değiştiriyor:

    YouTube → sonuna optimizasyon adımı
    Shorts / Reels / TikTok → dikey format, kapak yerine kesit,
                              altyazı ZORUNLU (sessiz izleniyor)

  Bu, boyut ayrımının somut karşılığı: "Youtube için korku videosu"
  hem korku hattını hem YouTube adımını alıyor.
*/
function applyModifiers(taskKeys, intentKey, modifiers) {
  let keys = [...taskKeys];
  const platform = modifiers?.platform || null;

  /* Kısa form platformları */
  const shortForm = ['video.shorts', 'video.reels', 'video.tiktok'];
  const isShort = shortForm.includes(intentKey) || shortForm.includes(platform);

  if (isShort) {
    /* Kapak görseli kısa formda işe yaramaz — kesit gerekir */
    keys = keys.filter(k => k !== 'thumbnail');
    if (!keys.includes('shorts')) keys.push('shorts');
    /* Altyazı kısa formda zorunlu: izleyicilerin çoğu sessiz izliyor.
       Şablonda optional işaretli ama burada zorunlu hale geliyor. */
    if (!keys.includes('subtitles')) {
      const editAt = keys.indexOf('edit');
      keys.splice(editAt >= 0 ? editAt + 1 : keys.length, 0, 'subtitles');
    }
  }

  /* YouTube: yayın optimizasyonu */
  const isYouTube = intentKey === 'video.youtube' || platform === 'video.youtube';
  if (isYouTube && !keys.includes('publish')) keys.push('publish');

  /* Uzun form üretimde sağlık kontrolü ve yönetmen değerli.
     Kısa formda ark analizi zaten çalışmıyor (TASK-05 dersi), ekleme.

     SIRA ÖNEMLİ: Sağlık ÖLÇER, Yönetmen o ölçümleri okuyup KARAR
     VERİR (TASK-06 mimarisi). Yönetmen önce gelirse okuyacağı veri
     yok demektir.

     İlk yazışta iki splice aynı eski indeksi kullanıyordu; ilki
     diziyi kaydırınca ikincisi ONUN ÖNÜNE giriyordu ve sıra ters
     çıkıyordu. Indeks her eklemede yeniden hesaplanmalı. */
  const isProduction = INTENT_FLOW[intentKey] === 'production';
  if (isProduction && !isShort) {
    for (const k of ['health', 'director']) {
      if (keys.includes(k)) continue;
      const editAt = keys.indexOf('edit');
      keys.splice(editAt >= 0 ? editAt : keys.length, 0, k);
    }
  }

  return keys;
}

/*
  ---------- BUGÜN YAPILABİLECEK ALTERNATİF ----------

  Üç analiz niyetinin (kanal, rakip, site) workflow'u tamamen Sprint-6
  görevlerinden oluşuyor. Kullanıcı "Youtube kanalımı analiz et"
  yazınca hiçbir şeyin tıklanamadığı bir yol haritası görürdü —
  çıkmaz sokak.

  Spec kuralı: "Kullanıcı hiçbir zaman boş ekran görmesin."

  Var olmayan modülleri varmış gibi göstermek de yanlış olurdu:
  Sağlık ve Yönetmen bir VİDEOYU analiz ediyor, KANALI değil. İkisini
  karıştırmak kullanıcıyı yanıltır.

  Doğrusu: niyeti tanı, yol haritasını göster (nereye gittiğimiz
  görünsün), ama bugün yapılabilecek GERÇEK bir alternatif sun.
*/
const FALLBACK_SUGGESTION = {
  channel: {
    reason: { tr: 'Kanal analizi henüz hazır değil.',
              en: 'Channel analysis is not ready yet.' },
    offer: { tr: 'Bunun yerine yayınladığın bir videoyu çözümleyebilirsin — sahnelere ayırıp neyin iyileştirilebileceğini gösterir.',
             en: 'Instead you can analyse a published video — it splits it into shots and shows what can be improved.' },
    tasks: ['rebuild', 'health']
  },
  rival: {
    reason: { tr: 'Rakip analizi henüz hazır değil.',
              en: 'Competitor analysis is not ready yet.' },
    offer: { tr: 'Kendi videonun güçlü ve zayıf yanlarını ölçerek başlayabilirsin.',
             en: 'You can start by measuring the strengths and weaknesses of your own video.' },
    tasks: ['health', 'director']
  },
  site: {
    reason: { tr: 'Site analizi henüz hazır değil.',
              en: 'Website analysis is not ready yet.' },
    offer: { tr: 'Şimdilik ürünün için bir tanıtım videosu hazırlayabilirsin.',
             en: 'For now you can prepare a promo video for your product.' },
    tasks: ['script', 'storyboard', 'prompts', 'images', 'voice', 'edit']
  }
};

function suggestionFor(flowKey) {
  const s = FALLBACK_SUGGESTION[flowKey];
  if (!s) return null;
  return {
    reason: s.reason,
    offer: s.offer,
    tasks: s.tasks.map(k => TASKS[k]).filter(Boolean).map(t => ({
      key: t.key, label: t.label, route: t.route
    }))
  };
}

/*
  ---------- WORKFLOW KUR ----------

  Girdi: Adım 1'in classifyIntent çıktısı
  Çıkış: { intent, tasks[], stats, warnings, suggestion }

  Her görev:
    { key, label, desc, route, future, optional, status, order }

  status: 'todo' — hepsi başlangıçta yapılacak. İlerleme takibi
  Adım 3'te Creator Session ile gelecek.
*/
export function buildWorkflow(classified, opts) {
  const intentKey = classified?.intent;
  const warnings = [];

  if (!intentKey) {
    return {
      intent: null, tasks: [], stats: emptyStats(), suggestion: null,
      warnings: ['no-intent'], version: WORKFLOW_VERSION
    };
  }

  const flowKey = INTENT_FLOW[intentKey];
  if (!flowKey || !BASE_FLOWS[flowKey]) {
    /* Niyet tanımlı ama akışı yok — tanım eksikliği. Sessiz kalmak
       yerine uyarı veriyoruz; test bu durumun oluşmadığını doğruluyor. */
    return {
      intent: intentKey, tasks: [], stats: emptyStats(), suggestion: null,
      warnings: ['no-flow-for-intent'], version: WORKFLOW_VERSION
    };
  }

  const keys = applyModifiers(BASE_FLOWS[flowKey], intentKey, classified.modifiers);

  const tasks = keys.map((k, i) => {
    const def = TASKS[k];
    if (!def) return null;
    return {
      key: def.key,
      label: def.label,
      desc: def.desc,
      route: def.route || null,
      future: !!def.future,
      optional: !!def.optional,
      status: 'todo',
      order: i
    };
  }).filter(Boolean);

  const stats = statsOf(tasks);
  const futureCount = stats.future;
  if (futureCount > 0) warnings.push('has-future-tasks');
  if (classified.needsInput) warnings.push('needs-' + classified.needsInput);
  if (classified.ambiguous) warnings.push('ambiguous-intent');

  /* Hiçbir görev bugün yapılamıyorsa alternatif şart */
  const suggestion = stats.available === 0 ? suggestionFor(flowKey) : null;
  if (stats.available === 0) warnings.push('not-available-yet');

  return {
    intent: intentKey,
    label: classified.label,
    modifiers: classified.modifiers || {},
    tasks,
    stats,
    /* available:false → arayüz "bu akış henüz hazır değil" der ve
       suggestion'ı gösterir. Boş ekran yok, yalan da yok. */
    available: stats.available > 0,
    suggestion,
    warnings,
    version: WORKFLOW_VERSION
  };
}

function emptyStats() {
  return { total: 0, available: 0, future: 0, optional: 0, done: 0 };
}

function statsOf(tasks) {
  const list = tasks || [];
  return {
    total: list.length,
    /* available: şimdi yapılabilecek görev sayısı. Kullanıcıya
       "9 adımdan 7'si hazır" demek, hepsini vaat etmekten dürüst. */
    available: list.filter(t => !t.future).length,
    future: list.filter(t => t.future).length,
    optional: list.filter(t => t.optional).length,
    done: list.filter(t => t.status === 'done').length
  };
}

/* ---------- Düzenleme ----------
   Spec: "Her görev eklenebilir, çıkarılabilir, yeniden sıralanabilir."
   Hepsi SAF fonksiyon — girdiyi değiştirmiyor. */

export function addTask(workflow, taskKey, position) {
  const def = TASKS[taskKey];
  if (!def || !workflow) return workflow;
  if (workflow.tasks.some(t => t.key === taskKey)) return workflow;

  const task = {
    key: def.key, label: def.label, desc: def.desc,
    route: def.route || null, future: !!def.future,
    optional: !!def.optional, status: 'todo', order: 0
  };

  const tasks = [...workflow.tasks];
  const at = Number.isInteger(position)
    ? Math.max(0, Math.min(position, tasks.length))
    : tasks.length;
  tasks.splice(at, 0, task);

  return { ...workflow, tasks: reorder(tasks), stats: statsOf(tasks) };
}

export function removeTask(workflow, taskKey) {
  if (!workflow) return workflow;
  const tasks = workflow.tasks.filter(t => t.key !== taskKey);
  if (tasks.length === workflow.tasks.length) return workflow;
  return { ...workflow, tasks: reorder(tasks), stats: statsOf(tasks) };
}

export function moveTask(workflow, taskKey, toIndex) {
  if (!workflow) return workflow;
  const from = workflow.tasks.findIndex(t => t.key === taskKey);
  if (from === -1) return workflow;
  const to = Math.max(0, Math.min(toIndex, workflow.tasks.length - 1));
  if (from === to) return workflow;

  const tasks = [...workflow.tasks];
  const [moved] = tasks.splice(from, 1);
  tasks.splice(to, 0, moved);
  return { ...workflow, tasks: reorder(tasks), stats: statsOf(tasks) };
}

export function setTaskStatus(workflow, taskKey, status) {
  if (!workflow) return workflow;
  const valid = ['todo', 'active', 'done', 'skipped'];
  if (!valid.includes(status)) return workflow;
  const tasks = workflow.tasks.map(t =>
    t.key === taskKey ? { ...t, status } : t);
  return { ...workflow, tasks, stats: statsOf(tasks) };
}

function reorder(tasks) {
  return tasks.map((t, i) => ({ ...t, order: i }));
}

/*
  ---------- SONRAKİ ADIM ----------

  Spec kuralı: "AI her zaman sonraki adımı bilmelidir."

  Sırayla ilk yapılmamış ve YAPILABİLİR görevi döner. Sprint-6
  görevleri atlanır — kullanıcıyı yapamayacağı bir adıma yönlendirmek
  çıkmaz sokak olur.
*/
export function nextTask(workflow) {
  const tasks = workflow?.tasks || [];
  return tasks.find(t =>
    t.status !== 'done' && t.status !== 'skipped' && !t.future) || null;
}

/* Eklenebilecek görevler — arayüzün "görev ekle" menüsü için. */
export function availableToAdd(workflow) {
  const used = new Set((workflow?.tasks || []).map(t => t.key));
  return TASK_KEYS.filter(k => !used.has(k)).map(k => ({
    key: k,
    label: TASKS[k].label,
    future: !!TASKS[k].future
  }));
}
