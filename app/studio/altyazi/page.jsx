'use client';
import { useState } from 'react';
import WizardFooter from '@/lib/WizardFooter';
import JSZip from 'jszip';
import Link from 'next/link';
import { callAI, parseJSONLoose, useStudio } from '@/lib/store';
import EpisodeBar from '@/lib/EpisodeBar';
import { cuesFromScenes, srtFromCues, vttFromCues, triggerDownload, formatDur, ENGINE } from '@/lib/engine';
import { LANGUAGES } from '@/lib/storyboard';
import { useT } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const FORMATS = ['SRT', 'VTT', 'TXT'];

export default function Altyazi() {
  const { storyboard, patchScene, episodeId, spendCredits } = useStudio();
  const t = useT();
  const [langs, setLangs] = useState(['İngilizce']);
  const [formats, setFormats] = useState(['SRT']);
  const [out, setOut] = useState([]);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [fallback] = useState(3);

  const sb = storyboard;

  /* Ses süreleri üzerinden sınırları hesapla — kurgudakiyle birebir aynı */
  function computeBounds() {
    const bounds = [];
    let acc = 0;
    sb.scenes.forEach(s => {
      acc += (s.voiceDuration ? s.voiceDuration + ENGINE.SCENE_GAP : fallback);
      bounds.push(acc);
    });
    return bounds;
  }

  function emit(list, name, scenes, bounds) {
    const cues = cuesFromScenes(scenes, bounds);
    const code = name === 'orijinal' ? sb.language.toLocaleLowerCase('tr').slice(0, 3) : name.toLocaleLowerCase('tr').slice(0, 3);
    if (formats.includes('SRT')) list.push({ n: 'altyazi_' + code + '.srt', m: name + ' · ' + cues.length + ' blok',
      b: new Blob([srtFromCues(cues)], { type: 'text/plain;charset=utf-8' }) });
    if (formats.includes('VTT')) list.push({ n: 'altyazi_' + code + '.vtt', m: name + ' · VTT',
      b: new Blob([vttFromCues(cues)], { type: 'text/plain;charset=utf-8' }) });
    if (formats.includes('TXT')) list.push({ n: 'altyazi_' + code + '.txt', m: name + ' · düz metin',
      b: new Blob([scenes.map(s => s.subtitle || s.paragraph).join('\n\n')], { type: 'text/plain;charset=utf-8' }) });
  }

  async function generate() {
    setErr(null);
    if (!sb.scenes?.length) return setErr(t('sub.errNoScenes'));
    if (!formats.length) return setErr(t('sub.errNoFormat'));
    setBusy(t('sub.preparing')); setOut([]);

    try {
      const bounds = computeBounds();
      const list = [];
      emit(list, 'orijinal', sb.scenes, bounds);

      for (const lang of langs) {
        setBusy(t('sub.translating', { l: lang }));
        const texts = sb.scenes.map(s => s.subtitle || s.paragraph || '');
        const translated = [];
        const PER = 6;
        for (let i = 0; i < texts.length; i += PER) {
          const slice = texts.slice(i, i + PER);
          const { text, creditsLeft } = await callAI('translate',
            `Aşağıdaki JSON dizisindeki her öğeyi ${lang} diline çevir. Bunlar video altyazı metinleri: ` +
            `doğal ve akıcı olsun, uzunluk benzer kalsın. Metin zaten ${lang} dilindeyse aynen döndür. ` +
            `SADECE ${slice.length} elemanlı JSON dizisi döndür.\n\n${JSON.stringify(slice)}`,
            { maxTokens: 3000 });
          spendCredits(creditsLeft);
          let arr = parseJSONLoose(text);
          while (arr.length < slice.length) arr.push(slice[arr.length]);
          translated.push(...arr.slice(0, slice.length).map(String));
        }
        const tScenes = sb.scenes.map((s, i) => ({ ...s, subtitle: translated[i] }));
        emit(list, lang, tScenes, bounds);
      }
      setOut(list);
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  async function zipAll() {
    const zip = new JSZip();
    out.forEach(f => zip.file(f.n, f.b));
    triggerDownload(await zip.generateAsync({ type: 'blob' }), 'altyazilar.zip');
  }

  const withVoice = sb.scenes?.filter(s => s.voice).length || 0;
  const total = (sb.scenes || []).reduce((a, s) => a + (s.voiceDuration || fallback), 0);

  if (!episodeId) return (<><h1 className="page-title">{t('sub.title')}</h1><EpisodeBar /></>);

  return (
    <>
      <h1 className="page-title">{t('sub.title')}</h1>
      <p className="page-sub">{t('sub.sub')}</p>
      <EpisodeBar />

      <div className="card" style={{ marginBottom: 14 }}>
        <p className="hint" style={{ margin: 0 }}>
          {withVoice === sb.scenes.length && sb.scenes.length > 0
            ? '✓ Bütün sahnelerin sesi bağlı — altyazılar birebir senkron olacak (' + formatDur(total) + ').'
            : withVoice > 0
              ? withVoice + '/' + sb.scenes.length + ' sahnenin sesi bağlı. Sessiz sahnelere ' + fallback + ' sn verilir.'
              : 'Hiç ses bağlı değil. Zamanlama için Seslendirme sayfasından ses dosyalarını bağla.'}
        </p>
        {withVoice < sb.scenes.length &&
          <Link href="/studio/seslendirme" className="btn btn-mini" style={{ marginTop: 10 }}>{t('sub.toVoice')}</Link>}
      </div>

      <div className="field">
        <label>{t('sub.transLangs')}</label>
        <div className="chips">
          {/* Orijinal dil de listede görünür ama kilitlidir: her zaman
              üretildiği için kullanıcı onu arayıp bulamama derdine düşmesin.
              Diğer on bir dil serbestçe seçilir. */}
          {LANGUAGES.map(l => {
            const isSource = l === sb.language;
            return (
              <label key={l}
                className={'chip' + (isSource || langs.includes(l) ? ' on' : '') + (isSource ? ' chip-locked' : '')}
                title={isSource ? t('sub.sourceLocked') : undefined}>
                <input type="checkbox" checked={isSource || langs.includes(l)} disabled={isSource}
                  onChange={e => setLangs(e.target.checked ? [...langs, l] : langs.filter(x => x !== l))} />{l}
              </label>
            );
          })}
        </div>
        <p className="hint">{t('sub.sourceNote', { lang: sb.language })}</p>
      </div>

      <div className="field">
        <label>{t('sub.format')}</label>
        <div className="chips">
          {FORMATS.map(f => (
            <label key={f} className={'chip' + (formats.includes(f) ? ' on' : '')}>
              <input type="checkbox" checked={formats.includes(f)}
                onChange={e => setFormats(e.target.checked ? [...formats, f] : formats.filter(x => x !== f))} />{f}
            </label>
          ))}
        </div>
      </div>

      <button className="btn btn-primary" onClick={generate} disabled={!!busy || !sb.scenes.length}>
        {busy ? busy + '…' : t('sub.generate')}
      </button>
      {busy && <div className="progress"><span>{busy}</span><div className="track"><i className="fill" style={{ width: '60%' }} /></div></div>}
      {err && <span className="err">{err}</span>}

      {out.length > 0 && (
        <>
          <h2 className="section-title">Dosyalar</h2>
          <div className="row-list">
            {out.map(f => (
              <div className="row" key={f.n}>
                <div><div className="r-name mono">{f.n}</div><div className="r-meta">{f.m}</div></div>
                <button className="btn btn-mini" onClick={() => triggerDownload(f.b, f.n)}>{t('common.download')}</button>
              </div>
            ))}
          </div>
          <button className="btn btn-primary btn-mini" style={{ marginTop: 12 }} onClick={zipAll}>{t('sub.zipAll')}</button>
        </>
      )}
          <WizardFooter stepKey="altyazi" />
    </>
  );
}
