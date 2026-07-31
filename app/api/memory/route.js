import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
import { emptyMemory, summarize, setProfileField, isCritical,
         auditPrivacy, MEMORY_VERSION } from '@/lib/creator/memory';
import { learn, ensureObserved, activeProposals, acceptProposal,
         rejectProposal, forgetKey, forgetSection, resetMemory,
         managerStatus, SECTION_KEYS } from '@/lib/creator/manager';
/* TASK-03 Adım 4: kullanıcının kendi girdiği kayıtlar */
import { addChannel, updateChannel, removeChannel,
         addBrand, updateBrand, removeBrand,
         addGoal, updateGoal, removeGoal, entitySummary } from '@/lib/creator/entities';
import { personalizationSummary } from '@/lib/creator/personalize';

export const dynamic = 'force-dynamic';

/*
  CREATOR OS — Memory API.

  Sprint 5 / TASK-03, Adım 3.

  Eylemler:
    read        — hafızayı ve özetini getir
    learn       — yeni kaynakları gözlemle (sunucu tarafında toplanır)
    setField    — profil alanı yaz (kritik alanlar dahil, açık istek)
    accept      — kritik tercih önerisini kabul et
    reject      — öneriyi reddet
    forgetKey   — tek kayıt sil
    forgetSection — kategori sil
    reset       — tümünü sıfırla
    export      — hafızayı indir
    import      — hafızayı yükle

  ---------------------------------------------------------------
  TASARIM: ÖĞRENME SUNUCUDA, İSTEMCİDE DEĞİL

  Kaynak veriler (episodes, prompt_reports, director_actions) zaten
  veritabanında. İstemciye indirip orada gözlem çıkarmak:
    • gereksiz veri transferi
    • istemci hafızayı değiştirebilir (güven manipülasyonu)

  `learn` eylemi kaynakları SUNUCUDA okuyor. İstemci yalnızca
  "öğren" diyor, ne öğrenileceğini söyleyemiyor.
  ---------------------------------------------------------------

  KREDİ YOK: hafıza AI çağırmıyor, kural motoru. Ücretsiz.
*/

/* Migration uygulanmamışsa tablo yok. Çökmek yerine boş hafıza
   dönüyoruz — Creator OS çalışmaya devam etsin, yalnızca öğrenmesin.
   TASK-05 ve TASK-07'de kurduğum aynı yaklaşım. */
function isMissingTable(error) {
  const msg = String(error?.message || error || '');
  return msg.includes('creator_memory') &&
         (msg.includes('does not exist') || msg.includes('schema cache'));
}

async function readMemory(supabase, userId) {
  const { data, error } = await supabase
    .from('creator_memory').select('memory, version, updated_at')
    .eq('user_id', userId).maybeSingle();

  if (error) {
    if (isMissingTable(error)) return { memory: null, missing: true };
    return { memory: null, error: error.message };
  }
  if (!data) return { memory: ensureObserved(emptyMemory()), fresh: true };
  return { memory: ensureObserved(data.memory || emptyMemory()) };
}

async function writeMemory(supabase, userId, memory) {
  /* GİZLİLİK KAPISI: kaydetmeden önce denetle.
     Uzun serbest metin sayaç anahtarına sızmışsa yazmıyoruz —
     spec'in yasağı sessizce çiğnenmesin. */
  const problems = auditPrivacy(memory);
  if (problems.length) {
    return { error: 'privacy-violation', problems };
  }

  const { error } = await supabase.from('creator_memory')
    .upsert({
      user_id: userId,
      version: MEMORY_VERSION,
      memory,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });

  if (error) {
    if (isMissingTable(error)) return { missing: true };
    return { error: error.message };
  }
  return { ok: true };
}

/* Öğrenme kaynaklarını sunucudan topla. */
async function gatherSources(supabase, userId) {
  const out = { episodes: [], generators: [], directorActions: [] };

  /* Bölümler — storyboard içeriği gözlem için gerekli */
  const { data: eps } = await supabase
    .from('episodes').select('id, storyboard')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (eps) out.episodes = eps;

  /* Üretici tercihi (migration v6). Tablo yoksa sessizce atla —
     o migration uygulanmamış olabilir. */
  try {
    const { data: pr, error } = await supabase
      .from('prompt_reports').select('generator, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(300);
    if (!error && pr) out.generators = pr;
  } catch { /* v6 yok — hafıza bu boyutu öğrenmez, sorun değil */ }

  /* Yönetmen geri bildirimi (migration v9) */
  try {
    const { data: da, error } = await supabase
      .from('director_actions').select('kind, action, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(500);
    if (!error && da) out.directorActions = da;
  } catch { /* v9 yok */ }

  return out;
}

/* Kayıt işlemlerinin ortak sonu: hata varsa 400, yoksa yaz ve dön. */
async function saveEntity(supabase, userId, result) {
  if (result.error) {
    return NextResponse.json({
      error: result.error,
      fields: result.fields, limit: result.limit
    }, { status: 400 });
  }
  const w = await writeMemory(supabase, userId, result.memory);
  if (w.error) return NextResponse.json({ error: w.error }, { status: 500 });
  if (w.missing) return NextResponse.json({ ok: false, missing: true, hint: 'migration-v10-required' });

  return NextResponse.json({
    ok: true,
    memory: result.memory,
    entities: entitySummary(result.memory),
    channel: result.channel, brand: result.brand, goal: result.goal
  });
}

export async function POST(req) {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'bad-json' }, { status: 400 }); }

  const action = String(body?.action || '');
  const read = await readMemory(supabase, user.id);

  if (read.error) return NextResponse.json({ error: read.error }, { status: 500 });

  /* Tablo yoksa: okuma boş döner, yazma reddedilir. Arayüz
     "hafıza kapalı" diyebilsin diye açıkça bildiriyoruz. */
  if (read.missing) {
    return NextResponse.json({
      ok: false, missing: true,
      hint: 'migration-v10-required',
      memory: null, summary: null
    });
  }

  const memory = read.memory;

  switch (action) {
    /* ---------- OKU ---------- */
    case 'read':
      return NextResponse.json({
        ok: true,
        memory,
        summary: summarize(memory),
        proposals: activeProposals(memory),
        status: managerStatus(memory),
        entities: entitySummary(memory),
        /* Hafıza şu an neyi etkiliyor — arayüz şeffaflık için
           gösterecek (spec: kullanıcı kontrolü kaybetmemeli) */
        personalization: personalizationSummary(memory)
      });

    /* ---------- ÖĞREN ---------- */
    case 'learn': {
      const sources = await gatherSources(supabase, user.id);
      /* Oturumlar istemcide (localStorage) — istemci gönderiyor.
         Tek istisna; ama oturum verisi zaten kullanıcının kendisi.
         Yine de yalnızca `log` ve `id` okunuyor. */
      if (Array.isArray(body?.sessions)) {
        sources.sessions = body.sessions
          .filter(s => s?.id && Array.isArray(s?.log))
          .map(s => ({ id: s.id, log: s.log }));
      }

      const r = learn(memory, sources);
      const w = await writeMemory(supabase, user.id, r.memory);
      if (w.error) return NextResponse.json({ error: w.error, problems: w.problems }, { status: 500 });
      if (w.missing) return NextResponse.json({ ok: false, missing: true, hint: 'migration-v10-required' });

      return NextResponse.json({
        ok: true,
        learned: r.learned,
        memory: r.memory,
        summary: summarize(r.memory),
        proposals: r.proposals
      });
    }

    /* ---------- PROFİL ALANI ---------- */
    case 'setField': {
      const field = String(body?.field || '');
      const r = setProfileField(memory, field, body?.value);
      if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });

      const w = await writeMemory(supabase, user.id, r.memory);
      if (w.error) return NextResponse.json({ error: w.error }, { status: 500 });

      return NextResponse.json({
        ok: true, memory: r.memory, summary: summarize(r.memory),
        /* Kritik alan değiştiyse arayüz bunu bildirsin */
        critical: isCritical(field)
      });
    }

    /* ---------- ÖNERİ ---------- */
    case 'accept': {
      const field = String(body?.field || '');
      /* Öneriyi SUNUCU yeniden hesaplıyor — istemci uydurma değer
         gönderip kritik alanı istediği gibi dolduramasın. */
      const proposal = activeProposals(memory).find(p => p.field === field);
      if (!proposal) return NextResponse.json({ error: 'no-such-proposal' }, { status: 400 });

      const r = acceptProposal(memory, field, proposal.value);
      if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });

      const w = await writeMemory(supabase, user.id, r.memory);
      if (w.error) return NextResponse.json({ error: w.error }, { status: 500 });
      return NextResponse.json({ ok: true, memory: r.memory, summary: summarize(r.memory) });
    }

    case 'reject': {
      const next = rejectProposal(memory, String(body?.field || ''));
      const w = await writeMemory(supabase, user.id, next);
      if (w.error) return NextResponse.json({ error: w.error }, { status: 500 });
      return NextResponse.json({ ok: true, memory: next, proposals: activeProposals(next) });
    }

    /* ---------- SİLME ---------- */
    case 'forgetKey': {
      const r = forgetKey(memory, String(body?.section || ''), body?.key);
      if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
      const w = await writeMemory(supabase, user.id, r.memory);
      if (w.error) return NextResponse.json({ error: w.error }, { status: 500 });
      return NextResponse.json({ ok: true, removed: r.removed,
        memory: r.memory, summary: summarize(r.memory) });
    }

    case 'forgetSection': {
      const r = forgetSection(memory, String(body?.group || ''));
      if (r.error) return NextResponse.json({ error: r.error }, { status: 400 });
      const w = await writeMemory(supabase, user.id, r.memory);
      if (w.error) return NextResponse.json({ error: w.error }, { status: 500 });
      return NextResponse.json({ ok: true, memory: r.memory, summary: summarize(r.memory) });
    }

    case 'reset': {
      const next = resetMemory(memory, { keepStated: !!body?.keepStated });
      const w = await writeMemory(supabase, user.id, next);
      if (w.error) return NextResponse.json({ error: w.error }, { status: 500 });
      return NextResponse.json({ ok: true, memory: next, summary: summarize(next) });
    }

    /* ---------- KANAL / MARKA / HEDEF ----------

       Hepsi aynı desende: işlemi yap, hata varsa 400, yoksa kaydet.
       Ortak yardımcı `saveEntity` tekrarı önlüyor. */
    case 'addChannel':    return saveEntity(supabase, user.id, addChannel(memory, body?.data));
    case 'updateChannel': return saveEntity(supabase, user.id, updateChannel(memory, body?.id, body?.data));
    case 'removeChannel': return saveEntity(supabase, user.id, removeChannel(memory, body?.id));

    case 'addBrand':      return saveEntity(supabase, user.id, addBrand(memory, body?.data));
    case 'updateBrand':   return saveEntity(supabase, user.id, updateBrand(memory, body?.id, body?.data));
    case 'removeBrand':   return saveEntity(supabase, user.id, removeBrand(memory, body?.id));

    case 'addGoal':       return saveEntity(supabase, user.id, addGoal(memory, body?.data));
    case 'updateGoal':    return saveEntity(supabase, user.id, updateGoal(memory, body?.id, body?.data));
    case 'removeGoal':    return saveEntity(supabase, user.id, removeGoal(memory, body?.id));

    /* ---------- DIŞA / İÇE AKTAR ---------- */
    case 'export':
      /* Spec: "Memory Export". Ham hafıza + üretim bilgisi.
         Kullanıcının kendi verisi; olduğu gibi veriyoruz. */
      return NextResponse.json({
        ok: true,
        export: {
          format: 'creator-memory',
          version: MEMORY_VERSION,
          exportedAt: new Date().toISOString(),
          memory
        }
      });

    case 'import': {
      const inc = body?.data;
      if (!inc || inc.format !== 'creator-memory') {
        return NextResponse.json({ error: 'bad-format' }, { status: 400 });
      }
      if (Number(inc.version) !== MEMORY_VERSION) {
        /* Sürüm uyuşmuyorsa YÜKLEMİYORUZ. Eski biçimi yorumlamaya
           çalışmak sessiz bozulma üretir. */
        return NextResponse.json({
          error: 'version-mismatch',
          expected: MEMORY_VERSION, got: inc.version
        }, { status: 400 });
      }

      const next = ensureObserved({ ...emptyMemory(), ...(inc.memory || {}) });
      const problems = auditPrivacy(next);
      if (problems.length) {
        return NextResponse.json({ error: 'privacy-violation', problems }, { status: 400 });
      }

      const w = await writeMemory(supabase, user.id, next);
      if (w.error) return NextResponse.json({ error: w.error }, { status: 500 });
      return NextResponse.json({ ok: true, memory: next, summary: summarize(next) });
    }

    default:
      return NextResponse.json({
        error: 'unknown-action',
        actions: ['read', 'learn', 'setField', 'accept', 'reject',
                  'forgetKey', 'forgetSection', 'reset', 'export', 'import',
                  'addChannel', 'updateChannel', 'removeChannel',
                  'addBrand', 'updateBrand', 'removeBrand',
                  'addGoal', 'updateGoal', 'removeGoal'],
        sections: SECTION_KEYS
      }, { status: 400 });
  }
}
