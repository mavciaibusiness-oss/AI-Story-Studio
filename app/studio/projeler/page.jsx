'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useStudio } from '@/lib/store';
import { triggerDownload } from '@/lib/engine';
import { normalize, progressOf, FORMATS, emptyStoryboard } from '@/lib/storyboard';
import { useT } from '@/lib/i18n';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function Projeler() {
  const { episodeId, openEpisode, closeEpisode, storyboard, profile } = useStudio();
  const t = useT();
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [episodes, setEpisodes] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const supabase = getSupabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setLoading(false);
      const { data: pj } = await supabase.from('projects').select('*').eq('user_id', user.id)
        .eq('archived', false).order('created_at', { ascending: false });
      setProjects(pj || []);
      if (pj?.length) await selectProject(pj[0]);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  async function selectProject(p) {
    setActiveProject(p);
    const supabase = getSupabaseBrowser();
    const { data: eps } = await supabase.from('episodes').select('*').eq('project_id', p.id)
      .order('created_at', { ascending: true });
    setEpisodes(eps || []);
  }

  async function newProject() {
    const name = prompt(t('proj.namePrompt'));
    if (!name) return;
    const supabase = getSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('projects').insert({ user_id: user.id, name }).select().single();
    if (error) return setErr(error.message);
    setProjects([data, ...projects]);
    setActiveProject(data);
    setEpisodes([]);
    /* İlk kez kullanan biri proje/video ayrımıyla uğraşmasın: yeni proje
       açılınca ilk videoyu da hemen oluşturup doğrudan Senaryo'ya götürüyoruz.
       Sihirbaz oradan itibaren adım adım yönlendirir. */
    await createVideoAndGo(data);
  }

  /* Bir projede yeni video (episode) oluşturur, açar ve Senaryo'ya yönlendirir. */
  async function createVideoAndGo(project) {
    const supabase = getSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const title = 'Video ' + String((project === activeProject ? episodes.length : 0) + 1).padStart(2, '0');
    const { data, error } = await supabase.from('episodes').insert({
      project_id: project.id, user_id: user.id, title,
      storyboard: emptyStoryboard({ title, language: profile?.settings?.prodLang || 'Türkçe' })
    }).select().single();
    if (error) return setErr(error.message);
    await openEpisode(data);
    router.push('/studio/senaryo');
  }

  /* Proje silinince episodes.project_id → projects(id) "on delete cascade"
     sayesinde o projeye ait bütün videolar veritabanında da otomatik silinir —
     ayrıca tek tek episode silmeye gerek yok. */
  async function delProject(p) {
    if (!confirm('"' + p.name + '" ' + t('proj.confirmDeleteProject'))) return;
    setErr(null);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.from('projects').delete().eq('id', p.id);
    if (error) return setErr(error.message);

    const wasActive = activeProject?.id === p.id;
    const hadOpenEpisode = wasActive && episodes.some(e => e.id === episodeId);
    setProjects(prev => prev.filter(x => x.id !== p.id));

    if (wasActive) {
      if (hadOpenEpisode) closeEpisode();
      const rest = projects.filter(x => x.id !== p.id);
      if (rest.length) selectProject(rest[0]);
      else { setActiveProject(null); setEpisodes([]); }
    }
  }

  async function newEpisode() {
    if (!activeProject) return setErr('Önce bir proje seç.');
    const supabase = getSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const title = 'Video ' + String(episodes.length + 1).padStart(2, '0');
    const { data, error } = await supabase.from('episodes').insert({
      project_id: activeProject.id, user_id: user.id, title,
      storyboard: emptyStoryboard({ title, language: profile?.settings?.prodLang || 'Türkçe' })
    }).select().single();
    if (error) return setErr(error.message);
    setEpisodes([...episodes, data]);
    await openEpisode(data);
    router.push('/studio/senaryo');
  }

  async function duplicate(ep) {
    const supabase = getSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const sb = normalize(ep.storyboard);
    const { data, error } = await supabase.from('episodes').insert({
      project_id: ep.project_id, user_id: user.id, title: ep.title + ' (kopya)',
      story: ep.story, storyboard: { ...sb, title: sb.title + ' (kopya)' }, format: ep.format
    }).select().single();
    if (error) return setErr(error.message);
    setEpisodes([...episodes, data]);
  }

  async function del(ep) {
    if (!confirm('"' + ep.title + '" — ' + t('proj.confirmDelete'))) return;
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.from('episodes').delete().eq('id', ep.id);
    if (error) return setErr(error.message);
    setEpisodes(episodes.filter(e => e.id !== ep.id));
    if (episodeId === ep.id) closeEpisode();
  }

  function exportProject() {
    triggerDownload(new Blob([JSON.stringify({ project: activeProject, episodes }, null, 2)],
      { type: 'application/json' }), (activeProject?.name || 'proje') + '.json');
  }

  if (loading) return <p className="hint">Yükleniyor…</p>;

  return (
    <>
      <h1 className="page-title">{t('proj.title')}</h1>
      <p className="page-sub">{t('proj.sub')}</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
        <button className="btn btn-primary btn-mini" onClick={newProject}>{t('proj.newProject')}</button>
        {activeProject && <button className="btn btn-mini" onClick={newEpisode}>{t('proj.newVideo')}</button>}
        {activeProject && <button className="btn btn-mini" onClick={exportProject}>Dışa aktar</button>}
      </div>

      {projects.length === 0 && (
        <div className="card"><p className="hint">{t('proj.empty')}</p></div>
      )}

      {err && <span className="err" style={{ display: 'block', marginBottom: 14 }}>{err}</span>}

      {projects.length > 0 && (
        <div className="chips" style={{ marginBottom: 22 }}>
          {projects.map(p => (
            <span key={p.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              <button className={'chip' + (activeProject?.id === p.id ? ' on' : '')}
                onClick={() => selectProject(p)}
                style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>{p.name}</button>
              <button
                onClick={() => delProject(p)}
                title={t('proj.deleteProject')}
                style={{
                  border: '1.5px solid var(--line)', borderLeft: 'none', background: 'var(--panel)',
                  borderTopRightRadius: 20, borderBottomRightRadius: 20, padding: '8px 10px',
                  fontSize: 12, color: 'var(--muted)', cursor: 'pointer'
                }}>×</button>
            </span>
          ))}
        </div>
      )}

      {episodes.map(ep => {
        const sb = normalize(ep.storyboard);
        const isOpen = episodeId === ep.id;
        const p = progressOf(isOpen ? storyboard : sb);
        const fmt = FORMATS.find(f => f.k === (ep.format || sb.format))?.l;
        return (
          <div className="card" key={ep.id} style={{ marginBottom: 10, borderColor: isOpen ? 'var(--lamp)' : 'var(--line)' }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 3 }}>
                  {isOpen ? (storyboard.title || ep.title) : (sb.title || ep.title)}
                </div>
                <div className="hint" style={{ margin: 0 }}>
                  {fmt} · {sb.genre} · {p.scenes} sahne
                  {p.scenes > 0 && ' · %' + p.pct + ' ' + t('proj.complete')}
                </div>
              </div>
              {isOpen
                ? <span className="chip on" style={{ fontSize: 12 }}>{t('proj.opened')}</span>
                : <button className="btn btn-mini btn-primary" onClick={() => openEpisode(ep)}>Aç</button>}
              <button className="btn btn-mini" onClick={() => duplicate(ep)}>{t('common.duplicate')}</button>
              <button className="btn btn-mini btn-danger" onClick={() => del(ep)}>Sil</button>
            </div>
            {isOpen && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Link href="/studio/senaryo" className="btn btn-mini">{t('nav.script')}</Link>
                <Link href="/studio/storyboard" className="btn btn-mini">{t('nav.storyboard')}</Link>
                <Link href="/studio/promptlar" className="btn btn-mini">{t('nav.prompts')}</Link>
                <Link href="/studio/gorseller" className="btn btn-mini">{t('nav.images')}</Link>
                <Link href="/studio/seslendirme" className="btn btn-mini">{t('nav.voice')}</Link>
                <Link href="/studio/atolye" className="btn btn-mini">Kurgu</Link>
              </div>
            )}
          </div>
        );
      })}

      {activeProject && episodes.length === 0 && (
        <div className="card"><p className="hint">{t('proj.noVideos')}</p></div>
      )}
    </>
  );
}
