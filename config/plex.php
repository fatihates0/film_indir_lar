<?php

return [
    'url' => env('PLEX_URL', 'http://127.0.0.1:32400'),
    'token' => env('PLEX_TOKEN', ''),
    'poll_interval_seconds' => env('PLEX_POLL_INTERVAL', 30),
];
