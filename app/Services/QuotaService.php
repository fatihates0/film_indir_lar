<?php

namespace App\Services;

use App\DTOs\UsageContext;
use App\Enums\QuotaPeriodStatus;
use App\Models\QuotaPeriod;
use App\Models\QuotaUsageRecord;
use App\Models\User;
use App\Models\UserQuota;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class QuotaService
{
    /**
     * Ensure the user has an active 30-day quota period and reset if expired.
     */
    public function ensureCurrentPeriod(User $user): UserQuota
    {
        return DB::transaction(function () use ($user) {
            $quota = UserQuota::where('user_id', $user->id)->lockForUpdate()->first();

            $now = Carbon::now();

            if (! $quota) {
                // Initialize default quota (e.g. 1000 GB)
                $defaultLimit = config('quota.default_limit_bytes', 1073741824000); // 1000 GB
                $periodDays = config('quota.period_days', 30);

                $periodStartedAt = $now->copy();
                $periodExpiresAt = $now->copy()->addDays($periodDays);

                $quota = UserQuota::create([
                    'user_id' => $user->id,
                    'quota_limit_bytes' => $defaultLimit,
                    'used_bytes' => 0,
                    'period_started_at' => $periodStartedAt,
                    'period_expires_at' => $periodExpiresAt,
                ]);

                QuotaPeriod::create([
                    'user_id' => $user->id,
                    'quota_limit_bytes' => $defaultLimit,
                    'used_bytes' => 0,
                    'started_at' => $periodStartedAt,
                    'expires_at' => $periodExpiresAt,
                    'status' => QuotaPeriodStatus::ACTIVE,
                ]);

                return $quota;
            }

            // Check if current period has expired
            if ($now->greaterThanOrEqualTo($quota->period_expires_at)) {
                $periodDays = config('quota.period_days', 30);

                // Mark current period as expired
                QuotaPeriod::where('user_id', $user->id)
                    ->where('status', QuotaPeriodStatus::ACTIVE)
                    ->update(['status' => QuotaPeriodStatus::EXPIRED]);

                // Calculate next period dates cleanly
                $newStartedAt = $quota->period_expires_at;
                $newExpiresAt = $newStartedAt->copy()->addDays($periodDays);

                // If period is way behind (e.g. server was off), reset from now
                if ($now->greaterThanOrEqualTo($newExpiresAt)) {
                    $newStartedAt = $now->copy();
                    $newExpiresAt = $now->copy()->addDays($periodDays);
                }

                $quota->update([
                    'used_bytes' => 0,
                    'period_started_at' => $newStartedAt,
                    'period_expires_at' => $newExpiresAt,
                ]);

                QuotaPeriod::create([
                    'user_id' => $user->id,
                    'quota_limit_bytes' => $quota->quota_limit_bytes,
                    'used_bytes' => 0,
                    'started_at' => $newStartedAt,
                    'expires_at' => $newExpiresAt,
                    'status' => QuotaPeriodStatus::ACTIVE,
                ]);
            }

            return $quota;
        });
    }

    /**
     * Check if user can consume requested bytes.
     */
    public function canConsume(User $user, int $bytes): bool
    {
        if ($bytes <= 0) {
            return true;
        }

        $quota = $this->ensureCurrentPeriod($user);

        return ($quota->used_bytes + $bytes) <= $quota->quota_limit_bytes;
    }

    /**
     * Atomically consume quota for user.
     */
    public function consume(User $user, UsageContext $context): QuotaUsageRecord
    {
        if ($context->bytes < 0) {
            throw new InvalidArgumentException('Consumption bytes cannot be negative.');
        }

        return DB::transaction(function () use ($user, $context) {
            // Check idempotency if eventId is provided
            if ($context->eventId) {
                $existing = QuotaUsageRecord::where('event_id', $context->eventId)->first();
                if ($existing) {
                    return $existing;
                }
            }

            $quota = UserQuota::where('user_id', $user->id)->lockForUpdate()->first();

            if (! $quota) {
                $quota = $this->ensureCurrentPeriod($user);
                $quota = UserQuota::where('user_id', $user->id)->lockForUpdate()->first();
            }

            $activePeriod = QuotaPeriod::where('user_id', $user->id)
                ->where('status', QuotaPeriodStatus::ACTIVE)
                ->lockForUpdate()
                ->first();

            $newUsed = $quota->used_bytes + $context->bytes;

            if ($newUsed > $quota->quota_limit_bytes) {
                throw new InvalidArgumentException('Requested consumption exceeds available quota limit.');
            }

            $quota->update(['used_bytes' => $newUsed]);

            if ($activePeriod) {
                $activePeriod->update(['used_bytes' => $activePeriod->used_bytes + $context->bytes]);
            }

            return QuotaUsageRecord::create([
                'user_id' => $user->id,
                'quota_period_id' => $activePeriod?->id,
                'source' => $context->source,
                'media_id' => $context->mediaId,
                'download_session_id' => $context->downloadSessionId,
                'bytes' => $context->bytes,
                'event_id' => $context->eventId,
                'started_at' => Carbon::now(),
                'completed_at' => Carbon::now(),
                'metadata' => $context->metadata,
            ]);
        });
    }

    /**
     * Update user limit directly (Admin action).
     */
    public function updateQuotaLimit(User $user, int $newLimitBytes): UserQuota
    {
        return DB::transaction(function () use ($user, $newLimitBytes) {
            $quota = $this->ensureCurrentPeriod($user);

            $quota->update(['quota_limit_bytes' => $newLimitBytes]);

            QuotaPeriod::where('user_id', $user->id)
                ->where('status', QuotaPeriodStatus::ACTIVE)
                ->update(['quota_limit_bytes' => $newLimitBytes]);

            return $quota->refresh();
        });
    }
}
