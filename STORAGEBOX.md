# Hetzner Storage Box Kurulum ve Mount Dokümanı

## 1. CIFS / SMB Mount (Önerilen)

Storage Box alanınızı sunucunuzda `/mnt/storagebox` dizinine bağlamak için aşağıdaki adımları uygulayın.

### Credential Dosyası Oluşturma

```bash
sudo mkdir -p /etc/storagebox
sudo nano /etc/storagebox/credentials
```

Dosya içeriği:
```ini
username=uXXXXXX
password=YOUR_STORAGEBOX_PASSWORD
```

Yetkileri kısıtlayın:
```bash
sudo chmod 600 /etc/storagebox/credentials
```

### `/etc/fstab` Kaydı Ekleme

```bash
sudo mkdir -p /mnt/storagebox
```

`/etc/fstab` dosyasına aşağıdaki satırı ekleyin:
```text
//uXXXXXX.your-storagebox.de/backup /mnt/storagebox cifs credentials=/etc/storagebox/credentials,iocharset=utf8,rw,uid=www-data,gid=www-data,file_mode=0664,dir_mode=0775,_netdev 0 0
```

Mount işlemini test edin:
```bash
sudo mount -a
ls -la /mnt/storagebox
```

## 2. Laravel Yapılandırması

`.env` dosyasında mount yolunu belirtin:
```env
STORAGEBOX_MOUNT=/mnt/storagebox
```
