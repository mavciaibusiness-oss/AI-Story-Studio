import { dominant, LEARN } from './memory';
import { TASKS } from './workflow';
import { normalizeStatus } from './state';

/*
  CREATOR OS — Kişiselleştirme.

  Sprint 5 / TASK-03, Adım 4.

  Adım 1-3 hafızayı kurdu, doldurdu ve kalıcı hale getirdi. Ama hafıza
  hâlâ hiçbir şeyi DEĞİŞTİRMİYORDU — sadece biliyordu.

  Bu dosya bilgiyi davranışa çeviriyor: yol haritası kullanıcının
  alışkanlığına göre kuruluyor.

  ---------------------------------------------------------------
  ÜÇ KURAL — hepsi aynı endişeden doğuyor

  Kişiselleştirme sessizce yapılırsa kullanıcı ürünün neden farklı
  davrandığını anlamaz ve kontrolü kaybettiğini hisseder.

  1. ŞEFFAF     Her değişiklik rapor ediliyor: "şunu senin
                alışkanlığına göre ekledim". Sessiz değişiklik yok.

  2. GERİ ALINAB İLİR  Eklenen görev çıkarılabilir, işaretlenen
                geri alınabilir. Hafıza öneriyor, dayatmıyor.

  3. TEMKİNLİ   Yalnızca GÜÇLÜ sinyalde uygulanıyor. Üç kez atladığı
                bir görevi "hep atlıyor" saymak erken.

  ---------------------------------------------------------------
  NE YAPMIYORUZ: GÖREV SİLMEK

  Kullanıcı karakterleri hep atlıyorsa, o görevi yol haritasından
  ÇIKARMAK cazip. Yapmıyoruz.

  Sebebi: bu sefer isteyebilir. Görünmeyen bir şeyi geri getirmek,
  görünen bir şeyi atlamaktan zor. Bunun yerine görev listede
  kalıyor ama "genelde atlıyorsun" notuyla işaretleniyor —
  kullanıcı bir tıkla atlayabiliyor.
  ---------------------------------------------------------------
*/

export const PERSONALIZE_VERSION = 1;

/* Bir alışkanlığı "güçlü" saymak için eşikler.

   ALWAYS_MIN: kaç kez tekrarlanmış olmalı.
   Öğrenme eşiğinden (LEARN.MIN_SAMPLES=3) yüksek tuttum: bir tercihi
   BİLMEK ile ona göre DAVRANMAK farklı şeyler. Davranmak için daha
   çok kanıt gerekir. */
export const HABIT = {
  ALWAYS_MIN: 4,
  /* Oturum sayısına oranla: 5 oturumun 4'ünde atlanmışsa alışkanlık.
     Yalnızca sayıya bakmak yanıltır — çok çalışan kullanıcıda her şey
     yüksek sayıya ulaşır. */
  ALWAYS_RATIO: 0.7
};

/*
  Bir görev "hep atlanıyor" mu?

  Girdi: hafıza + görev anahtarı
  Çıkış: { habit, count, sessions, ratio }
*/
function habitOf(memory, table, key) {
  const counts = memory?.workflow?.[table] || {};
  const count = counts[key] || 0;
  const sessions = memory?.workflow?.samples || 0;

  if (!sessions || count < HABIT.ALWAYS_MIN) {
    return { habit: false, count, sessions, ratio: 0 };
  }
  const ratio = count / sessions;
  return {
    habit: ratio >= HABIT.ALWAYS_RATIO,
    count, sessions,
    ratio: +ratio.toFixed(2)
  };
}

/*
  ---------- YOL HARİTASINI KİŞİSELLEŞTİR ----------

  Girdi: workflow (buildWorkflow çıktısı) + memory
  Çıkış: { workflow, changes[] }

  `changes` arayüzün göstereceği rapor. Boşsa kişiselleştirme
  yapılmamış demektir — hafıza henüz yeterli değil.
*/
export function personalizeWorkflow(workflow, memory) {
  const wf = workflow;
  if (!wf?.tasks?.length || !memory) {
    return { workflow: wf, changes: [] };
  }

  const changes = [];
  let tasks = [...wf.tasks];

  /* --- 1. HEP EKLEDİĞİ GÖREVLER --- */
  for (const [key, count] of Object.entries(memory.workflow?.added || {})) {
    if (tasks.some(t => t.key === key)) continue;   // zaten var
    const def = TASKS[key];
    if (!def) continue;

    const h = habitOf(memory, 'added', key);
    if (!h.habit) continue;

    tasks.push({
      key: def.key, label: def.label, desc: def.desc,
      route: def.route || null, future: !!def.future,
      optional: !!def.optional, status: 'waiting',
      order: tasks.length,
      /* İz: bu görev hafızadan geldi. Arayüz işaretleyecek,
         kullanıcı nereden çıktığını anlasın. */
      fromMemory: true
    });
    changes.push({
      type: 'task-added', taskKey: key, label: def.label,
      evidence: { count: h.count, sessions: h.sessions, ratio: h.ratio }
    });
  }

  /* --- 2. HEP ATLADIĞI GÖREVLER ---
     SİLMİYORUZ. İşaretliyoruz ki kullanıcı tek tıkla atlasın. */
  for (const t of tasks) {
    const h = habitOf(memory, 'skipped', t.key);
    if (!h.habit) continue;
    if (normalizeStatus(t.status) !== 'waiting') continue;

    changes.push({
      type: 'task-usually-skipped', taskKey: t.key, label: t.label,
      evidence: { count: h.count, sessions: h.sessions, ratio: h.ratio }
    });
  }

  /* Sıra numaralarını yenile */
  tasks = tasks.map((t, i) => ({ ...t, order: i }));

  /* Hangi görevlerin "genelde atlanan" olduğunu görevin üstünde
     taşıyoruz — arayüz her seferinde hesaplamasın. */
  const skipHints = new Set(
    changes.filter(c => c.type === 'task-usually-skipped').map(c => c.taskKey));
  tasks = tasks.map(t => skipHints.has(t.key) ? { ...t, usuallySkipped: true } : t);

  return {
    workflow: {
      ...wf,
      tasks,
      stats: { ...wf.stats, total: tasks.length,
        available: tasks.filter(x => !x.future).length,
        future: tasks.filter(x => x.future).length }
    },
    changes
  };
}

/*
  ---------- NİYET İPUÇLARI ----------

  Kullanıcı "video hazırla" gibi belirsiz bir şey yazdıysa, hafıza
  eksiği tamamlayabilir: "genelde YouTube için korku videosu
  yapıyorsun, öyle mi?"

  ÖNEMLİ: niyeti DEĞİŞTİRMİYORUZ, ipucu veriyoruz. Kullanıcı bu sefer
  başka bir şey isteyebilir. Arayüz bunu bir soru olarak sunacak.
*/
export function intentHints(classified, memory) {
  if (!memory || !classified) return [];

  const hints = [];

  /* Yalnızca belirsiz ya da taban niyette ipucu veriyoruz.
     Kullanıcı "korku videosu" dediyse tür ipucu vermek saçma. */
  const vague = !classified.intent ||
    classified.intent === 'video.generic' ||
    classified.ambiguous;
  if (!vague) return [];

  const genre = dominant(memory.content?.genres);
  if (genre?.key && genre.confidence >= 0.6) {
    hints.push({
      kind: 'genre', value: genre.key,
      confidence: genre.confidence,
      evidence: { count: genre.count, total: genre.total }
    });
  }

  const format = dominant(memory.content?.formats);
  if (format?.key && format.confidence >= 0.6) {
    hints.push({
      kind: 'format', value: format.key,
      confidence: format.confidence,
      evidence: { count: format.count, total: format.total }
    });
  }

  return hints;
}

/*
  ---------- ÖNERİ AĞIRLIKLARI ----------

  Kullanıcı yönetmen önerilerinin bir türünü sürekli reddediyorsa
  (örneğin ses önerilerini), o türü öne çıkarmak faydasız.

  DİKKAT: öneriyi GİZLEMİYORUZ. Sıralamada geriye alıyoruz.
  Gizlemek, kullanıcının fikrini değiştirme ihtimalini yok sayardı —
  ve bir gün gerçekten gerekli bir öneriyi kaçırmasına yol açardı.

  Çıkış: { [kind]: weight } — 1.0 nötr, düşük = geri plan
*/
export function feedbackWeights(memory) {
  const acc = memory?.feedback?.accepted || {};
  const rej = memory?.feedback?.rejected || {};
  const kinds = new Set([...Object.keys(acc), ...Object.keys(rej)]);

  const out = {};
  for (const k of kinds) {
    const a = acc[k] || 0;
    const r = rej[k] || 0;
    const total = a + r;
    /* Az veriyle ağırlık değiştirmiyoruz */
    if (total < HABIT.ALWAYS_MIN) continue;

    const acceptRate = a / total;
    /* 0.5 kabul oranı nötr (1.0). Tamamen reddedilen 0.6'ya iniyor —
       sıfıra indirmek gizlemek olurdu. */
    out[k] = +(0.6 + acceptRate * 0.8).toFixed(2);
  }
  return out;
}

/*
  ---------- KİŞİSELLEŞTİRME ÖZETİ ----------

  Arayüz için: hafıza şu an neyi etkiliyor?
  Boşsa "henüz öğreniyorum" denecek.
*/
export function personalizationSummary(memory) {
  if (!memory) return { active: false, reasons: [] };

  const reasons = [];

  const alwaysAdded = Object.keys(memory.workflow?.added || {})
    .filter(k => habitOf(memory, 'added', k).habit);
  const alwaysSkipped = Object.keys(memory.workflow?.skipped || {})
    .filter(k => habitOf(memory, 'skipped', k).habit);
  const weights = feedbackWeights(memory);

  /*
    NİYET ALIŞKANLIĞI — Sprint-6 TASK-02, Adım 5.

    Kullanıcı hep aynı şeyi istiyorsa söylüyoruz: "genellikle korku
    videosu üretiyorsun". Bu, hafızanın kullanıcıya kendini
    gösterdiği yerlerden biri.

    `dominant` eşiği (3 örnek, %40 baskınlık, tavan %90) burada da
    geçerli — az veriyle "sen hep şunu yaparsın" demek yanlış olur.
  */
  const topIntent = dominant(memory.intents?.keys);
  if (topIntent?.key && topIntent.confidence >= 0.6) {
    reasons.push({
      kind: 'usual-intent', key: topIntent.key,
      count: topIntent.count, total: topIntent.total
    });
  }

  if (alwaysAdded.length) {
    reasons.push({ kind: 'always-added', keys: alwaysAdded });
  }
  if (alwaysSkipped.length) {
    reasons.push({ kind: 'always-skipped', keys: alwaysSkipped });
  }
  const downweighted = Object.entries(weights)
    .filter(([, w]) => w < 0.9).map(([k]) => k);
  if (downweighted.length) {
    reasons.push({ kind: 'down-weighted', keys: downweighted });
  }

  const genre = dominant(memory.content?.genres);
  if (genre?.key && genre.confidence >= 0.6) {
    reasons.push({ kind: 'known-genre', keys: [genre.key] });
  }

  return {
    active: reasons.length > 0,
    reasons,
    /* Hafıza yeterli mi — arayüz "N video daha sonra" diyebilsin */
    sessionsNeeded: Math.max(0, HABIT.ALWAYS_MIN - (memory.workflow?.samples || 0)),
    episodesNeeded: Math.max(0, LEARN.MIN_SAMPLES - (memory.content?.samples || 0))
  };
}
