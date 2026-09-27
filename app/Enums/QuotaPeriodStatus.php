<?php

namespace App\Enums;

enum QuotaPeriodStatus: string
{
    case ACTIVE = 'active';
    case EXPIRED = 'expired';
    case CANCELLED = 'cancelled';
}
