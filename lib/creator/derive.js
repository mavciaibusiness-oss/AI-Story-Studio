import { bump, cleanKey } from './memory';
import { normalizeStatus } from './state';

/*
  CREATOR OS — Creator Memory: türetme motoru.

  Sprint 5 / TASK-03, Adım 1 (ikinci parça).

  Bu dosya, uygulamanın ZATEN ÜRETTİĞİ verilerden gözlem çıkarıyor.
  Kullanıcıya hiçbir şey sormuyor.

  ---------------------------------------------------------------
  KAYNAKLAR — hepsi mevcut, yenisi yok

    storyboard.format / genre / style   → içerik ve stil profili
    prompt_reports.generator (v6)       → AI aracı tercihi
    oturum olay günlüğü (live.js)       → çalışma sırası, atlananlar
    director_actions (v9)               → kabul/red geri bildirimi

  ---------------------------------------------------------------
  NE ÇIKARMIYORUZ

    prompt metni, senaryo, sahne metni, kullanıcı cümlesi —
    hiçbiri gözleme girmiyor. Spec'in yasağı. Yapısal koruma:
    `bump()` yalnızca kısa anahtar kabul ediyor (memory.js
    cleanKey), uzun metin sessizce düşüyor.
  ---------------------------------------------------------------

  TEK BÖLÜM = TEK GÖZLEM

  Bir kullanıcı aynı videoyu on kez kaydederse "on korku videosu
  yaptı" saymamalıyız. Gözlemler BÖLÜM BAŞINA bir kez üretiliyor;
  çağıran taraf hangi bölümleri işlediğini takip ediyor
  (`observedEpisodes` listesi, Adım 2'de Memory Manager'da).
*/

export const DERIVE_VERSION = 1;

/* Boş gözlem paketi */
export function emptyObservation() {
  return {
    content: { formats: {}, genres: {}, samples: 0 },
    /* Sprint-6 TASK-02: kullanıcının ne istediği (niyet anahtarı) */
    intents: { keys: {}, samples: 0 },
    style: { styles: {}, samples: 0 },
    tools: { generators: {}, samples: 0 },
    workflow: { transitions: {}, skipped: {}, added: {}, samples: 0 },
    feedback: { accepted: {}, rejected: {}, samples: 0 }
  };
}

/*
  ---------- STORYBOARD'DAN ----------

  Bir bölümden içerik ve stil gözlemi.

  BOŞ BÖLÜM SAYILMAZ: kullanıcı yeni bölüm açıp bırakmış olabilir.
  Sahne yoksa ya da hiç metin yoksa bu bir "üretim" değil; saymak
  istatistiği bozar.
*/
export function observeStoryboard(sb) {
  const obs = emptyObservation();
  if (!sb) return obs;

  const scenes = Array.isArray(sb.scenes) ? sb.scenes : [];
  const hasWork = scenes.some(s =>
    String(s?.paragraph || s?.voiceText || '').trim().length > 0);

  /* Üretime başlanmamış bölüm gözlem üretmez */
  if (!scenes.length || !hasWork) return obs;

  if (sb.format) {
    obs.content.formats = bump(obs.content.formats, sb.format);
  }
  if (sb.genre) {
    obs.content.genres = bump(obs.content.genres, sb.genre);
  }
  obs.content.samples = 1;

  /* Stil: storyboard'un kendi alanı. Serbest metin olabilir ama
     cleanKey uzun olanı eliyor — "sinematik, karanlık, 4k" gibi
     kısa etiketler geçer, paragraf geçmez. */
  if (sb.style) {
    const k = cleanKey(sb.style);
    if (k) {
      obs.style.styles = bump(obs.style.styles, k);
      obs.style.samples = 1;
    }
  }

  return obs;
}

/*
  ---------- PROMPT RAPORLARINDAN ----------

  migration v6'daki `prompt_reports.generator` kolonu, kullanıcının
  ölçüm anında hangi AI aracını hedeflediğini kaydediyor. Bu doğrudan
  AI tercih sinyali — sormaya gerek yok.

  Girdi: [{ generator }] satırları
*/
export function observeGenerators(rows) {
  const obs = emptyObservation();
  const list = Array.isArray(rows) ? rows : [];

  for (const r of list) {
    const g = cleanKey(r?.generator);
    if (!g) continue;
    obs.tools.generators = bump(obs.tools.generators, g);
    obs.tools.samples++;
  }
  return obs;
}

/*
  ---------- OTURUM GÜNLÜĞÜNDEN ----------

  Çalışma alışkanlığı: hangi sırayla çalışıyor, neyi hep atlıyor,
  neyi hep ekliyor.

  GEÇİŞLER: 'script>storyboard' gibi. Kullanıcının GERÇEK sırası —
  planın önerdiği değil, yaptığı.

  Yalnızca TAMAMLANMA olayları sayılıyor. Modül açmak sıra bilgisi
  vermiyor; kullanıcı bakıp çıkmış olabilir.
*/
export function observeSession(session) {
  const obs = emptyObservation();

  /*
    NİYET — Sprint-6 TASK-02, Adım 5.

    Şimdiye kadar oturumdan yalnızca görev akışı öğreniliyordu;
    kullanıcının NE İSTEDİĞİ hiç sayılmıyordu. Kullanıcı 20 kez
    korku videosu istese hafıza bunu bilmiyordu.

    Yalnızca niyet ANAHTARI sayılıyor (video.horror) — kullanıcının
    yazdığı cümle DEĞİL. TASK-03'ün gizlilik kuralı.

    Günlük boş olsa da niyet sayılıyor: plan kurulmuş ama henüz iş
    yapılmamış olabilir, o da geçerli bir sinyal.
  */
  if (session?.intent) {
    const k = cleanKey(session.intent);
    if (k) {
      obs.intents.keys = bump(obs.intents.keys, k);
      obs.intents.samples = 1;
    }
  }

  const log = Array.isArray(session?.log) ? session.log : [];
  if (!log.length) return obs;

  /* Günlük en yeni başta; sırayı okumak için ters çeviriyoruz */
  const chronological = [...log].reverse();

  let prevDone = null;
  let counted = false;

  for (const e of chronological) {
    if (e.type === 'task.done' && e.taskKey) {
      if (prevDone) {
        const k = cleanKey(prevDone + '>' + e.taskKey);
        if (k) obs.workflow.transitions = bump(obs.workflow.transitions, k);
      }
      prevDone = e.taskKey;
      counted = true;
    } else if (e.type === 'task.skipped' && e.taskKey) {
      obs.workflow.skipped = bump(obs.workflow.skipped, e.taskKey);
      counted = true;
    } else if (e.type === 'task.added' && e.taskKey) {
      obs.workflow.added = bump(obs.workflow.added, e.taskKey);
      counted = true;
    }
  }

  if (counted) obs.workflow.samples = 1;
  return obs;
}

/*
  ---------- DIRECTOR KARARLARINDAN ----------

  migration v9'daki `director_actions` tablosu her öneriye ne
  yapıldığını tutuyor: uygulandı mı, yoksayıldı mı.

  Bu doğrudan geri bildirim hafızası — spec'in "Feedback Memory"si.

  ÖNEMLİ: öneri METNİNİ değil, TÜRÜNÜ sayıyoruz. `rec_id` sahneye
  özgü olabilir ("camera-3-closeup"); tür kısmını çıkarıyoruz
  ("camera-closeup"). Böylece "bu kullanıcı yakın plan önerilerini
  kabul etmiyor" diyebiliriz, tek tek sahneleri değil.

  Girdi: [{ rec_id, kind, action }] satırları
*/
export function observeDirectorActions(rows) {
  const obs = emptyObservation();
  const list = Array.isArray(rows) ? rows : [];

  for (const r of list) {
    const kind = cleanKey(r?.kind);
    if (!kind) continue;

    if (r.action === 'applied') {
      obs.feedback.accepted = bump(obs.feedback.accepted, kind);
      obs.feedback.samples++;
    } else if (r.action === 'ignored') {
      obs.feedback.rejected = bump(obs.feedback.rejected, kind);
      obs.feedback.samples++;
    }
  }
  return obs;
}

/*
  ---------- BİRLEŞTİR ----------

  Birden çok gözlemi tek pakete topla. Memory Manager (Adım 2) bunu
  hafızaya katacak.
*/
export function combine(observations) {
  const out = emptyObservation();
  for (const o of (observations || [])) {
    if (!o) continue;
    addInto(out.content.formats, o.content?.formats);
    addInto(out.content.genres, o.content?.genres);
    out.content.samples += o.content?.samples || 0;

    addInto(out.style.styles, o.style?.styles);
    out.style.samples += o.style?.samples || 0;

    addInto(out.tools.generators, o.tools?.generators);
    out.tools.samples += o.tools?.samples || 0;

    addInto(out.workflow.transitions, o.workflow?.transitions);
    addInto(out.workflow.skipped, o.workflow?.skipped);
    addInto(out.workflow.added, o.workflow?.added);
    out.workflow.samples += o.workflow?.samples || 0;

    addInto(out.feedback.accepted, o.feedback?.accepted);
    addInto(out.feedback.rejected, o.feedback?.rejected);
    out.feedback.samples += o.feedback?.samples || 0;
  }
  return out;
}

function addInto(target, src) {
  for (const [k, v] of Object.entries(src || {})) {
    target[k] = (target[k] || 0) + (Number(v) || 0);
  }
}

/*
  ---------- GÖZLEM ÖZETİ ----------

  Bu gözlem paketinde ne var — arayüz "şunu öğrendim" diyebilsin.
  Boş paketi ayırt etmek için.
*/
export function observationSummary(obs) {
  const o = obs || emptyObservation();
  return {
    empty: !(o.content.samples || o.style.samples || o.tools.samples ||
             o.workflow.samples || o.feedback.samples),
    content: o.content.samples,
    style: o.style.samples,
    tools: o.tools.samples,
    workflow: o.workflow.samples,
    feedback: o.feedback.samples
  };
}
