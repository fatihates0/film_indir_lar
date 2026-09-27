<?php

return [
    'default_limit_bytes' => env('QUOTA_DEFAULT_BYTES', 1073741824000), // 1000 GB
    'period_days' => env('QUOTA_PERIOD_DAYS', 30),
    'warning_thresholds' => [80, 90, 100],
];
