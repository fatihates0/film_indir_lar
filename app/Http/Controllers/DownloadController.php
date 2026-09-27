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
        $session = DownloadSession::where('token', $token)->first();

        if (! $session) {
            abort(404, 'İndirme oturumu bulunamadı veya geçersiz.');
        }

        return $this->downloadService->stream($session, $request);
    }
}
