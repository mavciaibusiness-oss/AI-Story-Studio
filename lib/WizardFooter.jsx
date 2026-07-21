'use client';
import { useRouter } from 'next/navigation';
import { useStudio } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { stepDataDone, isFlagStep, nextStepAfter, WIZARD_STEPS } from '@/lib/wizard';

/*
  Her üretim modülünün altına konur. Adım tamamlandığında belirgin
  "Sonraki Adım → ..." butonu gösterir ve kullanıcıyı bir sonraki modüle
  götürür. Tamamlanmamış veri adımlarında ise kullanıcıyı kilitlemeden
  soluk bir "Şimdilik atla" bağlantısı sunar (sol menü de her zaman serbest).
*/
export default function WizardFooter({ stepKey }) {
  const { storyboard, episodeId, finalVideo, markWizardStep } = useStudio();
  const t = useT();
  const router = useRouter();

  if (!episodeId) return null;

  const ctx = { episodeId, finalVideo };
  const complete = stepDataDone(stepKey, storyboard, ctx);
  const next = nextStepAfter(stepKey);
  const flagStep = isFlagStep(stepKey);
  const nextLabel = next ? t('wiz.step.' + next.key) : null;

  function advance(markDone) {
    // İşaret adımlarında (veya tamamlanmış adımda) ilerlerken adımı tamamlandı say.
    if (markDone) markWizardStep(stepKey);
    if (next) router.push(next.href);
  }

  // Son adım (yayın): sonraki yok → tamamlandı kutlaması
  if (!next) {
    return (
      <div className="wiz-foot wiz-foot-done">
        <button className="btn btn-primary" onClick={() => markWizardStep(stepKey)}>
          {t('wiz.finishAll')}
        </button>
      </div>
    );
  }

  // İşaret adımı ya da tamamlanmış veri adımı → belirgin "Sonraki Adım"
  if (flagStep || complete) {
    return (
      <div className="wiz-foot">
        <button className="btn btn-primary wiz-next" onClick={() => advance(true)}>
          {t('wiz.next')} → {nextLabel}
        </button>
      </div>
    );
  }

  // Tamamlanmamış veri adımı → kilitleme, soluk atlama sun
  return (
    <div className="wiz-foot wiz-foot-todo">
      <p className="hint">{t('wiz.completeToUnlock')}</p>
      <button className="btn btn-mini wiz-skip" onClick={() => advance(false)}>
        {t('wiz.skip')} → {nextLabel}
      </button>
    </div>
  );
}
