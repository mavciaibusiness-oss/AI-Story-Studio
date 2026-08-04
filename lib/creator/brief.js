import { TASKS, ROUTES } from './workflow';
import { dominant } from './memory';
import { estimatePlan } from './timing';

/*
  CREATOR OS — plan özeti (brief).

  Sprint 6 / TASK-02, Adım 2.

  Spec kullanıcıya şunları göstermek istiyor:

    Kullanıcının amacı      → Adım 1'de var (classifyIntent)
    İçerik türü             → Adım 1'de var (dimension: genre)
    Kullanılacak modüller   → bu dosya
    Gerekli AI araçları     → bu dosya
    Tahmini çalışma süresi  → bu dosya (yalnızca ÖLÇÜLMÜŞSE)
    Gerekli dosyalar        → bu dosya
    İzlenecek yol           → Adım 1'de var (buildWorkflow)

  ---------------------------------------------------------------
  ÜÇ ŞEY UYDURULMUYOR

  1. SÜRE — timing.js ölçüyor. Yeterli veri yoksa `known: false`
     dönüyor ve arayüz yalnızca adım sayısını gösteriyor.

  2. AI ARAÇLARI — hangi aracın kullanılacağını BİZ seçmiyoruz.
     Kullanıcı hafızasında bir tercih varsa onu söylüyoruz
     ("genellikle Veo kullanıyorsun"); yoksa seçenekleri
     listeliyoruz. "Veo kullanacağız" demek yanlış olurdu —
     kullanıcı prompt'u istediği araca götürebilir.

  3. GEREKLİ DOSYALAR — akışın gerçekten beklediği girdiler.
     Uydurma bir "3 dosya yükleyin" listesi değil; hangi görevin
     dosya beklediği görev tanımından çıkarılıyor.
  ---------------------------------------------------------------
*/

export const BRIEF_VERSION = 1;

/*
  Hangi görev hangi dosyayı bekliyor?

  Bu liste akışın GERÇEK gereksinimleri. `optional: true` olanlar
  olmadan da çalışır ama sonuç zayıflar.
*/
const TASK_INPUTS = {
  /* Video analizi kendi videosunu istiyor — onsuz hiçbir şey
     yapılamaz. */
  rebuild:   { kind: 'video', optional: false },
  /* Görseller: kullanıcı kendi görsellerini yükleyebilir ya da
     AI ile üretir. İkisi de geçerli, o yüzden isteğe bağlı. */
  images:    { kind: 'image', optional: true },
  /* Ses: kendi kaydını yükleyebilir ya da seslendirme üretir. */
  voice:     { kind: 'audio', optional: true },
  /* Karakterler: referans görsel tutarlılığı artırır. */
  characters:{ kind: 'image', optional: true }
};

/* Görev → hangi AI aracı türü gerekiyor.
   Araç ADI değil, TÜRÜ — kullanıcı hangi ürünü seçeceğine kendi
   karar veriyor. */
const TASK_TOOLS = {
  images:  'image',
  prompts: 'image',
  voice:   'tts',
  edit:    'none'      // tarayıcıda, dış araç gerekmiyor
};

/* Her tür için bilinen seçenekler — lib/prompt/vocab.js'teki
   sözlükle uyumlu. Bunlar ÖNERİ değil, kullanıcının seçebileceği
   yaygın araçlar. */
export const TOOL_OPTIONS = {
  image: ['Midjourney', 'Flux', 'Leonardo', 'Nano Banana', 'Seedream'],
  video: ['Veo', 'Runway', 'Kling', 'Pika', 'Luma'],
  tts:   ['ElevenLabs', 'OpenAI TTS']
};

/*
  ---------- PLAN ÖZETİ ----------

  Girdi:
    classified — classifyIntent çıktısı
    workflow   — buildWorkflow çıktısı
    memory     — Creator Memory (varsa)
    timings    — taskTimings çıktısı (varsa)

  Çıkış: arayüzün göstereceği her şey. Metin YOK — anahtar ve veri.
*/
export function buildBrief({ classified, workflow, memory, timings }) {
  const tasks = (workflow?.tasks || []);
  const doable = tasks.filter(t => !t.future);
  const future = tasks.filter(t => t.future);

  /* --- Kullanılacak modüller ---
     Aynı ekrana giden görevler tek modül sayılıyor: kullanıcı
     "12 modül" değil "7 ekran" görecek. */
  const routes = [];
  const seen = new Set();
  for (const t of doable) {
    const r = t.route || TASKS[t.key]?.route;
    if (!r || seen.has(r)) continue;
    seen.add(r);
    routes.push({ route: r, taskKey: t.key, label: t.label });
  }

  /* --- Gerekli AI araçları ---
     Hangi TÜR araç gerekiyor + kullanıcının tercihi (varsa). */
  const toolKinds = new Set();
  for (const t of doable) {
    const kind = TASK_TOOLS[t.key];
    if (kind && kind !== 'none') toolKinds.add(kind);
  }
  /*
    VİDEO ARACI: görsel üretimi olan her akışta seçenek.

    İlk sürümde `modifiers.platform` varsa ekliyordum — ama "Korku
    videosu hazırla" platform belirtmiyor ve yine de video aracı
    kullanılabilir. Kullanıcı sahneleri hareketli üretmek isterse
    Veo/Runway gerekiyor; storyboard'da her sahne `media: 'image'`
    ya da `'video'` olabiliyor (lib/storyboard.js).

    Yani video aracı platform kararına DEĞİL, sahne türü kararına
    bağlı — ve o karar üretim sırasında veriliyor. Seçenek olarak
    sunuyoruz.
  */
  if (toolKinds.has('image')) toolKinds.add('video');

  const preferred = dominant(memory?.tools?.generators);
  const tools = [...toolKinds].map(kind => ({
    kind,
    options: TOOL_OPTIONS[kind] || [],
    /* Kullanıcı bu türde bir araç kullanıyorsa söylüyoruz.
       "Kullanacağız" değil — "genelde bunu kullanıyorsun". */
    preferred: preferred?.key && (TOOL_OPTIONS[kind] || [])
      .some(o => o.toLowerCase() === preferred.key.toLowerCase())
      ? preferred.key : null
  }));

  /*
    --- Gerekli dosyalar ---

    TÜRE GÖRE gruplanıyor. `characters` ve `images` görevlerinin
    ikisi de referans görsel kabul ediyor; kullanıcıya "image,
    image" göstermek kafa karıştırır. Tek satır: "görsel (isteğe
    bağlı) — Karakterler, Görseller".

    Bir türde zorunlu ve isteğe bağlı görev karışıksa ZORUNLU
    kazanıyor: en katı gereksinim geçerli.
  */
  const byKind = {};
  for (const t of doable) {
    const need = TASK_INPUTS[t.key];
    if (!need) continue;
    const g = byKind[need.kind] || (byKind[need.kind] = {
      kind: need.kind, optional: true, tasks: []
    });
    g.tasks.push({ taskKey: t.key, label: t.label });
    if (!need.optional) g.optional = false;
  }
  const inputs = Object.values(byKind);

  /* --- Süre — yalnızca ölçülmüşse --- */
  const estimate = estimatePlan(workflow, timings);

  return {
    intent: classified?.intent || null,
    intentLabel: classified?.label || null,
    confidence: classified?.confidence ?? null,
    ambiguous: !!classified?.ambiguous,
    modifiers: classified?.modifiers || {},

    steps: doable.length,
    futureSteps: future.length,
    modules: routes,
    tools,
    inputs,
    /* estimate.known false ise arayüz süre GÖSTERMİYOR */
    estimate,

    /* Zorunlu girdi var mı — arayüz baştan uyarabilsin.
       Kullanıcı 12 adımlık plan kurup 3. adımda "video yükle"
       demesindense baştan bilsin. */
    blockingInput: inputs.find(i => !i.optional) || null
  };
}

/*
  ---------- ÖZET SATIRI ----------

  Spec'in karşılama metni için. Yine metin değil, veri:

    { steps, modules, hasEstimate, minutes }

  Arayüz i18n ile cümle kuruyor. Süre yoksa `minutes: null` —
  şablon o kısmı atlıyor.
*/
export function briefSummary(brief) {
  return {
    steps: brief?.steps || 0,
    modules: (brief?.modules || []).length,
    hasEstimate: !!brief?.estimate?.known,
    minutes: brief?.estimate?.known ? brief.estimate.totalMin : null,
    /* Kaç görev ölçülü — arayüz "veri biriktikçe netleşecek"
       diyebilsin */
    measured: brief?.estimate?.measured || 0,
    needsFile: !!brief?.blockingInput
  };
}
