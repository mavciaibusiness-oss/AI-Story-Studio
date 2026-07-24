'use client';
import { useState } from 'react';
import WizardFooter from '@/lib/WizardFooter';
import Link from 'next/link';
import { useStudio, callAI, parseJSONLoose } from '@/lib/store';
import EpisodeBar from '@/lib/EpisodeBar';
import VideoHealthPanel from '@/lib/VideoHealthPanel';
import { emptyScene, renumber, PROMPT_KEYS } from '@/lib/storyboard';
import { useT } from '@/lib/i18n';
import { triggerDownload, formatDur } from '@/lib/engine';

export const dynamic = 'force-dynamic';

/* Storyboard = uygulamanın merkezi. Sahne kartları burada yaşar;
   görsel, ses, prompt ve altyazı hep bu sıraya bağlı. */
export default function StoryboardPage() {
  const { storyboard, setStoryboard, patchScene, episodeId, spendCredits } = useStudio();
  const t = useT();
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [drag, setDrag] = useState(null);

  const sb = storyboard;

  function move(from, to) {
    if (to < 0 || to >= sb.scenes.length) return;
    const arr = [...sb.scenes];
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    setStoryboard(s => ({ ...s, scenes: renumber(arr) }));
  }
  function addAfter(i) {
    const arr = [...sb.scenes];
    arr.splice(i + 1, 0, emptyScene(0));
    setStoryboard(s => ({ ...s, scenes: renumber(arr) }));
  }
  function remove(i) {
    if (!confirm(t('common.scene') + ' ' + (i + 1) + ' — ' + t('sb.confirmDelete'))) return;
    setStoryboard(s => ({ ...s, scenes: renumber(s.scenes.filter((_, k) => k !== i)) }));
    setOpen(null);
  }

  /* Tek sahneyi yeniden üret — komşularını bilerek, tutarlılığı bozmadan */
  async function regenerate(i) {
    setErr(null); setBusy(i);
    try {
      const prev = sb.scenes[i - 1]?.paragraph || '(başlangıç)';
      const next = sb.scenes[i + 1]?.paragraph || '(final)';
      const { text, creditsLeft } = await callAI('scene',
        `"${sb.title}" videosunun ${i + 1}. sahnesini yeniden yaz. Tür: ${sb.genre}. Dil: ${sb.language}. ` +
        `Görsel stil: ${sb.style}.\n` +
        `Önceki sahne: ${prev}\nSonraki sahne: ${next}\n` +
        `Şu anki hali: ${sb.scenes[i].paragraph}\n\n` +
        `Aynı olayı anlat ama daha iyi yaz. Önceki ve sonraki sahneyle uyumlu kalsın.\n` +
        `SADECE şu JSON'u döndür: {"paragraph":"","imagePrompt":"","videoPrompt":""}`,
        { maxTokens: 1500 });
      spendCredits(creditsLeft);
      const s = parseJSONLoose(text);
      patchScene(i, {
        paragraph: s.paragraph || sb.scenes[i].paragraph,
        voiceText: s.paragraph || sb.scenes[i].voiceText,
        subtitle: s.paragraph || sb.scenes[i].subtitle,
        imagePrompt: s.imagePrompt || sb.scenes[i].imagePrompt,
        videoPrompt: s.videoPrompt || sb.scenes[i].videoPrompt
      });
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  function exportJSON() {
    triggerDownload(new Blob([JSON.stringify(sb, (k, v) =>
      ['image', 'video', 'voice'].includes(k) ? undefined : v, 2)], { type: 'application/json' }),
      (sb.title || 'storyboard') + '.json');
  }

  const totalVoice = sb.scenes.reduce((a, s) => a + (s.voiceDuration || 0), 0);

  if (!episodeId) return (<><h1 className="page-title">{t('sb.title')}</h1><EpisodeBar /></>);

  return (
    <>
      <h1 className="page-title">{t('sb.title')}</h1>
      <p className="page-sub">{t('sb.sub')}</p>
      <EpisodeBar />

      {/* Video Health özet + Timeline Preview — Sprint 4 / TASK-02 */}
      <VideoHealthPanel storyboard={sb} />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        <Link href="/studio/promptlar" className="btn btn-mini">{t('sb.genPrompts')}</Link>
        <Link href="/studio/gorseller" className="btn btn-mini">{t('sb.bindImages')}</Link>
        <Link href="/studio/seslendirme" className="btn btn-mini">{t('sb.bindVoices')}</Link>
        <Link href="/studio/atolye" className="btn btn-mini btn-primary">{t('sb.buildVideo')}</Link>
        <button className="btn btn-mini" onClick={exportJSON}>{t('sb.exportJSON')}</button>
        {totalVoice > 0 && <span className="hint" style={{ alignSelf: 'center' }}>
          {t('sb.voiceTotal')}: {formatDur(totalVoice)}
        </span>}
      </div>

      {sb.scenes.length === 0 && (
        <div className="card">
          <p className="hint">{t('sb.empty')} <Link href="/studio/senaryo" style={{ color: 'var(--lamp)' }}>{t('nav.script')}</Link>{' '}
            {t('sb.emptyHint')}</p>
        </div>
      )}

      {sb.scenes.map((s, i) => (
        <div key={i} className="card" draggable
          onDragStart={() => setDrag(i)}
          onDragOver={e => e.preventDefault()}
          onDrop={() => { if (drag !== null && drag !== i) move(drag, i); setDrag(null); }}
          style={{ marginBottom: 10, padding: 14, opacity: drag === i ? 0.4 : 1, cursor: 'grab' }}>

          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 74, height: 42, borderRadius: 6, background: 'var(--ink)', flexShrink: 0,
              border: '1px solid var(--line)', overflow: 'hidden', display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--muted)'
            }}>
              {s.image?.url
                ? <img src={s.image.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : 'yok'}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--lamp)', fontFamily: 'monospace', fontSize: 13 }}>
                  {String(s.scene).padStart(3, '0')}
                </span>
                {s.imagePrompt && <span className="hint" style={{ margin: 0, fontSize: 11 }}>· {t('common.prompt')} ✓</span>}
                {s.voice && <span style={{ fontSize: 11, color: 'var(--ok)' }}>· {s.voiceDuration?.toFixed(1)} {t('common.sec')}</span>}
              </div>
              <p style={{ fontSize: 13, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {s.paragraph || <i>{t('sb.emptyScene')}</i>}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button className="btn btn-mini" onClick={() => move(i, i - 1)} disabled={i === 0} title={t('sb.up')}>↑</button>
              <button className="btn btn-mini" onClick={() => move(i, i + 1)} disabled={i === sb.scenes.length - 1} title={t('sb.down')}>↓</button>
              <button className="btn btn-mini" onClick={() => setOpen(open === i ? null : i)}>
                {open === i ? t('common.close') : t('common.open')}
              </button>
            </div>
          </div>

          {open === i && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <div className="field">
                <label>{t('sb.sceneText')}</label>
                <textarea className="textarea" style={{ minHeight: 90 }} value={s.paragraph}
                  onChange={e => patchScene(i, {
                    paragraph: e.target.value, voiceText: e.target.value, subtitle: e.target.value
                  })} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                {PROMPT_KEYS.map(p => (
                  <div className="field" key={p.k} style={{ marginBottom: 0 }}>
                    <label>{p.l}</label>
                    <textarea className="textarea mono" style={{ minHeight: 58, fontSize: 12 }}
                      value={s[p.k] || ''} onChange={e => patchScene(i, { [p.k]: e.target.value })} />
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                <button className="btn btn-mini" onClick={() => regenerate(i)} disabled={busy === i}>
                  {busy === i ? t('sb.writing') : t('sb.regenScene')}
                </button>
                <button className="btn btn-mini" onClick={() => addAfter(i)}>{t('sb.addBelow')}</button>
                <button className="btn btn-mini btn-danger" onClick={() => remove(i)}>{t('common.delete')}</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {sb.scenes.length > 0 && (
        <button className="btn btn-mini" onClick={() => addAfter(sb.scenes.length - 1)}>{t('sb.addScene')}</button>
      )}
      {err && <span className="err">{err}</span>}
          <WizardFooter stepKey="storyboard" />
    </>
  );
}
