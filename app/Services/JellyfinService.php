<?php

namespace App\Services;

use Exception;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class JellyfinService
{
    protected string $url;
    protected string $apiKey;
    protected string $clientName;
    protected string $deviceName;
    protected string $deviceId;
    protected string $version;
    protected int $timeout;

    public function __construct()
    {
        $this->url = rtrim((string) config('jellyfin.url', 'http://127.0.0.1:8096'), '/');
        $this->apiKey = (string) config('jellyfin.api_key', '');
        $this->clientName = (string) config('jellyfin.client_name', 'MedyaHub');
        $this->deviceName = (string) config('jellyfin.device_name', 'Laravel Server');
        $this->deviceId = (string) config('jellyfin.device_id', 'laravel-medyahub');
        $this->version = (string) config('jellyfin.version', '1.0.0');
        $this->timeout = (int) config('jellyfin.timeout', 15);
    }

    /**
     * Check if Jellyfin server is configured and reachable.
     */
    public function getStatus(): array
    {
        if (empty($this->apiKey)) {
            return [
                'online' => false,
                'configured' => false,
                'message' => 'Jellyfin API Key (JELLYFIN_API_KEY) tanımlanmamış.',
                'server_name' => null,
                'version' => null,
            ];
        }

        try {
            $response = $this->http()->get("{$this->url}/System/Info");

            if ($response->successful()) {
                $data = $response->json() ?? [];

                return [
                    'online' => true,
                    'configured' => true,
                    'server_name' => $data['ServerName'] ?? 'Jellyfin Server',
                    'version' => $data['Version'] ?? 'Bilinmiyor',
                    'id' => $data['Id'] ?? null,
                    'operating_system' => $data['OperatingSystem'] ?? null,
                ];
            }

            return [
                'online' => false,
                'configured' => true,
                'message' => 'Jellyfin HTTP ' . $response->status() . ': ' . $response->body(),
                'server_name' => null,
                'version' => null,
            ];
        } catch (Exception $e) {
            Log::warning('Jellyfin status check failed: ' . $e->getMessage());

            return [
                'online' => false,
                'configured' => true,
                'message' => 'Jellyfin sunucusuna erişilemedi: ' . $e->getMessage(),
                'server_name' => null,
                'version' => null,
            ];
        }
    }

    /**
     * Get all users from Jellyfin server.
     */
    public function getUsers(): array
    {
        $this->ensureConfigured();

        $response = $this->http()->get("{$this->url}/Users");

        if (! $response->successful()) {
            throw new Exception('Jellyfin kullanıcıları alınamadı: ' . $this->extractErrorMessage($response));
        }

        $rawUsers = $response->json() ?? [];

        return array_map(function ($u) {
            return [
                'id' => $u['Id'] ?? '',
                'name' => $u['Name'] ?? '',
                'has_password' => (bool) ($u['HasPassword'] ?? false),
                'has_configured_password' => (bool) ($u['HasConfiguredPassword'] ?? false),
                'last_activity_date' => $u['LastActivityDate'] ?? null,
                'last_login_date' => $u['LastLoginDate'] ?? null,
                'is_administrator' => (bool) ($u['Policy']['IsAdministrator'] ?? false),
                'is_disabled' => (bool) ($u['Policy']['IsDisabled'] ?? false),
                'enable_all_folders' => (bool) ($u['Policy']['EnableAllFolders'] ?? true),
                'raw' => $u,
            ];
        }, $rawUsers);
    }

    /**
     * Get single user from Jellyfin.
     */
    public function getUser(string $userId): array
    {
        $this->ensureConfigured();

        $response = $this->http()->get("{$this->url}/Users/{$userId}");

        if (! $response->successful()) {
            throw new Exception("Jellyfin kullanıcısı ({$userId}) bulunamadı: " . $this->extractErrorMessage($response));
        }

        return $response->json() ?? [];
    }

    /**
     * Create a new Jellyfin user.
     *
     * @param string $name Username
     * @param string|null $password Optional initial password
     * @return array Created user details ['id', 'name', 'raw']
     */
    public function createUser(string $name, ?string $password = null): array
    {
        $this->ensureConfigured();

        $payload = [
            'Name' => trim($name),
        ];

        if (! empty($password)) {
            $payload['Password'] = $password;
        }

        $response = $this->http()->post("{$this->url}/Users/New", $payload);

        if (! $response->successful()) {
            throw new Exception('Jellyfin kullanıcısı oluşturulamadı: ' . $this->extractErrorMessage($response));
        }

        $userData = $response->json();
        $userId = $userData['Id'] ?? null;

        if (! $userId) {
            throw new Exception('Jellyfin kullanıcısı oluşturuldu ancak kullanıcı ID değeri alınamadı.');
        }

        // If a password was provided and not set via New, ensure it is set via the Password endpoint
        if (! empty($password) && empty($userData['HasConfiguredPassword']) && empty($userData['HasPassword'])) {
            try {
                $this->updateUserPassword($userId, $password);
            } catch (Exception $e) {
                Log::warning("Jellyfin kullanıcısı oluşturuldu fakat şifre atanamadı: {$e->getMessage()}");
            }
        }

        return [
            'id' => $userId,
            'name' => $userData['Name'] ?? $name,
            'is_administrator' => (bool) ($userData['Policy']['IsAdministrator'] ?? false),
            'raw' => $userData,
        ];
    }

    /**
     * Delete a Jellyfin user by user ID.
     *
     * @param string $userId Jellyfin user UUID
     */
    public function deleteUser(string $userId): bool
    {
        $this->ensureConfigured();

        if (empty($userId)) {
            throw new Exception('Silinecek Jellyfin kullanıcı ID belirtilmedi.');
        }

        $response = $this->http()->delete("{$this->url}/Users/{$userId}");

        if (! $response->successful() && $response->status() !== 404) {
            throw new Exception('Jellyfin kullanıcısı silinemedi: ' . $this->extractErrorMessage($response));
        }

        return true;
    }

    /**
     * Update user password in Jellyfin.
     */
    public function updateUserPassword(string $userId, string $newPassword, string $currentPassword = ''): bool
    {
        $this->ensureConfigured();

        $response = $this->http()->post("{$this->url}/Users/{$userId}/Password", [
            'CurrentPw' => $currentPassword,
            'NewPw' => $newPassword,
            'ResetPassword' => empty($currentPassword),
        ]);

        if (! $response->successful()) {
            throw new Exception('Jellyfin şifresi güncellenemedi: ' . $this->extractErrorMessage($response));
        }

        return true;
    }

    /**
     * Update user policy (e.g. admin, disable user, permissions).
     */
    public function updateUserPolicy(string $userId, array $policy): bool
    {
        $this->ensureConfigured();

        $response = $this->http()->post("{$this->url}/Users/{$userId}/Policy", $policy);

        if (! $response->successful()) {
            throw new Exception('Jellyfin yetkileri güncellenemedi: ' . $this->extractErrorMessage($response));
        }

        return true;
    }

    /**
     * Build HTTP client with Jellyfin authorization headers.
     */
    protected function http()
    {
        $authHeader = sprintf(
            'MediaBrowser Client="%s", Device="%s", DeviceId="%s", Version="%s", Token="%s"',
            $this->clientName,
            $this->deviceName,
            $this->deviceId,
            $this->version,
            $this->apiKey
        );

        return Http::timeout($this->timeout)
            ->withHeaders([
                'X-Emby-Token' => $this->apiKey,
                'Authorization' => $authHeader,
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
            ]);
    }

    /**
     * Ensure URL and API Key are configured.
     */
    protected function ensureConfigured(): void
    {
        if (empty($this->apiKey)) {
            throw new Exception('Jellyfin API Key (JELLYFIN_API_KEY) tanımlanmamış. Lütfen .env dosyanızı kontrol edin.');
        }

        if (empty($this->url)) {
            throw new Exception('Jellyfin sunucu adresi (JELLYFIN_URL) tanımlanmamış.');
        }
    }

    /**
     * Extract readable error message from Jellyfin response.
     */
    protected function extractErrorMessage(Response $response): string
    {
        $status = $response->status();
        $body = $response->body();

        $json = $response->json();
        if (is_array($json) && ! empty($json['message'])) {
            return "{$json['message']} (HTTP {$status})";
        }

        if (! empty($body)) {
            return strip_tags(substr($body, 0, 200)) . " (HTTP {$status})";
        }

        return "HTTP {$status}";
    }
}
