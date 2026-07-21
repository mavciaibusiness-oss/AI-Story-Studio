'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT, useI18n } from '@/lib/i18n';
import { progressOf, FORMATS, emptyStoryboard } from '@/lib/storyboard';
import { useStudio } from '@/lib/store';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

/*
  Studio ana ekranı — iki durumlu:
  1) Hiç episode açık değil → "Nasıl başlamak istersin?" yol seçimi kartları +
     mevcut projeler listesi. Yol seçilince otomatik proje+video oluşur ve
     ilgili akışa yönlendirilir. İlk kez kullanan biri burada başlar.
  2) Episode açık → klasik dashboard (istatistik + son projeler).
*/
export default function DashboardView({ counts, eps }) {
  const t = useT();
  const { locale } = useI18n();
  const { episodeId, openEpisode, profile } = useStudio();
  const router = useRouter();
  const params = useSearchParams();
  const pathFromLanding = params.get('path') || '';  // 'ai' veya 'own'
  const [creating, setCreating] = useState(null);
  const [err, setErr] = useState(null);
  const [showPricing, setShowPricing] = useState(!!pathFromLanding);  // landing'den geldiyse önce fiyatlandırma

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

  /* ----- DURUM 1: Episode açık değil → Fiyatlandırma (varsa) + Yol seçimi ----- */
  if (!episodeId) {
    /* Landing'den path=ai/own ile geldiyse önce plan seçimi göster,
       kullanıcı "Ücretsiz Başla" veya "Pro'ya Geç" deyince yola girer. */
    if (showPricing) {
      return (
        <>
          <h1 className="page-title">{t('plan.title')}</h1>
          <p className="page-sub">{t('plan.sub')}</p>

          <div className="pricing" style={{ marginTop: 10, marginBottom: 28 }}>
            <div className="card price-card">
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('plan.starter')}</div>
              <div className="amount">{t('plan.free')}</div>
              <div className="per">{t('plan.noCard')}</div>
              <ul>
                <li>{t('plan.f1')}</li><li>{t('plan.f2')}</li><li>{t('plan.f3')}</li>
                <li>{t('plan.f4')}</li><li>{t('plan.f5')}</li>
              </ul>
              <button className="btn" style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => { setShowPricing(false); if (pathFromLanding) startPath(pathFromLanding); }}>
                {t('plan.startFree')}
              </button>
            </div>
            <div className="card price-card pro">
              <div style={{ fontSize: 13, color: 'var(--lamp)' }}>Pro</div>
              <div className="amount">₺499</div>
              <div className="per">{t('plan.monthly')}</div>
              <ul>
                <li>{t('plan.p1')}</li><li>{t('plan.p2')}</li><li>{t('plan.p3')}</li>
                <li>{t('plan.p4')}</li><li>{t('plan.p5')}</li>
              </ul>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => { setShowPricing(false); if (pathFromLanding) startPath(pathFromLanding); }}>
                {t('plan.goPro')}
              </button>
            </div>
          </div>
        </>
      );
    }

    return (
      <>
        <h1 className="page-title">{t('wchoose.title')}</h1>
        <p className="page-sub">{t('wchoose.sub')}</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 8, marginBottom: 28 }}>
          <button className="path-card" onClick={() => startPath('ai')} disabled={!!creating}>
            <div className="path-icon">✨</div>
            <div className="path-name">{t('wchoose.aiTitle')}</div>
            <p className="path-desc">{t('wchoose.aiDesc')}</p>
            <span className="btn btn-primary" style={{ marginTop: 14 }}>
              {creating === 'ai' ? '…' : t('wchoose.aiPick')}
            </span>
          </button>
          <button className="path-card" onClick={() => startPath('own')} disabled={!!creating}>
            <div className="path-icon">🎬</div>
            <div className="path-name">{t('wchoose.ownTitle')}</div>
            <p className="path-desc">{t('wchoose.ownDesc')}</p>
            <span className="btn btn-primary" style={{ marginTop: 14 }}>
              {creating === 'own' ? '…' : t('wchoose.ownPick')}
            </span>
          </button>
        </div>
        {err && <span className="err">{err}</span>}

        {eps.length > 0 && (
          <>
            <h2 className="section-title">{t('dash.recent')}</h2>
            <div className="row-list">
              {eps.map(e => {
                const p = progressOf(e.sb);
                const fmt = FORMATS.find(f => f.k === (e.format || e.sb.format))?.l;
                return (
                  <div className="row" key={e.id}>
                    <div>
                      <div className="r-name">{e.sb.title || e.title}</div>
                      <div className="r-meta">
                        {fmt} · {e.sb.genre} · {p.scenes} {t('common.scenes')}
                        {' · ' + new Date(e.updated_at).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-GB')}
                      </div>
                    </div>
                    <Link href="/studio/projeler" className="btn btn-mini">{t('common.open')}</Link>
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
