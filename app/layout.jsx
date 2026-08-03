import './globals.css';
import { I18nProvider } from '@/lib/i18n';

/*
  Sprint-6 TASK-01: başlık ve açıklama Creator OS mesajına geçti.

  Hero değişince başlık eski kalmıştı — sekmede hâlâ "Create.
  Animate. Publish." yazıyordu. Spec'in kendi ifadesiyle: "İnsanlara
  AI Studio satmıyoruz, Creator OS satıyoruz." Sekme başlığı da o
  mesajın parçası; arama sonuçlarında ve paylaşımlarda görünen ilk
  şey.
*/
export const metadata = {
  title: 'AI Content Studio — İçerik üreticisinin işletim sistemi',
  description: 'Tek cümleyle fikrini söyle, Creator OS gerisini planlasın. Senaryo, storyboard, görsel, ses, altyazı ve yayın tek yerden yönetilir.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Inter:wght@400;450;500;600;700&display=swap" rel="stylesheet" />
        {/* Altyazı fontları — canvas'a çizilecekleri için önceden yüklenmeleri şart */}
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Open+Sans:wght@400;600;700&family=Nunito:wght@400;600;700;800&family=Fredoka:wght@400;500;600;700&family=Baloo+2:wght@400;600;700&family=Comic+Neue:wght@400;700&family=Luckiest+Guy&display=swap" rel="stylesheet" />
      </head>
      <body><I18nProvider initial="en">{children}</I18nProvider></body>
    </html>
  );
}
