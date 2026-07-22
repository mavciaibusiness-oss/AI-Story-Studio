'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT, useI18n } from '@/lib/i18n';
import { progressOf, FORMATS, emptyStoryboard } from '@/lib/storyboard';
import { WIZARD_STEPS, computeWizard } from '@/lib/wizard';
import { useStudio } from '@/lib/store';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import PathChoice from '@/lib/PathChoice';
import Link from 'next/link';

/*
  Studio ana ekranı — iki durumlu:
  1) Hiç episode açık değil → sihirbaz giriş ekranı: hero, kaldığın yerden
     devam kartı, yol seçimi ve üretim hattı önizlemesi. Yol seçilince
     otomatik proje+video oluşur ve senaryo akışına yönlendirilir.
  2) Episode açık → klasik dashboard (istatistik + son projeler).

  Yol seçimi YALNIZCA burada ve senaryo modülünde yapılır; landing sayfası
  pazarlama içindir ve seçim barındırmaz. Kartların kendisi lib/PathChoice.jsx
  içinde tek kaynaktan gelir.
*/
export default function DashboardView({ counts, eps }) {
  const t = useT();
  const { locale } = useI18n();
  const { episodeId, openEpisode, profile } = useStudio();
  const router = useRouter();
  const [creating, setCreating] = useState(null);
  const [err, setErr] = useState(null);

  /* Yol seçildiğinde: arka planda otomatik proje + video oluştur,
     storyboard'a scratch.mode yaz, senaryo sayfasına yönlendir. */
  async function startPath(mode) {
    setCreating(mode); setErr(null);
    try {
      const supabase = getSupabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Oturum bulunamadı.');

      // Projeyi oluştur (ya da en son projeyi kullan)
      let projectId;
      const { data: existingProjects } = await supabase.from('projects')
        .select('id').eq('user_id', user.id).eq('archived', false)
        .order('created_at', { ascending: false }).limit(1);
      if (existingProjects && existingProjects.length) {
        projectId = existingProjects[0].id;
      } else {
        const { data: newProj, error: pErr } = await supabase.from('projects')
          .insert({ user_id: user.id, name: 'Projelerim' }).select().single();
        if (pErr) throw pErr;
        projectId = newProj.id;
      }

      // Videoyu oluştur
      const title = 'Video ' + String(Date.now()).slice(-4);
      const sb = emptyStoryboard({
        title,
        language: profile?.settings?.prodLang || 'Türkçe'
      });
      sb.scratch = { ...sb.scratch, mode };

      const { data: ep, error: eErr } = await supabase.from('episodes').insert({
        project_id: projectId, user_id: user.id, title, storyboard: sb
      }).select().single();
      if (eErr) throw eErr;

      await openEpisode(ep);
      router.push('/studio/senaryo');
    } catch (e) {
      setErr(e.message || 'Bir hata oluştu.');
    }
    setCreating(null);
  }

  /* Var olan bir videoyu aç ve sihirbazın kaldığı adıma götür.
     Hangi adımda kalındığı storyboard verisinden hesaplanır (computeWizard),
     böylece kullanıcı listeye dönüp adım aramak zorunda kalmaz. */
  async function resume(ep) {
    setCreating('resume'); setErr(null);
    try {
      await openEpisode({ id: ep.id, title: ep.title, storyboard: ep.sb });
      const w = computeWizard(ep.sb, { episodeId: ep.id });
      const step = WIZARD_STEPS.find(s => s.key === w.activeKey);
      router.push(step ? step.href : '/studio/senaryo');
    } catch (e) {
      setErr(e.message || 'Video açılamadı.');
      setCreating(null);
    }
  }

  /* ----- DURUM 1: Episode açık değil → Sihirbaz giriş ekranı ----- */
  if (!episodeId) {
    const last = eps[0] || null;                 // en son güncellenen video (sunucu sıralı gönderiyor)
    const lastPct = last ? progressOf(last.sb).pct : 0;

    return (
      <>
        {/* Hero — ürünün ne yaptığını tek bakışta anlatır */}
        <section className="entry-hero">
          <div className="entry-eyebrow">{t('entry.eyebrow')}</div>
          <h1>{t('entry.heroTitle')}</h1>
          <p>{t('entry.heroSub')}</p>

          {/* Dönen kullanıcı: kaldığı yerden devam birincil eylem */}
          {last && (
            <div className="entry-resume">
              <div className="entry-resume-meta">
                <div className="entry-resume-label">{t('entry.resumeTitle')}</div>
                <div className="entry-resume-name">{last.sb.title || last.title}</div>
                <div className="entry-resume-sub">
                  {FORMATS.find(f => f.k === (last.format || last.sb.format))?.l} · {last.sb.genre}
                  {' · ' + lastPct + '% ' + t('entry.progress')}
                </div>
                <div className="entry-bar" aria-hidden="true"><i style={{ width: lastPct + '%' }} /></div>
              </div>
              <button className="btn btn-primary" onClick={() => resume(last)} disabled={!!creating}>
                {creating === 'resume' ? t('entry.creating') : t('entry.resumeBtn')}
              </button>
            </div>
          )}
        </section>

        {/* Yol seçimi */}
        <h2 className="entry-label">{last ? t('entry.startNew') : t('entry.chooseTitle')}</h2>
        <p className="entry-hint">{t('entry.chooseSub')}</p>

        <PathChoice onPick={startPath} busy={creating} />

        {err && <span className="err">{err}</span>}

        {/* Üretim hattı önizlemesi — kullanıcı sırada ne olduğunu baştan görsün */}
        <section className="entry-pipeline">
          <h2 className="entry-label">{t('entry.pipelineTitle')}</h2>
          <p className="entry-hint">{t('entry.pipelineSub')}</p>
          <div className="entry-flow">
            {WIZARD_STEPS.map(st => (
              <span key={st.key} className={'entry-step' + (st.optional ? ' is-optional' : '')}>
                <b>{String(st.n).padStart(2, '0')}</b>
                {t('wiz.step.' + st.key)}
                {st.optional && <em>· {t('entry.optional')}</em>}
              </span>
            ))}
          </div>
        </section>

        {/* Son videolar — ilerleme çubuklu, doğrudan devam edilebilir */}
        {eps.length > 1 && (
          <>
            <h2 className="entry-label">{t('dash.recent')}</h2>
            <div className="row-list">
              {eps.slice(1).map(e => {
                const p = progressOf(e.sb);
                const fmt = FORMATS.find(f => f.k === (e.format || e.sb.format))?.l;
                return (
                  <div className="row" key={e.id}>
                    <div style={{ minWidth: 0 }}>
                      <div className="r-name">{e.sb.title || e.title}</div>
                      <div className="r-meta">
                        {fmt} · {e.sb.genre} · {p.scenes} {t('common.scenes')}
                        {' · ' + new Date(e.updated_at).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB')}
                      </div>
                      <div className="entry-bar" aria-hidden="true"><i style={{ width: p.pct + '%' }} /></div>
                    </div>
                    <button className="btn btn-mini" onClick={() => resume(e)} disabled={!!creating}>
                      {t('common.open')}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </>
    );
  }

  /* ----- DURUM 2: Episode açık → klasik dashboard ----- */
  return (
    <>
      <h1 className="page-title">{t('dash.title')}</h1>
      <p className="page-sub">{t('dash.sub')}</p>

      <div className="stat-grid">
        <div className="stat"><div className="num">{counts.projects}</div><div className="lbl">{t('dash.projects')}</div></div>
        <div className="stat"><div className="num">{counts.videos}</div><div className="lbl">{t('dash.videos')}</div></div>
        <div className="stat"><div className="num">{counts.scenes}</div><div className="lbl">{t('dash.scenes')}</div></div>
        <div className="stat"><div className="num">{counts.characters}</div><div className="lbl">{t('dash.characters')}</div></div>
        <div className="stat"><div className="num">{counts.credits}</div><div className="lbl">{t('dash.credits')}</div></div>
      </div>

      <h2 className="section-title">{t('dash.quick')}</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/studio/senaryo" className="btn btn-primary">{t('nav.script')}</Link>
        <Link href="/studio/gorseller" className="btn">{t('nav.images')}</Link>
        <Link href="/studio/seslendirme" className="btn">{t('nav.voice')}</Link>
        <Link href="/studio/atolye" className="btn">{t('nav.edit')}</Link>
      </div>

      <h2 className="section-title">{t('dash.recent')}</h2>
      <div className="row-list">
        {eps.length === 0 && (
          <div className="card">
            <p className="hint">
              {t('dash.empty')}{' '}
              <Link href="/studio/projeler" style={{ color: 'var(--lamp)' }}>{t('dash.emptyLink')}</Link>{' '}
              {t('dash.emptyRest')}
            </p>
          </div>
        )}
        {eps.map(e => {
          const p = progressOf(e.sb);
          const fmt = FORMATS.find(f => f.k === (e.format || e.sb.format))?.l;
          return (
            <div className="row" key={e.id}>
              <div>
                <div className="r-name">{e.sb.title || e.title}</div>
                <div className="r-meta">
                  {fmt} · {e.sb.genre} · {p.scenes} {t('common.scenes')}
                  {p.scenes > 0 && ' · ' + p.prompts + ' ' + t('bar.prompts') +
                    ' · ' + p.images + ' ' + t('bar.images') +
                    ' · ' + p.voices + ' ' + t('bar.voices')}
                  {' · ' + new Date(e.updated_at).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB')}
                </div>
              </div>
              <Link href="/studio/projeler" className="btn btn-mini">{t('common.open')}</Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
