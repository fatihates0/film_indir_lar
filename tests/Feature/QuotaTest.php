<?php

use App\DTOs\UsageContext;
use App\Enums\UsageSource;
use App\Models\User;

test('user gets default 1000 GB 30 day quota period on first check', function () {
    $user = User::factory()->create();
    $quotaService = app(\App\Services\QuotaService::class);

    $quota = $quotaService->ensureCurrentPeriod($user);

    expect($quota->quota_limit_bytes)->toBe(1073741824000);
    expect($quota->used_bytes)->toBe(0);
    expect($quota->remaining_bytes)->toBe(1073741824000);
});

test('quota consumption deducts correctly and prevents exceeding limit', function () {
    $user = User::factory()->create();
    $quotaService = app(\App\Services\QuotaService::class);

    $quotaService->ensureCurrentPeriod($user);
    $quotaService->updateQuotaLimit($user, 10 * 1073741824); // 10 GB limit

    $context = new UsageContext(
        source: UsageSource::DOWNLOAD,
        bytes: 3 * 1073741824 // 3 GB
    );

    $record = $quotaService->consume($user, $context);
    expect($record->bytes)->toBe(3 * 1073741824);

    $updatedQuota = $user->activeQuota->refresh();
    expect($updatedQuota->used_bytes)->toBe(3 * 1073741824);
    expect($updatedQuota->remaining_bytes)->toBe(7 * 1073741824);

    // Attempting to consume 8 GB (exceeds remaining 7 GB)
    $excessContext = new UsageContext(
        source: UsageSource::DOWNLOAD,
        bytes: 8 * 1073741824
    );

    expect(fn () => $quotaService->consume($user, $excessContext))
        ->toThrow(\InvalidArgumentException::class);
});
