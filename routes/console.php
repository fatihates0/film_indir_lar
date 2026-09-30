<?php

use App\Jobs\MediaScanJob;
use App\Jobs\PlexSyncJob;
use App\Jobs\QuotaResetJob;
use Illuminate\Support\Facades\Schedule;

Schedule::job(new PlexSyncJob)->everyThirtySeconds();
Schedule::job(new QuotaResetJob)->everyFiveMinutes();
Schedule::job(new MediaScanJob)->everyFiveMinutes();
