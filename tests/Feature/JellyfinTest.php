<?php

use App\Models\JellyfinAccount;
use App\Models\User;
use App\Services\JellyfinService;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    config()->set('jellyfin.url', 'http://127.0.0.1:8096');
    config()->set('jellyfin.api_key', 'test_jellyfin_api_key_123');
});

test('jellyfin service returns correct status when online', function () {
    Http::fake([
        'http://127.0.0.1:8096/System/Info' => Http::response([
            'ServerName' => 'MedyaHub Jellyfin',
            'Version' => '10.9.11',
            'Id' => 'server-abc-123',
            'OperatingSystem' => 'Linux',
        ], 200),
    ]);

    $service = app(JellyfinService::class);
    $status = $service->getStatus();

    expect($status['online'])->toBeTrue();
    expect($status['server_name'])->toBe('MedyaHub Jellyfin');
    expect($status['version'])->toBe('10.9.11');
});

test('jellyfin service creates user via REST API', function () {
    Http::fake([
        'http://127.0.0.1:8096/Users/New' => Http::response([
            'Id' => 'jellyfin-user-uuid-999',
            'Name' => 'testuser',
            'HasConfiguredPassword' => true,
            'Policy' => [
                'IsAdministrator' => false,
            ],
        ], 200),
    ]);

    $service = app(JellyfinService::class);
    $created = $service->createUser('testuser', 'secretPass123');

    expect($created['id'])->toBe('jellyfin-user-uuid-999');
    expect($created['name'])->toBe('testuser');

    Http::assertSent(function ($request) {
        return $request->url() === 'http://127.0.0.1:8096/Users/New'
            && $request->method() === 'POST'
            && $request->header('X-Emby-Token')[0] === 'test_jellyfin_api_key_123'
            && $request['Name'] === 'testuser';
    });
});

test('jellyfin service deletes user via REST API', function () {
    Http::fake([
        'http://127.0.0.1:8096/Users/jellyfin-user-uuid-999' => Http::response('', 204),
    ]);

    $service = app(JellyfinService::class);
    $result = $service->deleteUser('jellyfin-user-uuid-999');

    expect($result)->toBeTrue();

    Http::assertSent(function ($request) {
        return $request->url() === 'http://127.0.0.1:8096/Users/jellyfin-user-uuid-999'
            && $request->method() === 'DELETE'
            && $request->header('X-Emby-Token')[0] === 'test_jellyfin_api_key_123';
    });
});

test('admin can access jellyfin management page', function () {
    Http::fake([
        'http://127.0.0.1:8096/System/Info' => Http::response([
            'ServerName' => 'Test Server',
            'Version' => '10.9.11',
        ], 200),
        'http://127.0.0.1:8096/Users' => Http::response([
            [
                'Id' => 'user-1-uuid',
                'Name' => 'admin_jellyfin',
                'HasPassword' => true,
                'Policy' => ['IsAdministrator' => true, 'IsDisabled' => false],
            ],
        ], 200),
    ]);

    $admin = User::factory()->create(['role' => 'admin']);

    $response = $this->actingAs($admin)->get('/admin/jellyfin');
    $response->assertOk();
});

test('admin can create jellyfin user through web controller', function () {
    Http::fake([
        'http://127.0.0.1:8096/Users/New' => Http::response([
            'Id' => 'new-uuid-456',
            'Name' => 'cemil_kaya',
            'HasConfiguredPassword' => true,
            'Policy' => ['IsAdministrator' => false],
        ], 200),
    ]);

    $admin = User::factory()->create(['role' => 'admin']);
    $user = User::factory()->create();

    $response = $this->actingAs($admin)->post('/admin/jellyfin/users', [
        'username' => 'cemil_kaya',
        'password' => 'pass1234',
        'user_id' => $user->id,
    ]);

    $response->assertRedirect();

    $account = JellyfinAccount::where('jellyfin_user_id', 'new-uuid-456')->first();
    expect($account)->not->toBeNull();
    expect($account->username)->toBe('cemil_kaya');
    expect($account->user_id)->toBe($user->id);
});

test('admin can delete jellyfin user through web controller', function () {
    Http::fake([
        'http://127.0.0.1:8096/Users/uuid-to-delete' => Http::response('', 204),
    ]);

    $admin = User::factory()->create(['role' => 'admin']);

    $account = JellyfinAccount::create([
        'jellyfin_user_id' => 'uuid-to-delete',
        'username' => 'silinecek_user',
    ]);

    $response = $this->actingAs($admin)->delete('/admin/jellyfin/users/uuid-to-delete');
    $response->assertRedirect();

    expect(JellyfinAccount::find($account->id))->toBeNull();
});

test('artisan command jellyfin:create-user creates account', function () {
    Http::fake([
        'http://127.0.0.1:8096/Users/New' => Http::response([
            'Id' => 'cli-uuid-789',
            'Name' => 'cli_user',
            'HasConfiguredPassword' => true,
            'Policy' => ['IsAdministrator' => false],
        ], 200),
    ]);

    $this->artisan('jellyfin:create-user', [
        'username' => 'cli_user',
        '--password' => 'secretCli123',
    ])->assertSuccessful();

    $account = JellyfinAccount::where('jellyfin_user_id', 'cli-uuid-789')->first();
    expect($account)->not->toBeNull();
    expect($account->username)->toBe('cli_user');
});

test('artisan command jellyfin:delete-user deletes account', function () {
    Http::fake([
        'http://127.0.0.1:8096/Users/cli-delete-uuid' => Http::response('', 204),
    ]);

    $account = JellyfinAccount::create([
        'jellyfin_user_id' => 'cli-delete-uuid',
        'username' => 'cli_delete_user',
    ]);

    $this->artisan('jellyfin:delete-user', [
        'identifier' => 'cli-delete-uuid',
        '--force' => true,
    ])->assertSuccessful();

    expect(JellyfinAccount::find($account->id))->toBeNull();
});
