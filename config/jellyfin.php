<?php

return [
    'url' => env('JELLYFIN_URL', 'http://127.0.0.1:8096'),
    'api_key' => env('JELLYFIN_API_KEY', ''),
    'client_name' => env('JELLYFIN_CLIENT_NAME', 'MedyaHub'),
    'device_name' => env('JELLYFIN_DEVICE_NAME', 'Laravel Server'),
    'device_id' => env('JELLYFIN_DEVICE_ID', 'laravel-medyahub'),
    'version' => env('JELLYFIN_VERSION', '1.0.0'),
    'timeout' => env('JELLYFIN_TIMEOUT', 15),
];
