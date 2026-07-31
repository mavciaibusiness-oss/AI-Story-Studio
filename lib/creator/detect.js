import { normalizeStatus } from './state';

/*
  CREATOR OS — otomatik ilerleme tespiti.

  Sprint 5 / TASK-02, Adım 6.

  Şimdiye kadar kullanıcı her adımı ELLE "bitti" işaretliyordu.
  Ama uygulama zaten biliyor: storyboard'da 12 sahne varsa storyboard
  adımı bitmiş demektir. Kullanıcıdan bunu ayrıca söylemesini istemek
  gereksiz sürtünme.

  ---------------------------------------------------------------
  TASARIM KARARI: TAHMİN ETME, KANIT ARA

  Yanlış işaretleme, hiç işaretlememekten kötüdür. Kullanıcı bir adımı
  "bitti" görüp geçerse ve aslında bitmemişse, eksik işle ilerler.

  Bu yüzden iki seviye var:

    KESİN (complete)  — TÜM sahnelerde kanıt var. Otomatik işaretlenir.
                        12 sahnenin 12'sinde görsel varsa görseller
                        adımı bitmiştir; tartışmaya yer yok.

    KISMİ (partial)   — bazı sahnelerde var. İşaretlenmez, yalnızca
                        ilerleme gösterilir: "12 sahneden 7'sinde
                        görsel var."

  Kısmi durumu otomatik tamamlamak, kullanıcının yarım işini bitmiş
  saymak olur.
  ---------------------------------------------------------------

  NEYİ TESPİT EDEMİYORUZ:
    edit (kurgu)   — render çıktısı storyboard'da tutulmuyor
    health/director— rapor storyboard'da değil, veritabanında
    publish        — YouTube metinleri storyboard'da değil
    thumbnail      — kapak görseli storyboard'da değil

  Bunlar elle işaretlenmeye devam ediyor. Tespit edemediğimizi
  uydurmuyoruz — `detectable: false` ile bildiriyoruz.
*/

export const DETECT_VERSION = 1;

/* Sahne düzeyinde kanıt arayan görevler.
   test(scene) → bu sahnede kanıt var mı? */
const SCENE_EVIDENCE = {
  script:     { test: s => !!String(s.paragraph || s.voiceText || '').trim() },
  storyboard: { test: s => !!String(s.paragraph || s.voiceText || '').trim() },
  prompts:    { test: s => !!String(s.imagePrompt || s.videoPrompt || '').trim() },
  images:     { test: s => !!(s.image || s.video) },
  voice:      { test: s => !!s.voice },
  subtitles:  { test: s => !!String(s.subtitle || '').trim() }
};

/* Storyboard düzeyinde kanıt arayan görevler. */
const BOARD_EVIDENCE = {
  characters: {
    test: sb => Array.isArray(sb?.characters) && sb.characters.length > 0
  }
};

/* Tespit edilemeyen görevler — elle işaretlenir. */
export const UNDETECTABLE = ['edit', 'thumbnail', 'shorts', 'publish',
                             'health', 'director', 'rebuild'];

/*
  Bir görevin durumunu storyboard'dan çıkar.

  Dönüş:
    { detectable, complete, partial, have, total, ratio }
*/
export function detectTask(taskKey, storyboard) {
  const scenes = Array.isArray(storyboard?.scenes) ? storyboard.scenes : [];

  if (UNDETECTABLE.includes(taskKey)) {
    return { detectable: false, complete: false, partial: false,
             have: 0, total: 0, ratio: 0 };
  }

  const board = BOARD_EVIDENCE[taskKey];
  if (board) {
    const ok = board.test(storyboard);
    return { detectable: true, complete: ok, partial: false,
             have: ok ? 1 : 0, total: 1, ratio: ok ? 1 : 0 };
  }

  const ev = SCENE_EVIDENCE[taskKey];
  if (!ev) {
    return { detectable: false, complete: false, partial: false,
             have: 0, total: 0, ratio: 0 };
  }

  /* Sahne yoksa hiçbir sahne görevi tamamlanmış sayılamaz.
     0/0 = %100 gibi görünür ama aslında hiç iş yapılmamıştır. */
  if (!scenes.length) {
    return { detectable: true, complete: false, partial: false,
             have: 0, total: 0, ratio: 0 };
  }

  const have = scenes.filter(s => {
    try { return !!ev.test(s); } catch { return false; }
  }).length;

  const ratio = have / scenes.length;
  return {
    detectable: true,
    complete: have === scenes.length,
    partial: have > 0 && have < scenes.length,
    have,
    total: scenes.length,
    ratio: +ratio.toFixed(2)
  };
}

/*
  Tüm görevleri tara.

  Dönüş: { [taskKey]: detection }
*/
export function detectAll(tasks, storyboard) {
  const out = {};
  for (const t of (tasks || [])) {
    out[t.key] = detectTask(t.key, storyboard);
  }
  return out;
}

/*
  ---------- OTOMATİK İŞARETLEME ----------

  Hangi görevler otomatik "bitti" işaretlenmeli?

  KOŞULLAR (hepsi birden):
    • kanıt KESİN (tüm sahnelerde var)
    • görev şu an bitmiş/atlanmış DEĞİL
    • görev Sprint-6 görevi değil

  Kullanıcı bir görevi ATLADIYSA dokunmuyoruz — bilinçli kararı.
  Zaten bitmişse tekrar işaretlemenin anlamı yok.

  Dönüş: işaretlenecek görev anahtarları
*/
export function autoCompletable(tasks, storyboard) {
  const detections = detectAll(tasks, storyboard);
  const out = [];

  for (const t of (tasks || [])) {
    if (t.future) continue;
    const st = normalizeStatus(t.status);
    if (st === 'done' || st === 'skipped') continue;

    const d = detections[t.key];
    if (d?.detectable && d.complete) out.push(t.key);
  }
  return out;
}

/*
  ---------- İLERLEME KANITI ----------

  Kısmi ilerleme arayüzde gösterilecek: "12 sahneden 7'sinde görsel var."
  İşaretleme yok, yalnızca bilgi.

  Tamamlanmış ve atlanmış görevler için kanıt göstermiyoruz — zaten
  karar verilmiş, sayı göstermek gürültü.
*/
export function progressEvidence(tasks, storyboard) {
  const detections = detectAll(tasks, storyboard);
  const out = {};

  for (const t of (tasks || [])) {
    const st = normalizeStatus(t.status);
    if (st === 'done' || st === 'skipped' || t.future) continue;

    const d = detections[t.key];
    if (d?.detectable && d.partial) {
      out[t.key] = { have: d.have, total: d.total, ratio: d.ratio };
    }
  }
  return out;
}

/* Bir görev için tespit yapılabilir mi — arayüz "elle işaretle"
   demesi gerektiğini bilsin. */
export function isDetectable(taskKey) {
  return !UNDETECTABLE.includes(taskKey) &&
         (!!SCENE_EVIDENCE[taskKey] || !!BOARD_EVIDENCE[taskKey]);
}
