# Sprint-5 / TASK-04 — AI Workspace

Creator OS artık modüllerden oluşan bir uygulama olmaktan çıkıyor.

Bu task ile Creator OS'un ana çalışma ekranı geliştirilecek.

Kullanıcı onlarca sayfa arasında dolaşmayacak.

Tüm üretim süreci tek bir çalışma alanından yönetilecek.

---

# Amaç

AI Workspace;

Creator OS'un ana ekranıdır.

Kullanıcı uygulamayı açtığında artık onlarca menü yerine tek bir çalışma alanı görecektir.

Bu ekran;

AI Director

Creator Memory

Workflow

Project

Health

Timeline

Director

gibi modülleri tek merkezden yönetecektir.

---

# Workspace Felsefesi

Workspace;

dashboard değildir.

Panel değildir.

Admin ekranı değildir.

Bu ekran;

kullanıcının gün boyunca çalışacağı ana ortamdır.

Bilgisayar açıldığında ilk açılan yer burası olmalıdır.

---

# Workspace Yapısı

Workspace dört ana bölümden oluşacak.

---

## 1. AI Director Paneli

En üstte bulunur.

Kullanıcının son isteğini gösterir.

Örneğin

Bugün ne yapmak istiyorsun?

veya

Son çalışmana devam etmek ister misin?

veya

Bugün kanalın için yeni fikirler hazırladım.

AI Director her zaman ilk görülen bölüm olacak.

---

## 2. Active Workflow

Ortada aktif yol haritası bulunacak.

Örneğin

Video hazırlanıyor

██████░░░░

✓ Niche

✓ Senaryo

✓ Storyboard

► Görseller

□ Video

□ Thumbnail

□ Upload

Her adım canlı güncellenmeli.

---

## 3. Workspace Widgets

Sağ tarafta küçük kartlar.

Örneğin

Creator Memory

Bugünkü hedef

Son başarılar

Trend uyarıları

AI önerileri

Son projeler

Kullanıcı bunların yerini değiştirebilmeli.

---

## 4. Quick Actions

Alt bölüm.

En sık kullanılan işlemler.

Örneğin

Yeni Video

Yeni Reklam

Yeni Shorts

YouTube Kanalını Analiz Et

Web Sitesini Analiz Et

Ürün Reklamı Hazırla

Devam Et

---

# Workspace Durumları

Workspace boş görünmeyecek.

Her zaman bir durum gösterecek.

Örneğin

Henüz proje yok.

↓

İlk projeni oluşturalım.

veya

Video işleniyor.

↓

Tahmini süre:

2 dakika

veya

Bugün tamamlanacak 3 görev var.

---

# AI Director Entegrasyonu

Workspace tamamen AI Director tarafından yönetilecek.

AI Director;

hangi kartların gösterileceğine

hangi önerilerin sunulacağına

hangi işlemin sıradaki olduğuna

karar verecek.

Workspace yalnızca görüntüleme katmanıdır.

---

# Creator Memory Entegrasyonu

Workspace;

Creator Memory'den beslenecek.

Örneğin

"Genellikle Shorts üretiyorsun."

"Son 5 projende Pixar stilini kullandın."

"Geçen hafta yarım bıraktığın proje burada."

---

# Dynamic Workspace

Her kullanıcı aynı ekranı görmeyecek.

YouTube üreticisi

ile

E-Ticaret kullanıcısı

aynı Workspace'e sahip olmamalı.

Kartlar kullanım alışkanlıklarına göre değişebilmeli.

---

# Workspace Notifications

Bildirim sistemi oluştur.

Örneğin

AI yeni fikir hazırladı.

Trend değişti.

Video tamamlandı.

Thumbnail hazır.

Yeni görev eklendi.

Bildirimler Workspace içinde yönetilmeli.

---

# Acceptance Criteria

- AI Workspace ana ekranı
- Active Workflow paneli
- AI Director paneli
- Workspace Widget sistemi
- Quick Actions
- Notification sistemi
- Creator Memory entegrasyonu
- Dynamic Workspace desteği
- Responsive tasarım
- Workspace hiçbir zaman boş görünmez

---

# Development Rules

En fazla 6 adım.

Her adım sonunda;

- Runtime Test
- Regression Test
- Build

çalıştırılacak.

Her adım GitHub'a push edilecek.

ÖNEMLİ

Kod yazmadan önce mevcut Sprint-5 mimarisini incele.

Var olan Creator OS altyapısını kullan.

Yeni bir Workflow sistemi yazma.

Yeni bir Director sistemi yazma.

Yeni bir Memory sistemi yazma.

Workspace yalnızca mevcut sistemleri bir araya getiren üst katman olacaktır.

Kod tekrarından kaçın.

Creator OS mimarisini bozacak ikinci yapılar oluşturma.