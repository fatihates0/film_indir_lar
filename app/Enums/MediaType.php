<?php

namespace App\Enums;

enum MediaType: string
{
    case MOVIE = 'movie';
    case SERIES = 'series';
    case EPISODE = 'episode';
}
