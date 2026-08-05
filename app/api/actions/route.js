import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { buildActionRow, summarizeSignals, workingHours,
         ACTIONS, normalizePrompt } from '@/lib/intel/actions';

export const dynamic = 'force-dynamic';

/*
  CREATOR INTELLIGENCE — eylem kayıt API'si.

  Sprint 6 / TASK-03, Adım 1.

  Eylemler:
    record    — bir davranış sinyali kaydet
    prompts   — kullanıcının prompt geçmişi
    signals   — bir hedefe ait sinyal özeti
    hours     — çalışma saati dağılımı
    forget    — bir prompt kaydını sil
    reset     — tüm sinyalleri ve prompt geçmişini sil

  ---------------------------------------------------------------
  MIGRATION YOKSA SESSİZCE GEÇİYOR

  v11 uygulanmamışsa `record` hata dönmüyor — sinyal kaybolur ama
  kullanıcının işi bozulmaz. Prompt kopyalamak, sinyal
  kaydedilemedi diye başarısız olmamalı.

  Okuma eylemleri `unavailable: true` dönüyor; arayüz bölümü
  "kapalı" gösterecek (Dashboard'daki desenin aynısı).
  ---------------------------------------------------------------

  KREDİ YOK: hepsi kural motoru.
*/

const MAX_ROWS = 500;
const MAX_PROMPTS = 100;

export async function POST(req) {
  try {
    const supabase = getSupabaseServer();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    switch (action) {
      /* ---------- SİNYAL KAYDET ---------- */
      case 'record': {
        const row = buildActionRow({
          userId: user.id,
          targetKind: body.targetKind,
          targetId: body.targetId,
          action: body.event,
          episodeId: body.episodeId,
          sceneIndex: body.sceneIndex,
          meta: body.meta
        });
        if (!row) {
          return NextResponse.json({
            error: 'invalid-action', allowed: ACTIONS
          }, { status: 400 });
        }

        try {
          const { error } = await supabase.from('user_actions').insert(row);
          if (error) throw error;
        } catch {
          /* v11 yok ya da yazma hatası — kullanıcının işini bozmuyoruz */
          return NextResponse.json({ ok: true, recorded: false });
        }

        /*
          Prompt sinyaliyse geçmişi de güncelliyoruz.

          İstemci prompt METNİNİ gönderiyor; hash'i istemci
          hesaplıyor (Web Crypto async, orada zaten yapılıyor).
          Sunucu metni normalleştirip saklıyor.
        */
        let promptSaved = false;
        if (row.target_kind === 'prompt' && body.promptText) {
          try {
            const text = String(body.promptText).slice(0, 4000);
            const isUse = row.action === 'copy' || row.action === 'reuse';

            /* Var mı? */
            const { data: existing } = await supabase.from('prompt_history')
              .select('id, signal_count, use_count, prompt_version')
              .eq('user_id', user.id).eq('prompt_hash', row.target_id)
              .maybeSingle();

            if (existing) {
              await supabase.from('prompt_history').update({
                signal_count: (existing.signal_count || 0) + 1,
                use_count: (existing.use_count || 0) + (isUse ? 1 : 0),
                last_used_at: isUse ? new Date().toISOString() : undefined,
                updated_at: new Date().toISOString()
              }).eq('id', existing.id);
            } else {
              await supabase.from('prompt_history').insert({
                user_id: user.id,
                prompt_hash: row.target_id,
                prompt_text: text,
                prompt_version: 1,
                parent_hash: body.parentHash || null,
                generator: body.generator || null,
                style: body.style || null,
                genre: body.genre || null,
                scene_kind: body.sceneKind || null,
                signal_count: 1,
                use_count: isUse ? 1 : 0,
                last_used_at: isUse ? new Date().toISOString() : null
              });
            }
            promptSaved = true;
          } catch { /* prompt_history yok — sinyal yine kaydedildi */ }
        }

        return NextResponse.json({ ok: true, recorded: true, promptSaved });
      }

      /* ---------- PROMPT GEÇMİŞİ ----------

         Kullanıcı kararı: "İlk sürümde kullanıcıya skor
         göstermiyoruz." Sıralama KULLANIM sayısına göre, puana
         göre değil. */
      case 'prompts': {
        try {
          const { data, error } = await supabase.from('prompt_history')
            .select('id, prompt_hash, prompt_text, prompt_version, generator, style, genre, signal_count, use_count, score, last_used_at, first_seen')
            .eq('user_id', user.id)
            .order('use_count', { ascending: false })
            .order('last_used_at', { ascending: false, nullsFirst: false })
            .limit(Math.min(body.limit || 20, MAX_PROMPTS));
          if (error) throw error;
          return NextResponse.json({ ok: true, prompts: data || [] });
        } catch {
          return NextResponse.json({ ok: true, prompts: [], unavailable: true });
        }
      }

      /* ---------- BİR HEDEFİN SİNYAL ÖZETİ ---------- */
      case 'signals': {
        const kind = String(body.targetKind || '');
        const id = String(body.targetId || '');
        if (!kind || !id) {
          return NextResponse.json({ error: 'target-required' }, { status: 400 });
        }
        try {
          const { data, error } = await supabase.from('user_actions')
            .select('action, created_at')
            .eq('user_id', user.id).eq('target_kind', kind).eq('target_id', id)
            .order('created_at', { ascending: false }).limit(MAX_ROWS);
          if (error) throw error;
          return NextResponse.json({ ok: true, ...summarizeSignals(data || []) });
        } catch {
          return NextResponse.json({ ok: true, unavailable: true });
        }
      }

      /* ---------- ÇALIŞMA SAATİ ---------- */
      case 'hours': {
        try {
          const { data, error } = await supabase.from('user_actions')
            .select('created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false }).limit(MAX_ROWS);
          if (error) throw error;
          return NextResponse.json({ ok: true, ...workingHours(data || []) });
        } catch {
          return NextResponse.json({ ok: true, known: false, unavailable: true });
        }
      }

      /* ---------- TEK PROMPT SİL ----------

         Kullanıcı kararı: "UI tarafında ayrı yönetilebilir olacak
         (silme desteği)." */
      case 'forget': {
        const hash = String(body.promptHash || '');
        if (!hash) {
          return NextResponse.json({ error: 'hash-required' }, { status: 400 });
        }
        try {
          await supabase.from('prompt_history')
            .delete().eq('user_id', user.id).eq('prompt_hash', hash);
          /* O prompt'a ait sinyaller de gitsin — kayıt silinip
             sinyalleri kalırsa hayalet veri olur */
          await supabase.from('user_actions')
            .delete().eq('user_id', user.id)
            .eq('target_kind', 'prompt').eq('target_id', hash);
          return NextResponse.json({ ok: true });
        } catch (e) {
          return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
        }
      }

      /* ---------- TÜMÜNÜ SİL ----------

         Kullanıcı kararı: "resetMemory kapsamına prompt_history ve
         user_actions da dahil edilecek." Bu rota kendi başına da
         çağrılabiliyor; /api/memory reset'i de bunu tetikleyecek
         (Adım 3). */
      case 'reset': {
        const errs = [];
        for (const table of ['prompt_history', 'user_actions']) {
          try {
            const { error } = await supabase.from(table)
              .delete().eq('user_id', user.id);
            if (error) errs.push(table);
          } catch { errs.push(table); }
        }
        return NextResponse.json({
          ok: errs.length === 0, failed: errs
        });
      }

      default:
        return NextResponse.json({
          error: 'unknown-action',
          actions: ['record', 'prompts', 'signals', 'hours', 'forget', 'reset']
        }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
