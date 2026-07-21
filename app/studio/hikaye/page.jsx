'use client';
import { useState } from 'react';
import { useStudio, callAI } from '@/lib/store';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

export const dynamic = 'force-dynamic';

const GENRES = ['Macera', 'Uyku masalı', 'Eğitici', 'Fantastik', 'Hayvanlar', 'Arkadaşlık', 'Sihir'];
const LENGTHS = ['5 dakika', '10 dakika', '20 dakika', '30 dakika', '60 dakika'];
const AGES = ['2-4', '4-6', '6-8', '8-10'];
const LANGS = ['Türkçe', 'İngilizce', 'İspanyolca', 'Almanca', 'Fransızca'];
const ENDINGS = ['Ders veren', 'Sıcak kapanış', 'Sürprizli', 'Uykuya yumuşak geçiş', 'Devamı var'];

export default function HikayeYazari() {
  const { activeEpisode, setActiveEpisode, spendCredits } = useStudio();
  const [genre, setGenre] = useState('Uyku masalı');
  const [length, setLength] = useState('10 dakika');
  const [age, setAge] = useState('4-6');
  const [lang, setLang] = useState('Türkçe');
  const [ending, setEnding] = useState('Sıcak kapanış');
  const [lesson, setLesson] = useState('');
  const [idea, setIdea] = useState('');
  const [story, setStory] = useState(activeEpisode?.story || '');
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);

  async function run(task, prompt, label) {
    setErr(null); setNote(null); setBusy(label);
    try {
      const { text, creditsLeft } = await callAI(task, prompt);
      setStory(text.trim());
      spendCredits(creditsLeft);
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  const base = () =>
    `Hedef kitle: ${age} yaş çocuklar. Tür: ${genre}. Dil: ${lang}. ` +
    `Seslendirme uzunluğu: ${length} (yaklaşık ${{'5 dakika':750,'10 dakika':1500,'20 dakika':3000,'30 dakika':4500,'60 dakika':9000}[length]} kelime). ` +
    `Kapanış tarzı: ${ending}.` + (lesson ? ` Vermesi gereken ders: ${lesson}.` : '');

  const write = () => run('story',
    `Bir çocuk hikâyesi yaz. ${base()}\n` +
    (idea ? `Fikir: ${idea}\n` : '') +
    `Kurallar: Sahne sahne ilerlesin, görselleştirmesi kolay olsun. Karakter adları tutarlı kalsın. ` +
    `Korkutucu veya tehlikeli davranışı özendiren içerik olmasın. Başlık ekleme, sadece hikâye metnini yaz. ` +
    `Bölüm başlıkları, madde işaretleri veya sahne numaraları yazma — düz akan anlatı olsun, seslendirmeye hazır.`,
    'Yazılıyor');

  const rework = (instruction, label) => {
    if (!story.trim()) return setErr('Önce bir hikâye yaz.');
    return run('story',
      `Aşağıdaki çocuk hikâyesini şu şekilde yeniden düzenle: ${instruction}\n` +
      `${base()}\nSadece yeni hikâye metnini döndür, açıklama yazma.\n\nHİKÂYE:\n${story}`, label);
  };

  async function saveToEpisode() {
    if (!activeEpisode) return setErr('Kaydetmek için Projeler sayfasından bir bölüm aç ("Düzenle").');
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.from('episodes')
        .update({ story, status: { ...(activeEpisode.status || {}), story: true }, updated_at: new Date().toISOString() })
        .eq('id', activeEpisode.id);
      if (error) throw error;
      setActiveEpisode({ ...activeEpisode, story, status: { ...(activeEpisode.status || {}), story: true } });
      setNote('"' + activeEpisode.title + '" bölümüne kaydedildi.');
    } catch (e) { setErr(e.message); }
  }

  const words = story.trim() ? story.trim().split(/\s+/).length : 0;

  return (
    <>
      <h1 className="page-title">Hikâye Yazarı</h1>
      <p className="page-sub">Ayarları seç, fikri yaz. Çıkan metin doğrudan seslendirmeye hazır olsun diye düz akar.</p>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <div className="field"><label>Tür</label>
            <select className="select" value={genre} onChange={e => setGenre(e.target.value)}>
              {GENRES.map(g => <option key={g}>{g}</option>)}
            </select></div>
          <div className="field"><label>Uzunluk</label>
            <select className="select" value={length} onChange={e => setLength(e.target.value)}>
              {LENGTHS.map(g => <option key={g}>{g}</option>)}
            </select></div>
          <div className="field"><label>Yaş</label>
            <select className="select" value={age} onChange={e => setAge(e.target.value)}>
              {AGES.map(g => <option key={g}>{g}</option>)}
            </select></div>
          <div className="field"><label>Dil</label>
            <select className="select" value={lang} onChange={e => setLang(e.target.value)}>
              {LANGS.map(g => <option key={g}>{g}</option>)}
            </select></div>
          <div className="field"><label>Kapanış</label>
            <select className="select" value={ending} onChange={e => setEnding(e.target.value)}>
              {ENDINGS.map(g => <option key={g}>{g}</option>)}
            </select></div>
          <div className="field"><label>Ders (isteğe bağlı)</label>
            <input className="input" value={lesson} onChange={e => setLesson(e.target.value)}
              placeholder="paylaşmak, cesaret…" /></div>
        </div>

        <div className="field">
          <label>Fikir</label>
          <input className="input" value={idea} onChange={e => setIdea(e.target.value)}
            placeholder="Bubu ormanda kaybolan bir ateş böceğine yardım eder" />
        </div>

        <button className="btn btn-primary" onClick={write} disabled={!!busy}>
          {busy === 'Yazılıyor' ? 'Yazılıyor…' : 'Hikâye yaz'}
        </button>
      </div>

      <h2 className="section-title">Metin {words > 0 && <span style={{ color: 'var(--lamp)' }}>· {words} kelime · ~{Math.round(words / 150)} dk</span>}</h2>
      <textarea className="textarea" style={{ minHeight: 320 }} value={story}
        onChange={e => setStory(e.target.value)} placeholder="Hikâye burada görünecek. Kendi metnini de yapıştırabilirsin." />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button className="btn btn-mini" disabled={!!busy} onClick={() => rework('Aynı olayları koruyarak baştan yaz, dili tazele.', 'Yeniden')}>Yeniden yaz</button>
        <button className="btn btn-mini" disabled={!!busy} onClick={() => rework('Hikâyeyi kaldığı yerden devam ettir ve tamamla.', 'Devam')}>Devam ettir</button>
        <button className="btn btn-mini" disabled={!!busy} onClick={() => rework('Yaklaşık üçte bir oranında kısalt, olay örgüsünü koru.', 'Kısalt')}>Kısalt</button>
        <button className="btn btn-mini" disabled={!!busy} onClick={() => rework('Sahneleri detaylandırarak yaklaşık yarı oranında uzat.', 'Uzat')}>Uzat</button>
        <button className="btn btn-mini" disabled={!!busy} onClick={() => rework('Sadece finali değiştir, gerisi aynı kalsın.', 'Final')}>Finali değiştir</button>
        <button className="btn btn-mini btn-primary" onClick={saveToEpisode}>Bölüme kaydet</button>
      </div>

      {busy && <div className="progress"><span>{busy}…</span><div className="track"><i className="fill" style={{ width: '60%' }} /></div></div>}
      {err && <span className="err">{err}</span>}
      {note && <span className="okmsg">{note}</span>}
    </>
  );
}
