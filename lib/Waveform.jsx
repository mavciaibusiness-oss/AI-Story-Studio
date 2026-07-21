'use client';
import { useRef, useEffect } from 'react';
import { formatDur } from '@/lib/engine';

/*
  Ses dalga formu — bir audio Blob'undan görsel waveform çizer.
  Profesyonel editör hissi verir; düz bir çubuk yerine sesin gerçek
  şeklini gösterir. Web Audio API ile decode edip canvas'a çizer.
*/
export default function Waveform({ blob, duration }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!blob || !canvasRef.current) return;
    const cv = canvasRef.current;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    let cancelled = false;

    (async () => {
      try {
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        const buf = await actx.decodeAudioData(await blob.arrayBuffer());
        actx.close().catch(() => {});
        if (cancelled) return;

        const ch = buf.getChannelData(0);
        const W = cv.width = cv.offsetWidth * (window.devicePixelRatio || 1);
        const H = cv.height = 96;
        const step = Math.max(1, Math.floor(ch.length / W));

        ctx.clearRect(0, 0, W, H);
        const mid = H / 2;

        // Gradient — lamp renginde
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, 'rgba(255,180,84,0.8)');
        grad.addColorStop(0.5, 'rgba(255,180,84,0.4)');
        grad.addColorStop(1, 'rgba(255,180,84,0.8)');

        ctx.fillStyle = grad;
        for (let x = 0; x < W; x++) {
          let min = 1, max = -1;
          for (let j = 0; j < step; j++) {
            const v = ch[x * step + j] || 0;
            if (v < min) min = v;
            if (v > max) max = v;
          }
          const top = mid + min * mid * 0.85;
          const bot = mid + max * mid * 0.85;
          ctx.fillRect(x, top, 1, bot - top || 1);
        }
      } catch (e) { /* ses decode edilemezse boş kalır */ }
    })();

    return () => { cancelled = true; };
  }, [blob]);

  return (
    <div className="waveform-wrap">
      <canvas ref={canvasRef} className="waveform-canvas" />
      {duration > 0 && <span className="waveform-dur">{formatDur(duration)}</span>}
    </div>
  );
}
