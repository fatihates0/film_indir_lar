<?php

use App\Jobs\PlexSyncJob;
use App\Jobs\QuotaResetJob;
use Illuminate\Support\Facades\Schedule;

Schedule::job(new PlexSyncJob)->everyThirtySeconds();
Schedule::job(new QuotaResetJob)->everyFiveMinutes();
