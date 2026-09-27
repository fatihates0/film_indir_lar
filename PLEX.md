# Plex Entegrasyonu ve Kota Ölçüm Dokümanı

## 1. Plex Yapılandırması

MedyaHub, Plex REST API ve Webhook mekanizmasını kullanarak kullanıcı izlemelerini takip eder.

### `.env` Ayarları
```env
PLEX_URL=http://YOUR_PLEX_SERVER_IP:32400
PLEX_TOKEN=YOUR_PLEX_X_TOKEN
PLEX_POLL_INTERVAL=30
```

## 2. Webhook Entegrasyonu

Plex Web App > Settings > Webhooks bölümünden aşağıdaki adresi ekleyin:
```text
https://your-domain.com/webhooks/plex
```

## 3. Tahmini Kota Hesabı (Estimated Usage)

Plex REST API'si anlık soket seviyesinde byte aktarımını kullanıcı bazında ayrı sayaç olarak sunmadığından, MedyaHub tahmini tüketim yöntemini kullanır:

$$\text{Tüketilen Byte} = \frac{\text{Oynatma Süresi (sn)} \times \text{Bitrate (bps)}}{8}$$

Arayüzde bu tüketim açıkça **"Tahmini Plex Tüketimi"** olarak etiketlenir.
