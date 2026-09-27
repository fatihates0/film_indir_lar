import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, useForm } from '@inertiajs/react';
import { useState } from 'react';

export default function UserIndex({ users }) {
    const [selectedUser, setSelectedUser] = useState(null);

    const { data, setData, patch, processing, errors, reset } = useForm({
        quota_limit_gb: '',
        max_concurrent_downloads: 5,
        status: 'active',
        download_enabled: true,
        plex_enabled: true,
    });

    const openEditModal = (user) => {
        setSelectedUser(user);
        const limitGb = user.active_quota ? (user.active_quota.quota_limit_bytes / 1073741824).toFixed(0) : 1000;
        setData({
            quota_limit_gb: limitGb,
            max_concurrent_downloads: user.max_concurrent_downloads || 5,
            status: user.status || 'active',
            download_enabled: Boolean(user.download_enabled),
            plex_enabled: Boolean(user.plex_enabled),
        });
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (!selectedUser) return;

        // 1. Update quota limit
        patch(route('admin.users.quota', selectedUser.id), {
            onSuccess: () => {
                // 2. Update permissions and max_concurrent_downloads
                router.patch(route('admin.users.permissions', selectedUser.id), {
                    status: data.status,
                    download_enabled: data.download_enabled,
                    plex_enabled: data.plex_enabled,
                    max_concurrent_downloads: Number(data.max_concurrent_downloads),
                }, {
                    onSuccess: () => {
                        setSelectedUser(null);
                        reset();
                    },
                });
            },
        });
    };

    const togglePermission = (user, field) => {
        router.patch(route('admin.users.permissions', user.id), {
            status: user.status,
            download_enabled: field === 'download_enabled' ? !user.download_enabled : user.download_enabled,
            plex_enabled: field === 'plex_enabled' ? !user.plex_enabled : user.plex_enabled,
            max_concurrent_downloads: user.max_concurrent_downloads || 5,
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">Kullanıcı & Kota Yönetimi</h2>
                    <p className="text-sm text-slate-400 mt-1">Kullanıcıların 30 günlük kotalarını, eşzamanlı indirme sınırlarını ve erişimlerini yönetin.</p>
                </div>
            }
        >
            <Head title="Kullanıcı Yönetimi - MedyaHub" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
                <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-300">
                            <thead className="bg-slate-950/80 text-xs font-semibold uppercase text-slate-400 border-b border-slate-800">
                                <tr>
                                    <th className="px-6 py-4">Kullanıcı</th>
                                    <th className="px-6 py-4">Rol</th>
                                    <th className="px-6 py-4">Aylık Kota</th>
                                    <th className="px-6 py-4">Kullanılan / Kalan</th>
                                    <th className="px-6 py-4">Eşzamanlı Limit</th>
                                    <th className="px-6 py-4">İndirme</th>
                                    <th className="px-6 py-4">Plex</th>
                                    <th className="px-6 py-4 text-right">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {users.data.map((u) => {
                                    const quota = u.active_quota;
                                    const limitGb = quota ? (quota.quota_limit_bytes / 1073741824).toFixed(0) : 0;
                                    const usedGb = quota ? (quota.used_bytes / 1073741824).toFixed(1) : 0;
                                    const remainingGb = quota ? (quota.remaining_bytes / 1073741824).toFixed(1) : 0;

                                    return (
                                        <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-white">{u.name}</div>
                                                <div className="text-xs text-slate-400">{u.email}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase ${
                                                    u.role === 'admin' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-slate-800 text-slate-300'
                                                }`}>
                                                    {u.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 font-bold text-white">
                                                {limitGb} GB
                                            </td>
                                            <td className="px-6 py-4 text-xs">
                                                <div>Kullanılan: <strong className="text-slate-200">{usedGb} GB</strong></div>
                                                <div>Kalan: <strong className="text-emerald-400">{remainingGb} GB</strong></div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2.5 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20 text-xs">
                                                    {u.max_concurrent_downloads || 5} İndirme
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => togglePermission(u, 'download_enabled')}
                                                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                                        u.download_enabled
                                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                                    }`}
                                                >
                                                    {u.download_enabled ? 'AÇIK' : 'KAPALI'}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => togglePermission(u, 'plex_enabled')}
                                                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                                        u.plex_enabled
                                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                                    }`}
                                                >
                                                    {u.plex_enabled ? 'AÇIK' : 'KAPALI'}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => openEditModal(u)}
                                                    className="rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 px-3.5 py-1.5 text-xs font-semibold transition-all"
                                                >
                                                    Düzenle
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Edit Modal */}
                {selectedUser && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                        <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg font-bold text-white">Kullanıcı Düzenle</h3>
                                    <p className="text-xs text-slate-400">{selectedUser.name} ({selectedUser.email})</p>
                                </div>
                                <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-white font-bold">&times;</button>
                            </div>

                            <form onSubmit={handleFormSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                                        30 Günlük Kota Limiti (GB)
                                    </label>
                                    <input
                                        type="number"
                                        value={data.quota_limit_gb}
                                        onChange={(e) => setData('quota_limit_gb', e.target.value)}
                                        className="w-full rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:border-indigo-500 focus:ring-indigo-500 text-sm px-4 py-2.5"
                                        placeholder="Örn: 1000"
                                        min="1"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                                        Eşzamanlı İndirme Sınırı (Adet)
                                    </label>
                                    <input
                                        type="number"
                                        value={data.max_concurrent_downloads}
                                        onChange={(e) => setData('max_concurrent_downloads', e.target.value)}
                                        className="w-full rounded-xl bg-slate-950 border border-slate-800 text-white font-bold focus:border-indigo-500 focus:ring-indigo-500 text-sm px-4 py-2.5"
                                        placeholder="Örn: 5"
                                        min="1"
                                        max="50"
                                    />
                                    <p className="text-[11px] text-slate-500 mt-1">Kullanıcının aynı anda indirebileceği farklı dosya sayısı.</p>
                                </div>

                                <div className="pt-4 border-t border-slate-800 flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={processing}
                                        className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all disabled:opacity-50"
                                    >
                                        Kaydet ve Uygula
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedUser(null)}
                                        className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
                                    >
                                        İptal
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
