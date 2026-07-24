import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { analyzeStoryboard } from '@/lib/health/analyze';
import { narrateReport } from '@/lib/health/narrate';
import { VIP_CREDITS } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

/*
  POST /api/health   —  action bazlı:
    { action: 'analyze', episodeId, useAI: true|false }
      Rapor üretir, kaydeder. useAI:true ise AI yorum katmanı da devrede.
      Kural motoru bedava; AI yorumu için kredi düşülür.

    { action: 'list', episodeId }
      O bölümün geçmiş raporlarının hafif listesi (version, overall, source, date).

    { action: 'get', reportId }
      Tek raporun tam içeriği.

  GÜVENLİK:
    Her istek getUser() ile doğrulanır. Rapor okuma yazma RLS ile
    kullanıcının kendi bölümlerine kısıtlıdır; bu route ekstra bir
    episode.user_id kontrolü daha yapar — savunmayı çift kat tutmak için.

  KREDİ:
    Sadece AI yorum katmanı ücretlidir. Kural analizi ücretsizdir.
    VIP kullanıcılar için düşüm atlanır (Sprint-3 kararı ile uyumlu).
*/

const AI_COST = 8;

export async function POST(req) {
  try {
    const supabase = getSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'analyze';

    /* ---------- LİSTE ---------- */
    if (action === 'list') {
      const episodeId = String(body.episodeId || '');
      if (!episodeId) {
        return NextResponse.json({ error: 'episodeId gerekli.' }, { status: 400 });
      }
      const { data, error } = await supabase
        .from('video_health_reports')
        .select('id, version, overall, source, created_at')
        .eq('episode_id', episodeId)
        .order('version', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return NextResponse.json({ reports: data || [] });
    }

    /* ---------- TEK RAPOR ---------- */
    if (action === 'get') {
      const reportId = String(body.reportId || '');
      if (!reportId) {
        return NextResponse.json({ error: 'reportId gerekli.' }, { status: 400 });
      }
      const { data, error } = await supabase
        .from('video_health_reports')
        .select('*')
        .eq('id', reportId)
        .single();
      if (error) throw new Error(error.message);
      return NextResponse.json({ report: data });
    }

    /* ---------- ANALİZ + KAYIT ---------- */
    if (action === 'analyze') {
      const episodeId = String(body.episodeId || '');
      if (!episodeId) {
        return NextResponse.json({ error: 'episodeId gerekli.' }, { status: 400 });
      }

      // Bölümü çek — hem storyboard için, hem sahiplik kontrolü için
      const { data: ep, error: epErr } = await supabase
        .from('episodes')
        .select('id, title, storyboard, user_id')
        .eq('id', episodeId)
        .single();
      if (epErr || !ep) {
        return NextResponse.json({ error: 'Bölüm bulunamadı.' }, { status: 404 });
      }
      if (ep.user_id !== user.id) {
        return NextResponse.json({ error: 'Bu bölüm sana ait değil.' }, { status: 403 });
      }

      const sb = ep.storyboard || {};
      const scenes = Array.isArray(sb.scenes) ? sb.scenes : [];
      if (scenes.length === 0) {
        return NextResponse.json({
          error: 'Analiz için sahne yok. Önce senaryoyu sahnelere böl.'
        }, { status: 400 });
      }

      // 1) Kural analizi — daima çalışır, kredi harcamaz
      let report = analyzeStoryboard(sb);

      // 2) AI yorum katmanı — istekliyse ve kredi yeterliyse
      const useAI = body.useAI !== false;
      let aiModel = null;
      let aiWarning = null;
      let creditsLeft = null;

      if (useAI) {
        // Profil ve kredi
        const { data: prof } = await supabase
          .from('profiles').select('credits, plan').eq('id', user.id).single();
        const plan = prof?.plan || 'free';
        const isUnlimited = plan === 'vip';
        const credits = prof?.credits ?? 0;

        if (!isUnlimited && credits < AI_COST) {
          // Krediyi yetmeyeni sessizce düşürmeyelim; kural raporunu yine kaydedelim
          aiWarning = 'Kredi yetersiz (' + AI_COST + ' gerekiyor). Rapor AI yorumu olmadan üretildi.';
        } else {
          const locale = body.locale === 'en' ? 'en' : 'tr';
          const { report: narrated, model, error: aiErr } = await narrateReport(report, sb, { locale });
          if (aiErr) {
            aiWarning = 'AI yorumu alınamadı: ' + String(aiErr).slice(0, 200);
          } else if (model) {
            report = narrated;
            aiModel = model;
            if (!isUnlimited) {
              const next = Math.max(0, credits - AI_COST);
              await supabase.from('profiles').update({ credits: next }).eq('id', user.id);
              creditsLeft = next;
            }
          }
        }
      }

      // 3) Kayıt — version'ı trigger belirliyor
      const row = {
        episode_id: episodeId,
        user_id: user.id,
        overall: report.overall,
        scores: report.scores,
        issues: report.issues,
        timeline: report.timeline,
        stats: report.stats,
        summary: report.summary,
        source: report.source
      };
      const { data: saved, error: sErr } = await supabase
        .from('video_health_reports')
        .insert(row)
        .select('id, version, created_at')
        .single();
      if (sErr) throw new Error('Rapor kaydedilemedi: ' + sErr.message);

      return NextResponse.json({
        report: { ...report, id: saved.id, version: saved.version, created_at: saved.created_at },
        model: aiModel,
        creditsLeft,
        warning: aiWarning
      });
    }

    return NextResponse.json({ error: 'Bilinmeyen action: ' + action }, { status: 400 });

  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
