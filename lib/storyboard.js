/*
  TEK VERİ MODELİ — Storyboard
  Uygulamanın omurgası. Senaryo, prompt, görsel, video, ses, altyazı ve final
  kurgu aynı nesne üzerinde çalışır. Bir modülde yapılan değişiklik diğerlerine
  otomatik yansır.

  Project (episodes tablosundaki satır)
   └── storyboard
        ├── title, description, language, genre, format, duration, aspect, style
        └── scenes[]
             ├── scene, paragraph
             ├── imagePrompt, videoPrompt, negativePrompt
             ├── stylePrompt, cameraPrompt, motionPrompt, lightingPrompt
             ├── voiceText, subtitle
             └── (bellekte) image, video, voice, voiceDuration
*/

export const FORMATS = [
  { k: 'youtube', l: 'YouTube Video', aspect: '16:9' },
  { k: 'shorts', l: 'YouTube Shorts', aspect: '9:16' },
  { k: 'tiktok', l: 'TikTok', aspect: '9:16' },
  { k: 'reels', l: 'Instagram Reels', aspect: '9:16' },
  { k: 'documentary', l: 'Belgesel', aspect: '16:9' },
  { k: 'podcast', l: 'Podcast Klip', aspect: '1:1' },
  { k: 'custom', l: 'Serbest', aspect: '16:9' }
];

export const GENRES = [
  'Macera', 'Korku', 'Bilim Kurgu', 'Fantastik', 'Gerilim', 'Belgesel',
  'Motivasyon', 'Tarih', 'Mitoloji', 'Komedi', 'Anime', 'Romantik', 'Dram',
  'Çocuk', 'Masal', 'Dedektif', 'Suç', 'Cyberpunk', 'Uzay', 'YouTube Video',
  'TikTok', 'Instagram Reel', 'Podcast', 'Eğitim', 'Yapay Zekâ', 'Teknoloji',
  'Finans', 'İş Dünyası', 'Hayvanlar', 'Gezi', 'Sağlık', 'Müzik',
  'Film Özeti', 'Kitap Özeti', 'Haber', 'Gizem', 'Spor', 'Yemek'
];

export const DURATIONS = [
  { l: '30 saniye', sec: 30 }, { l: '45 saniye', sec: 45 },
  { l: '1 dakika', sec: 60 }, { l: '2 dakika', sec: 120 },
  { l: '3 dakika', sec: 180 }, { l: '5 dakika', sec: 300 },
  { l: '10 dakika', sec: 600 }, { l: '15 dakika', sec: 900 },
  { l: '20 dakika', sec: 1200 }, { l: '30 dakika', sec: 1800 },
  { l: '45 dakika', sec: 2700 }, { l: '60 dakika', sec: 3600 }
];

export const STYLES = [
  'Sinematik gerçekçi', '3D animasyon', 'Pixar tarzı', 'Disney tarzı', 'Anime',
  'Cyberpunk', 'Suluboya', 'Yağlı boya', 'Düz illüstrasyon', 'Kâğıt kesme',
  'Piksel sanat', 'Noir', 'Belgesel fotoğraf', 'Retro 80ler', 'Fantastik konsept',
  'Kara kalem', 'Vektör', 'Claymation'
];

export const CHARACTER_TYPES = [
  'İnsan', 'Robot', 'Hayvan', 'Anime', 'Canavar', 'Uzaylı', 'Çocuk', 'Yaşlı',
  'Süper kahraman', 'Fantastik varlık', 'Cyberpunk', 'Hayalet', 'Tarihî figür',
  'Anlatıcı', 'Diğer'
];

export const CHARACTER_LOOKS = [
  'Gerçekçi', '3D', 'Pixar', 'Disney', 'Anime', 'Cyberpunk', 'Sinematik',
  'İllüstrasyon', 'Piksel', 'Kara kalem'
];

export const LANGUAGES = [
  'Türkçe', 'İngilizce', 'İspanyolca', 'Almanca', 'Fransızca', 'Arapça',
  'Japonca', 'Korece', 'Çince', 'Rusça', 'İtalyanca', 'Portekizce'
];

export const ASPECTS = [
  { k: '16:9', l: 'Yatay 16:9', w: 1920, h: 1080 },
  { k: '9:16', l: 'Dikey 9:16', w: 1080, h: 1920 },
  { k: '1:1', l: 'Kare 1:1', w: 1080, h: 1080 },
  { k: '4:5', l: 'Dikey 4:5', w: 1080, h: 1350 }
];

export const PROMPT_KEYS = [
  { k: 'imagePrompt', l: 'Image Prompt' },
  { k: 'videoPrompt', l: 'Video Prompt' },
  { k: 'negativePrompt', l: 'Negative Prompt' },
  { k: 'stylePrompt', l: 'Style Prompt' },
  { k: 'cameraPrompt', l: 'Camera Prompt' },
  { k: 'motionPrompt', l: 'Motion Prompt' },
  { k: 'lightingPrompt', l: 'Lighting Prompt' }
];

export function emptyScene(n) {
  return {
    scene: n,
    media: 'image',      // 'image' | 'video' — sahne bağımsız, karışık olabilir
    paragraph: '',
    imagePrompt: '',
    videoPrompt: '',
    negativePrompt: '',
    stylePrompt: '',
    cameraPrompt: '',
    motionPrompt: '',
    lightingPrompt: '',
    voiceText: '',
    subtitle: ''
  };
}

export function emptyStoryboard(patch) {
  return {
    version: 2,
    title: '',
    description: '',
    language: 'Türkçe',
    genre: 'Macera',
    format: 'youtube',
    aspect: '16:9',
    style: 'Sinematik gerçekçi',
    duration: 180,
    videoFit: 'freeze',  // video sahnesi sesinden kısaysa: 'freeze' | 'loop'
    /* Senaryo sayfasındaki taslak alanları — henüz sahnelere dönüşmemiş
       yazılmakta olan metinler. Buraya konulmasının tek sebebi kalıcılık:
       sayfadan ayrılınca ya da sayfa yenilenince kaybolmasınlar diye
       storyboard'ın kendisiyle birlikte otomatik kaydediliyorlar. */
    scratch: { idea: '', tone: '', paste: '' },
    /* Sihirbaz adım işaretleri — veriye bakılarak çıkarılamayan (isteğe bağlı
       veya çıktı) adımların tamamlandı durumunu kalıcı tutar. */
    wizard: {},
    scenes: [],
    ...(patch || {})
  };
}

/* Eski kayıtları ve eksik alanları güvenle tamamlar */
export function normalize(sb) {
  const base = emptyStoryboard();
  if (!sb || typeof sb !== 'object' || Array.isArray(sb)) return base;
  const out = { ...base, ...sb };
  out.scratch = { ...base.scratch, ...(sb.scratch || {}) };
  out.wizard = { ...(sb.wizard || {}) };
  out.scenes = Array.isArray(sb.scenes) ? sb.scenes.map((s, i) => ({
    ...emptyScene(i + 1),
    ...s,
    scene: i + 1,
    media: s.media === 'video' ? 'video' : 'image',
    voiceText: s.voiceText || s.paragraph || '',
    subtitle: s.subtitle || s.voiceText || s.paragraph || ''
  })) : [];
  return out;
}

export function renumber(scenes) {
  return scenes.map((s, i) => ({ ...s, scene: i + 1 }));
}

/* Kaydedilebilir hali — bellekteki blob'lar DB'ye gitmez */
export function serializable(sb) {
  return {
    ...sb,
    scenes: (sb.scenes || []).map(
      ({ image, video, voice, voiceDuration, videoDuration, dirty, ...rest }) => rest
    )
  };
}

/* Sahnenin bağlı ortamı var mı — media alanına göre bakar */
export function sceneHasMedia(s) {
  return s.media === 'video' ? !!s.video : !!s.image;
}

/* Scene Engine özeti: karışık kullanımı raporlar */
export function mediaBreakdown(sb) {
  const scenes = sb.scenes || [];
  return {
    imageScenes: scenes.filter(s => s.media === 'image').length,
    videoScenes: scenes.filter(s => s.media === 'video').length,
    withImage: scenes.filter(s => s.media === 'image' && s.image).length,
    withVideo: scenes.filter(s => s.media === 'video' && s.video).length,
    filled: scenes.filter(sceneHasMedia).length
  };
}

/* Hedef süreye göre önerilen sahne sayısı: ~2.2 sn/sahne değil, konuşma temposuna göre */
export function suggestSceneCount(seconds) {
  if (seconds <= 45) return Math.max(3, Math.round(seconds / 5));
  if (seconds <= 180) return Math.round(seconds / 7);
  if (seconds <= 900) return Math.round(seconds / 9);
  return Math.min(120, Math.round(seconds / 12));
}

/* Bir sahnenin tüm prompt parçalarını tek satıra toplar (kopyalama için) */
export function flattenPrompt(scene, kind) {
  const parts = [];
  if (kind === 'video') parts.push(scene.videoPrompt || scene.imagePrompt);
  else parts.push(scene.imagePrompt);
  if (scene.stylePrompt) parts.push(scene.stylePrompt);
  if (scene.lightingPrompt) parts.push(scene.lightingPrompt);
  if (scene.cameraPrompt) parts.push(scene.cameraPrompt);
  if (kind === 'video' && scene.motionPrompt) parts.push(scene.motionPrompt);
  const main = parts.filter(Boolean).join(', ');
  return scene.negativePrompt ? main + '\nNegative: ' + scene.negativePrompt : main;
}

export function progressOf(sb) {
  const n = sb.scenes?.length || 0;
  if (!n) return { scenes: 0, prompts: 0, images: 0, voices: 0, pct: 0 };
  const prompts = sb.scenes.filter(s => s.imagePrompt).length;
  const images = sb.scenes.filter(sceneHasMedia).length;
  const voices = sb.scenes.filter(s => s.voice).length;
  const pct = Math.round(((prompts + images + voices) / (n * 3)) * 100);
  return { scenes: n, prompts, images, voices, pct };
}
