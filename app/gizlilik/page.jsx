import Link from 'next/link';
export const metadata = { title: 'Gizlilik Politikası — AI Content Studio' };

export default function Gizlilik() {
  return (
    <div className="legal">
      <Link href="/" className="logo">AI Video <em>Studio</em></Link>
      <h1 style={{ marginTop: 30 }}>Gizlilik Politikası</h1>
      <p>Son güncelleme: 17 Temmuz 2026</p>

      <h2>Hangi verileri tutuyoruz</h2>
      <ul>
        <li><b>Hesap bilgisi:</b> e-posta adresin ve şifrelenmiş parolan.</li>
        <li><b>İçeriğin:</b> proje adları, hikâye metinleri, sahne promptları, karakter kartları ve bölüm durumları.</li>
        <li><b>Kullanım:</b> plan bilgin ve kalan AI kredin.</li>
      </ul>

      <h2>Hangi verileri tutmuyoruz</h2>
      <p>Görsellerin, ses dosyaların ve videoların sunucumuza yüklenmez. Kolaj bölme, seslendirme
        analizi ve video oluşturma tamamen kendi tarayıcında çalışır. Bu dosyalar bilgisayarından çıkmaz.</p>

      <h2>Verilerin nerede saklanıyor</h2>
      <p>Hesap ve içerik verileri Supabase (PostgreSQL) üzerinde tutulur. Satır bazlı güvenlik kuralları
        sayesinde yalnızca sen kendi kayıtlarını okuyabilir ve değiştirebilirsin.</p>

      <h2>Üçüncü taraf servisler</h2>
      <ul>
        <li><b>Supabase:</b> kimlik doğrulama ve veritabanı.</li>
        <li><b>Anthropic:</b> hikâye, prompt, çeviri ve yayın metni üretimi. Yalnızca gönderdiğin metin iletilir.</li>
        <li><b>Stripe:</b> ödeme. Kart bilgilerini biz görmeyiz, Stripe işler.</li>
        <li><b>Vercel:</b> barındırma.</li>
      </ul>

      <h2>Çerezler</h2>
      <p>Yalnızca oturumunu açık tutan zorunlu çerezleri kullanıyoruz. Reklam veya takip çerezi yok.</p>

      <h2>Haklarına dair</h2>
      <p>Verilerini indirmek, düzeltmek veya hesabını tamamen silmek istersen{' '}
        <Link href="/iletisim" style={{ color: 'var(--lamp)' }}>iletişim sayfasından</Link> yaz.
        Hesabını sildiğimizde tüm içeriğin kalıcı olarak kaldırılır.</p>

      <h2>Çocukların gizliliği</h2>
      <p>Bu araç çocuklar için içerik üreten yetişkinlere yöneliktir. 18 yaşından küçüklerden bilerek veri toplamıyoruz.</p>

      <p style={{ marginTop: 30 }}><Link href="/" style={{ color: 'var(--lamp)' }}>← Ana sayfa</Link></p>
    </div>
  );
}
