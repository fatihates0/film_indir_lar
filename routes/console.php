<?php

use App\Jobs\MediaScanJob;
use App\Jobs\PlexSyncJob;
use Illuminate\Support\Facades\Schedule;

Schedule::job(new PlexSyncJob)->everyThirtySeconds();
Schedule::job(new MediaScanJob)->everyFiveMinutes();
