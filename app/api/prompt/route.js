import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { analyzePrompt, analyzeStoryboardPrompts } from '@/lib/prompt/analyze';
import { rewritePrompt } from '@/lib/prompt/rewrite';

export const dynamic = 'force-dynamic';

/*
  POST /api/prompt

  action: 'analyze'
    { episodeId, sceneIndex?, style?, generator? }
    Kural analizi. ÜCRETSİZDİR, kredi harcamaz, AI çağırmaz.
    sceneIndex verilirse tek sahne, verilmezse tüm storyboard.

  action: 'rewrite'
    { episodeId, sceneIndex, style?, generator? }
    AI ile yeniden yazım. Kredi harcar.
    Yeni promptu YİNE kural motoruna sokup before/after döner —
    "after" puanı AI'nin iddiası değil, bağımsız ölçüm.
    Sonucu KAYDETMEZ; kullanıcı arayüzde görüp onaylayınca
    storyboard'a kendisi uygular (mevcut kayıt akışıyla).

  GÜVENLİK
    Oturum zorunlu. Bölüm sahipliği ayrıca kontrol edilir (RLS'e ek).

  KREDİ
    Yalnızca rewrite ücretlidir. VIP atlanır (Sprint-3 kararıyla uyumlu).
*/

const REWRITE_COST = 6;

/* Bölümü çek ve sahipliği doğrula — iki eylemde de gerekiyor. */
async function loadEpisode(supabase, episodeId, userId) {
  const { data: ep, error } = await supabase
    .from('episodes')
    .select('id, title, storyboard, user_id')
    .eq('id', episodeId)
    .single();
  if (error || !ep) return { error: 'Bölüm bulunamadı.', status: 404 };
  if (ep.user_id !== userId) return { error: 'Bu bölüm sana ait değil.', status: 403 };
  return { ep };
}

/* Storyboard'dan bir sahneye kadar birikmiş karakter ipuçlarını topla.
   Yeniden yazımda sürekliliği korumak için AI'ye veriyoruz. */
function charsBefore(sb, index, ctx) {
  if (!index || index < 1) return {};
  const partial = { scenes: (sb.scenes || []).slice(0, index) };
  const rep = analyzeStoryboardPrompts(partial, ctx);
  const acc = {};
  for (const item of rep.perScene) {
    for (const [k, v] of Object.entries(item.report.characterHints || {})) {
      acc[k] = acc[k] || [];
      for (const c of v) if (!acc[k].includes(c)) acc[k].push(c);
    }
  }
  return acc;
}

export async function POST(req) {
  try {
    const supabase = getSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'analyze';
    const episodeId = String(body.episodeId || '');
    if (!episodeId) {
      return NextResponse.json({ error: 'episodeId gerekli.' }, { status: 400 });
    }

    const loaded = await loadEpisode(supabase, episodeId, user.id);
    if (loaded.error) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }

    const sb = loaded.ep.storyboard || {};
    const scenes = Array.isArray(sb.scenes) ? sb.scenes : [];
    if (!scenes.length) {
      return NextResponse.json({
        error: 'Analiz için sahne yok. Önce senaryoyu sahnelere böl.'
      }, { status: 400 });
    }

    // Ortak bağlam: stil kilidi ve hedef üretici
    const ctx = {
      style: body.style || sb.style || null,
      generator: body.generator || sb.generator || null
    };

    /* ---------- ANALİZ (ücretsiz) ---------- */
    if (action === 'analyze') {
      const idx = Number.isInteger(body.sceneIndex) ? body.sceneIndex : null;

      if (idx !== null) {
        if (idx < 0 || idx >= scenes.length) {
          return NextResponse.json({ error: 'Geçersiz sahne sırası.' }, { status: 400 });
        }
        const report = analyzePrompt(scenes[idx], {
          ...ctx,
          kind: scenes[idx].media === 'video' ? 'video' : 'image',
          sceneIndex: idx,
          previousChars: charsBefore(sb, idx, ctx)
        });
        return NextResponse.json({ scene: idx + 1, report });
      }

      const all = analyzeStoryboardPrompts(sb, ctx);
      return NextResponse.json({ result: all });
    }

    /* ---------- YENİDEN YAZIM (kredili) ---------- */
    if (action === 'rewrite') {
      const idx = Number.isInteger(body.sceneIndex) ? body.sceneIndex : null;
      if (idx === null || idx < 0 || idx >= scenes.length) {
        return NextResponse.json({ error: 'sceneIndex gerekli.' }, { status: 400 });
      }

      const scene = scenes[idx];
      const kind = scene.media === 'video' ? 'video' : 'image';
      const sceneCtx = {
        ...ctx, kind, sceneIndex: idx,
        previousChars: charsBefore(sb, idx, ctx)
      };

      // ÖNCE: mevcut durumu ölç
      const before = analyzePrompt(scene, sceneCtx);

      // Kredi kontrolü
      const { data: prof } = await supabase
        .from('profiles').select('credits, plan').eq('id', user.id).single();
      const plan = prof?.plan || 'free';
      const unlimited = plan === 'vip';
      const credits = prof?.credits ?? 0;

      if (!unlimited && credits < REWRITE_COST) {
        return NextResponse.json({
          error: 'Kredi yetersiz. Yeniden yazım ' + REWRITE_COST + ' kredi gerektirir.',
          before
        }, { status: 402 });
      }

      // AI yeniden yazım
      const { layers, changeNote, model, error: aiErr } =
        await rewritePrompt(scene, before, sceneCtx);

      if (!layers) {
        // Başarısızlıkta kredi DÜŞÜLMEZ — kullanıcı boşa ödemez
        const msg = aiErr === 'no_api_key'
          ? 'AI anahtarı tanımlı değil. ANTHROPIC_API_KEY ekleyip sunucuyu yeniden başlat.'
          : 'Yeniden yazım başarısız: ' + String(aiErr || 'bilinmeyen hata').slice(0, 200);
        return NextResponse.json({ error: msg, before }, { status: 502 });
      }

      /* SONRA: yeni promptu AYNI motorla ölç.
         AI'ye "kaç puan ettin" diye sormuyoruz; bağımsız ölçüyoruz. */
      const rewrittenScene = { ...scene, ...layers };
      const after = analyzePrompt(rewrittenScene, sceneCtx);

      // Kredi düş
      let creditsLeft = null;
      if (!unlimited) {
        creditsLeft = Math.max(0, credits - REWRITE_COST);
        await supabase.from('profiles').update({ credits: creditsLeft }).eq('id', user.id);
      }

      return NextResponse.json({
        scene: idx + 1,
        before: { overall: before.overall, stars: before.stars, scores: before.scores },
        after:  { overall: after.overall,  stars: after.stars,  scores: after.scores },
        layers,
        changeNote,
        issuesFixed: Math.max(0, (before.issues?.length || 0) - (after.issues?.length || 0)),
        remainingIssues: after.issues || [],
        model,
        creditsLeft
      });
    }

    return NextResponse.json({ error: 'Bilinmeyen action: ' + action }, { status: 400 });

  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
