import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/*
  TEK GİRİŞ EKRANI.

  Kullanıcı kararı: "/studio ve /studio/creator birleşsin — tek
  giriş ekranı olsun."

  Eskiden burada Dashboard vardı: bildirim çubuğu, davet kutusu,
  pazarlama başlığı, devam kartı ve iki büyük seçim kartı üst
  üste. Beşi de aynı anda "şunu yap" diyordu.

  Artık tek giriş noktası Creator OS. Sol menüdeki "Genel Bakış"
  da buraya geliyor — kullanıcı nereden tıklarsa tıklasın aynı
  sade ekranı görüyor.

  RAPORLAR KAYBOLMADI: Dashboard bölümleri (DashboardSections)
  Creator OS'un altında, katlanmış "Geçmiş ve ayrıntılar" kutusunda
  duruyor (Sprint-6 TASK-07).
*/
export default function Studio() {
  redirect('/studio/creator');
}
