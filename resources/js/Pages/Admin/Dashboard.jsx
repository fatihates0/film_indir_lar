import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';

export default function AdminDashboard({ stats, system_status }) {
    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Sistem Yönetim Paneli</h2>
                        <p className="text-sm text-slate-400 mt-1">Sunucu durumları, kota atamaları ve medya tarayıcı yönetimi.</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <Link
                            href={route('admin.users.index')}
                            className="rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-xs font-semibold text-white transition-all"
                        >
                            Kullanıcı ve Kota Yönetimi
                        </Link>
                        <Link
                            href={route('admin.jellyfin.index')}
                            className="rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 px-4 py-2 text-xs font-semibold text-purple-200 transition-all"
                        >
                            Jellyfin Yönetimi
                        </Link>
                        <Link
                            href={route('admin.media.index')}
                            className="rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-indigo-600/30 transition-all"
                        >
                            Medya & Tarayıcı
                        </Link>
                    </div>
                </div>
            }
        >
            <Head title="Yönetim Paneli - MedyaHub" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
                {/* System Health Status Banner */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 flex items-center justify-between">
                        <div>
                            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Hetzner Storage Box Mount</div>
                            <div className="text-xl font-bold text-white mt-1">/mnt/storagebox</div>
                        </div>
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                            system_status.storage_box === 'ONLINE'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                            ● {system_status.storage_box}
                        </span>
                    </div>

                    <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 flex items-center justify-between">
                        <div>
                            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Plex Media Server</div>
                            <div className="text-xl font-bold text-white mt-1">REST API Entegrasyonu</div>
                        </div>
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                            system_status.plex === 'ONLINE'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                            ● {system_status.plex}
                        </span>
                    </div>

                    <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 flex items-center justify-between">
                        <div>
                            <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Jellyfin Media Server</div>
                            <div className="text-xl font-bold text-white mt-1">REST API & Kullanıcılar</div>
                        </div>
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                            system_status.jellyfin === 'ONLINE'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                        }`}>
                            ● {system_status.jellyfin}
                        </span>
                    </div>
                </div>

                {/* Overall Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-2">
                        <div className="text-xs font-semibold text-slate-400">Toplam Kullanıcılar</div>
                        <div className="text-3xl font-extrabold text-white">{stats.total_users}</div>
                        <div className="text-xs text-emerald-400">{stats.active_users} Aktif hesap</div>
                    </div>

                    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-2">
                        <div className="text-xs font-semibold text-slate-400">Kütüphanedeki Medyalar</div>
                        <div className="text-3xl font-extrabold text-white">{stats.total_media}</div>
                        <div className="text-xs text-indigo-400">{stats.total_storage_gb} GB Depolama</div>
                    </div>

                    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-2">
                        <div className="text-xs font-semibold text-slate-400">Toplam Dağıtılan Kota</div>
                        <div className="text-3xl font-extrabold text-white">{stats.total_quota_tb} TB</div>
                        <div className="text-xs text-slate-400">Kullanılan: {stats.total_used_tb} TB</div>
                    </div>

                    <div className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-2">
                        <div className="text-xs font-semibold text-slate-400">Bugünkü Trafik</div>
                        <div className="text-3xl font-extrabold text-white">{(stats.today_download_gb + stats.today_plex_gb).toFixed(2)} GB</div>
                        <div className="text-xs text-blue-400">İndirme: {stats.today_download_gb} GB | Plex: {stats.today_plex_gb} GB</div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
