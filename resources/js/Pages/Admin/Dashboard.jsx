import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';

export default function AdminDashboard({ stats, system_status }) {
    const rawStats = stats || {};
    const status = system_status || {};

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Super Admin
                            </span>
                            <h1 className="font-display font-black text-3xl text-white tracking-tight">Sistem Yönetim Merkezi</h1>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Sunucu durumları, Storage Box uzaktan aktarımları, Jellyfin senkronizasyonu ve kullanıcı yönetimi.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Link
                            href={route('admin.storage-boxes.index')}
                            className="px-4 py-2.5 rounded-xl glass-panel text-slate-200 hover:text-white hover:border-indigo-500/40 text-xs font-bold transition-all"
                        >
                            💾 Storage Boxes
                        </Link>
                        <Link
                            href={route('admin.users.index')}
                            className="px-4 py-2.5 rounded-xl glass-panel text-slate-200 hover:text-white hover:border-indigo-500/40 text-xs font-bold transition-all"
                        >
                            👥 Kullanıcılar
                        </Link>
                        <Link
                            href={route('admin.jellyfin.index')}
                            className="px-4 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/40 border border-purple-500/30 text-purple-200 text-xs font-bold transition-all"
                        >
                            🍿 Jellyfin
                        </Link>
                        <Link
                            href={route('admin.media.index')}
                            className="px-4 py-2.5 rounded-xl gradient-button text-white text-xs font-bold shadow-glow-purple transition-all"
                        >
                            🎬 Medya Kataloğu
                        </Link>
                    </div>
                </div>
            }
        >
            <Head title="Yönetim Paneli - CINEBOX" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
                {/* System Health Status Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Storage Box Health */}
                    <div className="glass-card rounded-3xl p-6 border border-white/10 flex items-center justify-between">
                        <div className="space-y-1 text-left">
                            <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Hetzner Storage Box</div>
                            <div className="font-display font-bold text-lg text-white">SFTP / WebDAV Bağlantısı</div>
                        </div>
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 ${
                            status.storage_box === 'ONLINE'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            {status.storage_box || 'ONLINE'}
                        </span>
                    </div>

                    {/* Plex Health */}
                    <div className="glass-card rounded-3xl p-6 border border-white/10 flex items-center justify-between">
                        <div className="space-y-1 text-left">
                            <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Plex Media Server</div>
                            <div className="font-display font-bold text-lg text-white">Webhook & API Takibi</div>
                        </div>
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 ${
                            status.plex === 'ONLINE'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            {status.plex || 'ONLINE'}
                        </span>
                    </div>

                    {/* Jellyfin Health */}
                    <div className="glass-card rounded-3xl p-6 border border-white/10 flex items-center justify-between">
                        <div className="space-y-1 text-left">
                            <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Jellyfin REST API</div>
                            <div className="font-display font-bold text-lg text-white">Senkronizasyon</div>
                        </div>
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 ${
                            status.jellyfin === 'ONLINE'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-purple-500/10 text-purple-300 border border-purple-500/20'
                        }`}>
                            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                            {status.jellyfin || 'ONLINE'}
                        </span>
                    </div>
                </div>

                {/* Overall Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left">
                    <div className="glass-card rounded-3xl p-6 border border-white/10 space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Kullanıcı Sayısı</div>
                        <div className="font-display font-black text-4xl text-white">{rawStats.total_users ?? 0}</div>
                        <div className="text-xs text-emerald-400 font-semibold">{rawStats.active_users ?? 0} Aktif üye hesabı</div>
                    </div>

                    <div className="glass-card rounded-3xl p-6 border border-white/10 space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Kütüphane Medyaları</div>
                        <div className="font-display font-black text-4xl text-indigo-400">{rawStats.total_media ?? 0}</div>
                        <div className="text-xs text-slate-400 font-medium">{rawStats.total_storage_gb ?? 0} GB Toplam Medya Boyutu</div>
                    </div>

                    <div className="glass-card rounded-3xl p-6 border border-white/10 space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Aktif İndirmeler</div>
                        <div className="font-display font-black text-4xl text-purple-400">{rawStats.active_downloads ?? 0}</div>
                        <div className="text-xs text-slate-400 font-medium">Anlık İndirme Oturumu</div>
                    </div>

                    <div className="glass-card rounded-3xl p-6 border border-white/10 space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Aktif Plex / Jellyfin</div>
                        <div className="font-display font-black text-4xl text-cyan-400">{rawStats.active_plex_sessions ?? 0}</div>
                        <div className="text-xs text-slate-400 font-medium">Canlı İzleme Oturumu</div>
                    </div>
                </div>

                {/* Quick Management Cards */}
                <div className="grid md:grid-cols-2 gap-6 text-left">
                    <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
                                💾
                            </div>
                            <div>
                                <h3 className="font-display font-bold text-lg text-white">Storage Box & Uzaktan İndirme</h3>
                                <p className="text-xs text-slate-400">Sunucularınızdaki medya dosyalarını tarayın veya dış URL'lerden hızlı indirin.</p>
                            </div>
                        </div>
                        <div className="pt-2">
                            <Link
                                href={route('admin.storage-boxes.index')}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-button text-white text-xs font-bold"
                            >
                                Storage Box Yönetimine Git →
                            </Link>
                        </div>
                    </div>

                    <div className="glass-panel rounded-3xl p-6 border border-white/10 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold">
                                👥
                            </div>
                            <div>
                                <h3 className="font-display font-bold text-lg text-white">Kullanıcı Yönetimi</h3>
                                <p className="text-xs text-slate-400">Kullanıcıların indirme ve Plex/Jellyfin erişim yetkilerini düzenleyin.</p>
                            </div>
                        </div>
                        <div className="pt-2">
                            <Link
                                href={route('admin.users.index')}
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl glass-panel hover:border-indigo-500/40 text-white text-xs font-bold"
                            >
                                Kullanıcı Listesine Git →
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
