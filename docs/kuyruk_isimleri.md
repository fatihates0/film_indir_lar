# 🚀 Proje Kuyruk Yapılandırması ve İsimleri

Bu belgede, MedyaHub uygulamasındaki arka plan görevlerinin (Queue Jobs) hangi kuyruk kanallarında çalıştığı ve Plesk / Supervisor üzerinde nasıl yapılandırılacağı açıklanmaktadır.

---

## 📌 Kuyruk Listesi ve Atanan İşler

| Kuyruk İsmi | Açıklama | Bağlı Job Sınıfı | Çalışma Durumu / Tetiklenme |
| :--- | :--- | :--- | :--- |
| **`disk_scans`** | Storage Box Dosya Taramaları | `App\Jobs\MediaScanJob` | Kullanıcı butonla başlattığında veya günde 1 kez zamanlandığında |
| **`tmdb_sync`** | Toplu TMDB Veri Çekme İşlemleri | `App\Jobs\TmdbSyncJob` | /admin/media sayfasından "Tüm TMDB Bilgilerini Çek" butonuna tıklandığında |
| **`file_transfers`** | URL'den Uzaktan Dosya İndirmeleri | `App\Jobs\ProcessRemoteTransferJob` | URL'den indirme başlatıldığında |
| **`plex_sync`** | Plex Oturum & Kullanıcı Senkronizasyonu | `App\Jobs\PlexSyncJob` | 30 saniyede bir zamanlandığında |
| **`default`** | Genel İşlemler & Kota Sıfırlamaları | `App\Jobs\QuotaResetJob` | Kota süreleri dolduğunda veya varsayılan işlerde |

---

## 🛠 Plesk Laravel Toolkit Üzerinde Kuyruk Oluşturma

Plesk paneli **Laravel Toolkit > Kuyruk** sekmesinde aşağıdaki isimlerle sırayla işleyici (worker) ekleyebilirsiniz:

1. **`disk_scans`** kuyruğu oluşturun *(Dosya taramalarının bağımsız çalışması için)*
2. **`tmdb_sync`** kuyruğu oluşturun *(TMDB veri çekme işlemlerinin taramaları yavaşlatmaması için)*
3. **`file_transfers`** kuyruğu oluşturun *(İndirmelerin taramaları engellememesi için)*
4. **`plex_sync`** kuyruğu oluşturun *(Plex senkronizasyonlarının aksamaması için)*
5. **`default`** kuyruğu oluşturun *(Genel Laravel sistem işleri için)*

---

### 💡 Alternatif Tek İşleyici Komutu
Eğer tüm kuyrukları tek bir işleyici üzerinden çalıştırmak isterseniz komut satırından:
```bash
php artisan queue:work --queue=file_transfers,disk_scans,tmdb_sync,plex_sync,default
```
komutunu kullanabilirsiniz.

