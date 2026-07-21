'use client';
import { useRef, useState } from 'react';
import WizardFooter from '@/lib/WizardFooter';
import { useStudio, callAI, parseJSONLoose } from '@/lib/store';
import EpisodeBar from '@/lib/EpisodeBar';
import { roundRect, triggerDownload } from '@/lib/engine';
import { useT } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const STYLES = [
  { k: 'band', l: 'Renkli bant' }, { k: 'stroke', l: 'Konturlu yazı' }, { k: 'gradient', l: 'Gradyan' }
];

export default function Thumbnail() {
  const { storyboard, spendCredits } = useStudio();
  const t = useT();
  const scenes = (storyboard.scenes || []).filter(s => s.image).map(s => ({
    name: String(s.scene).padStart(3, '0'), url: s.image.url, blob: s.image.blob
  }));
  const canvasRef = useRef(null);
  const [source, setSource] = useState(null);
  const [srcName, setSrcName] = useState('');
  const [title, setTitle] = useState('');
  const [style, setStyle] = useState('band');
  const [blob, setBlob] = useState(null);
  const [ideas, setIdeas] = useState([]);
  const [story, setStory] = useState(
    (storyboard.scenes || []).slice(0, 3).map(s => s.paragraph).join(' ').slice(0, 600)
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  function onFile(e) {
    e.preventDefault();
    const f = [...(e.dataTransfer?.files || e.target.files || [])].find(x => x.type.startsWith('image/'));
    if (f) { setSource(f); setSrcName(f.name); }
  }

  function fitLines(ctx, text, maxW) {
    let fs = 88;
    while (fs > 40) {
      ctx.font = '800 ' + fs + 'px Inter, sans-serif';
      const words = text.split(' ');
      const arr = [];
      let cur = '';
      for (const w of words) {
        const t = (cur + ' ' + w).trim();
        if (ctx.measureText(t).width > maxW && cur) { arr.push(cur); cur = w; }
        else cur = t;
      }
      if (cur) arr.push(cur);
      if (arr.length <= 2) return { arr, fs };
      fs -= 8;
    }
    ctx.font = '800 40px Inter, sans-serif';
    return { arr: [text], fs: 40 };
  }

  async function draw() {
    setErr(null);
    if (!source) return setErr('Bir görsel seç ya da sürükle.');
    const W = 1280, H = 720;
    const c = canvasRef.current;
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    const bmp = await createImageBitmap(source);
    const sc = Math.max(W / bmp.width, H / bmp.height);
    ctx.drawImage(bmp, (W - bmp.width * sc) / 2, (H - bmp.height * sc) / 2, bmp.width * sc, bmp.height * sc);
    bmp.close();

    if (title.trim()) {
      if (style === 'gradient') {
        const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,0.88)');
        ctx.fillStyle = g;
        ctx.fillRect(0, H * 0.5, W, H * 0.5);
      }
      const { arr, fs } = fitLines(ctx, title.trim(), W * 0.86);
      ctx.textAlign = 'left';
      const lh = fs * 1.15;
      const baseY = H - 56 - (arr.length - 1) * lh;
      if (style === 'band') {
        const maxW = Math.max(...arr.map(l => ctx.measureText(l).width));
        ctx.fillStyle = '#ffb454';
        roundRect(ctx, 28, baseY - fs - 18, maxW + 52, arr.length * lh + 30, 14);
        ctx.fill();
        ctx.fillStyle = '#1a1408';
        arr.forEach((l, i) => ctx.fillText(l, 54, baseY + i * lh));
      } else {
        ctx.lineWidth = fs * 0.14;
        ctx.strokeStyle = '#000';
        ctx.lineJoin = 'round';
        ctx.fillStyle = '#fff';
        arr.forEach((l, i) => { ctx.strokeText(l, 44, baseY + i * lh); ctx.fillText(l, 44, baseY + i * lh); });
      }
    }
    setBlob(await new Promise(r => c.toBlob(r, 'image/png')));
  }

  async function suggest() {
    setErr(null);
    if (!story.trim()) return setErr('Başlık önerisi için hikâyeden birkaç cümle yaz.');
    setBusy(true);
    try {
      const { text, creditsLeft } = await callAI('titles',
        `Bu video için 5 YouTube thumbnail başlığı öner. ${storyboard.language || 'Türkçe'} dilinde, ` +
        `en fazla 5 kelime, merak uyandıran ama abartmayan, tıklama tuzağı olmayan. ` +
        `SADECE JSON dizisi döndür: ["Başlık", ...]\n\n${story}`);
      spendCredits(creditsLeft);
      setIdeas(parseJSONLoose(text));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <>
      <h1 className="page-title">{t('th.title')}</h1>
      <p className="page-sub">{t('th.sub')}</p>
      <EpisodeBar />

      <label className={'dropzone' + (source ? ' filled' : '')} onDragOver={e => e.preventDefault()} onDrop={onFile}>
        <div className="dz-big">{source ? '✓ ' + srcName : 'Kapak görseli'}</div>
        <div className="dz-small">sürükle ya da tıkla — veya aşağıdan bir sahne seç</div>
        <input type="file" accept="image/*" hidden onChange={onFile} />
      </label>

      {scenes.length > 0 && (
        <>
          <h2 className="section-title">Sahnelerin</h2>
          <div className="grid-thumbs">
            {scenes.map(s => (
              <div key={s.name} className={'thumb-cell selectable' + (srcName === s.name ? ' selected' : '')}
                onClick={() => { setSource(s.blob); setSrcName(s.name); }}>
                <img src={s.url} alt="" />
                <div className="name">{s.name}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="field" style={{ marginTop: 20 }}>
        <label>Başlık</label>
        <input className="input" value={title} onChange={e => setTitle(e.target.value)}
          maxLength={60} placeholder="Videonun başlığı" />
      </div>

      <div className="field">
        <label>Stil</label>
        <div className="chips">
          {STYLES.map(s => (
            <button key={s.k} className={'chip' + (style === s.k ? ' on' : '')} onClick={() => setStyle(s.k)}>{s.l}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={draw}>Thumbnail oluştur</button>
        {blob && <button className="btn" onClick={() => triggerDownload(blob, 'thumbnail.png')}>PNG indir</button>}
      </div>

      <h2 className="section-title">Başlık önerisi</h2>
      <textarea className="textarea" style={{ minHeight: 80 }} value={story} onChange={e => setStory(e.target.value)}
        placeholder="Videodan birkaç cümle — ya da boş bırak, storyboard'dan alınır." />
      <button className="btn btn-mini" style={{ marginTop: 10 }} onClick={suggest} disabled={busy}>
        {busy ? 'Düşünülüyor…' : 'Başlık öner'}
      </button>
      {ideas.length > 0 && (
        <div className="chips" style={{ marginTop: 12 }}>
          {ideas.map((t, i) => <button key={i} className="chip" onClick={() => setTitle(t)}>{t}</button>)}
        </div>
      )}
      {err && <span className="err">{err}</span>}

      <h2 className="section-title">Önizleme</h2>
      <div style={{ textAlign: 'center' }}>
        <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 12, border: '1px solid var(--line)', background: '#000' }} />
      </div>
          <WizardFooter stepKey="thumbnail" />
    </>
  );
}
