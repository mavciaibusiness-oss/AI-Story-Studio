import './globals.css';
import { I18nProvider } from '@/lib/i18n';

export const metadata = {
  title: 'AI Content Studio — Fikirden yayına, tek pencere',
  description: 'YouTube, Shorts, TikTok, Reels ve belgesel için AI video üretim stüdyosu: senaryo, storyboard, prompt üretimi, kolaj bölme, sese kilitli kurgu, altyazı ve MP4 dışa aktarma.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        {/* Altyazı fontları — canvas'a çizilecekleri için önceden yüklenmeleri şart */}
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=Open+Sans:wght@400;600;700&family=Nunito:wght@400;600;700;800&family=Fredoka:wght@400;500;600;700&family=Baloo+2:wght@400;600;700&family=Comic+Neue:wght@400;700&family=Luckiest+Guy&display=swap" rel="stylesheet" />
      </head>
      <body><I18nProvider initial="tr">{children}</I18nProvider></body>
    </html>
  );
}
