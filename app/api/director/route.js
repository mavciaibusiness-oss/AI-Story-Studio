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

/*
  KALICI YOKSAYMALARI ELE.

  Kullanıcı bir öneriyi reddettiyse her açılışta tekrar görmemeli.
  Öneri id'leri kural motoru tarafından deterministik üretiliyor
  ('camera-closeup:3'), yani aynı sorun aynı sahnede aynı id'yi alır —
  bu yüzden kalıcı yoksayma çalışıyor.

  MIGRATION YOKSA SESSİZ GEÇ: tablo bulunamazsa liste olduğu gibi
  döner. Yoksayma çalışmaz ama Director çalışmaya devam eder.
  Analizi tabloya bağlı kılmak yanlış olurdu.
*/
async function filterIgnored(supabase, episodeId, director) {
  try {
    const { data, error } = await supabase
      .from('director_actions')
      .select('rec_id')
      .eq('episode_id', episodeId)
      .eq('status', 'ignored');
    if (error) throw new Error(error.message);

    const ignoredIds = (data || []).map(r => r.rec_id);
    if (!ignoredIds.length) return { ignoredIds: [], filtered: director };

    const set = new Set(ignoredIds);
    const recs = (director.recommendations || []).filter(r => !set.has(r.id));
    return {
      ignoredIds,
      filtered: { ...director, recommendations: recs }
    };
  } catch {
    /* Tablo yok ya da erişilemedi — Director yine çalışsın */
    return { ignoredIds: [], filtered: director };
  }
}

/*
  ÖNERİ EYLEMİNİ KAYDET.

  Aynı bölüm + aynı öneri için TEK satır (benzersiz indeks). Kullanıcı
  yoksayıp sonra uygularsa satır güncellenir — yoksa "hem yoksayılmış
  hem uygulanmış" gibi tutarsız bir durum oluşur.

  Dönüş: başarılıysa true. Yoksayma için bu önemli — kaydedilemezse
  kullanıcıya söylemeliyiz, yoksa yoksaydığını sanıp sayfayı
  yenileyince geri gelmesine şaşırır.
*/
async function recordAction(supabase, episodeId, userId, rec, status, snapshotScenes) {
  try {
    const row = {
      episode_id: episodeId,
      user_id: userId,
      rec_id: rec.id,
      rec_action: rec.action || null,
      rec_kind: rec.kind || null,
      rec_scene: Number.isInteger(rec.scene) ? rec.scene : null,
      rec_title: String(rec.title || '').slice(0, 500),
      confidence: rec.confidence ?? null,
      status,
      snapshot: status === 'applied' && Array.isArray(snapshotScenes)
        ? snapshotScenes : null
    };
    const { error } = await supabase
      .from('director_actions')
      .upsert(row, { onConflict: 'episode_id,rec_id' });
    return !error;
  } catch {
    return false;
  }
}

/*
  KARAR TURUNU GEÇMİŞE YAZ.

  Kayıt hatası karar listesini geçersiz kılmaz — analiz zaten üretildi,
  kullanıcı görebilmeli. Migration v9 çalıştırılmamışsa null döner.
*/
async function saveReport(supabase, episodeId, userId, director) {
  try {
    const { data, error } = await supabase.from('director_reports').insert({
      episode_id: episodeId,
      user_id: userId,
      score_current: director.projected?.current ?? 0,
      score_expected: director.projected?.expected ?? 0,
      rec_count: director.summary?.total ?? 0,
      auto_count: director.summary?.auto ?? 0,
      avg_confidence: director.summary?.avgConfidence ?? 0,
      data_quality: director.dataQuality || 'estimated',
      recommendations: director.recommendations || [],
      summary: director.summary || {},
      engines: director.engines || {},
      projected: director.projected || {},
      source: director.source || 'rules'
    }).select('id').single();
    return error ? null : (data?.id || null);
  } catch {
    return null;
  }
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
      const director = directProject(sb);
      /* Kalıcı yoksaymalar listeden elenir. Kullanıcı bir öneriyi
         reddettiyse her açılışta tekrar görmemeli. */
      const { ignoredIds, filtered } = await filterIgnored(supabase, episodeId, director);

      /* Karar turunu geçmişe yaz — kayıt hatası listeyi geçersiz
         kılmaz (migration v9 gerekiyor). */
      let reportId = null;
      if (body.save !== false) {
        reportId = await saveReport(supabase, episodeId, user.id, filtered);
      }

      return NextResponse.json({ director: filtered, ignoredIds, reportId });
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

      /* Geçmişe yaz — geri alma anlık görüntüsüyle. */
      await recordAction(supabase, episodeId, user.id, rec, 'applied', scenes);

      const after = directProject(nextSb);
      const { filtered } = await filterIgnored(supabase, episodeId, after);

      return NextResponse.json({
        ok: true,
        applied: [rec.id],
        /* İstemci durumunu eşitlesin — otomatik kayıt eski haliyle
           üzerine yazmasın (TASK-04'te düzelttiğim yarış durumu). */
        nextScenes,
        director: filtered
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

        /* Snapshot uygulama ÖNCESİ durumu taşımalı */
        await recordAction(supabase, episodeId, user.id, rec, 'applied', currentSb.scenes);
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

      const afterMany = directProject(currentSb);
      const { filtered: filteredMany } = await filterIgnored(supabase, episodeId, afterMany);

      return NextResponse.json({
        ok: true,
        applied,
        skipped,
        nextScenes: currentSb.scenes,
        director: filteredMany
      });
    }

    /* ---------- KALICI YOKSAY (ücretsiz) ----------
       { action: 'ignore', episodeId, id }
       Öneri bir daha gösterilmez. Kullanıcı fikrini değiştirirse
       'unignore' ile geri alır. */
    if (action === 'ignore') {
      const id = String(body.id || '');
      if (!id) return NextResponse.json({ error: 'id gerekli.' }, { status: 400 });

      const director = directProject(sb);
      const rec = director.recommendations.find(r => r.id === id);
      if (!rec) {
        return NextResponse.json({ error: 'Öneri bulunamadı.' }, { status: 404 });
      }

      const ok = await recordAction(supabase, episodeId, user.id, rec, 'ignored', null);
      if (!ok) {
        return NextResponse.json({
          error: 'Yoksayma kaydedilemedi. Migration v9 çalıştırıldı mı?'
        }, { status: 500 });
      }

      const { ignoredIds, filtered } = await filterIgnored(supabase, episodeId, director);
      return NextResponse.json({ ok: true, ignoredIds, director: filtered });
    }

    /* ---------- YOKSAYMAYI GERİ AL (ücretsiz) ---------- */
    if (action === 'unignore') {
      const ids = Array.isArray(body.ids) ? body.ids.map(String)
        : body.id ? [String(body.id)] : [];
      if (!ids.length) {
        return NextResponse.json({ error: 'id ya da ids gerekli.' }, { status: 400 });
      }
      const { error } = await supabase.from('director_actions')
        .delete().eq('episode_id', episodeId).eq('user_id', user.id)
        .eq('status', 'ignored').in('rec_id', ids);
      if (error) throw new Error(error.message);

      const director = directProject(sb);
      const { ignoredIds, filtered } = await filterIgnored(supabase, episodeId, director);
      return NextResponse.json({ ok: true, ignoredIds, director: filtered });
    }

    /* ---------- GEÇMİŞ (ücretsiz) ----------
       Uygulanmış öneriler ve karar turları. */
    if (action === 'history') {
      const [actionsRes, reportsRes] = await Promise.all([
        supabase.from('director_actions')
          .select('id, rec_id, rec_action, rec_kind, rec_scene, rec_title, confidence, status, snapshot, created_at')
          .eq('episode_id', episodeId)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('director_reports')
          .select('id, version, score_current, score_expected, rec_count, auto_count, avg_confidence, data_quality, created_at')
          .eq('episode_id', episodeId)
          .order('version', { ascending: false })
          .limit(20)
      ]);

      /* snapshot İSTEMCİYE GİTMEZ — tüm sahne metinlerini taşıyor,
         listede gereksiz. Yalnızca geri alınabilir mi bilgisi. */
      const actions = (actionsRes.data || []).map(({ snapshot, ...rest }) => ({
        ...rest, canUndo: Array.isArray(snapshot) && snapshot.length > 0
      }));

      return NextResponse.json({
        actions,
        reports: reportsRes.data || []
      });
    }

    /* ---------- UYGULAMAYI GERİ AL (ücretsiz) ---------- */
    if (action === 'undo') {
      const actionId = String(body.actionId || '');
      if (!actionId) {
        return NextResponse.json({ error: 'actionId gerekli.' }, { status: 400 });
      }

      const { data: rec, error: rErr } = await supabase
        .from('director_actions')
        .select('id, snapshot, status, user_id, rec_title')
        .eq('id', actionId).single();
      if (rErr || !rec) {
        return NextResponse.json({ error: 'Kayıt bulunamadı.' }, { status: 404 });
      }
      if (rec.user_id !== user.id) {
        return NextResponse.json({ error: 'Bu kayıt sana ait değil.' }, { status: 403 });
      }
      if (rec.status !== 'applied') {
        return NextResponse.json({ error: 'Bu kayıt uygulanmış değil.' }, { status: 400 });
      }
      if (!Array.isArray(rec.snapshot) || !rec.snapshot.length) {
        return NextResponse.json({ error: 'Bu kayıt geri alınamaz.' }, { status: 400 });
      }

      const restoredSb = { ...sb, scenes: rec.snapshot };
      const { error: upErr } = await supabase
        .from('episodes').update({ storyboard: restoredSb }).eq('id', episodeId);
      if (upErr) throw new Error('Geri alınamadı: ' + upErr.message);

      /* Kaydı sil: öneri tekrar listede görünsün. Silmek yerine
         durumu değiştirseydik "yoksayılmış" gibi davranırdı. */
      await supabase.from('director_actions').delete().eq('id', actionId);

      const director = directProject(restoredSb);
      const { filtered } = await filterIgnored(supabase, episodeId, director);

      return NextResponse.json({
        ok: true,
        scenes: rec.snapshot.length,
        nextScenes: rec.snapshot,
        director: filtered
      });
    }

    return NextResponse.json({ error: 'Bilinmeyen action: ' + action }, { status: 400 });

  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
