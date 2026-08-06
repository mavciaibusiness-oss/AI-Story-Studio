import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { creatorSummary, productivity, aiInsights, goalProgress,
         recentActivity, workspaceHealth, creditStatus,
         sectionOrder, WEEK_DAYS } from '@/lib/dashboard/summary';
import { projectSuggestions } from '@/lib/project/compare';
import { buildVersions } from '@/lib/project/versions';
import { emptyMemory } from '@/lib/creator/memory';
/* Creator Intelligence Adım 5: toplam istatistikler + çalışma
   alışkanlığı. "19 kanal" gibi ölçülemeyenler YOK. */
import { lifetimeStats, workHabit, headlineStat } from '@/lib/intel/stats';
/* Adım 6: hafıza sağlığı — marka güncelliği. Logo/CTA ölçülmüyor. */
import { memoryHealth } from '@/lib/intel/health';
import { activeProposals } from '@/lib/creator/manager';

export const dynamic = 'force-dynamic';

/*
  CREATOR DASHBOARD — API.

  Sprint 5 / TASK-06, Adım 2.

  TEK EYLEM: `load`. Dashboard bir bakışta her şeyi gösteriyor; yedi
  ayrı istek atmak gereksiz gecikme demek.

  ---------------------------------------------------------------
  HER KAYNAK AYRI TRY İÇİNDE

  Dashboard yedi farklı yerden besleniyor: episodes, creator_memory,
  scene_plans, story_rewrites, director_actions, profiles.

  Biri yoksa (migration uygulanmamış) ya da hata verirse ötekiler
  çalışmaya devam etmeli. Kullanıcı hafıza kapalı diye üretim
  sayılarını da kaybetmemeli.

  Eksik kaynaklar `unavailable` listesinde bildiriliyor — arayüz
  o bölümü "kapalı" gösterecek, boş göstermeyecek.
  ---------------------------------------------------------------

  KREDİ YOK: hepsi kural motoru, AI çağrısı yok.

  ATLANAN (kullanıcının kararı, Sprint-6):
    • Trend verisi — dış kaynak yok
    • Render/Storage kullanımı — ölçülmüyor
*/

const MAX_EPISODES = 200;
/* Etkinlik akışı için kaç sürüm okunur. Dashboard'da yalnızca son
   birkaçı gösterilecek; fazlası boşuna transfer. */
const MAX_VERSIONS = 30;

/* Oturumlar localStorage'da — istemci gönderiyor.
   Yalnızca id, title ve workflow okunuyor; kullanıcı metni değil. */
function safeSessions(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 50)
    .filter(s => s?.id && s?.workflow)
    .map(s => ({ id: s.id, title: s.title || '', episodeId: s.episodeId || null,
                 workflow: s.workflow, log: Array.isArray(s.log) ? s.log : [] }));
}

export async function POST(req) {
  try {
    const supabase = getSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'load');
    if (action !== 'load') {
      return NextResponse.json({
        error: 'unknown-action', actions: ['load']
      }, { status: 400 });
    }

    const unavailable = [];

    /* ---------- Bölümler ---------- */
    let episodes = [];
    try {
      const { data, error } = await supabase
        .from('episodes')
        .select('id, title, storyboard, status, created_at, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(MAX_EPISODES);
      if (error) throw error;
      episodes = data || [];
    } catch {
      unavailable.push('projects');
    }

    /* ---------- Profil / kredi ---------- */
    let profile = null;
    try {
      const { data } = await supabase.from('profiles')
        .select('plan, credits').eq('id', user.id).maybeSingle();
      profile = data || null;
    } catch {
      unavailable.push('credits');
    }

    /* ---------- Creator Memory (v10) ---------- */
    let memory = null;
    let memoryEnabled = true;
    try {
      const { data, error } = await supabase.from('creator_memory')
        .select('memory').eq('user_id', user.id).maybeSingle();
      if (error) throw error;
      memory = data?.memory || emptyMemory();
    } catch {
      /* Tablo yok — hafıza kapalı. Dashboard çalışmaya devam ediyor,
         hedefler ve hafıza öngörüleri görünmüyor. */
      memoryEnabled = false;
      unavailable.push('memory');
      memory = emptyMemory();
    }

    /* ---------- Sürümler (v7/v8/v9) ----------

       Etkinlik akışı için. Her tablo ayrı: biri yoksa ötekiler
       yine okunuyor. */
    const epIds = episodes.slice(0, 20).map(e => e.id);
    const titleOf = Object.fromEntries(episodes.map(e =>
      [e.id, (e.storyboard?.title || e.title || '').trim() || e.title]));

    let snaps = { scenePlans: [], rewrites: [], directorActions: [] };
    let versionsAvailable = false;

    if (epIds.length) {
      const tables = [
        ['scenePlans', 'scene_plans',
         'id, episode_id, created_at, scenes_before, scenes_after, splits, merges, snapshot'],
        ['rewrites', 'story_rewrites',
         'id, episode_id, created_at, score_before, score_after, scenes_touched, scenes_before, change_note'],
        ['directorActions', 'director_actions',
         'id, episode_id, created_at, rec_action, rec_kind, rec_scene, rec_title, confidence, status, snapshot']
      ];
      for (const [key, table, cols] of tables) {
        try {
          const { data, error } = await supabase.from(table).select(cols)
            .in('episode_id', epIds).eq('user_id', user.id)
            .order('created_at', { ascending: false }).limit(MAX_VERSIONS);
          if (error) throw error;
          snaps[key] = data || [];
          versionsAvailable = true;
        } catch { /* o migration yok — sessizce atla */ }
      }
    }
    if (!versionsAvailable) unavailable.push('versions');

    /* Sürümlere proje başlığı ekliyoruz — etkinlik akışında
       "hangi videoda" görünsün. Adım 1'de risk olarak not etmiştim. */
    const versions = buildVersions(snaps).map(v => {
      const row = snaps.scenePlans.find(r => r.id === v.rowId)
        || snaps.rewrites.find(r => r.id === v.rowId)
        || snaps.directorActions.find(r => r.id === v.rowId);
      return { ...v, projectTitle: row ? titleOf[row.episode_id] || null : null };
    });

    /* ---------- Sağlık raporları (v5) — üretim kalitesi ---------- */
    let healthByEpisode = {};
    try {
      const { data, error } = await supabase.from('video_health_reports')
        .select('episode_id, overall, created_at')
        .in('episode_id', epIds).eq('user_id', user.id)
        .order('created_at', { ascending: false })
        /* SINIR: her bölümün TÜM rapor geçmişini çekmeye gerek yok.
           Yalnızca en yenisini kullanıyoruz; 20 bölüm × birkaç rapor
           için 100 satır fazlasıyla yeter. */
        .limit(100);
      if (error) throw error;
      for (const r of (data || [])) {
        if (!healthByEpisode[r.episode_id]) healthByEpisode[r.episode_id] = r.overall;
      }
    } catch { /* v5 yok */ }

    /*
      ---------- Çalışma alışkanlığı ----------

      user_actions'tan okunuyor. v11 uygulanmamışsa sessizce
      atlanıyor — Dashboard'ın geri kalanı çalışmaya devam ediyor.

      Yalnızca zaman damgası çekiliyor; eylem türü bu hesap için
      gerekmiyor ve gereksiz veri taşımıyoruz.
    */
    let actionRows = [];
    try {
      const { data, error } = await supabase.from('user_actions')
        .select('created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      actionRows = data || [];
    } catch {
      unavailable.push('habits');
    }

    /* ---------- Hesapla ---------- */
    const sessions = safeSessions(body.sessions);
    const summary = creatorSummary({ episodes, sessions });
    const proposals = memoryEnabled ? activeProposals(memory) : [];
    const suggestions = projectSuggestions(episodes);

    const payload = {
      ok: true,
      summary,
      productivity: productivity({ episodes, days: body.days || WEEK_DAYS }),
      insights: aiInsights({
        projectSuggestions: suggestions,
        memoryProposals: proposals,
        memory, summary
      }),
      goals: goalProgress(memory),
      activity: recentActivity({ episodes, versions, limit: body.activityLimit }),
      health: workspaceHealth({ sessions, memoryEnabled, versionsAvailable }),
      credits: creditStatus(profile),
      /* Bölüm sırası — kişiye özel (spec: Dynamic Dashboard) */
      order: sectionOrder(memory, summary),

      /*
        TOPLAM ÜRETİM — "bugüne kadar".

        `productivity` haftalık sayıyor; bu tüm zamanlar. İkisi
        farklı sorular ve ikisi de gerçek.
      */
      lifetime: (() => {
        const st = lifetimeStats(episodes);
        return { ...st, headline: headlineStat(st) };
      })(),

      /* Çalışma alışkanlığı — yetersiz veride known:false */
      habits: workHabit(actionRows, episodes),

      /*
        Hafıza sağlığı — marka kaydı güncelliği.

        Marka yoksa `hasBrands:false` dönüyor ve arayüz bölümü hiç
        göstermiyor: "sağlıklı" demek yanıltıcı olurdu, söyleyecek
        bir şey yok demek.
      */
      memHealth: memoryHealth({
        brands: memory?.brands || [],
        episodes: episodes.map(e => ({ id: e.id, createdAt: e.created_at }))
      }),
      /*
        NEYİ GÖSTEREMİYORUZ — açıkça bildiriliyor.

        `unavailable`: migration eksik olduğu için kapalı bölümler.
        `notMeasured`: hiç ölçülmeyen boyutlar (Sprint-6).

        İkisi farklı: birincisi kullanıcının düzeltebileceği bir şey
        (migration çalıştır), ikincisi henüz var olmayan özellik.
      */
      unavailable,
      notMeasured: ['trends', 'render', 'storage'],
      /* Ortalama sağlık — yalnızca rapor varsa. Yoksa null;
         "0 puan" göstermek ölçülmemiş projeyi kötü göstermek olur. */
      avgHealth: (() => {
        const vals = Object.values(healthByEpisode).filter(v => typeof v === 'number');
        return vals.length
          ? { score: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length),
              measured: vals.length, total: episodes.length }
          : null;
      })()
    };

    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
