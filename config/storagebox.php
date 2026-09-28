<?php

return [
    'mount_path' => env('STORAGEBOX_MOUNT', storage_path('app/storagebox')),
    'max_concurrent_transfers' => (int) env('REMOTE_TRANSFER_CONCURRENCY', env('MAX_CONCURRENT_REMOTE_TRANSFERS', 3)),
];
