/* AI Content Studio — tarayıcı içi üretim motoru
   Kolaj bölme, voice sync, Ken Burns render, altyazı, thumbnail yardımcıları.
   Saf fonksiyonlar: her sayfadan import edilir. */
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export const ENGINE = {
  BLACK_T: 34,
  BLACK_ROW_RATIO: 0.92,
  MAX_TRIM: 0.18,
  NUMBER_CROP: 0.07,
  PAD: 3,
  MAX_CHARS: 84,
  LINE_CHARS: 42,
  CUE_GAP: 0.08,
  LEAD_IN: 0.15,
  PAUSE_WEIGHT: 14,
  ZOOM_MIN: 1.0,
  ZOOM_MAX: 1.2,
  PAN_RATIO: 0.02,
  MIN_SCENE: 1.0,
  SNAP_WINDOW: 1.6,
  SIL_WIN: 0.046,
  MUSIC_GAIN: 0.15,
  VIDEO_TAIL: 0.6,
  CROSSFADE: 0.45,
  SCENE_GAP: 0.25,      // sahne sesleri arasına konan nefes payı (sn)
  VOICE_TAIL: 0.4       // son sahnenin sesi bittikten sonraki pay (sn)
};

/* ---------- Genel ---------- */
export function naturalSortBy(key) {
  return (a, b) => a[key].localeCompare(b[key], undefined, { numeric: true, sensitivity: 'base' });
}
export function triggerDownload(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 8000);
}
export function formatDur(s) {
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
}
export function loadImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('görsel okunamadı')); };
    img.src = url;
  });
}
export function pickMimeType() {
  const candidates = [
    ['video/mp4;codecs=avc1', 'mp4'], ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'], ['video/webm;codecs=vp8', 'webm'], ['video/webm', 'webm']
  ];
  for (const [mime, ext] of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

/* ---------- Kolaj bölme ---------- */
export function trimBlack(imgData, x, y, w, h) {
  const d = imgData.data, W = imgData.width;
  const T = ENGINE.BLACK_T, R = ENGINE.BLACK_ROW_RATIO;
  const step = Math.max(1, Math.floor(Math.min(w, h) / 200));
  const isBlackRow = (yy) => {
    let black = 0, total = 0;
    for (let xx = x; xx < x + w; xx += step) {
      const i = (yy * W + xx) * 4;
      if (d[i] < T && d[i + 1] < T && d[i + 2] < T) black++;
      total++;
    }
    return black / total >= R;
  };
  const isBlackCol = (xx) => {
    let black = 0, total = 0;
    for (let yy = y; yy < y + h; yy += step) {
      const i = (yy * W + xx) * 4;
      if (d[i] < T && d[i + 1] < T && d[i + 2] < T) black++;
      total++;
    }
    return black / total >= R;
  };
  const maxY = Math.floor(h * ENGINE.MAX_TRIM), maxX = Math.floor(w * ENGINE.MAX_TRIM);
  let top = 0, bottom = 0, left = 0, right = 0;
  while (top < maxY && isBlackRow(y + top)) top++;
  while (bottom < maxY && isBlackRow(y + h - 1 - bottom)) bottom++;
  while (left < maxX && isBlackCol(x + left)) left++;
  while (right < maxX && isBlackCol(x + w - 1 - right)) right++;
  return { x: x + left, y: y + top, w: w - left - right, h: h - top - bottom };
}

/* İç ayraç çizgilerindeki koyuluğa bakarak 3x3 / 4x4 / 5x5 tespiti */
export function detectGrid(imgData, outer) {
  const d = imgData.data, W = imgData.width;
  const T = ENGINE.BLACK_T + 12;
  const lineDarkness = (isRow, pos) => {
    let black = 0, total = 0;
    const step = 4;
    if (isRow) {
      for (let xx = outer.x; xx < outer.x + outer.w; xx += step) {
        for (let dy = -2; dy <= 2; dy++) {
          const yy = Math.round(pos) + dy;
          const i = (yy * W + xx) * 4;
          if (d[i] < T && d[i + 1] < T && d[i + 2] < T) black++;
          total++;
        }
      }
    } else {
      for (let yy = outer.y; yy < outer.y + outer.h; yy += step) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = Math.round(pos) + dx;
          const i = (yy * W + xx) * 4;
          if (d[i] < T && d[i + 1] < T && d[i + 2] < T) black++;
          total++;
        }
      }
    }
    return black / total;
  };
  let bestG = 3, bestScore = -1;
  for (const g of [3, 4, 5]) {
    let score = 0, n = 0;
    for (let k = 1; k < g; k++) {
      score += lineDarkness(true, outer.y + (outer.h * k) / g);
      score += lineDarkness(false, outer.x + (outer.w * k) / g);
      n += 2;
    }
    score /= n;
    if (score > bestScore) { bestScore = score; bestG = g; }
  }
  return bestScore > 0.5 ? bestG : 3;
}

/* Bir kolaj dosyasını sahnelere böler; state = {scenes, targetW, targetH} */
export async function splitCollageFile(file, state, gridOverride) {
  const img = await loadImage(file);
  const src = document.createElement('canvas');
  src.width = img.naturalWidth; src.height = img.naturalHeight;
  const ctx = src.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, src.width, src.height);
  const outer = trimBlack(data, 0, 0, src.width, src.height);
  const G = gridOverride || detectGrid(data, outer);
  const cw = outer.w / G, ch = outer.h / G;
  const added = [];

  for (let r = 0; r < G; r++) {
    for (let c = 0; c < G; c++) {
      const x = Math.round(outer.x + c * cw);
      const y = Math.round(outer.y + r * ch);
      const t = trimBlack(data, x, y, Math.round(cw), Math.round(ch));
      const ix = Math.round(t.w * ENGINE.NUMBER_CROP), iy = Math.round(t.h * ENGINE.NUMBER_CROP);
      const fx = t.x + ix, fy = t.y + iy;
      const fw = t.w - 2 * ix, fh = t.h - 2 * iy;
      if (fw < 10 || fh < 10) continue;
      if (!state.targetW) { state.targetW = fw; state.targetH = fh; }

      const out = document.createElement('canvas');
      out.width = state.targetW; out.height = state.targetH;
      const octx = out.getContext('2d');
      octx.imageSmoothingQuality = 'high';
      const scale = Math.max(state.targetW / fw, state.targetH / fh);
      octx.drawImage(src, fx, fy, fw, fh,
        (state.targetW - fw * scale) / 2, (state.targetH - fh * scale) / 2, fw * scale, fh * scale);

      const blob = await new Promise(res => out.toBlob(res, 'image/png'));
      const name = 'Scene' + String(state.scenes.length + 1).padStart(ENGINE.PAD, '0') + '.png';
      const scene = { name, blob, url: URL.createObjectURL(blob) };
      state.scenes.push(scene);
      added.push(scene);
    }
  }
  return { grid: G, added };
}

/* ---------- Altyazı ---------- */
export function chunkText(text) {
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentences = clean.match(/[^.!?…]+[.!?…]*/g) || [clean];
  const chunks = [];
  let cur = '';
  for (let s of sentences) {
    s = s.trim();
    if (!s) continue;
    if (s.length > ENGINE.MAX_CHARS) {
      if (cur) { chunks.push(cur); cur = ''; }
      const words = s.split(' ');
      let piece = '';
      for (const w of words) {
        if ((piece + ' ' + w).trim().length > ENGINE.MAX_CHARS) { chunks.push(piece.trim()); piece = w; }
        else piece = (piece + ' ' + w).trim();
      }
      if (piece) chunks.push(piece);
    } else if ((cur + ' ' + s).trim().length <= ENGINE.MAX_CHARS) {
      cur = (cur + ' ' + s).trim();
    } else {
      if (cur) chunks.push(cur);
      cur = s;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
/* Bir metin parçasının göreli "ağırlığı" — uzunluk + noktalama başına
   duraklama payı. buildTimings ve alignVoiceToParagraphs ikisi de bunu
   kullanır: aynı metne aynı süre mantığı uygulansın diye. */
export function textWeight(text) {
  return text.length + ((text.match(/[.!?…]/g) || []).length * ENGINE.PAUSE_WEIGHT);
}

export function buildTimings(chunks, duration) {
  const total = chunks.reduce((s, c) => s + textWeight(c), 0);
  const usable = Math.max(1, duration - ENGINE.LEAD_IN - ENGINE.CUE_GAP * (chunks.length - 1));
  let t = ENGINE.LEAD_IN;
  return chunks.map(c => {
    const d = usable * (textWeight(c) / total);
    const cue = { start: t, end: t + d };
    t = cue.end + ENGINE.CUE_GAP;
    return cue;
  });
}
function pad2(n) { return String(n).padStart(2, '0'); }
function timeParts(sec) {
  return {
    h: pad2(Math.floor(sec / 3600)),
    m: pad2(Math.floor((sec % 3600) / 60)),
    s: pad2(Math.floor(sec % 60)),
    ms: String(Math.round((sec - Math.floor(sec)) * 1000)).padStart(3, '0')
  };
}
export function srtTime(sec) { const p = timeParts(sec); return p.h + ':' + p.m + ':' + p.s + ',' + p.ms; }
export function vttTime(sec) { const p = timeParts(sec); return p.h + ':' + p.m + ':' + p.s + '.' + p.ms; }
export function wrapTwoLines(text) {
  if (text.length <= ENGINE.LINE_CHARS) return text;
  let best = -1, mid = text.length / 2;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === ' ' && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  }
  if (best === -1) return text;
  return text.slice(0, best) + '\n' + text.slice(best + 1);
}
export function buildSRT(chunks, timings) {
  return chunks.map((c, i) =>
    (i + 1) + '\n' + srtTime(timings[i].start) + ' --> ' + srtTime(timings[i].end) + '\n' + wrapTwoLines(c) + '\n'
  ).join('\n');
}
export function buildVTT(chunks, timings) {
  return 'WEBVTT\n\n' + chunks.map((c, i) =>
    vttTime(timings[i].start) + ' --> ' + vttTime(timings[i].end) + '\n' + wrapTwoLines(c) + '\n'
  ).join('\n');
}
export function buildTXT(chunks) { return chunks.join('\n'); }

/* ---------- Voice Sync ---------- */

/* Ses dalgasındaki duraklama/sessizlik anlarını bulur.
   46ms pencerelerle RMS enerjisi ölçülür, medyanın %35'inin altına düşen
   ve en az 180ms süren bölgeler "sessizlik" sayılır. Hem eski
   analyzeVoiceCuts hem yeni alignVoiceToParagraphs bunu paylaşır. */
function detectSilences(audioBuffer) {
  const ch = audioBuffer.getChannelData(0);
  const sr = audioBuffer.sampleRate;
  const win = Math.floor(sr * ENGINE.SIL_WIN);
  const nWin = Math.floor(ch.length / win);
  const rms = new Float32Array(nWin);
  for (let i = 0; i < nWin; i++) {
    let sum = 0;
    for (let j = i * win; j < (i + 1) * win; j++) sum += ch[j] * ch[j];
    rms[i] = Math.sqrt(sum / win);
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const thresh = Math.max(0.006, sorted[Math.floor(nWin * 0.5)] * 0.35);
  const silences = [];
  let start = -1;
  for (let i = 0; i < nWin; i++) {
    if (rms[i] < thresh) { if (start < 0) start = i; }
    else if (start >= 0) {
      const lenS = (i - start) * ENGINE.SIL_WIN;
      if (lenS >= 0.18) silences.push({ t: (start + (i - start) / 2) * ENGINE.SIL_WIN, len: lenS });
      start = -1;
    }
  }
  return silences;
}

export async function analyzeVoiceCuts(audioBuffer, nScenes) {
  const silences = detectSilences(audioBuffer);
  const dur = audioBuffer.duration;
  const cuts = [];
  let prev = 0;
  for (let k = 1; k < nScenes; k++) {
    const target = (dur / nScenes) * k;
    let best = null;
    for (const s of silences) {
      if (Math.abs(s.t - target) <= ENGINE.SNAP_WINDOW && s.t > prev + ENGINE.MIN_SCENE && s.t < dur - ENGINE.MIN_SCENE) {
        if (!best || Math.abs(s.t - target) < Math.abs(best.t - target)) best = s;
      }
    }
    const cut = best ? best.t : Math.max(prev + ENGINE.MIN_SCENE, Math.min(target, dur - ENGINE.MIN_SCENE));
    cuts.push(cut);
    prev = cut;
  }
  const durations = [];
  let last = 0;
  for (const c of cuts) { durations.push(c - last); last = c; }
  durations.push(dur - last + ENGINE.VIDEO_TAIL);
  return { durations, silenceCount: silences.length };
}

/*
  TEK SES DOSYASINI PARAGRAF METİNLERİNE HİZALAR.
  analyzeVoiceCuts'tan farkı: hedef kesim noktaları eşit değil, her
  paragrafın METİN AĞIRLIĞINA (uzunluk + noktalama duraklaması) orantılı
  hesaplanır — uzun paragraf daha çok, kısa paragraf daha az süre alır.
  Sonra bu hedefler, kullanıcının kaydederken doğal olarak bıraktığı
  duraklamalara (varsa) yapıştırılır. Duraklama bulunamazsa metin oranı
  aynen kullanılır — kayıt tamamen kesintisiz okunmuş olsa bile çalışır.
*/
export function alignVoiceToParagraphs(audioBuffer, paragraphs) {
  const dur = audioBuffer.duration;
  const silences = detectSilences(audioBuffer);
  const weights = paragraphs.map(textWeight);
  const totalW = weights.reduce((a, b) => a + b, 0) || 1;

  const cuts = [];
  let prev = 0, acc = 0;
  for (let k = 0; k < paragraphs.length - 1; k++) {
    acc += weights[k];
    const target = dur * (acc / totalW);
    let best = null;
    for (const s of silences) {
      if (Math.abs(s.t - target) <= ENGINE.SNAP_WINDOW && s.t > prev + ENGINE.MIN_SCENE && s.t < dur - ENGINE.MIN_SCENE) {
        if (!best || Math.abs(s.t - target) < Math.abs(best.t - target)) best = s;
      }
    }
    const cut = best ? best.t : Math.max(prev + ENGINE.MIN_SCENE, Math.min(target, dur - ENGINE.MIN_SCENE));
    cuts.push(cut);
    prev = cut;
  }

  const bounds = [...cuts, dur];
  let last = 0;
  return bounds.map(b => {
    const seg = { start: last, end: b, duration: b - last, snapped: cuts.includes(b) };
    last = b;
    return seg;
  });
}

/* Bir AudioBuffer'ın [startSec, endSec) aralığını 16-bit PCM WAV Blob'una
   çevirir. Tarayıcı dışına hiçbir şey göndermeden, tek bir kayıttan sahne
   başına ayrı, gerçekten oynatılabilir ses dosyaları üretmenin yolu budur. */
export function sliceAudioToWav(audioBuffer, startSec, endSec) {
  const sr = audioBuffer.sampleRate;
  const ch = Math.min(audioBuffer.numberOfChannels, 2);
  const startI = Math.max(0, Math.floor(startSec * sr));
  const endI = Math.min(audioBuffer.length, Math.ceil(endSec * sr));
  const n = Math.max(1, endI - startI);

  const channels = [];
  for (let c = 0; c < ch; c++) channels.push(audioBuffer.getChannelData(c).subarray(startI, endI));

  const blockAlign = ch * 2;
  const dataSize = n * blockAlign;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

  writeStr(0, 'RIFF'); view.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, ch, true); view.setUint32(24, sr, true);
  view.setUint32(28, sr * blockAlign, true); view.setUint16(32, blockAlign, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, dataSize, true);

  let off = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i] || 0));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/* ---------- Render ---------- */
export async function prepareFrames(sceneList, canvas, maxEdge) {
  const firstBmp = await createImageBitmap(sceneList[0].blob);
  let W = firstBmp.width, H = firstBmp.height;
  const longEdge = Math.max(W, H);
  if (longEdge > maxEdge) { const s = maxEdge / longEdge; W = Math.round(W * s); H = Math.round(H * s); }
  W -= W % 2; H -= H % 2;
  canvas.width = W; canvas.height = H;
  const frames = [];
  for (let i = 0; i < sceneList.length; i++) {
    const bmp = i === 0 ? firstBmp : await createImageBitmap(sceneList[i].blob);
    /* Pan payı için kadraj bir tık geniş basılır */
    const m = 1 + ENGINE.PAN_RATIO * 2;
    const off = document.createElement('canvas');
    off.width = Math.round(W * m); off.height = Math.round(H * m);
    const octx = off.getContext('2d');
    octx.imageSmoothingQuality = 'high';
    const sc = Math.max(off.width / bmp.width, off.height / bmp.height);
    octx.drawImage(bmp, (off.width - bmp.width * sc) / 2, (off.height - bmp.height * sc) / 2, bmp.width * sc, bmp.height * sc);
    bmp.close();
    frames.push(off);
    await new Promise(r => setTimeout(r, 0));
  }
  return { frames, W, H };
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function sceneIndexAt(boundaries, t) {
  for (let i = 0; i < boundaries.length; i++) { if (t < boundaries[i]) return i; }
  return boundaries.length - 1;
}
function drawScene(ctx, frames, idx, p, W, H, motion, zoomIdx) {
  /* zoomIdx verilmezse idx kullanılır. Scene Engine tek kareyi sarmalayarak
     çağırdığı için (idx hep 0) gerçek sahne numarasını buradan geçirir;
     böylece zoom yönü sahneden sahneye dönüşümlü kalır. */
  const zi = (zoomIdx === undefined || zoomIdx === null) ? idx : zoomIdx;
  const zoomIn = zi % 2 === 0;
  const z = zoomIn
    ? ENGINE.ZOOM_MIN + (ENGINE.ZOOM_MAX - ENGINE.ZOOM_MIN) * p
    : ENGINE.ZOOM_MAX - (ENGINE.ZOOM_MAX - ENGINE.ZOOM_MIN) * p;
  let panX = 0;
  if (motion === 'smart') {
    const dir = zi % 4 < 2 ? 1 : -1;
    panX = dir * (p - 0.5) * 2 * W * ENGINE.PAN_RATIO;
  }
  const f = frames[Math.min(idx, frames.length - 1)];
  const dw = f.width * z, dh = f.height * z;
  ctx.drawImage(f, (W - dw) / 2 + panX, (H - dh) / 2, dw, dh);
}

/* t anındaki kareyi çizer; crossfade + gömülü altyazı + filigran destekli */
export function drawFrameAt(ctx, frames, boundaries, durations, t, W, H, opts) {
  const o = opts || {};
  const idx = sceneIndexAt(boundaries, t);
  const segStart = idx === 0 ? 0 : boundaries[idx - 1];
  const p = Math.min(1, (t - segStart) / durations[idx]);
  drawScene(ctx, frames, idx, p, W, H, o.motion || 'zoom');

  if (o.crossfade && idx < frames.length - 1) {
    const remain = boundaries[idx] - t;
    if (remain < ENGINE.CROSSFADE) {
      ctx.globalAlpha = 1 - remain / ENGINE.CROSSFADE;
      drawScene(ctx, frames, idx + 1, 0, W, H, o.motion || 'zoom');
      ctx.globalAlpha = 1;
    }
  }

  if (o.cues) drawCue(ctx, o.cues, t, W, H, o.subStyle);
  if (o.watermark) drawWatermark(ctx, o.watermark, W, H);
  return idx;
}

/* Altyazı bandı — hem drawFrameAt hem drawSceneAt kullanır */
/* Altyazı için desteklenen fontlar — layout.jsx'te Google Fonts ile yüklenir. */
export const SUBTITLE_FONTS = [
  'Poppins', 'Montserrat', 'Inter', 'Roboto', 'Open Sans',
  'Nunito', 'Fredoka', 'Baloo 2', 'Comic Neue', 'Luckiest Guy'
];
export const SUBTITLE_WEIGHTS = [
  { label: 'Normal', value: 400 },
  { label: 'Medium', value: 500 },
  { label: 'SemiBold', value: 600 },
  { label: 'Bold', value: 700 }
];

export function defaultSubtitleStyle() {
  return {
    on: true,
    font: 'Poppins',
    size: 56,            // 1080px yüksekliğe göre referans; çizerken orantılı ölçeklenir
    weight: 600,         // SemiBold — varsayılan
    color: '#ffffff',
    outlineColor: '#000000',
    outlineWidth: 2,
    shadow: true,
    align: 'bottom-center',   // 'bottom-center' | 'bottom-left' | 'bottom-right' | 'middle-center'
    bgBox: false,
    bgColor: '#000000',
    bgOpacity: 45,       // %
    bgRadius: 10,
    safeArea: 8          // alttan % boşluk (TikTok/Shorts/Reels arayüzü için)
  };
}

/* Canvas metni ancak font BELGEDE yüklüyse o fontla çizer; yüklü değilse
   sessizce varsayılana düşer. Render'dan önce bunu çağırıp fontu garanti
   ediyoruz. Tarayıcı dışında (jsdom/SSR) document.fonts olmayabilir — o
   durumda sessizce geçiyoruz. */
export async function ensureSubtitleFont(style, H) {
  if (typeof document === 'undefined' || !document.fonts || !style || !style.font) return;
  const fs = subtitleFontSize(style, H);
  const spec = (style.weight || 600) + ' ' + fs + 'px "' + style.font + '"';
  try {
    await document.fonts.load(spec);
    await document.fonts.ready;
  } catch (e) {}
}

function subtitleFontSize(style, H) {
  // 56 → 1080px yükseklik referansı; farklı çözünürlüklerde orantılı ölçekle
  return Math.max(14, Math.round((style.size || 56) * (H / 1080)));
}

function hexToRgba(hex, alpha) {
  const h = (hex || '#000000').replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

export function drawCue(ctx, cues, t, W, H, style) {
  const cue = cues.find(c => t >= c.start && t <= c.end);
  if (!cue) return;
  const st = style || defaultSubtitleStyle();
  const lines = wrapTwoLines(cue.text).split('\n');
  const fs = subtitleFontSize(st, H);
  const fam = st.font === 'Luckiest Guy' ? '"Luckiest Guy"' : '"' + st.font + '", "Segoe UI", sans-serif';
  ctx.font = (st.weight || 600) + ' ' + fs + 'px ' + fam;

  const lh = fs * 1.3;
  const safe = Math.round(H * ((st.safeArea != null ? st.safeArea : 8) / 100));

  // Dikey konum
  let baseY;
  if (st.align === 'middle-center') baseY = H / 2 - (lines.length - 1) * lh / 2 + fs / 2;
  else baseY = H - safe - (lines.length - 1) * lh;

  // Yatay hizalama
  let anchorX, textAlign;
  if (st.align === 'bottom-left') { anchorX = Math.round(W * 0.06); textAlign = 'left'; }
  else if (st.align === 'bottom-right') { anchorX = W - Math.round(W * 0.06); textAlign = 'right'; }
  else { anchorX = W / 2; textAlign = 'center'; }
  ctx.textAlign = textAlign;
  ctx.textBaseline = 'alphabetic';

  const maxW = Math.max(...lines.map(l => ctx.measureText(l).width));

  // Arka plan kutusu (isteğe bağlı)
  if (st.bgBox) {
    let boxX;
    if (textAlign === 'left') boxX = anchorX;
    else if (textAlign === 'right') boxX = anchorX - maxW;
    else boxX = W / 2 - maxW / 2;
    const padX = fs * 0.55, padY = fs * 0.38;
    ctx.fillStyle = hexToRgba(st.bgColor, (st.bgOpacity != null ? st.bgOpacity : 45) / 100);
    roundRect(ctx, boxX - padX, baseY - fs - padY, maxW + padX * 2,
      (lines.length - 1) * lh + fs + padY * 2, st.bgRadius != null ? st.bgRadius : 10);
    ctx.fill();
  }

  lines.forEach((l, i) => {
    const y = baseY + i * lh;
    // Gölge
    if (st.shadow) {
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = Math.round(fs * 0.12);
      ctx.shadowOffsetX = 0; ctx.shadowOffsetY = Math.round(fs * 0.06);
    } else {
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    }
    // Kenarlık (outline)
    if (st.outlineWidth > 0) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = st.outlineWidth * (fs / 28);
      ctx.strokeStyle = st.outlineColor || '#000000';
      ctx.strokeText(l, anchorX, y);
    }
    // Dolgu (asıl metin)
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = st.color || '#ffffff';
    ctx.fillText(l, anchorX, y);
  });
  // Gölge state'ini temizle
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
}

export function drawWatermark(ctx, text, W, H) {
  const fs = Math.round(H * 0.028);
  ctx.font = '600 ' + fs + 'px Inter, "Segoe UI", sans-serif';
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(text, W - fs, fs * 1.6);
}


/* ============================================================
   SES SÜRESİ TABANLI SENKRONİZASYON
   Sahne başına bir ses dosyası. Süreler ölçülür, birleştirilir.
   Sahne geçişi ve altyazı sınırı = sesin bittiği an. Tahmin yok.
   ============================================================ */

/* Tek bir ses dosyasının süresini ölçer (çözmeden, hızlı) */
export function measureAudio(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); res(a.duration); };
    a.onerror = () => { URL.revokeObjectURL(url); rej(new Error('ses okunamadı')); };
    a.src = url;
  });
}

/*
  Sahne seslerini tek AudioBuffer'a diker.
  Dönüş: { buffer, durations, bounds }
    durations[i] = i. sahnenin ekranda kalacağı süre (ses + boşluk)
    bounds[i]    = i. sahnenin bitiş anı (kümülatif)
  Sesi olmayan sahneye fallbackDur saniye verilir.
*/
export async function buildVoiceTrack(actx, scenes, fallbackDur) {
  const fb = fallbackDur || 3;
  const decoded = [];
  for (const s of scenes) {
    if (s.voice?.blob) {
      try {
        decoded.push(await actx.decodeAudioData(await s.voice.blob.arrayBuffer()));
      } catch (e) { decoded.push(null); }
    } else decoded.push(null);
  }

  const sr = actx.sampleRate;
  const gapLen = Math.round(ENGINE.SCENE_GAP * sr);
  const channels = 2;
  const segLens = decoded.map(b => (b ? b.length + gapLen : Math.round(fb * sr)));
  const totalLen = segLens.reduce((a, b) => a + b, 0) + Math.round(ENGINE.VOICE_TAIL * sr);

  const out = actx.createBuffer(channels, Math.max(totalLen, sr), sr);
  let off = 0;
  const durations = [], bounds = [];
  let acc = 0;

  decoded.forEach((b, i) => {
    if (b) {
      for (let c = 0; c < channels; c++) {
        const src = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
        out.getChannelData(c).set(src, off);
      }
    }
    const d = segLens[i] / sr;
    durations.push(d);
    acc += d;
    bounds.push(acc);
    off += segLens[i];
  });

  return { buffer: out, durations, bounds, total: acc + ENGINE.VOICE_TAIL };
}

/* Altyazı hücreleri sesin sınırlarına birebir oturur */
export function cuesFromScenes(scenes, bounds) {
  const cues = [];
  scenes.forEach((s, i) => {
    const text = (s.subtitle || s.voiceText || s.paragraph || '').trim();
    if (!text) return;
    const start = i === 0 ? 0 : bounds[i - 1];
    const end = Math.max(start + 0.4, bounds[i] - ENGINE.SCENE_GAP * 0.5);
    // Uzun paragrafı ses süresi içinde kelime ağırlığına göre böl
    const chunks = chunkText(text);
    if (chunks.length <= 1) { cues.push({ start, end, text: chunks[0] || text }); return; }
    const span = end - start;
    const totalLen = chunks.reduce((a, c) => a + c.length, 0);
    let t = start;
    chunks.forEach(c => {
      const d = span * (c.length / totalLen);
      cues.push({ start: t, end: t + d - 0.04, text: c });
      t += d;
    });
  });
  return cues;
}

/* Storyboard → SRT / VTT (ses sınırlarıyla) */
export function srtFromCues(cues) {
  return cues.map((c, i) =>
    (i + 1) + '\n' + srtTime(c.start) + ' --> ' + srtTime(c.end) + '\n' + wrapTwoLines(c.text) + '\n'
  ).join('\n');
}
export function vttFromCues(cues) {
  return 'WEBVTT\n\n' + cues.map(c =>
    vttTime(c.start) + ' --> ' + vttTime(c.end) + '\n' + wrapTwoLines(c.text) + '\n'
  ).join('\n');
}

/* En boy oranına göre hedef tuval ölçüsü */
export function canvasSize(aspect, maxEdge) {
  const map = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5] };
  const [aw, ah] = map[aspect] || [16, 9];
  let W, H;
  if (aw >= ah) { W = maxEdge; H = Math.round(maxEdge * ah / aw); }
  else { H = maxEdge; W = Math.round(maxEdge * aw / ah); }
  W -= W % 2; H -= H % 2;
  return { W, H };
}

/* Sahne görsellerini hedef tuvale hazırlar (kolaj bölmeden bağımsız) */
export async function framesFromScenes(scenes, canvas, aspect, maxEdge) {
  const { W, H } = canvasSize(aspect, maxEdge);
  canvas.width = W; canvas.height = H;
  const m = 1 + ENGINE.PAN_RATIO * 2;
  const frames = [];
  for (const s of scenes) {
    const off = document.createElement('canvas');
    off.width = Math.round(W * m); off.height = Math.round(H * m);
    const ctx = off.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    if (s.image?.blob) {
      const bmp = await createImageBitmap(s.image.blob);
      const sc = Math.max(off.width / bmp.width, off.height / bmp.height);
      ctx.drawImage(bmp, (off.width - bmp.width * sc) / 2, (off.height - bmp.height * sc) / 2,
        bmp.width * sc, bmp.height * sc);
      bmp.close();
    } else {
      ctx.fillStyle = '#12131c';
      ctx.fillRect(0, 0, off.width, off.height);
      ctx.fillStyle = '#8e90a6';
      ctx.font = '600 ' + Math.round(H * 0.05) + 'px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sahne ' + s.scene + ' — görsel yok', off.width / 2, off.height / 2);
    }
    frames.push(off);
    await new Promise(r => setTimeout(r, 0));
  }
  return { frames, W, H };
}


/* ============================================================
   SCENE ENGINE — karışık görsel/video sahne render'ı
   Sahne 1 görsel, Sahne 2 video, Sahne 3 görsel… hepsi desteklenir.
   Zamanlama her durumda sesten gelir; ortam ona uyar.
   ============================================================ */

/* Video dosyasının süresini ölçer */
export function measureVideo(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); res(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); rej(new Error('video okunamadı')); };
    v.src = url;
  });
}

/*
  Sahneleri render'a hazırlar. İki tür kaynak döner:
    { kind: 'image', canvas }  → Ken Burns uygulanacak statik kare
    { kind: 'video', el }      → oynatılacak <video> elemanı
    { kind: 'blank', canvas }  → ortamı olmayan sahne için yer tutucu

  Video elemanları muted + playsInline: tarayıcı otomatik oynatmayı engellemesin.
  Sesleri kullanılmaz — ses hattı sahne voice dosyalarından kurulur.
*/
export async function prepareScenes(scenes, canvas, aspect, maxEdge) {
  const { W, H } = canvasSize(aspect, maxEdge);
  canvas.width = W; canvas.height = H;
  const m = 1 + ENGINE.PAN_RATIO * 2;
  const sources = [];

  for (const s of scenes) {
    if (s.media === 'video' && s.video?.blob) {
      const el = document.createElement('video');
      el.src = s.video.url || URL.createObjectURL(s.video.blob);
      el.muted = true;
      el.playsInline = true;
      el.preload = 'auto';
      await new Promise((res) => {
        if (el.readyState >= 2) return res();
        el.onloadeddata = () => res();
        el.onerror = () => res();
      });
      sources.push({ kind: 'video', el, duration: el.duration || 0 });
      continue;
    }

    const off = document.createElement('canvas');
    off.width = Math.round(W * m); off.height = Math.round(H * m);
    const ctx = off.getContext('2d');
    ctx.imageSmoothingQuality = 'high';

    if (s.image?.blob) {
      const bmp = await createImageBitmap(s.image.blob);
      const sc = Math.max(off.width / bmp.width, off.height / bmp.height);
      ctx.drawImage(bmp, (off.width - bmp.width * sc) / 2, (off.height - bmp.height * sc) / 2,
        bmp.width * sc, bmp.height * sc);
      bmp.close();
      sources.push({ kind: 'image', canvas: off });
    } else {
      ctx.fillStyle = '#12131c';
      ctx.fillRect(0, 0, off.width, off.height);
      ctx.fillStyle = '#8e90a6';
      ctx.font = '600 ' + Math.round(H * 0.05) + 'px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Scene ' + s.scene, off.width / 2, off.height / 2);
      sources.push({ kind: 'blank', canvas: off });
    }
    await new Promise(r => setTimeout(r, 0));
  }
  return { sources, W, H };
}

/* Video elemanını sahnenin penceresine oturtur.
   local = sahne başlangıcından geçen süre, dur = sahnenin ses süresi.
   - video sesten UZUNSA: ses bitince kesilir (fazlası oynatılmaz)
   - video sesten KISAYSA: fit='freeze' son kareyi dondurur, 'loop' baştan sarar */
function syncVideoEl(src, local, dur, fit) {
  const el = src.el;
  const vd = src.duration || el.duration || 0;
  if (!vd || !isFinite(vd)) return;

  let target;
  if (local >= vd) {
    if (fit === 'loop') target = local % vd;
    else target = Math.max(0, vd - 0.04);      // freeze: son karede kal
  } else {
    target = local;
  }

  // Küçük kaymaları düzelt; her karede seek etmek pahalı olur
  if (Math.abs(el.currentTime - target) > 0.25) {
    try { el.currentTime = target; } catch (e) {}
  }

  const shouldPlay = local < vd || fit === 'loop';
  if (shouldPlay && el.paused) el.play().catch(() => {});
  if (!shouldPlay && !el.paused) el.pause();
}

/* Bir kaynağı tuvale çizer. Görselde Ken Burns, videoda cover-fit. */
function paintSource(ctx, src, prog, W, H, motion, i) {
  if (src.kind === 'video') {
    const el = src.el;
    const vw = el.videoWidth || W, vh = el.videoHeight || H;
    const sc = Math.max(W / vw, H / vh);
    const dw = vw * sc, dh = vh * sc;
    try { ctx.drawImage(el, (W - dw) / 2, (H - dh) / 2, dw, dh); } catch (e) {}
    return;
  }
  /* Görsel ve boş kare mevcut Ken Burns yolundan geçer.
     drawScene bir dizi bekliyor; tek kareyi sarmalayıp indeksi koruyoruz
     ki zoom yönü (tek/çift sahne) bozulmasın. */
  drawScene(ctx, [src.canvas], 0, prog, W, H, motion || 'zoom', i);
}

/*
  Ana çizim döngüsü. drawFrameAt'in Scene Engine sürümü:
  görsel ve video sahnelerini bir arada kurgular.
  Dönüş: o an ekranda olan sahnenin indeksi.
*/
export function drawSceneAt(ctx, sources, bounds, durations, t, W, H, opts) {
  const o = opts || {};
  let i = bounds.findIndex(b => t < b);
  if (i < 0) i = sources.length - 1;

  const start = i === 0 ? 0 : bounds[i - 1];
  const dur = durations[i] || 1;
  const local = t - start;
  const prog = Math.min(1, Math.max(0, local / dur));

  if (sources[i]?.kind === 'video') syncVideoEl(sources[i], local, dur, o.videoFit || 'freeze');

  ctx.clearRect(0, 0, W, H);
  paintSource(ctx, sources[i], prog, W, H, o.motion, i);

  /* Geçiş: sonraki sahne son CROSSFADE saniyede üstte belirir */
  if (o.crossfade && i < sources.length - 1) {
    const left = dur - local;
    if (left < ENGINE.CROSSFADE) {
      const a = 1 - left / ENGINE.CROSSFADE;
      const nxt = sources[i + 1];
      if (nxt.kind === 'video') syncVideoEl(nxt, 0, durations[i + 1] || 1, o.videoFit || 'freeze');
      ctx.save();
      ctx.globalAlpha = a;
      paintSource(ctx, nxt, 0, W, H, o.motion, i + 1);
      ctx.restore();
    }
  }

  if (o.cues) drawCue(ctx, o.cues, t, W, H, o.subStyle);
  if (o.watermark) drawWatermark(ctx, o.watermark, W, H);
  return i;
}

/* Render bitince video elemanlarını durdur ve belleği bırak */
export function releaseScenes(sources) {
  (sources || []).forEach(s => {
    if (s.kind === 'video' && s.el) {
      try { s.el.pause(); s.el.removeAttribute('src'); s.el.load(); } catch (e) {}
    }
  });
}


/*
  TEK SAHNE RENDER
  Her sahne bağımsız olarak kendi ses+görsel/video karışımıyla kaydedilir.
  Final video bunların ffmpeg ile birleştirilmesinden oluşur (bkz. concatScenes).
  Kayıt gerçek zamanlıdır ama yalnızca o sahnenin süresi kadar sürer.
*/
export async function renderSingleScene(scene, opts) {
  const o = opts || {};
  const codec = pickMimeType();
  if (!codec) throw new Error('Bu tarayıcı video kaydını desteklemiyor.');

  const canvas = o.canvas || document.createElement('canvas');
  const { sources, W, H } = await prepareScenes([scene], canvas, o.aspect || '16:9', o.res || 1280);

  /* Altyazı özel bir font kullanıyorsa, canvas o fontla çizebilsin diye
     render başlamadan ÖNCE fontu belgeye yüklüyoruz. Yüklenmezse canvas
     sessizce varsayılan sans-serif'e düşerdi — kullanıcının seçtiği font
     render çıktısında görünmezdi. */
  if (o.cues && o.subStyle) { try { await ensureSubtitleFont(o.subStyle, H); } catch (e) {} }
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';

  const actx = new (window.AudioContext || window.webkitAudioContext)();
  const { buffer, durations, bounds, total } = await buildVoiceTrack(actx, [scene], o.fallback || 3);

  /* buildVoiceTrack tek sahne için çağrıldığında o sahneyi hem ilk hem son
     sahne sayar ve VOICE_TAIL payını sona ekler (total = durations[0] + VOICE_TAIL).
     Bu, tek sahne önizlemesi için doğru ama sahneler ffmpeg ile art arda
     birleştirileceğinde HER kesimde fazladan ~0.65sn donmaya yol açar.
     o.tail === false ise bu son payı kesip yalnızca durations[0]'da durur;
     final birleştirmede yalnızca gerçekten son sahne tail:true ile render edilir. */
  const stopAt = o.tail === false ? durations[0] : total;

  const fps = o.fps || 30;
  const vs = canvas.captureStream(fps);
  const dest = actx.createMediaStreamDestination();
  if (buffer) {
    const src = actx.createBufferSource();
    src.buffer = buffer; src.connect(dest); src.start();
  }
  dest.stream.getAudioTracks().forEach(t => vs.addTrack(t));

  /* codec.mime — önceki sürümde bütün {mime,ext} nesnesi MediaRecorder'a
     geçiyordu, bu da kaydı sessizce bozuyordu. Düzeltildi. */
  /* Bitrate çözünürlüğe göre ölçeklenir — 720p için 8Mbps yeterliyken,
     1080p için 16Mbps, 1440p+ için 24Mbps gerekir ki görsel detaylar korunsun.
     Kullanıcının yüklediği 2K görsel render'da da 2K kalitesinde kalmalı. */
  const autoBitrate = W >= 2160 ? 40e6 : W >= 1440 ? 24e6 : W >= 1080 ? 16e6 : 8e6;
  const rec = new MediaRecorder(vs, { mimeType: codec.mime, videoBitsPerSecond: o.bitrate || autoBitrate });
  const chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const done = new Promise(res => { rec.onstop = res; });
  rec.start(100);

  const t0 = performance.now();
  await new Promise(res => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      if (t >= stopAt) return res();
      drawSceneAt(ctx, sources, bounds, durations, t, W, H, {
        motion: o.motion, crossfade: false,
        cues: o.cues || null, subStyle: o.subStyle, watermark: o.watermark,
        videoFit: o.videoFit || 'freeze'
      });
      requestAnimationFrame(tick);
    };
    tick();
  });

  rec.stop();
  await done;
  releaseScenes(sources);
  actx.close().catch(() => {});
  return {
    blob: new Blob(chunks, { type: codec.mime.split(';')[0] }),
    duration: stopAt,
    mime: codec.mime.split(';')[0],
    ext: codec.ext
  };
}

/* ============================================================
   FFMPEG.WASM — sahne klipleri bu havuzda tek dosyada birleşir
   Tek iş parçacıklı çekirdek kullanılır: özel COOP/COEP başlığı
   gerekmez, next.config.js'e dokunmadan çalışır. Çekirdek dosyaları
   ilk çağrıda CDN'den indirilip tarayıcı belleğinde tutulur —
   bu yüzden yükleme yalnızca bir kez, ilk render'da olur.
   ============================================================ */

const FFMPEG_CORE = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';

let ffmpegSingleton = null;
let ffmpegLoadingPromise = null;

export async function getFFmpeg(onLog) {
  if (ffmpegSingleton) return ffmpegSingleton;
  if (ffmpegLoadingPromise) return ffmpegLoadingPromise;

  ffmpegLoadingPromise = (async () => {
    const ff = new FFmpeg();
    if (onLog) ff.on('log', ({ message }) => onLog(message));
    await ff.load({
      coreURL: await toBlobURL(FFMPEG_CORE + '/ffmpeg-core.js', 'text/javascript'),
      wasmURL: await toBlobURL(FFMPEG_CORE + '/ffmpeg-core.wasm', 'application/wasm')
    });
    ffmpegSingleton = ff;
    return ff;
  })();

  try {
    return await ffmpegLoadingPromise;
  } finally {
    ffmpegLoadingPromise = null;
  }
}

/* Yarıda kalan iş varsa çekirdeği sıfırlar — sıradaki çağrı yeniden yükler. */
export function terminateFFmpeg() {
  if (ffmpegSingleton) {
    try { ffmpegSingleton.terminate(); } catch (e) {}
    ffmpegSingleton = null;
  }
  ffmpegLoadingPromise = null;
}

/*
  Sahne kliplerini sırayla birleştirir.
    clips: [{ blob, duration, ext }]  — sahne sırasına göre
    opts.crossfade: true ise klipler arasına xfade/acrossfade geçişi eklenir
      (bağımsız render edilmiş klipler arasında gerçek geçiş yalnızca
      ffmpeg'in xfade filtresiyle mümkündür — canvas render'ı artık
      sahne başına izole olduğu için eski "aynı kayıtta blend" yöntemi
      kullanılamaz).
    opts.crossfadeDur: geçiş süresi (sn), varsayılan ENGINE.CROSSFADE
  Dönüş: birleşmiş mp4 Blob'u.
*/
export async function concatScenes(clips, opts) {
  const o = opts || {};
  if (!clips.length) throw new Error('Birleştirilecek sahne yok.');
  if (clips.length === 1) return clips[0].blob;

  const ffmpeg = await getFFmpeg();
  const stderr = [];
  const onFfLog = ({ message }) => {
    stderr.push(message);
    if (stderr.length > 200) stderr.shift();
    if (o.onLog) o.onLog('ffmpeg: ' + message);
  };
  ffmpeg.on('log', onFfLog);
  const log = (m) => { if (o.onLog) o.onLog(m); };
  const done = () => { try { ffmpeg.off && ffmpeg.off('log', onFfLog); } catch(e){} };

  const CF = (o.crossfade && clips.length > 1) ? (o.crossfadeDur || ENGINE.CROSSFADE) : 0;

  /* İki blob'u birleştirip yeni blob döndürür. Bellekte aynı anda en fazla 2 girdi + 1 çıktı. */
  async function mergePair(blobA, durA, blobB, durB, ext, label) {
    const nA = 'a_' + label + '.' + ext, nB = 'b_' + label + '.' + ext, nO = 'o_' + label + '.mp4';
    await ffmpeg.writeFile(nA, await fetchFile(blobA));
    await ffmpeg.writeFile(nB, await fetchFile(blobB));
    let ok = false;

    if (ext === 'mp4' && !CF) {
      const list = "file '" + nA + "'\nfile '" + nB + "'";
      await ffmpeg.writeFile('p.txt', new TextEncoder().encode(list));
      try { await ffmpeg.exec(['-f','concat','-safe','0','-i','p.txt','-c','copy',nO]); ok = true; }
      catch(e){ log('copy başarısız, re-encode'); }
      try { await ffmpeg.deleteFile('p.txt'); } catch(e){}
    }
    if (!ok && CF) {
      const off = Math.max(0, durA - CF);
      try {
        await ffmpeg.exec(['-i',nA,'-i',nB,'-filter_complex',
          '[0:v][1:v]xfade=transition=fade:duration='+CF.toFixed(3)+':offset='+off.toFixed(3)+'[v];[0:a][1:a]acrossfade=d='+CF.toFixed(3)+'[a]',
          '-map','[v]','-map','[a]','-c:v','libx264','-preset','ultrafast','-crf',String(o.crf||18),
          '-c:a','aac','-b:a','192k','-pix_fmt','yuv420p',nO]);
        ok = true;
      } catch(e){ log('xfade başarısız, düz concat'); }
    }
    if (!ok) {
      try {
        await ffmpeg.exec(['-i',nA,'-i',nB,'-filter_complex',
          '[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[ov][oa]','-map','[ov]','-map','[oa]',
          '-c:v','libx264','-preset','ultrafast','-crf',String(o.crf||18),
          '-c:a','aac','-b:a','192k','-pix_fmt','yuv420p',nO]);
        ok = true;
      } catch(e){ log('concat filter başarısız: '+e.message); }
    }
    try { await ffmpeg.deleteFile(nA); } catch(e){}
    try { await ffmpeg.deleteFile(nB); } catch(e){}
    if (!ok) { try { await ffmpeg.deleteFile(nO); } catch(e){} return null; }
    const data = await ffmpeg.readFile(nO);
    try { await ffmpeg.deleteFile(nO); } catch(e){}
    if (!data || data.byteLength === 0) return null;
    return new Blob([data], { type: 'video/mp4' });
  }

  let queue = clips.map(c => ({ blob: c.blob, dur: c.duration || 0, ext: c.ext || 'webm' }));
  let round = 0;
  log('ikili birleştirme: ' + queue.length + ' sahne');

  while (queue.length > 1) {
    round++;
    const next = [];
    log('tur ' + round + ': ' + queue.length + ' → ' + Math.ceil(queue.length / 2));
    for (let i = 0; i < queue.length; i += 2) {
      if (i + 1 >= queue.length) { next.push(queue[i]); continue; }
      const a = queue[i], b = queue[i + 1];
      log('  ' + fmtBytes(a.blob.size) + ' + ' + fmtBytes(b.blob.size));
      const merged = await mergePair(a.blob, a.dur, b.blob, b.dur, round === 1 ? a.ext : 'mp4', round + '_' + (i >> 1));
      if (!merged) {
        done();
        throw new Error('Birleştirme tur ' + round + ' başarısız.\nffmpeg:\n' + stderr.slice(-12).join('\n'));
      }
      next.push({ blob: merged, dur: a.dur + b.dur - (CF || 0), ext: 'mp4' });
    }
    queue = next;
  }
  done();
  log('çıktı: ' + fmtBytes(queue[0].blob.size));
  if (!queue[0].blob || queue[0].blob.size === 0) throw new Error('Birleştirme boş dosya üretti.');
  return queue[0].blob;
}


/* Byte'ı okunur biçime çevirir (log için). */
function fmtBytes(n) {
  if (!n) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

/*
  Birleşmiş videonun altına fon müziği ekler. Video akışı kopyalanır
  (yeniden kodlanmaz — hızlı), yalnızca ses miksajı yapılır.
  Müzik total süresi kadar döngüye alınır ve MUSIC_GAIN seviyesine
  fade-in/fade-out uygulanır.
*/
export async function mixMusic(videoBlob, musicFile, opts) {
  const o = opts || {};
  const ffmpeg = await getFFmpeg();

  const musicExt = (musicFile.name.split('.').pop() || 'mp3').toLowerCase();
  const musicName = 'music.' + musicExt;
  await ffmpeg.writeFile('in.mp4', await fetchFile(videoBlob));
  await ffmpeg.writeFile(musicName, await fetchFile(musicFile));

  const gain = o.gain ?? ENGINE.MUSIC_GAIN;
  const total = o.total || 0;
  const fade = Math.min(1.5, total / 4 || 1.5);
  const fadeOut = Math.max(0, total - fade);

  const filter =
    '[1:a]aloop=loop=-1:size=2e9,volume=' + gain +
    (total > fade * 2 ? ',afade=t=in:st=0:d=' + fade + ',afade=t=out:st=' + fadeOut.toFixed(2) + ':d=' + fade : '') +
    '[m];[0:a][m]amix=inputs=2:duration=first:dropout_transition=0[aout]';

  await ffmpeg.exec([
    '-i', 'in.mp4', '-i', musicName, '-filter_complex', filter,
    '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-shortest', 'out.mp4'
  ]);

  const data = await ffmpeg.readFile('out.mp4');
  for (const n of ['in.mp4', musicName, 'out.mp4']) { try { await ffmpeg.deleteFile(n); } catch (e) {} }
  if (!data || data.byteLength === 0) {
    throw new Error('Müzik miksajı boş bir dosya üretti. Müzik dosyasını kontrol edip tekrar dene.');
  }
  return new Blob([data], { type: 'video/mp4' });
}
