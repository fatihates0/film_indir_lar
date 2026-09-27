# 30 Günlük Kota Sistem Dokümanı

## 1. Kota Periyot Mantığı (Rolling 30-Day Period)

- Kota takvim ayına bağlı değildir. Her kullanıcının hesabının açıldığı veya periyodunun başlatıldığı tarihten itibaren 30 günlük dönen periyotları (Rolling Period) bulunur.
- Tüm miktar değerleri veritabanında kesinlik için `BIGINT UNSIGNED` cinsinden `bytes` olarak saklanır. Arayüzde `GB` veya `TB` olarak biçimlendirilir.

## 2. Atomik İşlemler & Concurrency

- İndirme veya izleme gerçekleştiğinde `QuotaService`, `DB::transaction()` ve `SELECT ... FOR UPDATE` (row-level lock) kullanarak eşzamanlı isteklerde yarış koşullarını (race condition) engeller.
- Kota sıfırlandığında eski kullanım kayıtları silinmez, `quota_periods` arşiv tablosunda geçmiş raporlama için saklanır.
