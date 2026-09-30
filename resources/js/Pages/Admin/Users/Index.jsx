import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, useForm } from '@inertiajs/react';
import { useState } from 'react';

export default function UserIndex({ users }) {
    const safeUsers = users && users.data ? users.data : [];
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

        patch(route('admin.users.quota', selectedUser.id), {
            onSuccess: () => {
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="font-display font-black text-3xl text-white tracking-tight">Kullanıcı & Kota Yönetimi</h1>
                        <p className="text-xs text-slate-400 mt-1">Kullanıcı bazlı aylık GB kotalarını atayın, indirme ve Plex erişimlerini düzenleyin.</p>
                    </div>
                    <div className="px-4 py-2 rounded-2xl glass-panel text-xs text-slate-300 font-bold border border-white/10">
                        Kayıtlı Üye: <span className="text-indigo-400">{safeUsers.length} Kullanıcı</span>
                    </div>
                </div>
            }
        >
            <Head title="Kullanıcı Yönetimi - CINEBOX" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
                <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden shadow-2xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-slate-950/80 text-[11px] font-semibold uppercase text-slate-400 border-b border-white/5">
                                <tr>
                                    <th className="px-6 py-4">Kullanıcı</th>
                                    <th className="px-6 py-4">Rol</th>
                                    <th className="px-6 py-4">Aylık Limit</th>
                                    <th className="px-6 py-4">Kullanım / Kalan</th>
                                    <th className="px-6 py-4">Eşzamanlı Bağlantı</th>
                                    <th className="px-6 py-4">İndirme</th>
                                    <th className="px-6 py-4">Plex</th>
                                    <th className="px-6 py-4 text-right">Düzenle</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {safeUsers.length > 0 ? (
                                    safeUsers.map((u) => {
                                        const quota = u.active_quota;
                                        const limitGb = quota ? (quota.quota_limit_bytes / 1073741824).toFixed(0) : 0;
                                        const usedGb = quota ? (quota.used_bytes / 1073741824).toFixed(1) : 0;
                                        const remainingGb = quota ? (quota.remaining_bytes / 1073741824).toFixed(1) : 0;
                                        const percentage = limitGb > 0 ? Math.min(100, Math.round((usedGb / limitGb) * 100)) : 0;

                                        return (
                                            <tr key={u.id} className="hover:bg-white/5 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-white flex items-center gap-2">
                                                        <div className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center font-bold text-indigo-300 text-xs">
                                                            {u.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span>{u.name}</span>
                                                    </div>
                                                    <div className="text-[11px] text-slate-400 pl-9">{u.email}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase ${
                                                        u.role === 'admin' 
                                                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                                                            : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                                                    }`}>
                                                        {u.role || 'Kullanıcı'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 font-mono font-bold text-white">
                                                    {limitGb} GB
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="space-y-1">
                                                        <div className="flex items-center justify-between text-[10px]">
                                                            <span className="text-slate-400">{usedGb} / {limitGb} GB</span>
                                                            <span className="text-emerald-400 font-bold">{remainingGb} GB Kalan</span>
                                                        </div>
                                                        <div className="w-32 h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                                                            <div
                                                                className={`h-full rounded-full ${percentage > 85 ? 'bg-rose-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}
                                                                style={{ width: `${percentage}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 font-mono font-bold text-slate-300">
                                                    {u.max_concurrent_downloads || 5} İndirme
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button
                                                        onClick={() => togglePermission(u, 'download_enabled')}
                                                        className={`px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                                                            u.download_enabled
                                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                                        }`}
                                                    >
                                                        {u.download_enabled ? 'Aktif' : 'Pasif'}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <button
                                                        onClick={() => togglePermission(u, 'plex_enabled')}
                                                        className={`px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                                                            u.plex_enabled
                                                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                                        }`}
                                                    >
                                                        {u.plex_enabled ? 'Aktif' : 'Pasif'}
                                                    </button>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => openEditModal(u)}
                                                        className="px-3.5 py-1.5 rounded-xl gradient-button text-white font-bold text-xs shadow-md"
                                                    >
                                                        Düzenle
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan="8" className="px-6 py-12 text-center text-slate-500 text-xs">
                                            Kayıtlı kullanıcı bulunmamaktadır.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Edit Quota Modal */}
                {selectedUser && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
                        <div className="w-full max-w-md glass-panel rounded-3xl border border-white/15 p-6 shadow-2xl space-y-6 text-left relative">
                            <div className="flex items-start justify-between">
                                <div>
                                    <h3 className="font-display font-bold text-lg text-white">Kullanıcı Kotasını Düzenle</h3>
                                    <p className="text-xs text-slate-400">{selectedUser.name} ({selectedUser.email})</p>
                                </div>
                                <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-white p-1">✕</button>
                            </div>

                            <form onSubmit={handleFormSubmit} className="space-y-4">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                        30 Günlük Kota Limiti (GB)
                                    </label>
                                    <input
                                        type="number"
                                        value={data.quota_limit_gb}
                                        onChange={(e) => setData('quota_limit_gb', e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-xl glass-input text-xs text-white"
                                        placeholder="Örn: 1000"
                                        required
                                    />
                                    {errors.quota_limit_gb && <div className="text-rose-400 text-[10px]">{errors.quota_limit_gb}</div>}
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                        Maksimum Eşzamanlı İndirme Bağlantısı
                                    </label>
                                    <input
                                        type="number"
                                        value={data.max_concurrent_downloads}
                                        onChange={(e) => setData('max_concurrent_downloads', e.target.value)}
                                        className="w-full px-3 py-2.5 rounded-xl glass-input text-xs text-white"
                                        min="1"
                                        max="32"
                                        required
                                    />
                                </div>

                                <div className="flex items-center gap-4 pt-2">
                                    <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={data.download_enabled}
                                            onChange={(e) => setData('download_enabled', e.target.checked)}
                                            className="rounded bg-slate-900 border-white/10 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        İndirme Erişimi
                                    </label>

                                    <label className="flex items-center gap-2 text-xs text-slate-300 font-semibold cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={data.plex_enabled}
                                            onChange={(e) => setData('plex_enabled', e.target.checked)}
                                            className="rounded bg-slate-900 border-white/10 text-purple-600 focus:ring-purple-500"
                                        />
                                        Plex Erişimi
                                    </label>
                                </div>

                                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedUser(null)}
                                        className="px-5 py-2.5 rounded-xl glass-panel text-slate-300 text-xs font-bold"
                                    >
                                        İptal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={processing}
                                        className="px-6 py-2.5 rounded-xl gradient-button text-white text-xs font-bold shadow-glow-purple"
                                    >
                                        {processing ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
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
