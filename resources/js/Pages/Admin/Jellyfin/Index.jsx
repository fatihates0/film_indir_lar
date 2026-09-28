import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import { useState } from 'react';

export default function JellyfinIndex({ server_status, api_error, jellyfin_users = [], available_users = [], config }) {
    const flash = usePage().props.flash;
    const errors = usePage().props.errors;

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [passwordModalUser, setPasswordModalUser] = useState(null);
    const [syncing, setSyncing] = useState(false);

    // Create user form
    const createForm = useForm({
        username: '',
        password: '',
        user_id: '',
    });

    // Password update form
    const passwordForm = useForm({
        password: '',
    });

    const handleCreateSubmit = (e) => {
        e.preventDefault();
        createForm.post(route('admin.jellyfin.users.store'), {
            onSuccess: () => {
                setCreateModalOpen(false);
                createForm.reset();
            },
        });
    };

    const handlePasswordSubmit = (e) => {
        e.preventDefault();
        if (!passwordModalUser) return;

        passwordForm.patch(route('admin.jellyfin.users.password', passwordModalUser.jellyfin_user_id), {
            onSuccess: () => {
                setPasswordModalUser(null);
                passwordForm.reset();
            },
        });
    };

    const handleDeleteUser = (user) => {
        if (!confirm(`"${user.username}" kullanıcısını Jellyfin sunucusundan silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`)) {
            return;
        }

        router.delete(route('admin.jellyfin.users.destroy', user.jellyfin_user_id));
    };

    const handleSync = () => {
        setSyncing(true);
        router.post(route('admin.jellyfin.sync'), {}, {
            onFinish: () => setSyncing(false),
        });
    };

    const totalAdmins = jellyfin_users.filter(u => u.is_administrator).length;
    const totalLinked = jellyfin_users.filter(u => u.user).length;

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 p-2 shadow-lg shadow-purple-600/30 flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
                                    Jellyfin Kullanıcı Yönetimi
                                </h2>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Jellyfin API ile kullanıcı oluşturma, şifre belirleme ve silme işlemleri.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleSync}
                            disabled={syncing || !server_status.online}
                            className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-200 transition-all border border-slate-700 disabled:opacity-50"
                        >
                            <svg className={`w-4 h-4 text-slate-400 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Jellyfin ile Eşitle
                        </button>

                        <button
                            onClick={() => setCreateModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-600/30 hover:scale-105 transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                            </svg>
                            + Yeni Jellyfin Kullanıcısı
                        </button>
                    </div>
                </div>
            }
        >
            <Head title="Jellyfin Yönetimi - MedyaHub" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
                {flash?.message && (
                    <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm text-emerald-300 flex items-center gap-3">
                        <svg className="w-5 h-5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{flash.message}</span>
                    </div>
                )}

                {errors?.general && (
                    <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-300 flex items-center gap-3">
                        <svg className="w-5 h-5 text-rose-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{errors.general}</span>
                    </div>
                )}

                {/* Server Status Banner */}
                <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <span className={`flex h-3 w-3 rounded-full ${
                                server_status.online ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'
                            }`} />
                            <div>
                                <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">
                                    Jellyfin Medya Sunucusu
                                </div>
                                <div className="text-lg font-bold text-white flex items-center gap-2 mt-0.5">
                                    {config.url}
                                    {server_status.server_name && (
                                        <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                                            {server_status.server_name}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                            <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
                                server_status.online
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}>
                                ● {server_status.online ? `ONLINE (v${server_status.version})` : 'OFFLINE'}
                            </span>

                            <span className={`px-3 py-1.5 rounded-xl text-xs font-medium border ${
                                config.has_api_key
                                    ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                    : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                            }`}>
                                {config.has_api_key ? 'API Key Tanımlı' : 'API Key Eksik (.env: JELLYFIN_API_KEY)'}
                            </span>
                        </div>
                    </div>

                    {!server_status.online && (
                        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 text-xs text-amber-300 flex items-start gap-3">
                            <svg className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div>
                                <div className="font-bold">Bağlantı Uyarısı</div>
                                <div className="mt-0.5">
                                    {server_status.message || 'Jellyfin sunucusuna bağlanılamadı. Lütfen sunucunuzun çalıştığından ve .env dosyasında JELLYFIN_URL ile JELLYFIN_API_KEY değerlerinin doğru girildiğinden emin olun.'}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
                        <div className="text-xs text-slate-400 font-medium">Toplam Jellyfin Kullanıcıları</div>
                        <div className="text-2xl font-black text-white mt-1">{jellyfin_users.length}</div>
                        <div className="text-[11px] text-slate-500 mt-1">Sunucuda kayıtlı profiller</div>
                    </div>

                    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
                        <div className="text-xs text-slate-400 font-medium">Yönetici Hesaplar</div>
                        <div className="text-2xl font-black text-purple-400 mt-1">{totalAdmins}</div>
                        <div className="text-[11px] text-slate-500 mt-1">Yönetim yetkisine sahip profiller</div>
                    </div>

                    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
                        <div className="text-xs text-slate-400 font-medium">MedyaHub Eşleşmesi</div>
                        <div className="text-2xl font-black text-indigo-400 mt-1">{totalLinked}</div>
                        <div className="text-[11px] text-slate-500 mt-1">Platform üyeleriyle bağlantılı</div>
                    </div>
                </div>

                {/* Users List Card */}
                <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-white tracking-tight">Kullanıcı Listesi</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Jellyfin REST API üzerinden okunan kullanıcı hesapları.</p>
                        </div>
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            {jellyfin_users.length} Kayıt
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-300">
                            <thead className="bg-slate-950/80 text-xs font-semibold uppercase text-slate-400 border-b border-slate-800">
                                <tr>
                                    <th className="px-6 py-4">Kullanıcı</th>
                                    <th className="px-6 py-4">Jellyfin ID</th>
                                    <th className="px-6 py-4">Rol / Yetki</th>
                                    <th className="px-6 py-4">Şifre</th>
                                    <th className="px-6 py-4">MedyaHub Eşleşmesi</th>
                                    <th className="px-6 py-4">Son Aktivite</th>
                                    <th className="px-6 py-4 text-right">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {jellyfin_users.length > 0 ? (
                                    jellyfin_users.map((u) => (
                                        <tr key={u.jellyfin_user_id} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-purple-600/40 to-indigo-600/40 border border-purple-500/30 flex items-center justify-center font-bold text-purple-200 text-sm">
                                                        {u.username.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="font-bold text-white">{u.username}</div>
                                                        {u.is_disabled && (
                                                            <span className="text-[10px] text-rose-400 font-semibold">Devre Dışı</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-6 py-4 font-mono text-xs text-slate-400">
                                                <span title={u.jellyfin_user_id}>
                                                    {u.jellyfin_user_id ? `${u.jellyfin_user_id.substring(0, 12)}...` : '-'}
                                                </span>
                                            </td>

                                            <td className="px-6 py-4">
                                                {u.is_administrator ? (
                                                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">
                                                        Yönetici
                                                    </span>
                                                ) : (
                                                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                                                        Standart
                                                    </span>
                                                )}
                                            </td>

                                            <td className="px-6 py-4 text-xs">
                                                {u.has_password ? (
                                                    <span className="text-emerald-400 flex items-center gap-1 font-medium">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                        </svg>
                                                        Korumalı
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-500">Şifresiz</span>
                                                )}
                                            </td>

                                            <td className="px-6 py-4 text-xs">
                                                {u.user ? (
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-indigo-300">{u.user.name}</span>
                                                        <span className="text-[11px] text-slate-500">{u.user.email}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-500 italic">Bağımsız Hesap</span>
                                                )}
                                            </td>

                                            <td className="px-6 py-4 text-xs text-slate-400">
                                                {u.last_activity_date}
                                            </td>

                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setPasswordModalUser(u);
                                                            passwordForm.reset();
                                                        }}
                                                        className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-xs font-semibold border border-indigo-500/30 transition-all"
                                                        title="Jellyfin şifresini güncelle"
                                                    >
                                                        Şifre
                                                    </button>

                                                    <button
                                                        onClick={() => handleDeleteUser(u)}
                                                        className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/30 text-rose-400 text-xs font-semibold border border-rose-500/30 transition-all"
                                                        title="Jellyfin kullanıcısını sunucudan sil"
                                                    >
                                                        Sil
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="7" className="px-6 py-12 text-center text-slate-400">
                                            {server_status.online
                                                ? 'Jellyfin üzerinde kayıtlı kullanıcı bulunamadı. "+ Yeni Jellyfin Kullanıcısı" butonuna tıklayarak ilk hesabı oluşturabilirsiniz.'
                                                : 'Jellyfin sunucusuna bağlanılamadığı için kullanıcı listesi alınamadı.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Yeni Kullanıcı Oluşturma Modalı */}
            {createModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-bold text-white">Yeni Jellyfin Kullanıcısı</h3>
                                <p className="text-xs text-slate-400">Jellyfin sunucusuna doğrudan yeni kullanıcı hesabı ekler.</p>
                            </div>
                            <button
                                onClick={() => setCreateModalOpen(false)}
                                className="text-slate-400 hover:text-white font-bold"
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-300 mb-1">
                                    Kullanıcı Adı <span className="text-rose-400">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={createForm.data.username}
                                    onChange={(e) => createForm.setData('username', e.target.value)}
                                    className="w-full rounded-xl bg-slate-950 border-slate-800 text-white focus:border-purple-500 focus:ring-purple-500 text-xs"
                                    placeholder="örn: ahmet_yilmaz"
                                    required
                                    autoFocus
                                />
                                {createForm.errors.username && (
                                    <div className="text-rose-400 text-[11px] mt-1">{createForm.errors.username}</div>
                                )}
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-300 mb-1">
                                    Giriş Şifresi <span className="text-slate-500 font-normal">(Opsiyonel)</span>
                                </label>
                                <input
                                    type="password"
                                    value={createForm.data.password}
                                    onChange={(e) => createForm.setData('password', e.target.value)}
                                    className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-purple-500 focus:ring-purple-500 text-xs"
                                    placeholder="Belirlemek istemiyorsanız boş bırakın"
                                />
                                {createForm.errors.password && (
                                    <div className="text-rose-400 text-[11px] mt-1">{createForm.errors.password}</div>
                                )}
                            </div>

                            <div>
                                <label className="block font-semibold text-slate-300 mb-1">
                                    MedyaHub Kullanıcısıyla Eşleştir <span className="text-slate-500 font-normal">(Opsiyonel)</span>
                                </label>
                                <select
                                    value={createForm.data.user_id}
                                    onChange={(e) => createForm.setData('user_id', e.target.value)}
                                    className="w-full rounded-xl bg-slate-950 border-slate-800 text-white focus:border-purple-500 focus:ring-purple-500 text-xs"
                                >
                                    <option value="">Bağımsız Hesap (Eşleştirme Yok)</option>
                                    {availableUsers.map((u) => (
                                        <option key={u.id} value={u.id}>
                                            {u.name} ({u.email})
                                        </option>
                                    ))}
                                </select>
                                <p className="text-[11px] text-slate-500 mt-1">
                                    Seçilen platform kullanıcısının hesabı bu Jellyfin profili ile ilişkilendirilir.
                                </p>
                            </div>

                            <div className="pt-4 border-t border-slate-800 flex gap-2">
                                <button
                                    type="submit"
                                    disabled={createForm.processing}
                                    className="flex-1 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-600/30 hover:opacity-90 transition-all disabled:opacity-50"
                                >
                                    Kullanıcıyı Oluştur
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCreateModalOpen(false)}
                                    className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
                                >
                                    İptal
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Şifre Güncelleme Modalı */}
            {passwordModalUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="text-lg font-bold text-white">Şifre Belirle / Değiştir</h3>
                                <p className="text-xs text-slate-400">{passwordModalUser.username} kullanıcısı için</p>
                            </div>
                            <button
                                onClick={() => setPasswordModalUser(null)}
                                className="text-slate-400 hover:text-white font-bold"
                            >
                                &times;
                            </button>
                        </div>

                        <form onSubmit={handlePasswordSubmit} className="space-y-4 text-xs">
                            <div>
                                <label className="block font-semibold text-slate-300 mb-1">
                                    Yeni Şifre <span className="text-rose-400">*</span>
                                </label>
                                <input
                                    type="password"
                                    value={passwordForm.data.password}
                                    onChange={(e) => passwordForm.setData('password', e.target.value)}
                                    className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                    placeholder="Yeni şifreyi girin"
                                    required
                                    autoFocus
                                />
                                {passwordForm.errors.password && (
                                    <div className="text-rose-400 text-[11px] mt-1">{passwordForm.errors.password}</div>
                                )}
                            </div>

                            <div className="pt-4 border-t border-slate-800 flex gap-2">
                                <button
                                    type="submit"
                                    disabled={passwordForm.processing}
                                    className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all disabled:opacity-50"
                                >
                                    Şifreyi Güncelle
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPasswordModalUser(null)}
                                    className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
                                >
                                    İptal
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </AuthenticatedLayout>
    );
}
