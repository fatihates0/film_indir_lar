<?php

namespace App\Jobs;

use App\Models\User;
use App\Services\QuotaService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class QuotaResetJob implements ShouldQueue
{
    use Queueable;

    public function __construct()
    {
        $this->onQueue('default');
    }

    public function handle(QuotaService $quotaService): void
    {
        User::where('status', 'active')->chunk(100, function ($users) use ($quotaService) {
            foreach ($users as $user) {
                $quotaService->ensureCurrentPeriod($user);
            }
        });
    }
}
