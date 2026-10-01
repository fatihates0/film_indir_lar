<?php

return [
    'url_ttl_minutes' => (int) env('DOWNLOAD_URL_TTL_MINUTES', 60),
    'max_concurrent' => (int) env('MAX_CONCURRENT_DOWNLOADS', 5),
    'use_x_accel' => (bool) env('DOWNLOAD_USE_X_ACCEL', false),
    'x_accel_prefix' => env('DOWNLOAD_X_ACCEL_PREFIX', '/protected-download/'),
    'enforce_ip_lock' => (bool) env('DOWNLOAD_ENFORCE_IP_LOCK', false),
];
