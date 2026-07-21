'use client';
import { useEffect, useState } from 'react';
import WizardFooter from '@/lib/WizardFooter';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useStudio, callAI, parseJSONLoose } from '@/lib/store';
import EpisodeBar from '@/lib/EpisodeBar';
import { STYLES, flattenPrompt } from '@/lib/storyboard';
import { useT } from '@/lib/i18n';
import { triggerDownload } from '@/lib/engine';

export const dynamic = 'force-dynamic';

const TARGETS = ['Google Flow', 'Midjourney', 'Flux', 'SeaArt', 'Leonardo', 'Stable Diffusion', 'OpenAI Images', 'Runway', 'Kling', 'Veo'];
const QUALITY = ['Normal', 'Yüksek', 'Ultra'];
const NEG_DEFAULT = 'text, watermark, logo, extra limbs, deformed hands, blurry, low quality, jpeg artifacts';

export default function Promptlar() {
  const { storyboard, setStoryboard, patchScene, episodeId, spendCredits } = useStudio();
  const t = useT();
  const [chars, setChars] = useState([]);
  const [picked, setPicked] = useState([]);
  const [target, setTarget] = useState('Google Flow');
  const [quality, setQuality] = useState('Yüksek');
  const [neg, setNeg] = useState(NEG_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(null);
  const [failedIdx, setFailedIdx] = useState([]);
  const [view, setView] = useState('image');

  const sb = storyboard;

  useEffect(() => { (async () => {
    const supabase = getSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('characters').select('*').eq('user_id', user.id);
    setChars(data || []);
    setPicked((data || []).filter(c => c.locked).map(c => c.id));
  })(); }, []);

  /* Bölüm değişince önceki denemenin artıklarını temizle */
  useEffect(() => { setFailedIdx([]); setErr(null); setOk(null); }, [episodeId]);

  function charBlock() {
    const sel = chars.filter(c => picked.includes(c.id));
    if (!sel.length) return '';
    return '\n\nKARAKTER KİLİDİ — bu tanımlar her promptta birebir korunmalı, hiçbir sahnede değişmemeli:\n' +
      sel.map(c => {
        const f = c.fields || {};
        const parts = Object.entries(f).filter(([, v]) => v && String(v).trim()).map(([k, v]) => k + ': ' + v);
        return '- ' + c.name + ' (' + parts.join('; ') + ')';
      }).join('\n');
  }

  /*
    Yedi prompt katmanını sahne sahne üretir. `indices` verilirse yalnızca o
    sahneler işlenir (başarısız sahneleri yeniden denemek için) — verilmezse
    bütün sahneler baştan üretilir. Bir grup (4 sahne) başarısız olsa bile
    diğer gruplar durmadan devam eder; en sonda hangi sahnelerin başarısız
    kaldığı ayrı ayrı raporlanır ve yalnızca onlar tekrar denenebilir.
  */
  async function generate(indices) {
    setErr(null); setOk(null);
    if (!episodeId) return setErr(t('pr.errNoProject'));
    if (!sb.scenes.length) return setErr(t('pr.errNoScenes'));

    const targets = (indices && indices.length) ? indices : sb.scenes.map((_, i) => i);
    setBusy(true); setProg(0);

    const PER = 4;
    let done = 0;
    let lastErrorMsg = '';
    const stillFailed = new Set();

    for (let i = 0; i < targets.length; i += PER) {
      const idxSlice = targets.slice(i, i + PER);
      const slice = idxSlice.map(idx => sb.scenes[idx]);
      setProg(Math.round((i / targets.length) * 100));

      try {
        const { text, creditsLeft } = await callAI('prompts',
          `${target} için görsel/video promptları yazıyorsun. Video türü: ${sb.genre}. ` +
          `Görsel stil: ${sb.style}. En boy: ${sb.aspect}. Kalite: ${quality}.\n` +
          `Her sahne için yedi ayrı katman üret. Hepsi İngilizce olacak:\n` +
          `- imagePrompt: sahnenin ne gösterdiği (özne, mekân, aksiyon, detay)\n` +
          `- videoPrompt: aynı sahnenin video olarak nasıl akacağı\n` +
          `- negativePrompt: istenmeyenler\n` +
          `- stylePrompt: sanat yönü ve doku\n` +
          `- cameraPrompt: kadraj, lens, açı\n` +
          `- motionPrompt: kamera ve nesne hareketi\n` +
          `- lightingPrompt: ışık, saat, atmosfer\n` +
          charBlock() +
          `\n\nSAHNELER:\n` + slice.map((s, k) => (idxSlice[k] + 1) + '. ' + s.paragraph).join('\n\n') +
          `\n\nSADECE ${slice.length} elemanlı şu JSON dizisini döndür:\n` +
          `[{"imagePrompt":"","videoPrompt":"","negativePrompt":"","stylePrompt":"","cameraPrompt":"","motionPrompt":"","lightingPrompt":""}]`,
          { maxTokens: 3000 });

        /* Kredi sunucuda çağrı başarılı olduğu anda düşer — JSON ayrıştırma
           sonradan patlasa bile gösterilen kredi bakiyesi gerçek durumla
           senkron kalsın diye burada hemen güncelliyoruz. */
        spendCredits(creditsLeft);

        const arr = parseJSONLoose(text);
        arr.slice(0, idxSlice.length).forEach((p, k) => {
          patchScene(idxSlice[k], {
            imagePrompt: p.imagePrompt || '',
            videoPrompt: p.videoPrompt || '',
            negativePrompt: p.negativePrompt || neg,
            stylePrompt: p.stylePrompt || '',
            cameraPrompt: p.cameraPrompt || '',
            motionPrompt: p.motionPrompt || '',
            lightingPrompt: p.lightingPrompt || ''
          });
          done++;
        });
        if (arr.length < idxSlice.length) {
          idxSlice.slice(arr.length).forEach(idx => stillFailed.add(idx));
        }
      } catch (e) {
        idxSlice.forEach(idx => stillFailed.add(idx));
        lastErrorMsg = e.message;
      }
    }

    setProg(100);
    setBusy(false);
    const failedList = [...stillFailed].sort((a, b) => a - b);
    setFailedIdx(failedList);

    if (failedList.length === 0) {
      setOk(t('pr.success'));
    } else if (done > 0) {
      setErr(t('pr.successPartial', { done, total: targets.length, fail: failedList.length }));
    } else {
      setErr(t('pr.errAllFailed', { detail: lastErrorMsg || '—' }));
    }
  }

  function allText() {
    return sb.scenes.map(s =>
      String(s.scene).padStart(3, '0') + '\n' + flattenPrompt(s, view) + '\n'
    ).join('\n');
  }

  const ready = sb.scenes.filter(s => s.imagePrompt).length;

  return (
    <>
      <h1 className="page-title">{t('pr.title')}</h1>
      <p className="page-sub">{t('pr.sub')}</p>
      <EpisodeBar />

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <div className="field"><label>{t('pr.target')}</label>
            <select className="select" value={target} onChange={e => setTarget(e.target.value)}>
              {TARGETS.map(x => <option key={x}>{x}</option>)}</select></div>
          <div className="field"><label>{t('pr.quality')}</label>
            <select className="select" value={quality} onChange={e => setQuality(e.target.value)}>
              {QUALITY.map(x => <option key={x}>{x}</option>)}</select></div>
          <div className="field"><label>{t('script.style')}</label>
            <select className="select" value={sb.style} onChange={e => setStoryboard(s => ({ ...s, style: e.target.value }))}>
              {STYLES.map(x => <option key={x}>{x}</option>)}</select></div>
        </div>

        {chars.length > 0 && (
          <div className="field">
            <label>{t('pr.charLock')}</label>
            <div className="chips">
              {chars.map(c => (
                <label key={c.id} className={'chip' + (picked.includes(c.id) ? ' on' : '')}>
                  <input type="checkbox" checked={picked.includes(c.id)}
                    onChange={e => setPicked(e.target.checked ? [...picked, c.id] : picked.filter(x => x !== c.id))} />
                  {c.name}
                </label>
              ))}
            </div>
            <p className="hint">{t('pr.charLockHint')}</p>
          </div>
        )}

        <div className="field">
          <label>{t('pr.negDefault')}</label>
          <input className="input mono" style={{ fontSize: 13 }} value={neg} onChange={e => setNeg(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={() => generate(failedIdx)} disabled={busy || !sb.scenes.length}>
            {busy ? t('pr.generating')
              : failedIdx.length > 0 ? t('pr.retryFailed', { n: failedIdx.length })
              : t('pr.generate', { n: sb.scenes.length })}
          </button>
          {!busy && ready > 0 && failedIdx.length > 0 && (
            <button className="btn btn-mini" onClick={() => generate()}>{t('common.regenerate')}</button>
          )}
        </div>

        {busy && <div className="progress"><span>{t('pr.working')}</span><div className="track"><i className="fill" style={{ width: prog + '%' }} /></div><span className="count">%{prog}</span></div>}
        {!busy && err && <span className="err">{err}</span>}
        {!busy && ok && <span className="okmsg">{ok}</span>}
      </div>

      {ready > 0 && (
        <>
          <h2 className="section-title">{t('pr.ready', { a: ready, b: sb.scenes.length })}</h2>
          <div className="chips" style={{ marginBottom: 12 }}>
            <button className={'chip' + (view === 'image' ? ' on' : '')} onClick={() => setView('image')}>{t('pr.viewImage')}</button>
            <button className={'chip' + (view === 'video' ? ' on' : '')} onClick={() => setView('video')}>{t('pr.viewVideo')}</button>
            <button className="btn btn-mini" onClick={() => navigator.clipboard.writeText(allText())}>{t('common.copyAll')}</button>
            <button className="btn btn-mini" onClick={() => triggerDownload(
              new Blob([allText()], { type: 'text/plain;charset=utf-8' }), 'prompts-' + view + '.txt')}>TXT {t('common.download')}</button>
          </div>

          {sb.scenes.map((s, i) => (
            <div className="card" key={i} style={{
              marginBottom: 8, padding: 14,
              borderColor: failedIdx.includes(i) ? 'var(--lamp)' : undefined
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                <span style={{ color: 'var(--lamp)', fontFamily: 'monospace', fontSize: 13 }}>
                  {String(s.scene).padStart(3, '0')}
                  {failedIdx.includes(i) && <span style={{ marginLeft: 8 }}>⚠</span>}
                </span>
                <button className="btn btn-mini" onClick={() => navigator.clipboard.writeText(flattenPrompt(s, view))}>
                  {t('common.copy')}
                </button>
              </div>
              <p className="mono" style={{ fontSize: 12, color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>
                {flattenPrompt(s, view) || <i>{t('pr.notYet')}</i>}
              </p>
            </div>
          ))}
        </>
      )}
          <WizardFooter stepKey="prompt" />
    </>
  );
}
