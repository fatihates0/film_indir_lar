# Laravel + Hetzner Storage Box + Plex + Kullanıcı Bazlı Kota Sistemi

## 0. PROJENİN ANA AMACI

Laravel tabanlı bir medya/dosya platformu geliştir.

Sistemin temel amacı:

1. Film ve dizi dosyaları **Hetzner Storage Box** üzerinde tutulacak.
2. Kullanıcılar Laravel hesabıyla sisteme giriş yapacak.
3. Kullanıcılar kendilerine izin verilen filmleri:

   * PC'ye doğrudan indirebilecek,
   * IDM gibi download manager'larla indirebilecek,
   * Plex üzerinden TV / mobil / bilgisayar gibi cihazlardan izleyebilecek.
4. Her Laravel kullanıcısına bağımsız bir aylık/30 günlük GB kotası atanabilecek.
5. Örneğin:

   * `x_1` → 1000 GB / 30 gün
   * `x_2` → 2000 GB / 30 gün
   * `x_3` → 500 GB / 30 gün
6. Kullanıcı ister indirme ister Plex üzerinden tüketim gerçekleştirsin, kullanım aynı kota havuzundan düşecek.
7. 30 günlük dönem sona erdiğinde kullanım sıfırlanacak ve yeni dönem başlayacak.
8. Kullanıcıya kalan kota, kullanılan kota, dönem başlangıcı ve dönem bitişi gösterilecek.
9. Admin panelinden kullanıcı bazlı kota atanabilecek/değiştirilebilecek.
10. Sistem yüksek sayıda kullanıcı ve büyük medya dosyaları düşünülerek tasarlanacak.
11. Laravel mümkün olduğunca dosya trafiğinin gereksiz proxy'si haline getirilmeyecek.
12. IDM'nin pause/resume ve çoklu bağlantı özellikleri mümkün olduğunca desteklenecek.
13. Plex tarafındaki tüketim ölçümü gerçek veri aktarımına mümkün olduğunca yakın ve doğrulanabilir şekilde yapılacak.

---

# 1. ÇOK ÖNEMLİ GELİŞTİRME KURALI

Bu projeyi geliştirirken hiçbir teknik özelliği varsayma.

Özellikle:

* Plex API
* Plex webhook
* Plex playback session
* Plex bandwidth bilgileri
* Plex kullanıcı kimliği
* Plex token
* Storage Box protokolleri
* Storage Box bağlantı limitleri
* HTTP Range
* HTTP 206 Partial Content
* IDM resume
* HTTP streaming
* Laravel filesystem
* Symfony StreamedResponse
* Nginx X-Accel-Redirect
* Storage Box SMB/WebDAV/SFTP erişimi

konularında, desteklenmeyen bir özelliği varmış gibi kabul etme.

Bir API veya özellik gerekiyorsa önce güncel resmi dokümantasyonu araştır.

Bir özelliğin Plex tarafından doğrudan desteklenmediği ortaya çıkarsa:

* sahte API yazma,
* uydurma endpoint oluşturma,
* olmayan webhook event'i varsayma,
* olmayan bandwidth değerini Plex'ten alıyormuş gibi gösterme.

Bunun yerine mimariyi gerçek ve doğrulanabilir yöntemle kur.

Kod içinde `TODO: VERIFY` gibi bırakmak yerine mümkünse alternatif gerçek çözümü uygula.

---

# 2. TEKNOLOJİ YIĞINI

Backend:

* Laravel 12 veya projenin mevcut Laravel sürümü
* PHP 8.3+ tercih et
* MySQL veya MariaDB
* Redis
* Laravel Queue
* Laravel Scheduler
* Laravel Cache
* Laravel Events / Listeners
* Laravel Policies / Gates
* Laravel Sanctum gerektiğinde

Frontend:

* Mevcut proje yapısına uy.
* Eğer yeni proje ise:

  * React
  * Inertia.js
  * Tailwind CSS
* Admin panel responsive olacak.

Sunucu:

* Linux
* Nginx
* PHP-FPM
* Redis
* MySQL/MariaDB
* FFmpeg yalnızca gerekiyorsa medya metadata işlemleri için kullanılabilir.
* Storage Box bağlantısı mümkünse sistem seviyesinde mount edilerek kullanılmalı.

Plex:

* Ayrı Plex Media Server.
* Plex'in gerçek desteklediği API/özellikler kullanılmalı.

Storage:

* Hetzner Storage Box.

---

# 3. TEMEL MİMARİ

Önerilen yapı:

```text
                         INTERNET
                            |
             +--------------+--------------+
             |                             |
             v                             v
       Laravel Web                    Plex Server
             |                             |
             |                             |
             v                             v
       Redis / MySQL               Media Filesystem
             |                             |
             +--------------+--------------+
                            |
                            v
                   Hetzner Storage Box
                            |
                            v
                  Films / Series / Media
```

Ancak dosya transferi için mümkün olduğunca:

```text
Storage Box
     |
     v
HTTP/HTTPS Download Endpoint
     |
     v
User / IDM
```

ve Plex için:

```text
Storage Box
     |
     v
Plex Media Server
     |
     v
User Device
```

kullan.

Laravel yalnızca:

* authentication,
* authorization,
* quota,
* signed URL,
* download authorization,
* usage tracking,
* Plex user association,
* logging

işlerini yönetsin.

Laravel'in 20 GB / 50 GB / 100 GB film dosyalarını PHP üzerinden sürekli proxy etmesi varsayılan mimari olmasın.

---

# 4. STORAGE BOX

Storage Box yalnızca medya depolama alanı olarak kullanılacak.

Örnek:

```text
/Filmler
    /A
    /B
    /C
    ...

/Diziler
    /The Wire
    /Peaky Blinders
    /Silo
    ...
```

Dosya isimleri Unicode desteklemeli.

Türkçe karakterler dahil:

```text
Ç
ç
Ğ
ğ
İ
ı
Ö
ö
Ş
ş
Ü
ü
```

sorunsuz çalışmalı.

---

# 5. STORAGE BOX ERİŞİMİ

Storage Box'a erişim için sistem seviyesinde mount tercih et.

Örneğin:

```text
/mnt/storagebox
```

ve:

```text
/mnt/storagebox/Filmler
/mnt/storagebox/Diziler
```

gibi.

Mount işlemini Laravel'e bağlama.

Linux mount:

* `/etc/fstab`
* credentials dosyası
* uygun permissions
* systemd mount
* network-online.target

ile güvenli şekilde yönetilebilir.

Storage Box parolası:

* `.env`
* root-only credentials file
* secret management

ile saklanmalı.

Asla:

* Git'e,
* frontend JavaScript'e,
* database plaintext alanına,
* loglara

Storage Box şifresi yazılmamalı.

---

# 6. MEDIA LIBRARY

Laravel içerisinde medya kütüphanesi oluştur.

Tablo:

```text
media
```

Önerilen alanlar:

```text
id
type
title
original_title
year
slug
file_path
file_name
file_size
mime_type
extension
duration_seconds
width
height
video_codec
audio_codec
audio_channels
audio_language
subtitle_languages
fps
bitrate
storage_disk
is_active
created_at
updated_at
```

`type`:

```text
movie
series
episode
```

olabilir.

---

# 7. MEDIA SCANNER

Admin'in çalıştırabileceği:

```text
Scan Storage
```

özelliği oluştur.

Storage Box'taki dosyaları tarayarak database'e aktar.

Tarama:

* mevcut dosyayı tekrar eklememeli,
* silinen dosyayı algılamalı,
* değişen dosyanın metadata'sını güncellemeli,
* büyük kütüphanede queue kullanmalı.

Metadata için gerekirse:

```bash
ffprobe
```

kullan.

Her dosyada mümkün olduğunca:

* file size
* duration
* video codec
* audio codec
* bitrate
* channels
* sample rate
* fps
* resolution

tespit et.

---

# 8. KULLANICILAR

Laravel kullanıcı sistemi kullanılacak.

`users` tablosuna veya ayrı profile/quota tablolarına kota bilgilerini dağıt.

Kullanıcıların:

```text
username
email
password
status
```

gibi normal alanları olsun.

Ayrıca:

```text
quota_plan_id
plex_enabled
download_enabled
status
```

gibi yetkiler bulunabilir.

---

# 9. KOTA SİSTEMİ

Bu projenin en önemli bölümü.

Kullanıcıya örneğin:

```text
1000 GB
```

kota atanabilir.

Başka kullanıcı:

```text
2000 GB
```

kullanabilir.

Kota kullanıcı bazlıdır.

---

# 10. KOTA PERİYODU

Takvim ayı kullanma.

30 günlük rolling period kullan.

Örneğin:

```text
Başlangıç:
27.09.2026 22:00:00

Bitiş:
27.10.2026 22:00:00
```

Kullanıcı sisteme ilk tanımlandığında period başlat.

Alanlar:

```text
quota_limit_bytes
used_bytes
period_started_at
period_expires_at
```

Önerilen ayrı tablo:

```text
user_quotas
```

---

# 11. KOTA RESET

Her kullanıcı kendi dönemine sahip olabilir.

Scheduler her dakika veya uygun aralıkla kontrol etsin.

Örneğin:

```text
if now >= period_expires_at
```

ise:

```text
used_bytes = 0
period_started_at = old period_expires_at
period_expires_at = old period_expires_at + 30 days
```

Ancak sistem uzun süre çalışmadıysa tek bir reset yerine doğru yeni dönemi hesapla.

Örneğin scheduler 5 gün kapalı kaldıysa:

```text
expired period
expired period
expired period
```

hesaplaması gerekmiyorsa doğrudan mevcut tarihe göre yeni 30 günlük dönem oluşturulabilir.

Bunun davranışını net ve test edilebilir şekilde tasarla.

---

# 12. KOTA BİRİMİ

Database'de GB olarak float kullanma.

Her şeyi:

```text
bytes
```

olarak integer sakla.

Örneğin:

```text
quota_limit_bytes BIGINT UNSIGNED
used_bytes BIGINT UNSIGNED
```

UI'da:

```text
1000 GB
```

göster.

Database:

```text
1073741824000
```

gibi byte değeri saklasın.

UI için:

```text
GB
TB
MB
```

formatlayıcı oluştur.

---

# 13. KOTA HAREKETLERİ

Sadece `used_bytes` tutma.

Ayrıca immutable kullanım kayıtları oluştur.

Tablo:

```text
quota_usage_records
```

Alanlar:

```text
id
user_id
quota_period_id
source
media_id
download_id
bytes
started_at
completed_at
metadata
created_at
```

`source`:

```text
download
plex
```

olabilir.

Örneğin:

```text
x_1
Film A
download
18.3 GB
```

ve:

```text
x_1
Film B
plex
7.2 GB
```

şeklinde kayıt tutulabilsin.

---

# 14. ATOMIC QUOTA UPDATE

Aynı anda iki cihaz kullanabilir.

Örneğin:

```text
PC download
+
Plex playback
```

aynı anda gerçekleşebilir.

Bu nedenle:

```text
used_bytes
```

update işlemi race condition yaratmamalı.

Database transaction ve row lock kullan.

Örneğin:

```text
SELECT ... FOR UPDATE
```

veya Laravel'in transaction/lock mekanizmaları.

Şu durum kesinlikle oluşmamalı:

```text
Kota = 100 GB

Download A → 80 GB
Download B → 50 GB

İkisi aynı anda başladı.

Sistem yanlışlıkla:
80 GB
veya
50 GB

yazmamalı.
```

Doğru davranış:

```text
130 GB > 100 GB
```

ise politika gereği ikinci işlem reddedilmeli veya yalnızca kullanılabilir byte kadar izin verilmelidir.

---

# 15. DOWNLOAD SİSTEMİ

Kullanıcı media sayfasında:

```text
İndir
```

butonuna sahip olsun.

Butona basınca Laravel:

1. Kullanıcı login mi?
2. Kullanıcı aktif mi?
3. Download yetkisi var mı?
4. Media aktif mi?
5. Dosya gerçekten mevcut mu?
6. Kota yeterli mi?
7. Dosya boyutu nedir?
8. Kullanıcı bu medyaya erişebilir mi?

kontrol etsin.

---

# 16. DOWNLOAD LINK

Download için kısa ömürlü signed URL kullan.

Örneğin:

```text
/download/secure/{token}
```

veya Laravel signed route.

Token:

* kullanıcıya bağlı,
* dosyaya bağlı,
* expiration'a bağlı,
* mümkünse tek kullanımlık veya kontrollü tekrar kullanım destekli.

URL'nin süresi örneğin:

```text
1 saat
```

olabilir.

Ancak IDM resume için URL'nin çok kısa sürede expire olması sorun yaratabilir.

Bu yüzden download authorization ile actual file transfer süresini birbirinden ayır.

---

# 17. IDM DESTEĞİ

Sistem IDM ile kullanılabilecek şekilde HTTP Range desteklemeli.

Aşağıdaki HTTP davranışları doğru çalışmalı:

```text
Range: bytes=0-1048575
```

ve:

```text
206 Partial Content
```

Ayrıca:

```text
Accept-Ranges: bytes
Content-Length
Content-Range
Content-Disposition
Content-Type
```

header'ları doğru olmalı.

IDM'nin:

* pause
* resume
* multi-thread download

özelliklerini bozma.

---

# 18. DOWNLOAD KOTA HESAPLAMA

Burada çok önemli bir karar uygulanacak.

Dosyanın tamamını kullanıcı kota kullanımına peşinen ekleme.

Örneğin:

```text
Film = 30 GB
```

kullanıcı yalnızca:

```text
8 GB
```

indirdiyse:

```text
8 GB
```

kullanıma yazılmalı.

IDM resume yaptığında daha önce indirilen byte tekrar kota tüketimi olarak sayılmamalı.

Bunun için download session sistemi oluştur.

---

# 19. DOWNLOAD SESSION

Tablo:

```text
download_sessions
```

alanları:

```text
id
user_id
media_id
token
file_size
bytes_transferred
last_byte_position
status
started_at
last_activity_at
completed_at
expires_at
ip_address
user_agent
```

Ancak çoklu IDM bağlantılarında aynı dosyanın farklı Range parçalarının birbirine karışmaması gerekir.

Her transfer session için:

```text
download_id
```

oluştur.

Bir IDM dosyası 8 parçaya bölünürse:

```text
Download Session
   ├── Range 1
   ├── Range 2
   ├── Range 3
   ├── Range 4
   ├── ...
```

mantığı kullanılabilir.

Aynı byte'ın iki kez sayılmasını engelle.

---

# 20. DOWNLOAD BYTE TRACKING

Mümkünse gerçekten istemciye gönderilen byte miktarını ölç.

Fakat PHP'nin bütün büyük dosyayı proxy etmesi zorunlu olmasın.

Tercih sırası:

### 1. Nginx internal redirect / X-Accel-Redirect

Eğer Storage Box filesystem olarak mount edilmişse:

```text
Laravel
    ↓
authorization
    ↓
X-Accel-Redirect
    ↓
Nginx
    ↓
Storage Box mounted filesystem
```

tasarımı değerlendir.

Bu, PHP worker'ın dosya aktarımı sırasında meşgul kalmasını engeller.

### 2. Alternatif download gateway

Gerekirse ayrı bir download service kullanılabilir.

Ama gereksiz mikroservis oluşturma.

---

# 21. DOWNLOAD KOTA DOĞRULUĞU

Kullanım kaydını:

```text
download requested
```

anında değil,

gerçekten aktarılan byte miktarına göre hesapla.

Fakat Nginx'in doğrudan dosya göndermesi durumunda Laravel'in gerçek byte miktarını nasıl güvenilir şekilde öğrenebileceğini araştır.

Bu mümkün değilse:

* bunu açıkça dokümante et,
* güvenilir approximate yöntem kullanma konusunda admin'e seçenek sun,
* sahte kesinlik gösterme.

---

# 22. PLEX ENTEGRASYONU

Plex tarafında kullanıcıların Laravel kullanıcılarıyla ilişkilendirilmesi gerekiyor.

Örneğin:

```text
Laravel user
x_1

Plex user
Fatih
```

eşleştirilebilir.

Tablo:

```text
plex_users
```

veya:

```text
user_plex_accounts
```

oluştur.

Alanlar:

```text
id
user_id
plex_user_identifier
plex_username
plex_email
is_active
metadata
created_at
updated_at
```

Plex token gerekiyorsa plaintext olarak database'e koyma.

Encrypted cast kullan.

---

# 23. PLEX API ARAŞTIRMASI

Geliştirmeye başlamadan önce güncel Plex API imkanlarını araştır.

Özellikle:

* Plex server API
* Plex identity
* Plex sessions
* Plex playback state
* Plex user identity
* Plex bandwidth
* Plex webhook
* Plex history
* Plex Tautulli integration imkanları

araştırılmalı.

Kullanılacak her yöntem gerçek ve güncel dokümana dayanmalı.

---

# 24. PLEX KOTA ÖLÇÜMÜ

Sistemin hedefi:

```text
Plex'te kullanıcı 8.7 GB veri tüketti
↓
8.7 GB kullanıcının kotasından düş
```

Ancak Plex'in playback session bilgisinin doğrudan "bu kullanıcı şu kadar byte internet tüketti" verisi verip vermediğini varsayma.

Gerçekten sunulan veriyi doğrula.

---

# 25. PLEX İÇİN İKİ ÖLÇÜM MODU

Admin panelinde:

```text
Plex Quota Accounting Mode
```

olsun.

Seçenekler:

```text
A) Actual Network Usage
B) Media File Size
C) Playback Duration Based
```

Fakat varsayılan olarak yalnızca teknik olarak güvenilir yöntem aktif olsun.

Eğer "Actual Network Usage" Plex API ile doğrudan alınamıyorsa bunu admin'e:

```text
Not directly available from Plex API
```

şeklinde göster.

Uydurma ölçüm yapma.

---

# 26. PLEX STREAMING İÇİN MEDYA BOYUTU YÖNTEMİ

Eğer gerçek network byte ölçümü Plex'ten alınamıyorsa alternatif olarak:

```text
playback start
+
playback progress
+
media bitrate
```

üzerinden yaklaşık tüketim hesaplanabilir.

Ancak bu:

```text
GERÇEK NETWORK KULLANIMI
```

olarak gösterilmemeli.

UI'da:

```text
Estimated Plex Usage
```

olarak gösterilmeli.

---

# 27. PLEX TRANSCODING

Plex kullanıcıları farklı cihazlardan bağlanabilir.

Örneğin:

```text
Direct Play
Direct Stream
Transcode
```

olabilir.

Kota hesaplamasında mümkünse gerçekten network üzerinden gönderilen veri esas alınmalı.

Dosyanın fiziksel boyutunu kör şekilde düşme.

Örneğin:

```text
40 GB MKV
```

4K Direct Play ile farklı,
1080p Transcode ile farklı,
mobil düşük kalite ile farklı veri tüketebilir.

Bu yüzden:

```text
file_size
```

ile:

```text
actual_transfer
```

ayrı kavramlar olarak tutulmalı.

---

# 28. PLEX KULLANICISI KOTA BİTİRİRSE

Kullanıcının kotası:

```text
0 bytes
```

olduğunda:

```text
Download = disabled
Plex = disabled
```

olmalı.

Ancak Plex tarafında mevcut aktif stream'in anında durdurulması mümkün değilse:

1. yeni playback başlatma engellenir,
2. aktif session varsa mümkün olan gerçek Plex API yöntemiyle sonlandırılır,
3. desteklenmiyorsa mevcut playback'in dönem sonunda/sonraki request'te engellenmesi davranışı uygulanır.

Kullanıcıya yanlış bilgi verme.

---

# 29. KOTA NEGATİFE DÜŞMEMELİ

Asla:

```text
used_bytes > quota_limit_bytes
```

normal durum haline gelmemeli.

Bütün kota işlemlerinde:

```text
remaining_bytes =
quota_limit_bytes - used_bytes
```

kontrol edilmeli.

---

# 30. KOTA AŞIMI POLİTİKASI

Admin panelinden politika seçilebilsin:

```text
Hard Limit
Soft Limit
```

### Hard Limit

Kota bitince yeni kullanım engellenir.

### Soft Limit

Kullanıcı kısa süreli olarak aşabilir.

Ancak ilk versiyonda:

```text
Hard Limit
```

varsayılan olsun.

---

# 31. DOSYA ERİŞİM KONTROLÜ

Kullanıcı Storage Box'a doğrudan erişmemeli.

Asla kullanıcıya:

```text
smb://...
sftp://...
```

Storage Box credentials verme.

Storage Box:

```text
PRIVATE
```

kalmalı.

Kullanıcı:

```text
Laravel authorization
```

üzerinden dosyaya erişmeli.

---

# 32. SECURITY

Şunları kesinlikle yap:

* CSRF
* XSS protection
* SQL injection protection
* rate limiting
* brute force protection
* signed URL
* authorization policy
* encrypted secrets
* secure cookies
* HTTPS
* session security
* audit logs
* IP logging
* user agent logging

Dosya yolu kullanıcıdan doğrudan alınmamalı.

Şunu yapma:

```php
Storage::get($request->path);
```

Path traversal engellenmeli.

Şunları kesinlikle engelle:

```text
../
..\ 
/etc/passwd
C:\Windows
```

ve benzeri.

---

# 33. ADMIN PANEL

Admin aşağıdakileri yönetebilmeli.

## Dashboard

Göster:

```text
Toplam kullanıcı
Aktif kullanıcı
Toplam medya
Toplam depolama
Bugünkü download
Bugünkü Plex kullanım
Aktif download
Aktif Plex session
Toplam kota
Toplam kullanılan kota
```

---

# 34. USER MANAGEMENT

Admin:

```text
Users
```

sayfasında:

```text
Username
Email
Status
Quota
Used
Remaining
Period
Download
Plex
```

görmeli.

Kullanıcı detayında:

```text
Quota:
1000 GB

Used:
320.4 GB

Remaining:
679.6 GB

Period:
27 Sep → 27 Oct
```

---

# 35. USER QUOTA EDIT

Admin:

```text
Quota:
1000 GB
```

değerini:

```text
2000 GB
```

yapabilmeli.

Değişikliğin ne zaman etkili olacağı net tanımlanmalı.

Önerilen davranış:

```text
Yeni kota mevcut dönemde uygulanır.
```

Örneğin:

```text
1000 GB
kullanılmış 400 GB

Admin → 2000 GB

Kalan:
1600 GB
```

olur.

Ancak kota düşürülürse:

```text
2000 GB → 500 GB
```

ve kullanıcı zaten:

```text
700 GB
```

kullanmışsa:

```text
used_bytes > quota_limit_bytes
```

durumu oluşabilir.

Bu durumda admin UI uyarı vermeli.

Politika:

```text
Yeni limit mevcut kullanımın altında olamaz
```

veya admin açık onay vermelidir.

---

# 36. QUOTA PLANLARI

İstersen kullanıcıya doğrudan GB vermek yerine plan sistemi oluştur.

Tablo:

```text
quota_plans
```

Örneğin:

```text
Free
500 GB
1000 GB
2000 GB
5000 GB
```

Kullanıcı plana atanabilir.

Ama custom quota da desteklenmeli.

---

# 37. MEDIA ACCESS

Her medya için:

```text
is_public
is_active
requires_permission
```

gibi alanlar olabilir.

Gelecekte kullanıcı grupları eklenebilmesi için mimariyi hazırla.

Örneğin:

```text
User
   ↓
Role
   ↓
Media Permission
```

---

# 38. DOWNLOAD HISTORY

Kullanıcı kendi geçmişini görebilmeli:

```text
Film
Başlangıç
Tamamlanan
İndirilen GB
Durum
```

Örnek:

```text
Film A
27.09.2026 18:30
Completed
18.4 GB
```

---

# 39. PLEX HISTORY

Kullanıcı kendi Plex kullanımını görebilmeli:

```text
Film
Başlangıç
Süre
Estimated / Actual Usage
```

Örneğin:

```text
Film B
27.09.2026
01:42:13
7.2 GB
```

---

# 40. KOTA DASHBOARD

Kullanıcı ana sayfasında büyük bir kota kartı:

```text
Kullanım

320.4 GB / 1000 GB

████████░░░░░░░░░░

Kalan:
679.6 GB

Dönem:
27 Eylül - 27 Ekim

Sıfırlanmaya:
12 gün 4 saat
```

göster.

---

# 41. KOTA TÜKETİM GRAFİĞİ

Son 30 günlük kullanım:

```text
Downloads
Plex
Total
```

ayrı gösterilebilir.

Örneğin:

```text
Download: 230 GB
Plex:      90 GB
Total:    320 GB
```

---

# 42. API

Frontend için REST/JSON API oluştur.

Örneğin:

```text
GET /api/me/quota
GET /api/me/usage
GET /api/me/downloads
GET /api/me/plex
GET /api/media
GET /api/media/{id}
POST /api/media/{id}/download
```

Admin:

```text
GET /api/admin/users
GET /api/admin/users/{id}
PATCH /api/admin/users/{id}/quota
GET /api/admin/quota/usage
```

---

# 43. API RESPONSE ÖRNEĞİ

```json
{
    "quota": {
        "limit_bytes": 1073741824000,
        "used_bytes": 343597383680,
        "remaining_bytes": 730144440320,
        "limit_gb": 1000,
        "used_gb": 320,
        "remaining_gb": 680,
        "period_started_at": "2026-09-27T22:00:00+03:00",
        "period_expires_at": "2026-10-27T22:00:00+03:00"
    }
}
```

---

# 44. DATABASE TASARIMI

En az aşağıdaki tabloları değerlendir:

```text
users
media
quota_plans
quota_periods
quota_usage_records
download_sessions
plex_accounts
plex_usage_sessions
media_permissions
audit_logs
```

Foreign key'ler düzgün kurulmalı.

Index'ler:

```text
user_id
media_id
period_id
status
created_at
started_at
```

üzerinde gerektiğinde oluşturulmalı.

---

# 45. QUEUE

Ağır işlemleri queue'ya al:

```text
media scan
ffprobe
Plex synchronization
usage aggregation
expired session cleanup
quota reset
audit processing
```

Download transferinin kendisini Laravel queue job'ına koyma.

---

# 46. SCHEDULER

Scheduler:

```text
quota reset
expired download sessions cleanup
plex sync
usage reconciliation
media consistency check
```

işlemlerini yönetmeli.

Örneğin:

```text
php artisan schedule:work
```

ve production'da cron kullanılabilir.

---

# 47. USAGE RECONCILIATION

Kota sistemi yalnızca canlı sayaçlara güvenmemeli.

Periyodik olarak:

```text
quota_usage_records
```

toplanarak:

```text
used_bytes
```

ile karşılaştırılmalı.

Örneğin her saat:

```text
SUM(quota_usage_records.bytes)
```

hesaplanıp:

```text
user_quotas.used_bytes
```

ile karşılaştırılabilir.

Uyuşmazlık varsa audit log oluştur.

---

# 48. IDEMPOTENCY

Aynı usage event iki kere işlenirse kota iki kere düşmemeli.

Her kullanım event'inin unique ID'si olsun.

Örneğin:

```text
usage_event_id
```

unique olmalı.

---

# 49. PLEX DUPLICATE EVENT

Plex tarafında aynı playback/event birden fazla alınabilir.

Sistem:

```text
event_id
session_id
timestamp
```

ile duplicate kayıtları ayıklamalı.

---

# 50. PLEX OFFLINE DURUMU

Plex server geçici olarak erişilemezse Laravel çalışmaya devam etmeli.

Admin panelinde:

```text
Plex:
ONLINE
OFFLINE
UNKNOWN
```

göster.

Plex entegrasyonu Laravel'in tüm sistemini durdurmamalı.

---

# 51. STORAGE BOX OFFLINE

Storage Box erişilemiyorsa:

```text
Download unavailable
```

göster.

Laravel:

```text
500 Internal Server Error
```

yerine kullanıcıya düzgün hata vermeli:

```text
Dosya sunucusuna şu anda erişilemiyor. Lütfen daha sonra tekrar deneyin.
```

Admin loglarında gerçek hata tutulmalı.

---

# 52. DOSYA SILINIRSE

Media database'de var ama Storage Box'ta yoksa:

```text
is_available = false
```

yap.

Kullanıcıya download butonu gösterme.

---

# 53. IDM VE SIGNED URL

Signed URL'nin IDM resume özelliğini bozmadığından emin ol.

Test et:

1. 10 GB dosya başlat.
2. IDM pause.
3. Process kapat.
4. Tekrar başlat.
5. Range request gönderildiğini doğrula.
6. Kota yalnızca yeni aktarılan byte kadar artsın.

---

# 54. DOWNLOAD TEST SENARYOLARI

En az aşağıdaki testleri yaz:

### Test 1

```text
Quota = 100 GB
File = 10 GB
Download = 10 GB

Used = 10 GB
```

### Test 2

```text
Quota = 100 GB
File = 10 GB
Download interrupted at 3 GB

Used ≈ 3 GB
```

### Test 3

Resume:

```text
3 GB
+
7 GB
=
10 GB total
```

Kota:

```text
10 GB
```

olmalı.

### Test 4

Parallel:

```text
Download A = 60 GB
Download B = 60 GB
Quota = 100 GB
```

Toplam:

```text
120 GB
```

olmasına izin verme.

### Test 5

Plex + download aynı anda.

### Test 6

Quota expires.

### Test 7

Quota reset.

### Test 8

User disabled.

### Test 9

Download disabled but Plex enabled.

### Test 10

Plex disabled but download enabled.

---

# 55. EŞZAMANLI KULLANIM

Aynı kullanıcı:

```text
PC
TV
Telefon
```

üçünde aynı anda sistem kullanabilir.

Quota transaction-safe olmalı.

---

# 56. STORAGE BOX CONNECTION LIMIT

Storage Box'ın eşzamanlı bağlantı limitini dikkate al.

Mimariyi:

```text
100 kullanıcı
100 ayrı SMB bağlantısı
```

şeklinde tasarlama.

Tek bir sistem mount'u kullan.

Plex ve download server mümkün olduğunca Storage Box'a:

```text
tek/az sayıda filesystem bağlantısı
```

üzerinden erişsin.

Connection pool / mount mimarisini kullan.

---

# 57. PLEX SERVER YERLEŞİMİ

Plex server'ın Storage Box'a yakın bir Hetzner lokasyonunda çalıştırılması değerlendirilmeli.

Önerilen:

```text
Hetzner VPS / Dedicated
        |
        |
Storage Box
```

Ancak Plex server için yeterli CPU/RAM/transcoding kapasitesi gerekiyorsa bunu ayrıca değerlendir.

Plex server'ı sırf Storage Box'a yakın olduğu için çok düşük CPU'lu VPS'e koyma.

---

# 58. DIRECT PLAY

Sistemin amacı mümkün olduğunca:

```text
Storage Box
 ↓
Plex
 ↓
Direct Play
 ↓
TV
```

olmalı.

Transcoding mümkün olduğunca kullanıcı cihazının medya uyumluluğuna göre azaltılmalı.

Admin panelinde Plex session:

```text
Direct Play
Direct Stream
Transcode
```

bilgisi gösterilebilir.

---

# 59. KULLANICIYA PLEX DAVETİ

Admin kullanıcıya Plex erişimi verebilmeli.

Ancak Plex'in gerçek kullanıcı/invite mekanizması güncel API ile doğrulanmalı.

Varsa:

```text
Invite
```

işlemi.

Yoksa admin'e:

```text
Plex user must be linked manually
```

gibi gerçekçi fallback ver.

---

# 60. PLEX TOKEN GÜVENLİĞİ

Plex token:

```text
PLEX_TOKEN
```

gibi env üzerinden veya encrypted database ile tutulmalı.

Frontend'e gönderme.

Loglara yazma.

Exception mesajlarına dahil etme.

---

# 61. AUDIT LOG

Admin işlemlerinin tamamını logla.

Örneğin:

```text
admin changed x_1 quota
1000 GB → 2000 GB
```

ve:

```text
admin disabled download for x_2
```

ve:

```text
system quota reset
```

gibi.

---

# 62. ADMIN LOG

Log:

```text
timestamp
actor
action
target
old_value
new_value
ip
user_agent
```

---

# 63. RATE LIMIT

Login:

```text
5 attempts / minute
```

gibi uygun rate limit.

Download authorization endpoint:

```text
per user
per IP
```

rate limit.

Ancak gerçek download stream'ini küçük API rate limit'e sokup IDM'yi bozma.

---

# 64. ANTI-ABUSE

Aynı kullanıcının:

```text
1000 paralel download
```

başlatmasını engelle.

Örneğin admin ayarı:

```text
max_concurrent_downloads
```

varsayılan:

```text
3
```

olabilir.

Plex için:

```text
max_concurrent_streams
```

opsiyonel olsun.

---

# 65. USER SESSION

Kullanıcı hesabı başka kişilere paylaşılmaması için:

* active sessions
* device list
* last activity
* IP
* user agent

takip edilebilir.

Admin isterse:

```text
Logout all devices
```

yapabilsin.

---

# 66. DOWNLOAD SECURITY

Download token:

```text
user-bound
media-bound
expiration-bound
```

olmalı.

Token başka kullanıcıda çalışmamalı.

URL başka IP'ye taşındığında IP binding opsiyonel olabilir.

Ancak IDM/proxy kullanıcılarının IP değişimi nedeniyle yanlış bloklanmaması için IP binding default olarak zorunlu yapılmamalı.

---

# 67. MEDIA DETAIL PAGE

Film sayfası:

```text
Poster
Title
Year
Duration
Resolution
Codec
Audio
Subtitle
File size

[Kota]
Kalan: 680 GB

[PLEX'TE İZLE]

[İNDİR]
```

olmalı.

---

# 68. PLEX BUTTON

Plex butonu:

* kullanıcı Plex yetkili mi?
* Plex hesabı bağlı mı?
* media Plex kütüphanesinde mevcut mu?

kontrol etmeli.

Plex deep link / web link / app launch yöntemi Plex'in gerçek desteklediği şekilde oluşturulmalı.

---

# 69. DOWNLOAD BUTTON

Download button'a basıldığında:

```text
Dosya: 12.4 GB
Kalan kota: 15 GB
```

ise:

```text
Download available.
```

göster.

Eğer:

```text
Dosya: 12.4 GB
Kalan: 10 GB
```

ise hard-limit politikasında:

```text
Yetersiz kota.
Bu dosyayı indirmek için 2.4 GB daha fazla kotaya ihtiyacınız var.
```

göster.

Ancak partial download + quota accounting destekleniyorsa admin politikasına göre yalnızca mevcut quota kadar indirme yapılabilir.

---

# 70. KOTA DOLU

```text
Kotanız dolmuştur.

Mevcut dönem:
27.09.2026 - 27.10.2026

Yeni dönem:
27.10.2026
```

göster.

---

# 71. TIMEZONE

Sistem timezone:

```text
Europe/Istanbul
```

olarak yapılandırılabilir.

Ama database UTC saklama prensibini koru.

UI'da Türkiye saatine dönüştür.

---

# 72. LARGE FILE SUPPORT

Film dosyaları:

```text
1 GB
10 GB
50 GB
100 GB+
```

olabilir.

32-bit integer kullanma.

PHP integer / database BIGINT uyumluluğunu kontrol et.

---

# 73. PERFORMANCE

Şunları yap:

* eager loading
* indexes
* Redis cache
* pagination
* chunked scanning
* queue
* database transaction
* batch insert
* usage aggregation

Büyük media library'de:

```text
SELECT *
FROM media
```

gibi sorgulardan kaçın.

---

# 74. DATABASE INDEXLERİ

Kullanım tablolarında:

```text
(user_id, quota_period_id)
(user_id, created_at)
(media_id, created_at)
(source, created_at)
```

gibi index'leri kullanım senaryosuna göre oluştur.

---

# 75. OBSERVABILITY

Admin:

```text
Storage Box status
Plex status
Database status
Redis status
Queue status
```

görebilsin.

Health endpoint:

```text
/health
```

oluştur.

---

# 76. ERROR HANDLING

Kullanıcıya:

```text
SQLSTATE
filesystem exception
Plex token
Storage Box path
```

gibi teknik bilgi gösterme.

Admin loglarında ayrıntılı exception sakla.

---

# 77. LOG ROTATION

Download ve Plex kullanım logları çok büyüyebilir.

Laravel log rotation kullan.

Usage kayıtlarını silme.

Audit kayıtlarını silme.

Ancak çok eski teknik debug logları retention policy ile temizlenebilir.

---

# 78. RETENTION

Öneri:

```text
quota_usage_records:
minimum 1 yıl

audit_logs:
minimum 1 yıl

download_sessions:
90 gün

technical logs:
7-30 gün
```

Bunları config'den ayarlanabilir yap.

---

# 79. BACKUP

Database backup:

```text
daily
```

Storage Box medya dosyaları için ayrıca backup mekanizması gerektiğini dokümante et.

Storage Box'ın kendisini tek backup olarak varsayma.

---

# 80. DEPLOYMENT

Production deployment dokümantasyonu oluştur:

```text
Ubuntu
Nginx
PHP-FPM
MySQL
Redis
Supervisor
Laravel Scheduler
Storage Box mount
Plex
SSL
Firewall
```

---

# 81. ENV ÖRNEĞİ

`.env.example` oluştur.

Örneğin:

```env
APP_NAME="Media Platform"
APP_ENV=production
APP_URL=https://example.com

DB_CONNECTION=mysql
DB_DATABASE=media
DB_USERNAME=
DB_PASSWORD=

REDIS_HOST=127.0.0.1

STORAGEBOX_MOUNT=/mnt/storagebox

PLEX_URL=
PLEX_TOKEN=

QUOTA_DEFAULT_GB=1000
QUOTA_PERIOD_DAYS=30

DOWNLOAD_URL_TTL_MINUTES=60

MAX_CONCURRENT_DOWNLOADS=3
```

Gerçek credential koyma.

---

# 82. CONFIG DOSYASI

Ayarları doğrudan `env()` çağrılarıyla her yerde kullanma.

Örneğin:

```text
config/quota.php
config/plex.php
config/storagebox.php
config/downloads.php
```

oluştur.

---

# 83. CODE QUALITY

Kod:

* SOLID
* PSR-12
* Laravel conventions
* typed properties
* return types
* DTO
* Services
* Actions
* Policies

kullanmalı.

Controller'ları aşırı büyütme.

Örneğin:

```text
QuotaService
DownloadAuthorizationService
DownloadUsageService
PlexService
PlexUsageService
MediaScannerService
StorageBoxService
```

gibi servisler kullanılabilir.

---

# 84. DOWNLOAD ARCHITECTURE

Önerilen:

```text
DownloadController
        |
        v
DownloadAuthorizationService
        |
        +---- User permission
        +---- Media exists
        +---- Quota
        +---- Download limit
        |
        v
Signed Download
        |
        v
Nginx
        |
        v
Storage Box mounted file
```

PHP dosya transferini mümkün olduğunca yapmasın.

---

# 85. PLEX ARCHITECTURE

Önerilen:

```text
Plex Server
    |
    v
Storage Box mounted media
    |
    v
Plex Client
```

Laravel:

```text
Plex account association
+
authorization
+
usage synchronization
```

yapsın.

---

# 86. ÇOK ÖNEMLİ: PLEX KOTA ENTEGRASYONUNU UYDURMA

Eğer Plex:

```text
"User X exactly transferred 7,234,123,456 bytes"
```

şeklinde bir veri sağlamıyorsa bunu varmış gibi kodlama.

Gerekirse Tautulli gibi gerçek bir Plex monitoring çözümü araştırılabilir.

Ama üçüncü parti sistem kullanılacaksa:

1. Güncel API'sini araştır.
2. Gerçekten gerekli veriyi veriyor mu doğrula.
3. Authentication yöntemini doğrula.
4. Kullanıcı eşleştirmesini doğrula.
5. Duplicate event yönetimini yap.
6. Kullanım verisinin güvenilirlik seviyesini belirt.

---

# 87. TAUTULLI OPSİYONEL

Plex kullanım takibi için Tautulli araştırılabilir.

Eğer teknik olarak:

```text
Plex
 ↓
Tautulli
 ↓
API
 ↓
Laravel
```

kullanmak gerçek zamanlı/gerçeğe yakın kullanıcı playback ve bandwidth verisi sağlıyorsa entegrasyon yapılabilir.

Ama Tautulli API'si de varsayılmamalı.

Güncel dokümanı araştır.

---

# 88. KOTA MUHASEBESİ İÇİN ÖNERİLEN HİYERARŞİ

Öncelik:

```text
1. Gerçek network byte
2. Güvenilir Plex bandwidth telemetry
3. Kontrollü estimated usage
4. Media file size
```

Hangisi gerçekten mümkünse onu kullan.

UI'da her kaynağın:

```text
Actual
Estimated
File Size Based
```

olduğunu belirt.

---

# 89. KULLANICIYA YANLIŞ "GB TÜKETTİN" DEME

Eğer ölçüm:

```text
estimated
```

ise:

```text
Tahmini Plex kullanımı
```

de.

Eğer gerçek ölçüm ise:

```text
Gerçek veri kullanımı
```

de.

---

# 90. TEST ORTAMI

Production'a geçmeden:

```text
Local Laravel
Test Storage
Test Plex
Test User
```

oluştur.

Örnek:

```text
user:
test_1000

quota:
1000 GB

media:
1 GB
5 GB
10 GB
```

ile test et.

---

# 91. AUTOMATED TESTLER

Feature testleri:

```text
QuotaTest
DownloadAuthorizationTest
DownloadRangeTest
DownloadResumeTest
QuotaConcurrencyTest
QuotaResetTest
PlexIntegrationTest
UsageAggregationTest
MediaScannerTest
PermissionTest
```

oluştur.

---

# 92. CONCURRENCY TEST

Özellikle:

```text
100 GB quota
```

ve:

```text
20 concurrent requests
```

ile kota yarış koşulu test edilmeli.

Sonuç deterministik olmalı.

---

# 93. LOAD TEST

Download endpoint için:

```text
10 users
50 users
100 users
```

senaryolarını test edebilecek k6 veya benzeri script oluştur.

Gerçek 100 GB dosya kullanmak zorunda değilsin.

Range request test edebilirsin.

---

# 94. SECURITY TEST

Test et:

```text
expired signed URL
invalid signed URL
another user's URL
modified media ID
path traversal
quota bypass
duplicate usage event
race condition
disabled user
disabled media
expired quota
invalid Plex user
invalid Plex token
```

---

# 95. API DOCUMENTATION

README içinde:

```text
Authentication
Media API
Download API
Quota API
Admin API
Plex API
```

belgele.

---

# 96. INSTALLATION DOCUMENTATION

Şu dosyaları oluştur:

```text
README.md
INSTALL.md
DEPLOYMENT.md
STORAGEBOX.md
PLEX.md
QUOTA.md
SECURITY.md
API.md
TROUBLESHOOTING.md
```

---

# 97. STORAGEBOX.md

Açıkça anlat:

```text
Storage Box oluşturma
Credentials
SMB/CIFS mount
Mount persistence
Permissions
Test
Unmount
Monitoring
```

---

# 98. PLEX.md

Anlat:

```text
Plex kurulumu
Media Library
Storage Box mount
Plex path
Plex account
Laravel mapping
Plex API
Usage tracking
Troubleshooting
```

---

# 99. QUOTA.md

Anlat:

```text
30 günlük dönem
Quota calculation
Download usage
Plex usage
Actual vs estimated
Reset
Concurrency
Audit
```

---

# 100. KULLANICI DENEYİMİ

UI sade ve modern olsun.

Kullanıcı giriş yaptıktan sonra:

```text
Ana Sayfa

Kota
Kalan
Dönem
Filmler
Diziler
İndirmelerim
Plex
Kullanım Geçmişim
Hesabım
```

---

# 101. RESPONSIVE

Telefon:

```text
responsive
```

TV/desktop:

```text
desktop optimized
```

Admin:

```text
desktop-first
```

---

# 102. MEDIA SEARCH

Film sayfasında:

```text
Search
Filter
Sort
Pagination
```

olsun.

---

# 103. MEDIA SORT

Örneğin:

```text
Title
Year
Added date
File size
Duration
```

---

# 104. ADMIN MEDIA

Admin:

```text
Scan
Rescan
Disable
Delete database record
Refresh metadata
```

yapabilsin.

Storage Box'taki fiziksel dosyayı silmek için ayrı bir "Delete physical file" onayı gerektir.

Yanlışlıkla film silme olmasın.

---

# 105. DELETE MEDIA

Database kaydı silmek ile fiziksel dosya silmeyi birbirinden ayır.

Örneğin:

```text
Remove from library
```

ve:

```text
Delete physical file
```

iki farklı işlem.

---

# 106. USER QUOTA HISTORY

Kullanıcının geçmiş dönemlerini sakla.

Örneğin:

```text
September
1000 GB
Used 723 GB

August
1000 GB
Used 981 GB
```

Böylece reset sonrasında eski kullanım kaybolmasın.

---

# 107. QUOTA PERIOD TABLE

Önerilen:

```text
quota_periods

id
user_id
quota_limit_bytes
used_bytes
started_at
expires_at
status
created_at
updated_at
```

Status:

```text
active
expired
cancelled
```

---

# 108. KOTA RESET İLE ESKİ KAYITLARI SİLME

Reset:

```text
used_bytes = 0
```

yapıp eski kayıtları silme.

Yeni period oluştur.

Bu sayede geçmiş raporlanabilir.

---

# 109. DOWNLOAD USAGE VE QUOTA PERIOD

Her usage kaydı:

```text
quota_period_id
```

ile ilişkili olsun.

Böylece eski download'ın yeni döneme yazılması engellenir.

---

# 110. TIME RACE

Download başladı:

```text
23:59
```

Kota dönemi:

```text
00:00
```

da bitti.

Transfer:

```text
00:01
```

devam ediyor.

Bu durum için net bir politika uygula.

Önerilen:

Download session başladığı döneme bağlanır.

Ancak kota limiti dönem başında mı kilitleniyor, yoksa transfer sırasında mı kontrol ediliyor netleştir.

Bu davranışı test et.

---

# 111. DOWNLOAD RESUME SONRAKİ DÖNEME TAŞARSA

Örneğin:

```text
27 Eylül:
8 GB indirildi

27 Ekim:
resume edildi
```

Hangi döneme yazılacağı net olmalı.

Önerilen:

Her gerçek transfer byte'ı transfer edildiği döneme yazılmalı.

Ancak download session eski döneme ait authorization ile sınırsız devam etmemeli.

Yeni dönem başladığında kota kontrolü tekrar yapılmalı.

---

# 112. DOWNLOAD SESSION EXPIRATION

Download session:

```text
24 saat
```

veya admin-configurable TTL.

Expired session yeniden authorization istemeli.

IDM resume sırasında yeni signed URL üretilebilmeli.

---

# 113. IDENTITY

Kullanıcı login olduğunda:

```text
user_id
```

tek kaynak olarak Laravel'de tutulmalı.

Plex kullanıcı eşlemesi ayrıca tutulmalı.

---

# 114. NO STORAGE BOX CREDENTIAL EXPOSURE

Kullanıcıya asla:

```text
Storage Box username
Storage Box password
SMB path
SFTP password
```

verme.

---

# 115. NO DIRECT PUBLIC STORAGE

Storage Box'ı:

```text
public internet directory
```

haline getirme.

Bütün erişimler Laravel/Plex authorization üzerinden gerçekleşsin.

---

# 116. DOWNLOAD URL ENUMERATION

Şunu yapma:

```text
/download/1
/download/2
/download/3
```

ve sadece ID kontrol et.

Her request authorization kontrolünden geçmeli.

---

# 117. SIGNED URL TOKEN

Signed URL'nin içeriği:

```text
user
media
expiration
download session
```

ile ilişkilendirilmeli.

---

# 118. RATE LIMIT BYPASS

Download URL'nin kendisi rate limit'ten muaf olabilir ancak authorization endpoint rate limit'e tabi olmalı.

---

# 119. CACHING

Media metadata cache:

```text
media:{id}
```

Quota dashboard:

```text
quota:user:{id}
```

kullanabilir.

Ancak kota yazma işlemlerinde stale cache nedeniyle kota aşımı oluşmamalı.

---

# 120. DATABASE TRANSACTIONS

Quota değişimleri:

```text
DB transaction
```

içinde gerçekleşmeli.

---

# 121. EVENT SİSTEMİ

Örneğin:

```text
DownloadStarted
DownloadProgress
DownloadCompleted
PlexPlaybackStarted
PlexPlaybackStopped
QuotaExceeded
QuotaReset
```

event'leri oluşturulabilir.

Ama gerçek Plex event'i yoksa uygulama içi event ile Plex webhook event'ini birbirine karıştırma.

---

# 122. AUDIT

Her quota değişimi:

```text
before
after
reason
actor
```

olarak kaydedilmeli.

---

# 123. ADMIN QUOTA ADJUSTMENT

Admin manuel olarak:

```text
+100 GB
```

bonus verebilir.

Bu işlem:

```text
source = admin_adjustment
```

olarak kaydedilebilir.

---

# 124. BONUS QUOTA

Opsiyonel:

```text
base quota = 1000 GB
bonus quota = 100 GB
total = 1100 GB
```

desteklenebilir.

Ama ilk sürümde gerekli değilse karmaşıklığı azalt.

---

# 125. GELECEKTE ÖDEME

Şimdilik ödeme sistemi yapma.

Ancak quota plan mimarisini gelecekte:

```text
1000 GB
2000 GB
5000 GB
```

gibi planlara uygun tasarla.

---

# 126. NO HARDCODE

Şunları hardcode etme:

```text
1000
2000
30
3
60
```

Config/database üzerinden yönet.

---

# 127. DEFAULT SETTINGS

Admin Settings:

```text
Default quota
Quota period
Download session TTL
Max concurrent downloads
Max concurrent Plex sessions
Signed URL TTL
```

yönetilebilir olsun.

---

# 128. SYSTEM SETTINGS

Tablo:

```text
settings
```

veya config tercih edilebilir.

Güvenlik açısından secret değerleri normal settings tablosunda plaintext saklama.

---

# 129. ADMIN PERMISSIONS

Roller:

```text
super_admin
admin
moderator
```

olabilir.

Örneğin moderator quota değiştiremesin.

---

# 130. USER STATUS

```text
active
suspended
banned
expired
```

gibi status'ler.

Suspended kullanıcı:

```text
Download = NO
Plex = NO
```

olmalı.

---

# 131. SOFT DELETE

User/media için gerekiyorsa soft delete kullan.

---

# 132. DATA INTEGRITY

Foreign key cascade/restrict davranışlarını bilinçli seç.

Örneğin usage record'ları kullanıcı silinse bile audit açısından korunacaksa:

```text
user_id nullable
```

veya anonymization politikası kullan.

---

# 133. GDPR / KVKK

Sistem kullanıcı IP'si, user agent ve kullanım geçmişi tutacağı için KVKK/Gizlilik gereksinimlerini dikkate alan:

```text
Privacy Policy
Data retention
Account deletion
```

mekanizmasını geleceğe hazır bırak.

---

# 134. DOWNLOAD CONTENT DISPOSITION

Dosya adı UTF-8 düzgün gönderilmeli.

Özellikle:

```text
Ç
Ğ
İ
Ö
Ş
Ü
```

içeren dosyalarda IDM ve Chrome/Edge uyumluluğunu test et.

---

# 135. RANGE SECURITY

Range header kötüye kullanımına karşı:

* invalid ranges
* overlapping ranges
* absurd range
* negative range

kontrol edilmeli.

---

# 136. LARGE RANGE

100 GB dosyalarda:

```text
Content-Length
Content-Range
```

integer overflow yaratmamalı.

---

# 137. NGINX CONFIG

Production için örnek:

```nginx
location /protected-download {
    internal;
    alias /mnt/storagebox/;
}
```

gibi yapı kullanılabilir.

Ama gerçek path mapping güvenli olmalı.

Kullanıcının arbitrary path belirlemesine izin verme.

---

# 138. X-ACCEL-REDIRECT

Laravel:

```text
Authorization
Quota
```

yaptıktan sonra:

```text
X-Accel-Redirect
```

ile Nginx'e aktarım yaptır.

Fakat usage accounting için Nginx'in gerçek bytes sent bilgisini güvenilir biçimde nasıl Laravel'e aktaracağını çöz.

Nginx logları veya access log parser gerekiyorsa değerlendir.

---

# 139. DOWNLOAD USAGE RECONCILIATION

Nginx access log:

```text
request
status
bytes_sent
range
user/download ID
```

içerecek şekilde tasarlanabilir.

Her request'e:

```text
download_session_id
```

bağlanması araştırılmalı.

---

# 140. DOWNLOAD LOG FORMAT

Örneğin:

```text
timestamp
user_id
download_id
media_id
range
status
bytes_sent
```

gibi structured JSON log tercih edilebilir.

---

# 141. PLEX NETWORK ACCOUNTING

Plex server'ın network traffic telemetry'sini araştır.

Eğer işletim sistemi seviyesinde:

```text
Plex process
→ network bytes
```

ölçülebiliyorsa bunu kullanıcı bazında ayırmanın mümkün olup olmadığını araştır.

Kullanıcı bazında ayırmak mümkün değilse bunu açıkça belirt.

---

# 142. PLEX + TAUTULLI

Tautulli kullanılıyorsa:

```text
Plex
 ↓
Tautulli
 ↓
Tautulli API
 ↓
Laravel Queue
 ↓
Quota Usage
```

mimarisini değerlendirebilirsin.

Tautulli'nin kullanıcı bazında:

* session
* playback
* bandwidth
* duration

bilgilerini gerçekten sağlayıp sağlamadığını doğrula.

---

# 143. PLEX USAGE POLLING

Eğer webhook yeterli değilse polling kullanılabilir.

Örneğin:

```text
30 sec
```

aralıklarla.

Ama çok fazla kullanıcıda:

```text
N users × polling
```

yükünü düşün.

Queue kullan.

---

# 144. PLEX EVENT DUPLICATION

Aynı session için:

```text
start
playing
playing
playing
pause
resume
stop
```

event'leri gelebilir.

Her event'te kota düşme.

Session bazlı usage hesapla.

---

# 145. PLAYBACK SESSION

Tablo:

```text
plex_usage_sessions

id
user_id
plex_user_id
media_id
plex_session_id
started_at
last_seen_at
stopped_at
last_position
usage_bytes
usage_mode
status
```

---

# 146. PLEX USAGE MODE

```text
actual
estimated
file_size
```

tut.

---

# 147. RECONCILIATION

Plex session kapanınca:

```text
final usage
```

hesapla.

Ara sıra canlı usage dashboard'da:

```text
estimated current usage
```

gösterilebilir.

---

# 148. PLEX KULLANIMI VE QUOTA

Plex kullanımını doğrudan:

```text
used_bytes += ...
```

şeklinde kontrolsüz yapma.

Önce:

```text
QuotaService::consume(...)
```

üzerinden geçir.

Bütün kaynaklar aynı quota service'i kullanmalı.

---

# 149. CENTRAL QUOTA SERVICE

Mutlaka merkezi servis oluştur:

```php
QuotaService
```

Örneğin:

```php
canConsume(User $user, int $bytes): bool
consume(User $user, int $bytes, UsageContext $context): UsageRecord
release(...)
remaining(...)
reset(...)
```

gibi.

Download ve Plex ayrı ayrı kota mantığı yazmasın.

---

# 150. USAGE CONTEXT

Örneğin:

```php
UsageContext
```

içinde:

```text
source
media_id
session_id
request_id
bytes
```

bulunabilir.

---

# 151. NEGATIVE USAGE

Usage release gibi bir işlem varsa:

```text
used_bytes
```

negatife düşmemeli.

---

# 152. REFUND

Bir download yanlışlıkla fazla sayıldıysa admin:

```text
Refund usage
```

yapabilsin.

Bu da audit'e girsin.

---

# 153. USER DASHBOARD

Kullanıcıya:

```text
Toplam Kota
Kullanılan
Kalan
Sıfırlanma Tarihi
Download Kullanımı
Plex Kullanımı
```

göster.

---

# 154. ADMIN DASHBOARD

Admin:

```text
Toplam kota:
100 TB

Toplam kullanılan:
34.2 TB

Download:
22 TB

Plex:
12.2 TB
```

görebilsin.

---

# 155. REAL-TIME

WebSocket zorunlu değil.

İlk sürümde:

```text
polling
```

veya page refresh yeterli.

Daha sonra WebSocket eklenebilir.

---

# 156. NOTIFICATION

Kullanıcı:

```text
%80
%90
%100
```

kullanıma ulaştığında notification alabilir.

Admin ayarı:

```text
quota_warning_thresholds
```

---

# 157. EMAIL

İlk sürümde opsiyonel.

Kullanıcıya:

```text
Kotanızın %90'ını kullandınız.
```

maili gönderilebilir.

---

# 158. CRON FAILURE

Scheduler çalışmadığında quota reset bozulmamalı.

Her login/dashboard request'inde gerektiğinde:

```text
ensureCurrentQuotaPeriod()
```

çalıştırılabilir.

Ancak ağır işlem yapma.

---

# 159. PERIOD RESET ALGORITHM

Kullanıcı request yaptığında:

```text
if now >= expires_at
```

kontrol et.

Expired ise yeni period oluştur.

Race condition için transaction + lock kullan.

---

# 160. CACHE INVALIDATION

Quota değişince:

```text
quota:user:{id}
```

cache temizle.

---

# 161. TEST DATA

Seeder:

```text
Admin
x_1 = 1000 GB
x_2 = 2000 GB
x_3 = 500 GB
```

oluştur.

---

# 162. DEMO MEDIA

Test için küçük medya dosyaları oluştur.

Gerçek film dosyalarını Git'e koyma.

---

# 163. GIT

`.gitignore`:

```text
.env
storage/logs
vendor
node_modules
```

ve secret dosyaları.

---

# 164. SECURITY SCAN

Production öncesi:

```text
composer audit
npm audit
```

çalıştır.

---

# 165. MIGRATIONS

Her database değişikliği migration olarak yapılmalı.

---

# 166. SEEDERS

Demo admin ve test user seed'leri ayrı olsun.

Production seed'i yanlışlıkla demo kullanıcı oluşturmamalı.

---

# 167. BACKWARD COMPATIBILITY

Mevcut Laravel projesi varsa mevcut:

* auth
* routes
* components
* design
* database

yapısını gereksiz yere bozma.

Önce repository'yi analiz et.

---

# 168. MEVCUT PROJE ANALİZİ

Kod yazmadan önce:

1. Repository yapısını incele.
2. Laravel versiyonunu bul.
3. PHP versiyonunu bul.
4. Database yapısını incele.
5. Auth sistemini incele.
6. Frontend yapısını incele.
7. Existing media tables varsa kullan.
8. Existing users varsa değiştirme.
9. Existing design system varsa koru.
10. Yeni sistemi mevcut projeye entegre et.

---

# 169. VAR OLAN KODU SİLME

Mevcut özellikleri:

```text
without reason
```

silme.

Breaking change yapmadan önce nedenini belirt.

---

# 170. UI TASARIMI

Arayüz modern, temiz ve profesyonel olsun.

Film sitesi gibi görünmeli.

Kullanıcı için önemli bilgiler:

```text
Kota
Film
İndir
Plex
```

öne çıkmalı.

---

# 171. KULLANICI NAVIGATION

```text
Dashboard
Filmler
Diziler
İndirmeler
Plex
Kullanım
Hesap
```

---

# 172. ADMIN NAVIGATION

```text
Dashboard
Users
Quota
Media
Downloads
Plex
Usage
Logs
Settings
```

---

# 173. DARK MODE

Mevcut projede varsa koru.

Yeni projede opsiyonel dark mode eklenebilir.

---

# 174. ACCESSIBILITY

Butonlar:

```text
Download
Watch on Plex
```

açık ve anlaşılır.

---

# 175. ERROR STATES

Örneğin:

```text
Kota yetersiz
Dosya bulunamadı
Plex erişimi yok
Storage Box offline
Yetkiniz yok
Link süresi doldu
Download devam ediyor
```

için ayrı kullanıcı mesajları oluştur.

---

# 176. FINAL ARCHITECTURE

Final sistem şu mantıkta çalışmalı:

```text
                         +------------------+
                         |     Laravel      |
                         |                  |
                         | Authentication   |
                         | Users            |
                         | Quota            |
                         | Media            |
                         | Download Auth    |
                         | Plex Integration |
                         +--------+---------+
                                  |
                 +----------------+----------------+
                 |                                 |
                 v                                 v
        +------------------+              +------------------+
        | Download Gateway |              | Plex Server      |
        | Nginx            |              |                  |
        +--------+---------+              +--------+---------+
                 |                                 |
                 +----------------+----------------+
                                  |
                                  v
                         +------------------+
                         | Hetzner Storage  |
                         | Box              |
                         |                  |
                         | Films            |
                         | Series           |
                         +------------------+
```

---

# 177. EN ÖNEMLİ İŞ KURALI

Bir kullanıcı:

```text
1000 GB
```

kotaya sahipse:

```text
IDM ile 400 GB
+
Plex ile 200 GB
=
600 GB
```

kullanmış sayılmalı.

Kalan:

```text
400 GB
```

olmalı.

---

# 178. ÖRNEK

Kullanıcı:

```text
x_1
```

Kota:

```text
1000 GB
```

Başlangıç:

```text
27.09.2026
```

Kullanım:

```text
Download:
350 GB

Plex:
180 GB

Total:
530 GB
```

UI:

```text
Kota
1000 GB

Kullanılan
530 GB

Kalan
470 GB
```

---

# 179. İKİNCİ ÖRNEK

```text
x_2
quota = 2000 GB

download = 800 GB
plex = 900 GB

total = 1700 GB
remaining = 300 GB
```

---

# 180. RESET ÖRNEĞİ

27.10.2026 tarihinde:

```text
x_1

old:
1000 GB quota
530 GB used
```

yeni period:

```text
1000 GB quota
0 GB used
```

olmalı.

Eski dönem:

```text
530 GB
```

history'de kalmalı.

---

# 181. ADMIN REPORT

Admin:

```text
User      Quota      Used       Remaining
x_1       1000 GB    530 GB     470 GB
x_2       2000 GB    1700 GB    300 GB
x_3       500 GB     120 GB     380 GB
```

görebilmeli.

---

# 182. DEVELOPMENT AŞAMALARI

Projeyi tek seferde rastgele kodlama.

Şu sırayı izle:

## Phase 1

Repository analysis.

## Phase 2

Database architecture.

## Phase 3

Quota system.

## Phase 4

Media library.

## Phase 5

Storage Box integration.

## Phase 6

Secure downloads.

## Phase 7

Range / IDM support.

## Phase 8

Plex integration.

## Phase 9

Plex usage accounting.

## Phase 10

Admin panel.

## Phase 11

User panel.

## Phase 12

Security.

## Phase 13

Automated tests.

## Phase 14

Load tests.

## Phase 15

Documentation.

---

# 183. HER PHASE SONUNDA

Her aşamadan sonra:

```text
tests
lint
static analysis
```

çalıştır.

Hata varsa sonraki aşamaya geçme.

---

# 184. KODLAMA TARZI

Kısa vadeli hack yapma.

Örneğin:

```php
if ($user->quota > 0)
```

gibi dağınık quota kontrolleri yazma.

Bütün quota mantığı:

```text
QuotaService
```

üzerinden geçsin.

---

# 185. SERVICE SINIFLARI

Minimum:

```text
MediaService
MediaScannerService
QuotaService
QuotaPeriodService
UsageService
DownloadService
DownloadAuthorizationService
StorageBoxService
PlexService
PlexUsageService
```

değerlendir.

Gereksiz sınıf çoğaltma yapma.

---

# 186. DOMAIN MODELLERİ

Laravel Eloquent modelleri:

```text
Media
QuotaPlan
QuotaPeriod
QuotaUsageRecord
DownloadSession
PlexAccount
PlexUsageSession
```

oluştur.

---

# 187. ENUM

PHP enum:

```text
UsageSource
DownloadStatus
QuotaPeriodStatus
PlexUsageMode
UserStatus
```

kullanılabilir.

---

# 188. LOGGING

Structured logging tercih et.

Örneğin:

```json
{
    "event": "quota_usage",
    "user_id": 15,
    "source": "download",
    "bytes": 123456789
}
```

---

# 189. METRICS

İleride Prometheus/Grafana eklenebilmesi için service katmanını temiz tut.

---

# 190. SON KURAL

Kod yazmadan önce bana:

1. Mevcut proje analizi
2. Mimari plan
3. Database ERD
4. Storage Box erişim planı
5. Download mimarisi
6. Plex entegrasyon yöntemi
7. Plex kota ölçüm yönteminin gerçek API kanıtı
8. Kota algoritması
9. Güvenlik planı
10. Test planı

sun.

Ancak bu aşamadan sonra implementasyona başla.

---

# 191. ANTIGRAVITY'DEN BEKLENEN SONUÇ

Projenin sonunda çalışır durumda:

```text
Laravel
+
MySQL
+
Redis
+
Hetzner Storage Box
+
Nginx
+
Plex
+
User Authentication
+
Per-user 30-day quota
+
Download
+
IDM Range/Resume
+
Plex Streaming
+
Plex User Mapping
+
Usage Tracking
+
Admin Panel
+
User Panel
+
Audit Logs
+
Security
+
Automated Tests
+
Deployment Documentation
```

bulunmalı.

---

# 192. KESİN OLARAK UYGULANMASI GEREKEN ANA SENARYO

Son sistemde şu senaryo baştan sona çalışmalı:

### Kullanıcı oluştur

```text
Username:
x_1

Quota:
1000 GB

Period:
30 days

Download:
ON

Plex:
ON
```

### Film

```text
Film A
Size:
20 GB
```

### IDM

Kullanıcı:

```text
Download
```

yapar.

10 GB indirir.

Quota:

```text
1000 GB
→
990 GB
```

### Plex

Kullanıcı Plex'ten film izler.

Gerçek/kanıtlanmış usage:

```text
5 GB
```

ise:

```text
990 GB
→
985 GB
```

### Aynı anda

Kullanıcı başka film indirirken Plex'te başka film izler.

Quota transaction-safe çalışır.

### Kota

Kullanıcı:

```text
985 GB
```

kalan kotaya sahip olur.

### 30 gün

Period bittiğinde:

```text
Used:
0 GB

Quota:
1000 GB
```

yeni period başlar.

Eski:

```text
15 GB
```

kullanım history'de kalır.

---

# 193. ÇOK ÖNEMLİ SON KONTROL

Uygulamayı teslim etmeden önce aşağıdaki soruların her birine gerçek kod ve test ile "EVET" diyebilmelisin:

* [ ] Kullanıcı bazlı kota var mı?
* [ ] 30 günlük dönem var mı?
* [ ] Dönem otomatik yenileniyor mu?
* [ ] Eski kullanım history'de kalıyor mu?
* [ ] Download kota düşürüyor mu?
* [ ] Plex kota düşürüyor mu?
* [ ] Download ve Plex aynı kota havuzunu kullanıyor mu?
* [ ] Concurrent usage güvenli mi?
* [ ] IDM Range destekleniyor mu?
* [ ] IDM resume çalışıyor mu?
* [ ] Aynı byte iki kez sayılmıyor mu?
* [ ] Storage Box credentials kullanıcıya verilmiyor mu?
* [ ] Signed URL var mı?
* [ ] URL expiration var mı?
* [ ] Path traversal engelleniyor mu?
* [ ] Admin kullanıcı kotasını değiştirebiliyor mu?
* [ ] Kullanıcı kalan kotasını görebiliyor mu?
* [ ] Admin toplam kullanımı görebiliyor mu?
* [ ] Plex kullanıcıları Laravel kullanıcılarıyla eşleşiyor mu?
* [ ] Plex entegrasyonu gerçek API'ye dayanıyor mu?
* [ ] Plex usage gerçek mi yoksa estimated mı açıkça belirtiliyor mu?
* [ ] Plex API'nin desteklemediği hiçbir özellik uydurulmuyor mu?
* [ ] Storage Box bağlantı mimarisi ölçeklenebilir mi?
* [ ] Queue kullanılıyor mu?
* [ ] Scheduler çalışıyor mu?
* [ ] Database transaction kullanılıyor mu?
* [ ] Automated tests var mı?
* [ ] Load test var mı?
* [ ] Production deployment dokümanı var mı?
* [ ] Security dokümanı var mı?

---

# 194. GELİŞTİRME PRENSİBİ

Bu proje "çalışıyor gibi görünen demo" olarak değil, gerçek kullanıcıların büyük medya dosyalarını indireceği ve Plex üzerinden izleyeceği production sistem olarak geliştirilmelidir.

Özellikle:

```text
KOTA
DOWNLOAD
IDM RANGE
PLEX USAGE
STORAGE BOX
CONCURRENCY
SECURITY
```

konularında kısa yol kullanılmamalıdır.

Bir teknik kısıt varsa bunu gizleme.

Önce gerçek teknik kısıtı tespit et.

Sonra o kısıta uygun mimari oluştur.

Hiçbir durumda olmayan bir API'yi, olmayan bir Plex özelliğini veya doğrulanmamış bir Storage Box özelliğini varmış gibi implement etme.

## HEDEF

Son kullanıcı açısından sistem şu kadar basit görünmelidir:

```text
                    KULLANICI

                       |
             +---------+---------+
             |                   |
          İNDİR                PLEX
             |                   |
            IDM                 TV
             |                   |
             +---------+---------+
                       |
                       v
                  AYLIK KOTA
                       |
              +--------+--------+
              |                 |
          Download            Plex
              |                 |
              +--------+--------+
                       |
                    GB USED
                       |
                       v
                  30 GÜN SONRA
                       |
                       v
                    RESET
```

Bütün karmaşık işlemler backend tarafından yönetilmeli ve kullanıcı yalnızca:

```text
Kota
Kullanılan
Kalan
Sıfırlanma tarihi
İndir
Plex'te izle
```

bilgilerini görmelidir.
