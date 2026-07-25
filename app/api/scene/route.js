import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { planStoryboard, applyPlan, splitUnits } from '@/lib/scene/plan';
import { estimateSpokenDuration } from '@/lib/timeline';
import { refinePlan } from '@/lib/scene/refine';

export const dynamic = 'force-dynamic';

/*
  POST /api/scene

  action: 'plan'
    { episodeId }
    Kural tabanlı sahne planı. ÜCRETSİZ, AI çağırmaz, kredi harcamaz.

  action: 'refine'
    { episodeId, locale? }
    AI ile bölme noktalarını anlatıya göre iyileştirir. Kredili.
    AI hiçbir şeyi değiştirmediyse KREDİ DÜŞÜLMEZ.

  action: 'apply'
    { episodeId, selection?, plan? }
    Planı storyboard'a yazar. ÜCRETSİZ.
    selection verilmezse tüm plan, verilirse yalnızca seçilenler.
    Yaratıcı modları bu seçimle çalışır:
      Beginner     → selection yok, hepsi uygulanır
      Advanced     → kullanıcı seçtiklerini gönderir
      Professional → selection: { splits: [], merges: [] } (hiçbiri)

  GÜVENLİK
    Oturum zorunlu, bölüm sahipliği ayrıca doğrulanır (RLS'e ek kat).

  KREDİ
    Yalnızca refine ücretli. VIP atlanır.
*/

const REFINE_COST = 7;

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

/* Bölünecek sahnelerin birimlerini topla.
   plan.js'in splitUnits'i kullanılır — AI ile aynı indeks düzlemi. */
function collectUnits(sb, plan) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  const out = {};
  for (const s of plan.splits) {
    if (!s.pieces) continue;
    const scene = scenes[s.scene - 1];
    const text = String(scene?.voiceText || scene?.paragraph || '');
    out[s.scene] = splitUnits(text, s.dur);
  }
  return out;
}

/*
  İstemciden gelen planın YAPISINI al, METNİ sunucuda yeniden kur.

  İstemci yalnızca gruplamayı (hangi birim hangi parçaya) etkileyebilir.
  Parça metni her zaman storyboard'daki gerçek metinden üretilir.

  Gruplama geçersizse (indeks tekrarı, eksik birim, taşan indeks) o
  sahnenin sunucu planı korunur — sessizce.
*/
function rebuildPlanFromClient(sb, serverPlan, clientPlan) {
  if (!clientPlan || !Array.isArray(clientPlan.splits)) return serverPlan;

  const units = collectUnits(sb, serverPlan);
  const clientByScene = new Map(
    clientPlan.splits
      .filter(s => Number.isInteger(s?.scene))
      .map(s => [s.scene, s])
  );

  const splits = serverPlan.splits.map(s => {
    if (!s.pieces) return s;
    const c = clientByScene.get(s.scene);
    const groups = c?.groups;
    const u = units[s.scene];
    if (!Array.isArray(groups) || !Array.isArray(u) || !u.length) return s;

    // Doğrulama: her indeks tam bir kez, geçerli aralıkta, en az 2 grup
    if (groups.length < 2) return s;
    const seen = new Set();
    for (const g of groups) {
      if (!Array.isArray(g) || !g.length) return s;
      for (const i of g) {
        if (!Number.isInteger(i) || i < 0 || i >= u.length) return s;
        if (seen.has(i)) return s;
        seen.add(i);
      }
    }
    if (seen.size !== u.length) return s;

    // Metni SUNUCUDAKİ birimlerden kur; süreleri de sunucu hesaplar
    const texts = groups.map(g => g.map(i => u[i]).join(' '));
    const est = texts.map(t => estimateSpokenDuration(t));
    const estTotal = est.reduce((a, b) => a + b, 0);
    const scale = s.dur > 0 && estTotal > 0 ? s.dur / estTotal : 1;
    const pieces = texts.map((t, i) => ({ text: t, dur: +(est[i] * scale).toFixed(2) }));

    return { ...s, pieces, groups, gain: pieces.length - 1 };
  });

  return { ...serverPlan, splits };
}

export async function POST(req) {
  try {
    const supabase = getSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'plan';
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
        error: 'Plan için sahne yok. Önce senaryoyu sahnelere böl.'
      }, { status: 400 });
    }

    /* ---------- PLAN (ücretsiz) ---------- */
    if (action === 'plan') {
      const plan = planStoryboard(sb);
      return NextResponse.json({ plan });
    }

    /* ---------- AI İYİLEŞTİRME (kredili) ---------- */
    if (action === 'refine') {
      const base = planStoryboard(sb);
      const units = collectUnits(sb, base);

      // İyileştirilecek bir şey yok — AI'yi çağırmadan dön, kredi harcamayalım
      const splittable = base.splits.filter(s => s.pieces);
      if (!splittable.length) {
        return NextResponse.json({
          plan: base,
          note: '',
          changes: { splits: 0, types: 0, transitions: 0 },
          creditsLeft: null,
          warning: 'İyileştirilecek bölme önerisi yok. Plan olduğu gibi kaldı.'
        });
      }

      const { data: prof } = await supabase
        .from('profiles').select('credits, plan').eq('id', user.id).single();
      const userPlan = prof?.plan || 'free';
      const unlimited = userPlan === 'vip';
      const credits = prof?.credits ?? 0;

      if (!unlimited && credits < REFINE_COST) {
        return NextResponse.json({
          error: 'Kredi yetersiz. İyileştirme ' + REFINE_COST + ' kredi gerektirir.',
          plan: base
        }, { status: 402 });
      }

      const locale = body.locale === 'en' ? 'en' : 'tr';
      const { plan: refined, note, model, error: aiErr, changes } =
        await refinePlan(base, sb, units, { locale });

      if (aiErr) {
        const msg = aiErr === 'no_api_key'
          ? 'AI anahtarı tanımlı değil. ANTHROPIC_API_KEY ekleyip sunucuyu yeniden başlat.'
          : 'İyileştirme başarısız: ' + String(aiErr).slice(0, 200);
        // Başarısızlıkta kredi düşülmez; kural planı yine döner
        return NextResponse.json({ error: msg, plan: base }, { status: 502 });
      }

      /* AI hiçbir şeyi değiştirmediyse kredi düşme.
         Kullanıcı "iyileştir" deyip aynı planı geri alırsa ödemesin. */
      const changed = changes.splits + changes.types + changes.transitions;
      let creditsLeft = null;
      if (changed > 0 && !unlimited) {
        creditsLeft = Math.max(0, credits - REFINE_COST);
        await supabase.from('profiles').update({ credits: creditsLeft }).eq('id', user.id);
      }

      return NextResponse.json({
        plan: refined,
        note,
        changes,
        model,
        creditsLeft,
        warning: changed === 0
          ? 'AI kural planını iyileştirecek bir nokta bulamadı. Kredi düşülmedi.'
          : null
      });
    }

    /* ---------- UYGULA (ücretsiz) ---------- */
    if (action === 'apply') {
      /*
        İstemci AI ile iyileştirilmiş bir plan gönderebilir. Ancak
        sunucu o planın METNİNE GÜVENMEZ: yalnızca YAPISINI (hangi
        birimler hangi parçaya gidiyor) alır ve metni kendi
        storyboard'undan yeniden kurar.

        Neden önemli: aksi halde istemci pieces.text alanına ne yazarsa
        storyboard'a o yazılır. Kullanıcı kendi metnini zaten
        düzenleyebildiği için bu bir yetki sorunu değil; ama "plan
        uygula" eyleminin metni değiştirmemesi gerekiyor. Sözleşme
        kodla korunuyor, yorumla değil.
      */
      const serverPlan = planStoryboard(sb);
      const plan = rebuildPlanFromClient(sb, serverPlan, body.plan);

      const selection = body.selection || null;
      const nextScenes = applyPlan(sb, plan, selection);

      if (!nextScenes.length) {
        return NextResponse.json({ error: 'Plan uygulanamadı.' }, { status: 400 });
      }

      const nextSb = { ...sb, scenes: nextScenes };
      const { error: upErr } = await supabase
        .from('episodes')
        .update({ storyboard: nextSb })
        .eq('id', episodeId);
      if (upErr) throw new Error('Storyboard kaydedilemedi: ' + upErr.message);

      /* Uygulama sonrası yeni planı da hesapla: kullanıcı sonucu
         hemen görsün, ikinci bir istek atmak zorunda kalmasın. */
      const after = planStoryboard(nextSb);

      return NextResponse.json({
        ok: true,
        scenes: nextScenes.length,
        before: plan.current.scenes,
        needsVoiceWork: nextScenes.some(s => s._needsVoiceSlice || s._needsVoiceRerecord),
        plan: after
      });
    }

    return NextResponse.json({ error: 'Bilinmeyen action: ' + action }, { status: 400 });

  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
