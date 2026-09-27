# Production Deployment & Nginx Configuration

## 1. Nginx X-Accel-Redirect Yapılandırması

PHP worker'larını büyük dosya transferleriyle meşgul etmemek için Nginx internal redirect kullanın.

`/etc/nginx/sites-available/medyahub.conf`:
```nginx
server {
    listen 80;
    server_name medyahub.example.com;
    root /var/www/medyahub/public;

    index index.php;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    # Internal location for X-Accel-Redirect (Storage Box Mount)
    location /protected-download/ {
        internal;
        alias /mnt/storagebox/;
    }

    location ~ \.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.3-fpm.sock;
    }
}
```

## 2. `.env` Yapılandırması
```env
DOWNLOAD_USE_X_ACCEL=true
DOWNLOAD_X_ACCEL_PREFIX=/protected-download/
```

## 3. Queue Worker & Scheduler (Supervisor)
`/etc/supervisor/conf.d/medyahub-worker.conf`:
```ini
[program:medyahub-worker]
process_name=%(program_name)s_%(process_num)02d
command=php /var/www/medyahub/artisan queue:work --sleep=3 --tries=3
autostart=true
autorestart=true
user=www-data
numprocs=2
```

Cron kaydı (`crontab -e`):
```text
* * * * * cd /var/www/medyahub && php artisan schedule:run >> /dev/null 2>&1
```
