'use client';
import { useRef, useState } from 'react';
import WizardFooter from '@/lib/WizardFooter';
import { useStudio } from '@/lib/store';
import { useT } from '@/lib/i18n';
import { pickMimeType, triggerDownload, formatDur, ENGINE } from '@/lib/engine';

export const dynamic = 'force-dynamic';

const LENGTHS = [15, 30, 45, 60];

export default function Shorts() {
  const { finalVideo: video, storyboard: sb } = useStudio();
  const t = useT();
  const canvasRef = useRef(null);
  const cancelRef = useRef(false);
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [dur, setDur] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(30);          // serbest bitiş noktası
  const [fromStudio, setFromStudio] = useState(false);  // sahne sınırları yalnız kurgu videosunda geçerli
  const [vertical, setVertical] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);

  function useStudioVideo() {
    if (!video) return setErr('Atölye\'de henüz video üretmedin.');
    setFile(video.blob); setName(video.filename); setDur(video.dur); setErr(null);
    setFromStudio(true); setStart(0); setEnd(Math.min(30, video.dur));
  }

  function onFile(e) {
    e.preventDefault();
    const f = [...(e.dataTransfer?.files || e.target.files || [])].find(x => x.type.startsWith('video/'));
    if (!f) return;
    setErr(null);
    const url = URL.createObjectURL(f);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      setFile(f); setName(f.name); setDur(v.duration);
      setFromStudio(false); setStart(0); setEnd(Math.min(30, v.duration));
      URL.revokeObjectURL(url);
    };
    v.onerror = () => { setErr('Video okunamadı.'); URL.revokeObjectURL(url); };
    v.src = url;
  }

  /* Sahne sınırları — kurgu videosunun zaman çizgisindeki yerleri.
     Motor her sahnenin sesini arka arkaya ekler ve aralarına SCENE_GAP
     nefes payı koyar. Aynı hesabı burada tekrarlayarak "3. sahneden başla"
     gibi bir seçim yapılabiliyor. Yalnızca kurgudan gelen videoda geçerli;
     dışarıdan yüklenen dosyanın sahnelerle ilgisi olmayabilir. */
  const sceneMarks = (() => {
    if (!fromStudio || !sb?.scenes?.length) return [];
    const marks = [];
    let acc = 0;
    for (let i = 0; i < sb.scenes.length; i++) {
      const d = sb.scenes[i].voiceDuration;
      if (!d) return [];                       // süre bilinmiyorsa hiç gösterme
      marks.push({ n: i + 1, start: acc, end: acc + d });
      acc += d + ENGINE.SCENE_GAP;
    }
    return marks.filter(m => m.start < dur);
  })();

  /* Bir sahneyi seç: aralığı o sahnenin sınırlarına oturt. */
  function pickScene(m) {
    setStart(+m.start.toFixed(2));
    setEnd(+Math.min(m.end, dur).toFixed(2));
  }

  /* Hazır uzunluk: başlangıcı koru, bitişi kaydır. */
  function setLength(sec) {
    setEnd(+Math.min(start + sec, dur).toFixed(2));
  }

  const selLen = Math.max(0, end - start);

  async function cut() {
    setErr(null);
    if (!file) return setErr('Önce bir video seç.');
    const codec = pickMimeType();
    if (!codec) return setErr('Bu tarayıcı video kaydını desteklemiyor. Chrome veya Edge kullan.');
    if (start >= dur) return setErr('Başlangıç videonun süresini aşıyor (' + formatDur(dur) + ').');
    if (end <= start) return setErr('Bitiş, başlangıçtan sonra olmalı.');
    const realLen = Math.min(end - start, dur - start);

    setBusy(true); cancelRef.current = false; setResult(null); setProg(0);
    const v = document.createElement('video');
    let actx = null;
    try {
      v.src = URL.createObjectURL(file);
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('video açılamadı')); });

      let W, H;
      if (vertical) {
        H = Math.min(1280, v.videoHeight - (v.videoHeight % 2));
        W = Math.round(H * 9 / 16); W -= W % 2;
      } else {
        W = v.videoWidth - (v.videoWidth % 2); H = v.videoHeight - (v.videoHeight % 2);
      }
      const c = canvasRef.current;
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';

      actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = actx.createMediaElementSource(v);
      const dest = actx.createMediaStreamDestination();
      src.connect(dest);

      const vStream = c.captureStream(30);
      const combined = new MediaStream([...vStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      const rec = new MediaRecorder(combined, { mimeType: codec.mime, videoBitsPerSecond: 10000000 });
      const parts = [];
      rec.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
      const stopped = new Promise(r => rec.onstop = r);

      v.currentTime = start;
      await new Promise(r => { v.onseeked = r; });
      await v.play();
      rec.start(1000);
      const t0 = performance.now();

      await new Promise(resolve => {
        const loop = () => {
          const t = (performance.now() - t0) / 1000;
          if (cancelRef.current || t >= realLen || v.ended) return resolve();
          const sc = Math.max(W / v.videoWidth, H / v.videoHeight);
          ctx.drawImage(v, (W - v.videoWidth * sc) / 2, (H - v.videoHeight * sc) / 2, v.videoWidth * sc, v.videoHeight * sc);
          setProg(Math.round((t / realLen) * 100));
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      });

      v.pause();
      rec.stop();
      await stopped;
      combined.getTracks().forEach(t => t.stop());
      if (!cancelRef.current) {
        const blob = new Blob(parts, { type: codec.mime.split(';')[0] });
        setResult({ blob, name: 'short.' + codec.ext, url: URL.createObjectURL(blob), size: blob.size });
      }
    } catch (e) { setErr('Short kesilemedi: ' + e.message); }
    if (actx) actx.close().catch(() => {});
    URL.revokeObjectURL(v.src);
    setBusy(false);
  }

  return (
    <>
      <h1 className="page-title">{t('sh.title')}</h1>
      <p className="page-sub">{t('sh.sub')}</p>

      <label className={'dropzone' + (file ? ' filled' : '')} onDragOver={e => e.preventDefault()} onDrop={onFile}>
        <div className="dz-big">{file ? '✓ ' + name + ' — ' + formatDur(dur) : 'Video dosyası'}</div>
        <div className="dz-small">mp4 veya webm</div>
        <input type="file" accept="video/*" hidden onChange={onFile} />
      </label>
      {video && <button className="btn btn-mini" style={{ marginTop: 10 }} onClick={useStudioVideo}>
        Kurgudaki videoyu kullan ({video.filename})
      </button>}

      <div className="card" style={{ marginTop: 16 }}>

        {/* SAHNEDEN SEÇ — videonun hangi bölümünden short çıkacağı.
            Kurgudan gelen videoda sahne sınırları bilindiği için
            tek tıkla o sahneye oturtulur. */}
        {sceneMarks.length > 0 && (
          <div className="field">
            <label>Sahneden seç</label>
            <div className="chips sh-scenes">
              {sceneMarks.map(m => {
                const on = Math.abs(start - m.start) < 0.4;
                return (
                  <button key={m.n} className={'chip' + (on ? ' on' : '')}
                    title={formatDur(m.start) + ' → ' + formatDur(m.end)}
                    onClick={() => pickScene(m)}>
                    {m.n}
                  </button>
                );
              })}
            </div>
            <p className="hint">Sahneye tıkla, aralık o sahnenin sesine oturur.</p>
          </div>
        )}

        {/* ZAMAN ÇİZGİSİ — seçili aralık ve sahne sınırları görünür */}
        {dur > 0 && (
          <div className="field">
            <label>Aralık · {formatDur(start)} → {formatDur(end)} ({selLen.toFixed(1)} sn)</label>
            <div className="sh-timeline" aria-hidden="true">
              <div className="sh-sel" style={{
                left: (start / dur * 100) + '%',
                width: Math.max(0.5, selLen / dur * 100) + '%'
              }} />
              {sceneMarks.map(m => (
                <i key={m.n} className="sh-mark" style={{ left: (m.start / dur * 100) + '%' }} />
              ))}
            </div>

            <div className="sh-slider">
              <span>Başlangıç</span>
              <input type="range" min="0" max={Math.max(0, dur - 0.5)} step="0.1" value={start}
                onChange={e => {
                  const v = +e.target.value;
                  setStart(v);
                  if (end <= v) setEnd(+Math.min(v + 5, dur).toFixed(2));
                }} disabled={!dur} />
              <b>{formatDur(start)}</b>
            </div>
            <div className="sh-slider">
              <span>Bitiş</span>
              <input type="range" min="0" max={Math.max(0.5, dur)} step="0.1" value={end}
                onChange={e => {
                  const v = +e.target.value;
                  setEnd(v);
                  if (v <= start) setStart(+Math.max(0, v - 5).toFixed(2));
                }} disabled={!dur} />
              <b>{formatDur(end)}</b>
            </div>
          </div>
        )}

        {/* HAZIR UZUNLUKLAR — başlangıcı koruyup bitişi kaydırır */}
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Hazır uzunluk</label>
          <div className="chips">
            {LENGTHS.map(l => (
              <button key={l} className={'chip' + (Math.abs(selLen - l) < 0.3 ? ' on' : '')}
                onClick={() => setLength(l)} disabled={!dur}>{l} saniye</button>
            ))}
            <button className="chip" onClick={() => { setStart(0); setEnd(dur); }} disabled={!dur}>
              Tamamı
            </button>
            <label className={'chip' + (vertical ? ' on' : '')}>
              <input type="checkbox" checked={vertical} onChange={e => setVertical(e.target.checked)} />9:16 dikey
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={cut} disabled={busy}>{busy ? 'Kesiliyor…' : 'Short kes'}</button>
        {busy && <button className="btn" onClick={() => { cancelRef.current = true; }}>İptal</button>}
        {result && <button className="btn" onClick={() => triggerDownload(result.blob, result.name)}>
          İndir ({(result.size / 1048576).toFixed(1)} MB)
        </button>}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>Kesim gerçek zamanlı: {selLen.toFixed(0)} saniyelik Short {selLen.toFixed(0)} saniye sürer. Sekmeyi ön planda tut.</p>
      {busy && <div className="progress"><span>%{prog}</span><div className="track"><i className="fill" style={{ width: prog + '%' }} /></div></div>}
      {err && <span className="err">{err}</span>}

      <h2 className="section-title">Önizleme</h2>
      <div style={{ textAlign: 'center' }}>
        <canvas ref={canvasRef} style={{ maxHeight: 400, maxWidth: '100%', borderRadius: 12, border: '1px solid var(--line)', background: '#000' }} />
        {result && <video src={result.url} controls style={{ maxHeight: 400, maxWidth: '100%', borderRadius: 12, border: '1px solid var(--line)', marginTop: 14, background: '#000' }} />}
      </div>
          <WizardFooter stepKey="shorts" />
    </>
  );
}
