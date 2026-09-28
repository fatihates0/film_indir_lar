<?php

use App\Http\Controllers\Admin\AdminDashboardController;
use App\Http\Controllers\Admin\MediaAdminController;
use App\Http\Controllers\Admin\StorageBoxAdminController;
use App\Http\Controllers\Admin\UserController as AdminUserController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DownloadController;
use App\Http\Controllers\MediaController;
use App\Http\Controllers\PlexWebhookController;
use App\Http\Controllers\ProfileController;
use App\Http\Middleware\EnsureUserIsAdmin;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    if (auth()->check()) {
        return redirect()->route('dashboard');
    }

    return Inertia::render('Welcome', [
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
        'laravelVersion' => Application::VERSION,
        'phpVersion' => PHP_VERSION,
    ]);
});

// Download Stream signed URL route (accessible directly by IDM with valid signature)
Route::get('/download/stream/{token}', [DownloadController::class, 'stream'])
    ->name('download.stream');

// Plex Webhook route
Route::post('/webhooks/plex', [PlexWebhookController::class, 'handle'])
    ->name('webhooks.plex');

// Authenticated User Routes
Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'index'])->name('dashboard');

    Route::get('/media', [MediaController::class, 'index'])->name('media.index');
    Route::get('/media/{media}', [MediaController::class, 'show'])->name('media.show');
    Route::post('/media/{media}/download', [MediaController::class, 'authorizeDownload'])->name('media.authorize-download');

    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

// Admin Routes
Route::middleware(['auth', EnsureUserIsAdmin::class])->prefix('admin')->name('admin.')->group(function () {
    Route::get('/dashboard', [AdminDashboardController::class, 'index'])->name('dashboard');

    Route::get('/users', [AdminUserController::class, 'index'])->name('users.index');
    Route::patch('/users/{user}/quota', [AdminUserController::class, 'updateQuota'])->name('users.quota');
    Route::patch('/users/{user}/permissions', [AdminUserController::class, 'updatePermissions'])->name('users.permissions');

    Route::get('/media', [MediaAdminController::class, 'index'])->name('media.index');
    Route::post('/media', [MediaAdminController::class, 'store'])->name('media.store');
    Route::post('/media/probe', [MediaAdminController::class, 'probe'])->name('media.probe');
    Route::post('/media/scan', [MediaAdminController::class, 'triggerScan'])->name('media.scan');
    Route::patch('/media/{media}/toggle', [MediaAdminController::class, 'toggleActive'])->name('media.toggle');
    Route::delete('/media/{media}', [MediaAdminController::class, 'destroy'])->name('media.destroy');

    // Storage Boxes Management
    Route::get('/storage-boxes', [StorageBoxAdminController::class, 'index'])->name('storage-boxes.index');
    Route::get('/storage-boxes/{storage_box}/browse', [StorageBoxAdminController::class, 'browse'])->name('storage-boxes.browse');
    Route::post('/storage-boxes', [StorageBoxAdminController::class, 'store'])->name('storage-boxes.store');
    Route::patch('/storage-boxes/{storage_box}', [StorageBoxAdminController::class, 'update'])->name('storage-boxes.update');
    Route::delete('/storage-boxes/{storage_box}', [StorageBoxAdminController::class, 'destroy'])->name('storage-boxes.destroy');
    Route::post('/storage-boxes/{storage_box}/scan', [StorageBoxAdminController::class, 'scan'])->name('storage-boxes.scan');
    Route::post('/storage-boxes/{storage_box}/media', [StorageBoxAdminController::class, 'addMedia'])->name('storage-boxes.add-media');

    // Remote Transfers
    Route::post('/storage-boxes/probe-url', [StorageBoxAdminController::class, 'probeUrl'])->name('storage-boxes.probe-url');
    Route::post('/storage-boxes/remote-transfer', [StorageBoxAdminController::class, 'startRemoteTransfer'])->name('storage-boxes.remote-transfer');
    Route::post('/storage-boxes/bulk-remote-transfer', [StorageBoxAdminController::class, 'startBulkRemoteTransfer'])->name('storage-boxes.bulk-remote-transfer');
    Route::get('/storage-boxes/transfers', [StorageBoxAdminController::class, 'getTransfers'])->name('storage-boxes.transfers');
    Route::delete('/storage-boxes/transfers/{transfer}', [StorageBoxAdminController::class, 'cancelTransfer'])->name('storage-boxes.cancel-transfer');
});

require __DIR__.'/auth.php';
