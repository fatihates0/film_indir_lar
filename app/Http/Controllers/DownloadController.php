<?php

namespace App\Http\Controllers;

use App\Models\DownloadSession;
use App\Services\DownloadService;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class DownloadController extends Controller
{
    public function __construct(
        protected DownloadService $downloadService,
    ) {}

    public function stream(string $token, Request $request): Response
    {
        if (! $request->hasValidSignature()) {
            abort(403, 'Geçersiz veya süresi dolmuş indirme bağlantısı.');
        }

        $session = DownloadSession::where('token', $token)->firstOrFail();

        return $this->downloadService->stream($session, $request);
    }
}
