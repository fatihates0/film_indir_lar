<?php

namespace App\Enums;

enum UsageSource: string
{
    case DOWNLOAD = 'download';
    case PLEX = 'plex';
    case ADMIN_ADJUSTMENT = 'admin_adjustment';
}
