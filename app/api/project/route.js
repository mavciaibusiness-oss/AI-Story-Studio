import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { projectSummary, projectTimeline, findUnfinished,
         statusCounts, deriveStatus, STATUS_KEYS } from '@/lib/project/model';
import { compareProjects, projectSuggestions } from '@/lib/project/compare';
import { buildVersions, restorePreview, applyRestore,
         versionSummary } from '@/lib/project/versions';

export const dynamic = 'force-dynamic';

/*
  SMART PROJECT MANAGER — API.

  Sprint 5 / TASK-05, Adım 3.

  Eylemler:
    list       — projeler + durum dağılımı + yarım kalanlar
    detail     — tek proje: özet, zaman çizelgesi, sürümler
    versions   — sürüm listesi (üç snapshot tablosundan)
    preview    — geri alma önizlemesi (NE KAYBOLACAK)
    restore    — geri almayı uygula
    compare    — iki proje karşılaştırması
    suggest    — AI proje önerileri
    setStatus  — elle durum işaretleme

  ---------------------------------------------------------------
  MIGRATION YOK

  Üç snapshot tablosu (v7/v8/v9) zaten var. Bu rota onları OKUYOR.
  Tablolar uygulanmamışsa sessizce atlanıyor — sürüm listesi boş
  döner ama proje yönetimi çalışmaya devam eder.
  ---------------------------------------------------------------

  KREDİ YOK: hepsi kural motoru, AI çağrısı yok.
*/

/* Kaç proje okunur. Çok üretken kullanıcıda tüm geçmişi çekmek
   gereksiz; liste zaten sayfalanacak (arayüz Adım 4). */
const MAX_EPISODES = 200;
/* Sürüm listesi sınırı — Adım 2'de risk olarak not etmiştim. */
const MAX_VERSIONS = 60;

/* Sahibi doğrula. RLS zaten koruyor ama açık kontrol daha net hata
   veriyor ve niyeti okunur kılıyor. */
async function loadEpisode(supabase, userId, episodeId) {
  const { data, error } = await supabase
    .from('episodes')
    .select('id, project_id, user_id, title, storyboard, status, created_at, updated_at')
    .eq('id', episodeId).maybeSingle();

  if (error) return { error: error.message, status: 500 };
  if (!data) return { error: 'Bölüm bulunamadı.', status: 404 };
  if (data.user_id !== userId) return { error: 'Bu bölüm sana ait değil.', status: 403 };
  return { episode: data };
}

/*
  Snapshot tablolarını oku.

  Her biri ayrı try içinde: migration uygulanmamışsa o kaynak
  atlanıyor, ötekiler çalışmaya devam ediyor. TASK-03'te kurduğum
  aynı yaklaşım.
*/
async function loadSnapshots(supabase, userId, episodeId) {
  const out = { scenePlans: [], rewrites: [], directorActions: [] };

  try {
    const { data, error } = await supabase.from('scene_plans')
      .select('id, created_at, scenes_before, scenes_after, splits, merges, snapshot')
      .eq('episode_id', episodeId).eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(MAX_VERSIONS);
    if (!error && data) out.scenePlans = data;
  } catch { /* v7 yok */ }

  try {
    const { data, error } = await supabase.from('story_rewrites')
      .select('id, created_at, score_before, score_after, scenes_touched, scenes_before, change_note')
      .eq('episode_id', episodeId).eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(MAX_VERSIONS);
    if (!error && data) out.rewrites = data;
  } catch { /* v8 yok */ }

  try {
    const { data, error } = await supabase.from('director_actions')
      .select('id, created_at, rec_action, rec_kind, rec_scene, rec_title, confidence, status, snapshot')
      .eq('episode_id', episodeId).eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(MAX_VERSIONS);
    if (!error && data) out.directorActions = data;
  } catch { /* v9 yok */ }

  return out;
}

/* Sağlık raporu — karşılaştırma için. Tablo yoksa null. */
async function loadHealth(supabase, userId, episodeIds) {
  const out = {};
  try {
    const { data, error } = await supabase.from('video_health_reports')
      .select('episode_id, overall, created_at')
      .in('episode_id', episodeIds).eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (!error && data) {
      /* En yeni rapor geçerli — eskiler atlanıyor */
      for (const r of data) {
        if (!out[r.episode_id]) out[r.episode_id] = { health: { overall: r.overall } };
      }
    }
  } catch { /* v5 yok */ }
  return out;
}

export async function POST(req) {
  try {
    const supabase = getSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'list');

    switch (action) {
      /* ---------- LİSTE ---------- */
      case 'list': {
        const { data: eps, error } = await supabase
          .from('episodes')
          .select('id, project_id, title, storyboard, status, created_at, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(MAX_EPISODES);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const list = (eps || []).map(projectSummary);
        return NextResponse.json({
          ok: true,
          projects: list,
          statuses: statusCounts(eps || []),
          unfinished: findUnfinished(eps || []),
          suggestions: projectSuggestions(eps || [])
        });
      }

      /* ---------- TEK PROJE ---------- */
      case 'detail': {
        const loaded = await loadEpisode(supabase, user.id, String(body.episodeId || ''));
        if (loaded.error) {
          return NextResponse.json({ error: loaded.error }, { status: loaded.status });
        }
        const snaps = await loadSnapshots(supabase, user.id, loaded.episode.id);
        const versions = buildVersions(snaps);

        return NextResponse.json({
          ok: true,
          project: projectSummary(loaded.episode),
          timeline: projectTimeline(loaded.episode, body.session || null),
          versions,
          versionSummary: versionSummary(versions)
        });
      }

      /* ---------- SÜRÜMLER ---------- */
      case 'versions': {
        const loaded = await loadEpisode(supabase, user.id, String(body.episodeId || ''));
        if (loaded.error) {
          return NextResponse.json({ error: loaded.error }, { status: loaded.status });
        }
        const snaps = await loadSnapshots(supabase, user.id, loaded.episode.id);
        const versions = buildVersions(snaps);
        return NextResponse.json({
          ok: true, versions, summary: versionSummary(versions)
        });
      }

      /* ---------- GERİ ALMA ÖNİZLEMESİ ----------

         Kullanıcı NE KAYBEDECEĞİNİ görmeden geri alma yapılmıyor.
         `restore` eylemi bu önizlemeyi tekrar hesaplıyor ve
         onaylanmamışsa reddediyor. */
      case 'preview': {
        const loaded = await loadEpisode(supabase, user.id, String(body.episodeId || ''));
        if (loaded.error) {
          return NextResponse.json({ error: loaded.error }, { status: loaded.status });
        }
        const snaps = await loadSnapshots(supabase, user.id, loaded.episode.id);
        const versions = buildVersions(snaps);
        const version = versions.find(v => v.id === String(body.versionId || ''));
        if (!version) {
          return NextResponse.json({ error: 'version-not-found' }, { status: 404 });
        }

        const snapshot = pickSnapshot(version, snaps);
        const scenes = loaded.episode.storyboard?.scenes || [];
        return NextResponse.json({
          ok: true, version,
          preview: restorePreview(version, snapshot, scenes)
        });
      }

      /* ---------- GERİ ALMAYI UYGULA ---------- */
      case 'restore': {
        /*
          AÇIK ONAY ŞART.

          İş kaybı olan bir geri almayı tek tıkla yapmak kabul
          edilemez. İstemci `confirmed: true` göndermek zorunda ve
          bunu ancak önizlemeyi gösterdikten sonra yapmalı.

          Sunucu önizlemeyi YENİDEN hesaplıyor: istemcinin
          gönderdiği kayıp listesine güvenmiyoruz.
        */
        const loaded = await loadEpisode(supabase, user.id, String(body.episodeId || ''));
        if (loaded.error) {
          return NextResponse.json({ error: loaded.error }, { status: loaded.status });
        }
        const snaps = await loadSnapshots(supabase, user.id, loaded.episode.id);
        const versions = buildVersions(snaps);
        const version = versions.find(v => v.id === String(body.versionId || ''));
        if (!version) {
          return NextResponse.json({ error: 'version-not-found' }, { status: 404 });
        }
        if (!version.canRestore) {
          return NextResponse.json({ error: 'not-restorable' }, { status: 400 });
        }

        const snapshot = pickSnapshot(version, snaps);
        const sb = loaded.episode.storyboard || {};
        const scenes = sb.scenes || [];
        const preview = restorePreview(version, snapshot, scenes);

        if (!preview.ok) {
          return NextResponse.json({ error: preview.reason }, { status: 400 });
        }
        /* İş kaybı varsa onay şart */
        if (preview.warning && !body.confirmed) {
          return NextResponse.json({
            ok: false, needsConfirm: true, preview
          }, { status: 409 });
        }

        const nextScenes = applyRestore(scenes, version, snapshot);
        const nextSb = { ...sb, scenes: nextScenes };

        const { error: upErr } = await supabase.from('episodes')
          .update({ storyboard: nextSb, updated_at: new Date().toISOString() })
          .eq('id', loaded.episode.id).eq('user_id', user.id);

        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

        return NextResponse.json({
          ok: true,
          restored: { versionId: version.id, kind: version.kind },
          /* İstemci storyboard'u yeniden yüklemesin diye dönüyoruz —
             TASK-05'te (Sprint-4) otomatik kayıt yarışını böyle
             önlemiştik. */
          storyboard: nextSb,
          lost: preview.lost
        });
      }

      /* ---------- KARŞILAŞTIRMA ---------- */
      case 'compare': {
        const idA = String(body.a || ''), idB = String(body.b || '');
        if (!idA || !idB) {
          return NextResponse.json({ error: 'two-ids-required' }, { status: 400 });
        }
        const a = await loadEpisode(supabase, user.id, idA);
        if (a.error) return NextResponse.json({ error: a.error }, { status: a.status });
        const b = await loadEpisode(supabase, user.id, idB);
        if (b.error) return NextResponse.json({ error: b.error }, { status: b.status });

        const extras = await loadHealth(supabase, user.id, [idA, idB]);
        return NextResponse.json({
          ok: true, ...compareProjects(a.episode, b.episode, extras)
        });
      }

      /* ---------- ÖNERİLER ---------- */
      case 'suggest': {
        const { data: eps } = await supabase
          .from('episodes')
          .select('id, title, storyboard, status, created_at, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(MAX_EPISODES);
        return NextResponse.json({
          ok: true, suggestions: projectSuggestions(eps || [], { limit: body.limit })
        });
      }

      /* ---------- ELLE DURUM ----------

         Yalnızca türetilemeyen durumlar elle işaretlenebilir.
         "editing" gibi türetilen bir durumu elle yazmak, türetmeyle
         çelişir ve hangisinin doğru olduğu belirsizleşir. */
      case 'setStatus': {
        const value = String(body.status || '');
        const MANUAL = ['archived', 'published', 'paused', 'failed'];
        if (!MANUAL.includes(value) && value !== '') {
          return NextResponse.json({
            error: 'not-manual-status', allowed: MANUAL
          }, { status: 400 });
        }
        const loaded = await loadEpisode(supabase, user.id, String(body.episodeId || ''));
        if (loaded.error) {
          return NextResponse.json({ error: loaded.error }, { status: loaded.status });
        }

        /* Mevcut status alanını KORUYORUZ — hikâye sayfası oraya
           {story:true} yazıyor, ezmek onu bozar. */
        const nextStatus = { ...(loaded.episode.status || {}) };
        if (value) nextStatus.manual = value;
        else delete nextStatus.manual;

        const { error: upErr } = await supabase.from('episodes')
          .update({ status: nextStatus, updated_at: new Date().toISOString() })
          .eq('id', loaded.episode.id).eq('user_id', user.id);

        if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

        return NextResponse.json({
          ok: true,
          status: deriveStatus({ ...loaded.episode, status: nextStatus })
        });
      }

      default:
        return NextResponse.json({
          error: 'unknown-action',
          actions: ['list', 'detail', 'versions', 'preview', 'restore',
                    'compare', 'suggest', 'setStatus'],
          statuses: STATUS_KEYS
        }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

/* Sürüm kaydına karşılık gelen snapshot verisini bul.

   Her kaynağın snapshot alanı farklı: v7/v9 `snapshot`, v8
   `scenes_before`. Sürüm listesi bu farkı gizliyor, burada tekrar
   çözüyoruz. */
function pickSnapshot(version, snaps) {
  if (version.kind === 'scene-plan') {
    return snaps.scenePlans.find(r => r.id === version.rowId)?.snapshot ?? null;
  }
  if (version.kind === 'rewrite') {
    return snaps.rewrites.find(r => r.id === version.rowId)?.scenes_before ?? null;
  }
  return snaps.directorActions.find(r => r.id === version.rowId)?.snapshot ?? null;
}
