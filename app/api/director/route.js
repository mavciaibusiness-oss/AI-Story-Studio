import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { directProject, applyRecommendation } from '@/lib/director/decide';
import { explainRecommendations, attachExplanations, MAX_EXPLAIN } from '@/lib/director/explain';

export const dynamic = 'force-dynamic';

/*
  POST /api/director

  action: 'direct'
    { episodeId }
    Beş motoru çalıştırır, öncelikli karar listesi döner.
    ÜCRETSİZ — kural motoru, AI çağırmaz.

  action: 'explain'
    { episodeId, ids?, limit? }
    Seçili önerilerin arkasındaki yönetmen mantığını AI ile açıklar.
    Kredili. AI öneriyi DEĞİŞTİREMEZ, yalnızca metin ekler.

  action: 'apply'
    { episodeId, id }
    Tek öneriyi storyboard'a uygular. ÜCRETSİZ.
    Yalnızca auto:true öneriler uygulanabilir.

  action: 'applyMany'
    { episodeId, ids }
    Birden çok otomatik öneriyi sırayla uygular. ÜCRETSİZ.

  GÜVENLİK
    Oturum zorunlu, bölüm sahipliği ayrıca doğrulanır.
    Öneriler SUNUCUDA yeniden üretilir — istemci sahte öneri gönderip
    storyboard'a istediğini yazdıramaz.

  KREDİ
    Yalnızca explain ücretli. VIP atlanır.
*/

/* Açıklama AI çağrısı: prompt yeniden yazımı 6, plan iyileştirme 7,
   hikâye yazımı 12. Bu bir metin üretimi, en hafifi: 4. */
const EXPLAIN_COST = 4;

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

export async function POST(req) {
  try {
    const supabase = getSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'direct';
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
        error: 'Yönetmen kararı için sahne yok. Önce senaryoyu sahnelere böl.'
      }, { status: 400 });
    }

    /* ---------- KARAR LİSTESİ (ücretsiz) ---------- */
    if (action === 'direct') {
      return NextResponse.json({ director: directProject(sb) });
    }

    /* ---------- AÇIKLAMA (kredili) ---------- */
    if (action === 'explain') {
      /*
        Öneriler SUNUCUDA yeniden üretilir. İstemciden öneri listesi
        kabul etmiyoruz — sahte öneri gönderip AI'ye alakasız şeyler
        açıklatmanın anlamı yok ama kapıyı kapalı tutmak doğru.
        İstemci yalnızca HANGİ önerileri istediğini id ile söyler.
      */
      const director = directProject(sb);
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;

      let target = director.recommendations;
      if (ids?.length) {
        const want = new Set(ids);
        target = director.recommendations.filter(r => want.has(r.id));
        if (!target.length) {
          return NextResponse.json({
            error: 'İstenen öneriler bulunamadı. Liste güncellenmiş olabilir.',
            director
          }, { status: 400 });
        }
      }
      const limit = Number.isInteger(body.limit) ? body.limit : MAX_EXPLAIN;
      target = target.slice(0, Math.max(1, Math.min(limit, MAX_EXPLAIN)));

      const { data: prof } = await supabase
        .from('profiles').select('credits, plan').eq('id', user.id).single();
      const plan = prof?.plan || 'free';
      const unlimited = plan === 'vip';
      const credits = prof?.credits ?? 0;

      if (!unlimited && credits < EXPLAIN_COST) {
        return NextResponse.json({
          error: 'Kredi yetersiz. Açıklama ' + EXPLAIN_COST + ' kredi gerektirir.',
          director
        }, { status: 402 });
      }

      const locale = body.locale === 'en' ? 'en' : 'tr';
      const result = await explainRecommendations(target, sb, { locale, limit });

      if (!Object.keys(result.explanations).length) {
        /* Başarısızlıkta kredi DÜŞÜLMEZ. Kural motorunun `reason`
           alanı zaten kullanıcıya bir şey söylüyor. */
        const msg = result.error === 'no_api_key'
          ? 'AI anahtarı tanımlı değil. ANTHROPIC_API_KEY ekleyip sunucuyu yeniden başlat.'
          : 'Açıklama alınamadı: ' + String(result.error || 'bilinmeyen').slice(0, 200);
        return NextResponse.json({ error: msg, director }, { status: 502 });
      }

      let creditsLeft = null;
      if (!unlimited) {
        creditsLeft = Math.max(0, credits - EXPLAIN_COST);
        await supabase.from('profiles').update({ credits: creditsLeft }).eq('id', user.id);
      }

      /* Açıklamaları önerilere işle — öneri alanları değişmez,
         yalnızca `explain` eklenir. */
      const withExplain = attachExplanations(director.recommendations, result.explanations);

      return NextResponse.json({
        director: { ...director, recommendations: withExplain },
        explained: Object.keys(result.explanations).length,
        rejected: result.rejected,
        model: result.model,
        creditsLeft
      });
    }

    /* ---------- TEK ÖNERİ UYGULA (ücretsiz) ---------- */
    if (action === 'apply') {
      const id = String(body.id || '');
      if (!id) {
        return NextResponse.json({ error: 'id gerekli.' }, { status: 400 });
      }

      const director = directProject(sb);
      const rec = director.recommendations.find(r => r.id === id);
      if (!rec) {
        return NextResponse.json({
          error: 'Öneri bulunamadı. Liste güncellenmiş olabilir.', director
        }, { status: 404 });
      }
      if (!rec.auto) {
        /* Bu öneri elle yapılacak bir iş (yeni görsel üretmek, sesi
           yeniden kaydetmek). Arayüz "Uygula" düğmesi göstermemeliydi;
           yine de kapıyı kapalı tutuyoruz. */
        return NextResponse.json({
          error: 'Bu öneri otomatik uygulanamaz; elle yapılması gerekiyor.',
          rec
        }, { status: 400 });
      }

      const nextScenes = applyRecommendation(sb, rec);
      if (!nextScenes) {
        return NextResponse.json({
          error: 'Öneri uygulanamadı. Zaten uygulanmış olabilir.', rec
        }, { status: 400 });
      }

      const nextSb = { ...sb, scenes: nextScenes };
      const { error: upErr } = await supabase
        .from('episodes').update({ storyboard: nextSb }).eq('id', episodeId);
      if (upErr) throw new Error('Kaydedilemedi: ' + upErr.message);

      return NextResponse.json({
        ok: true,
        applied: [rec.id],
        /* İstemci durumunu eşitlesin — otomatik kayıt eski haliyle
           üzerine yazmasın (TASK-04'te düzelttiğim yarış durumu). */
        nextScenes,
        director: directProject(nextSb)
      });
    }

    /* ---------- ÇOKLU UYGULAMA (ücretsiz) ----------
       Otomatik önerileri sırayla uygular. Her adımda storyboard
       değiştiği için öneriler yeniden üretiliyor: bir öneri
       uygulandıktan sonra diğeri geçersiz olabilir. */
    if (action === 'applyMany') {
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      if (!ids.length) {
        return NextResponse.json({ error: 'ids gerekli.' }, { status: 400 });
      }

      let currentSb = sb;
      const applied = [];
      const skipped = [];

      for (const id of ids) {
        const director = directProject(currentSb);
        const rec = director.recommendations.find(r => r.id === id);
        if (!rec) { skipped.push({ id, reason: 'not-found' }); continue; }
        if (!rec.auto) { skipped.push({ id, reason: 'manual-only' }); continue; }

        const next = applyRecommendation(currentSb, rec);
        if (!next) { skipped.push({ id, reason: 'no-change' }); continue; }

        currentSb = { ...currentSb, scenes: next };
        applied.push(id);
      }

      if (!applied.length) {
        return NextResponse.json({
          error: 'Hiçbir öneri uygulanamadı.', skipped,
          director: directProject(sb)
        }, { status: 400 });
      }

      const { error: upErr } = await supabase
        .from('episodes').update({ storyboard: currentSb }).eq('id', episodeId);
      if (upErr) throw new Error('Kaydedilemedi: ' + upErr.message);

      return NextResponse.json({
        ok: true,
        applied,
        skipped,
        nextScenes: currentSb.scenes,
        director: directProject(currentSb)
      });
    }

    return NextResponse.json({ error: 'Bilinmeyen action: ' + action }, { status: 400 });

  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
