<?php

namespace App\DTOs;

use App\Enums\UsageSource;

class UsageContext
{
    public function __construct(
        public UsageSource $source,
        public int $bytes,
        public ?int $mediaId = null,
        public ?int $downloadSessionId = null,
        public ?string $eventId = null,
        public ?array $metadata = null,
    ) {}
}
