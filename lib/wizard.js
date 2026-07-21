import { sceneHasMedia } from '@/lib/storyboard';

/*
  12 adımlık üretim akışı. Sıra, ilk kez kullanan birinin hiç eğitim almadan
  baştan sona ilerleyebileceği doğal üretim sırasıdır. Sol menü ve üstteki yol
  haritası bu tek kaynaktan beslenir.

  İki tür adım var:
  - VERİ ADIMI: tamamlanma storyboard verisinden çıkarılır (senaryo, prompt,
    görsel, ses, kurgu). Kullanıcı işi yaptıkça kendiliğinden yeşile döner.
  - İŞARET ADIMI: veriden anlaşılamayan isteğe bağlı/çıktı adımları (karakter,
    altyazı, thumbnail, shorts, yayın). "Sonraki Adım"a basınca işaretlenir.
*/
export const WIZARD_STEPS = [
  { key: 'proje',      href: '/studio/projeler',    n: 1 },
  { key: 'senaryo',    href: '/studio/senaryo',     n: 2 },
  { key: 'storyboard', href: '/studio/storyboard',  n: 3 },
  { key: 'karakter',   href: '/studio/karakterler', n: 4, optional: true },
  { key: 'prompt',     href: '/studio/promptlar',   n: 5 },
  { key: 'gorsel',     href: '/studio/gorseller',   n: 6 },
  { key: 'ses',        href: '/studio/seslendirme', n: 7 },
  { key: 'kurgu',      href: '/studio/atolye',      n: 8 },
  { key: 'altyazi',    href: '/studio/altyazi',     n: 9,  optional: true },
  { key: 'thumbnail',  href: '/studio/thumbnail',   n: 10, optional: true },
  { key: 'shorts',     href: '/studio/shorts',      n: 11, optional: true },
  { key: 'yayin',      href: '/studio/youtube',     n: 12 },
];

/* Adımın verisi tamamlanmış mı? (işaret adımları için işaret bayrağına bakar) */
export function stepDataDone(key, sb, ctx) {
  const scenes = (sb && sb.scenes) || [];
  const n = scenes.length;
  const flag = !!(sb && sb.wizard && sb.wizard[key]);
  const c = ctx || {};
  switch (key) {
    case 'proje':      return !!c.episodeId;
    case 'senaryo':    return n > 0;
    case 'storyboard': return n > 0;
    case 'prompt':     return n > 0 && scenes.every(s => s.imagePrompt);
    case 'gorsel':     return n > 0 && scenes.every(sceneHasMedia);
    case 'ses':        return n > 0 && scenes.every(s => s.voice);
    case 'kurgu':      return !!c.finalVideo || flag;
    default:           return flag;   // karakter, altyazi, thumbnail, shorts, yayin
  }
}

/* Bir veri adımı mı yoksa işaret adımı mı? İşaret adımları "Sonraki Adım"a
   basınca tamamlanır; veri adımları yalnızca gerçek veri oluşunca. */
export function isFlagStep(key) {
  const st = WIZARD_STEPS.find(s => s.key === key);
  return !!(st && st.optional) || key === 'yayin' || key === 'kurgu';
}

/* Tüm adımların durumunu + yüzdeyi hesaplar. */
export function computeWizard(sb, ctx) {
  const done = WIZARD_STEPS.map(st => stepDataDone(st.key, sb, ctx));
  const activeIndex = done.findIndex(d => !d);
  const active = activeIndex === -1 ? WIZARD_STEPS.length - 1 : activeIndex;
  const doneCount = done.filter(Boolean).length;
  const steps = WIZARD_STEPS.map((st, i) => ({
    ...st,
    done: done[i],
    status: done[i] ? 'done' : (i === active ? 'active' : 'todo')
  }));
  return {
    steps,
    pct: Math.round((doneCount / WIZARD_STEPS.length) * 100),
    doneCount,
    total: WIZARD_STEPS.length,
    activeKey: WIZARD_STEPS[active].key
  };
}

export function nextStepAfter(key) {
  const i = WIZARD_STEPS.findIndex(s => s.key === key);
  return (i >= 0 && i < WIZARD_STEPS.length - 1) ? WIZARD_STEPS[i + 1] : null;
}

export function stepByHref(href) {
  return WIZARD_STEPS.find(s => s.href === href) || null;
}
