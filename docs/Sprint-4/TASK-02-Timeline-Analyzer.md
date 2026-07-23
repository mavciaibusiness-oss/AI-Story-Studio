# Sprint 4 — TASK-02
# Timeline Analyzer

Status: Planned
Priority: ⭐⭐⭐⭐⭐
Estimated Time: 2-3 Days

---

# Goal

AI Story Studio'da oluşturulan storyboard ile seslendirmeyi analiz ederek;

- sahne sürelerini otomatik hesaplamak,
- uzun veya kısa sahneleri tespit etmek,
- videonun toplam süresini tahmin etmek,
- kullanıcıya zaman çizelgesi (Timeline) göstermek.

Bu sistem Sprint 4'ün en önemli bileşenlerinden biridir çünkü ileride video editörünün temelini oluşturacaktır.

---

# Problem

Şu anda;

Storyboard var.

Seslendirme var.

Promptlar var.

Ancak sistem;

hangi sahnenin kaç saniye süreceğini bilmiyor.

Örneğin;

Scene 1
14 saniye

Scene 2
5 saniye

Scene 3
21 saniye

bunlar tamamen bilinmiyor.

Sonuç:

Google Flow'da

Runway'de

Pika'da

Luma'da

oluşturulan videolar düzensiz oluyor.

---

# Solution

Yeni bir Timeline Engine geliştirilecek.

Bu motor;

Storyboard

+

Voice Over

+

Video Metadata

analiz ederek otomatik timeline oluşturacak.

---

# Timeline Card

Her sahne için;

Scene 01

00:00 - 00:12

██████████

12 sec

--------------------

Scene 02

00:12 - 00:18

█████

6 sec

--------------------

Scene 03

00:18 - 00:31

████████████

13 sec

...

şeklinde gösterilecek.

---

# Hesaplama

Süre;

Voice Over kelime sayısından hesaplanacak.

Örnek:

90 kelime

↓

yaklaşık

35 saniye

Sonra;

her paragraf

ayrı analiz edilecek.

Örneğin;

Paragraph 1

18 kelime

↓

7 saniye

Paragraph 2

41 kelime

↓

15 saniye

Paragraph 3

11 kelime

↓

4 saniye

---

# AI Adjustment

Sadece kelime sayısı yeterli değil.

AI ayrıca;

nokta

virgül

ünlem

üç nokta

boşluk

duygusal duraklama

gibi etkenleri de analiz edecek.

Örneğin;

"Hayır..."

ile

"Hayır!"

aynı uzunlukta okunmaz.

Bu nedenle Timeline Analyzer buna göre saniyeleri düzeltecek.

---

# Timeline Preview

Kullanıcı;

Storyboard oluşturduğu anda;

hemen aşağıda;

Timeline Preview

görecek.

Örneğin;

00:00

Scene 1

--------------------

00:09

Scene 2

--------------------

00:16

Scene 3

--------------------

00:29

Scene 4

...

---

# Warnings

Timeline Analyzer;

çok kısa

ve

çok uzun

sahneleri tespit edecek.

Örneğin;

⚠ Scene 5

2 saniye

↓

Too Short

veya;

⚠ Scene 11

42 saniye

↓

Too Long

şeklinde uyarı verecek.

---

# Future Integration

Bu sistem;

Sprint 5 Video Editor

Sprint 6 Shorts Generator

Sprint 7 Auto Camera

Sprint 8 AI Director

modüllerinin temelini oluşturacaktır.

---

# Expected Result

Sprint sonunda kullanıcı;

Storyboard oluşturur.

↓

Voice Over ekler.

↓

Timeline otomatik oluşur.

↓

Her sahnenin süresi görünür.

↓

Toplam video süresi hesaplanır.

↓

Problemli sahneler işaretlenir.

↓

Video üretiminden önce tüm akış kontrol edilmiş olur.

---

Status

READY FOR IMPLEMENTATION