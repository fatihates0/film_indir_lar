<?php

namespace App\Http\Controllers;

use App\Models\DownloadSession;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();

        // Fetch recent user download sessions
        $recentDownloads = DownloadSession::with('media')
            ->where('user_id', $user->id)
            ->latest()
            ->take(10)
            ->get();

        return Inertia::render('User', [
            'recent_downloads' => $recentDownloads,
        ]);
    }
}
