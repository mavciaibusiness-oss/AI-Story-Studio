'use client';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { emptyStoryboard } from '@/lib/storyboard';
import { intentByKey } from './intent';

/*
  CREATOR OS — otomatik bölüm oluşturma.

  Sprint 5 / TASK-01, Adım 5.

  Spec kuralı: "Kullanıcı önce proje oluşturmak zorunda bırakılmamalıdır.
  Proje gerekirse AI tarafından otomatik oluşturulmalıdır."

  Kullanıcı "korku videosu hazırla" dedi; ondan proje adı, format ve
  tür seçmesini beklemek Creator OS'un tüm fikrine aykırı. Bu dosya
  o adımları niyetten türetip bölümü sessizce açıyor.

  NİYETTEN TÜRETİLENLER:
    başlık  — kullanıcının cümlesinden
    tür     — niyetin genre boyutundan (korku → Korku)
    format  — platform değiştiricisinden (shorts → 9:16)

  Türetemediğimiz şeyi UYDURMUYORUZ: dil kullanıcının ayarından,
  yoksa Türkçe. Stil boş bırakılıyor — kullanıcı isterse doldurur.
*/

/* Niyet → mevcut GENRES değerleri (lib/storyboard.js).
   Uydurma değer yazmıyoruz; test listeyle karşılaştırıyor. */
const INTENT_GENRE = {
  'video.horror':      'Korku',
  'video.kids':        'Çocuk',
  'video.documentary': 'Belgesel',
  'video.story':       'Masal',
  'ad.product':        'Motivasyon',
  'ad.etsy':           'Motivasyon',
  'ad.shopify':        'Motivasyon'
};

/* Platform → mevcut FORMATS değerleri */
const PLATFORM_FORMAT = {
  'video.youtube': 'youtube',
  'video.shorts':  'shorts',
  'video.tiktok':  'tiktok',
  'video.reels':   'reels'
};

/* Kullanıcının cümlesinden başlık. Cümle uzunsa kırpılıyor; niyet
   etiketi eklemiyoruz çünkü kullanıcının kendi sözü daha tanıdık. */
function titleFrom(input) {
  const clean = String(input || '').replace(/\s+/g, ' ').trim();
  if (!clean) return 'Video ' + String(Date.now()).slice(-4);
  if (clean.length <= 60) return clean;
  return clean.slice(0, 57).trimEnd() + '…';
}

export function deriveStoryboardFields(session, profile) {
  const intent = session?.intent;
  const platform = session?.modifiers?.platform;

  return {
    title: titleFrom(session?.input),
    genre: INTENT_GENRE[intent] || 'Macera',
    format: PLATFORM_FORMAT[platform] || PLATFORM_FORMAT[intent] || 'youtube',
    language: profile?.settings?.prodLang || 'Türkçe'
  };
}

/*
  Oturum için bölüm oluştur.

  Mevcut proje varsa onu kullanır, yoksa açar — DashboardView'daki
  startPath ile aynı desen. Kullanıcıya proje sorulmuyor.

  Dönüş: { episode, error }
*/
export async function ensureEpisodeForSession(session, profile) {
  try {
    const supabase = getSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { episode: null, error: 'no-session' };

    /* Proje: en son kullanılan ya da yeni */
    let projectId;
    const { data: existing } = await supabase.from('projects')
      .select('id').eq('user_id', user.id).eq('archived', false)
      .order('created_at', { ascending: false }).limit(1);

    if (existing?.length) {
      projectId = existing[0].id;
    } else {
      const { data: proj, error: pErr } = await supabase.from('projects')
        .insert({ user_id: user.id, name: 'Projelerim' }).select().single();
      if (pErr) return { episode: null, error: pErr.message };
      projectId = proj.id;
    }

    const fields = deriveStoryboardFields(session, profile);
    const sb = emptyStoryboard({
      title: fields.title,
      language: fields.language
    });
    sb.genre = fields.genre;
    sb.format = fields.format;
    /* Creator OS izi: bu bölüm bir oturumdan doğdu. İleride
       (TASK-04 Creator Memory) hangi cümleden çıktığı sorulabilir. */
    sb.scratch = {
      ...sb.scratch,
      mode: 'creator-os',
      creatorInput: session?.input || '',
      creatorIntent: session?.intent || null,
      creatorSessionId: session?.id || null
    };

    const { data: ep, error: eErr } = await supabase.from('episodes').insert({
      project_id: projectId, user_id: user.id,
      title: fields.title, storyboard: sb
    }).select().single();

    if (eErr) return { episode: null, error: eErr.message };
    return { episode: ep, error: null };
  } catch (e) {
    return { episode: null, error: String(e?.message || e) };
  }
}

/* Niyet etiketini dile göre ver — arayüz kısayolu. */
export function intentLabel(intentKey, locale) {
  const d = intentByKey(intentKey);
  if (!d) return null;
  return d.label[locale] || d.label.tr;
}
