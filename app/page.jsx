import Link from 'next/link';

const PIPELINE = [
  { icon: '✍️', name: 'Senaryo', desc: 'sahnelere bölünmüş' },
  { icon: '▦', name: 'Storyboard', desc: 'tek veri modeli' },
  { icon: '⌘', name: 'Prompt', desc: 'yedi katman' },
  { icon: '▣', name: 'Görsel', desc: 'kolaj ya da tek tek' },
  { icon: '♪', name: 'Ses', desc: 'sahne başına' },
  { icon: '🎬', name: 'Kurgu', desc: 'sese kilitli' },
  { icon: '↗', name: 'Yayın', desc: 'başlık, etiket, SRT' },
];

export default function Home() {
  return (
    <>
      <div className="container">
        <nav className="nav">
          <Link href="/" className="logo">AI Content <em>Studio</em></Link>
          <div style={{ display: 'flex', gap: 10 }}>
            <Link href="#nasil" className="btn btn-mini">Nasıl çalışır</Link>
            <Link href="#fiyat" className="btn btn-mini">Fiyatlar</Link>
            <Link href="/giris" className="btn btn-mini btn-primary">Giriş Yap</Link>
          </div>
        </nav>

        {/* ===== ANA BÖLÜM: Yol Seçimi ===== */}
        <header className="hero" style={{ paddingBottom: 20 }}>
          <h1>Nasıl başlamak istersin?</h1>
          <p style={{ maxWidth: 520, margin: '0 auto 30px', color: 'var(--muted)' }}>
            İki yol var. Birini seç, hemen başla.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18, maxWidth: 680, margin: '0 auto' }}>
            <Link href="/giris?path=ai" className="path-card" style={{ textDecoration: 'none' }}>
              <div className="path-icon">✨</div>
              <div className="path-name">AI ile Oluştur</div>
              <p className="path-desc">Sadece bir fikir yaz. Yapay zeka senaryoyu, görselleri ve videoyu üretsin.</p>
              <span className="btn btn-primary" style={{ marginTop: 14 }}>AI ile Başla</span>
            </Link>
            <Link href="/giris?path=own" className="path-card" style={{ textDecoration: 'none' }}>
              <div className="path-icon">🎬</div>
              <div className="path-name">Kendi İçeriğim Hazır</div>
              <p className="path-desc">Seslendirme metnin ve görsellerini hazırla, uygulama videoyu kursun.</p>
              <span className="btn btn-primary" style={{ marginTop: 14 }}>Kendi İçeriğimle Başla</span>
            </Link>
          </div>
        </header>

        {/* ===== NASIL ÇALIŞIR ===== */}
        <h2 className="section-title" id="nasil">Nasıl çalışır</h2>
        <div className="filmstrip" aria-label="Üretim hattı adımları">
          <div className="filmstrip-track">
            {PIPELINE.map((f, i) => (
              <div key={f.name} className={'frame' + (i === 5 ? ' lit' : '')}>
                <div className="f-icon" aria-hidden="true">{f.icon}</div>
                <div className="f-name">{f.name}</div>
                <div className="f-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <h2 className="section-title">Ne yapar</h2>
        <div className="features">
          <div className="card feature">
            <h3>Sese kilitli kurgu</h3>
            <p>Her sahnenin kendi ses dosyası var. Ses bitince sahne değişir. Sabit süre yok, tahmin yok, kayma yok.</p>
          </div>
          <div className="card feature">
            <h3>Kolaj ya da tek tek</h3>
            <p>3×3, 4×4, 5×5 ızgarayı tanır ve böler. Ya da tek tek ürettiğin görselleri doğrudan sahnelere bağla.</p>
          </div>
          <div className="card feature">
            <h3>Karakterler kaymaz</h3>
            <p>İnsan, robot, anime, uzaylı — kartı bir kez doldur, kilitle. Her sahnenin promptu aynı tanımı taşır.</p>
          </div>
          <div className="card feature">
            <h3>On iki dilde altyazı</h3>
            <p>Altyazı senaryonun kendisinden çıkar, sesin sınırlarına oturur. SRT, VTT, TXT.</p>
          </div>
          <div className="card feature">
            <h3>Her format</h3>
            <p>YouTube 16:9, Shorts ve TikTok 9:16, Reels, kare podcast klibi. En boy oranı senaryoyla birlikte seçilir.</p>
          </div>
          <div className="card feature">
            <h3>Sahneyi tek tek düzelt</h3>
            <p>17. sahne tutmadıysa yalnızca onu yeniden üret. Gerisi olduğu gibi kalır.</p>
          </div>
        </div>

        {/* ===== FİYATLANDIRMA ===== */}
        <h2 className="section-title" id="fiyat">Fiyat</h2>
        <div className="pricing">
          <div className="card price-card">
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>Başlangıç</div>
            <div className="amount">Ücretsiz</div>
            <div className="per">kredi kartı istemez</div>
            <ul>
              <li>2 proje</li>
              <li>Ayda 100 AI kredisi</li>
              <li>Kolaj bölme sınırsız</li>
              <li>Video ve altyazı dışa aktarma</li>
              <li>Filigranlı çıktı</li>
            </ul>
            <Link href="/giris" className="btn" style={{ width: '100%', justifyContent: 'center' }}>Ücretsiz Başla</Link>
          </div>
          <div className="card price-card pro">
            <div style={{ fontSize: 13, color: 'var(--lamp)' }}>Pro</div>
            <div className="amount">₺499</div>
            <div className="per">aylık, KDV dahil</div>
            <ul>
              <li>Sınırsız proje ve bölüm</li>
              <li>Ayda 5.000 AI kredisi</li>
              <li>Filigransız 1440p çıktı</li>
              <li>Karakter kütüphanesi ve prompt katmanları</li>
              <li>On iki dilde altyazı ve yayın metinleri</li>
            </ul>
            <Link href="/giris" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Pro'ya Geç</Link>
          </div>
        </div>
        <p className="hint" style={{ textAlign: 'center', marginTop: 14 }}>
          Video, ses ve görsel işleme senin bilgisayarında yapılır. Dosyaların sunucuya yüklenmez.
        </p>

        <footer className="landing-footer">
          <div>© {new Date().getFullYear()} AI Content Studio</div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <Link href="/gizlilik">Gizlilik</Link>
            <Link href="/kullanim-kosullari">Kullanım Koşulları</Link>
            <Link href="/kvkk">KVKK Aydınlatma</Link>
            <Link href="/iletisim">İletişim</Link>
          </div>
        </footer>
      </div>
    </>
  );
}
