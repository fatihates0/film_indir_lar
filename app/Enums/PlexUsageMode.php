<?php

namespace App\Enums;

enum PlexUsageMode: string
{
    case ESTIMATED = 'estimated';
    case ACTUAL = 'actual';
    case FILE_SIZE = 'file_size';
}
