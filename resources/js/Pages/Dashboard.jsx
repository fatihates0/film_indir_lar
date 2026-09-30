import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';

export default function Dashboard({ quota, breakdown, recent_usage }) {
    const percentage = Math.min(100, Math.round((quota.used_bytes / (quota.limit_bytes || 1)) * 100));

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Kullanıcı Paneli</h2>
                        <p className="text-xs text-slate-400 mt-1">İndirme kotanızı, Plex akış tüketimlerinizi ve kullanım geçmişinizi takip edin.</p>
                    </div>
                    <Link
                        href={route('media.index')}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 text-xs font-bold text-white shadow-xl shadow-indigo-600/30 hover:scale-105 transition-all"
                    >
                        <span>🎬</span> Film & Dizi Kütüphanesine Git →
                    </Link>
                </div>
            }
        >
            <Head title="Dashboard - CINEMAFLIX" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
                {/* Main Quota Gauge Card */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0f1422] via-[#0f1422] to-[#151c30] p-6 md:p-8 border border-slate-800 shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-16 -mr-16 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>

                    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                        <div className="lg:col-span-7 space-y-6">
                            <div className="flex items-center gap-3">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                                    30 Günlük Dönem Kotası
                                </span>
                                <span className="text-xs text-slate-400 font-medium">
                                    Sıfırlanmaya: <strong className="text-white">{quota.days_left} gün</strong> kaldı
                                </span>
                            </div>

                            <div>
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Tüketilen Kota</div>
                                <div className="flex items-baseline gap-3 mt-1">
                                    <span className="text-4xl md:text-5xl font-black text-white tracking-tight">
                                        {quota.used_gb} <span className="text-xl font-bold text-slate-400">GB</span>
                                    </span>
                                    <span className="text-base font-semibold text-slate-400">
                                        / {quota.limit_gb} GB Toplam
                                    </span>
                                </div>
                            </div>

                            {/* Glowing Progress Bar */}
                            <div className="space-y-2">
                                <div className="h-4 w-full rounded-full bg-slate-950 p-0.5 overflow-hidden border border-slate-800">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${
                                            percentage >= 90
                                                ? 'bg-gradient-to-r from-rose-500 to-red-600 shadow-lg shadow-rose-500/50'
                                                : percentage >= 75
                                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg shadow-amber-500/50'
                                                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-teal-400 shadow-lg shadow-indigo-500/50'
                                        }`}
                                        style={{ width: `${percentage}%` }}
                                    ></div>
                                </div>
                                <div className="flex justify-between text-xs text-slate-400 font-medium">
                                    <span>%{percentage} Kullanıldı</span>
                                    <span>Kalan Kota: <strong className="text-emerald-400 font-bold">{quota.remaining_gb} GB</strong></span>
                                </div>
                            </div>
                        </div>

                        {/* Breakdown Stats */}
                        <div className="lg:col-span-5 grid grid-cols-2 gap-4">
                            <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-5 space-y-2 hover:border-indigo-500/40 transition-all">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20 text-lg">
                                    ⚡
                                </div>
                                <div className="text-2xl font-black text-white">{breakdown.download_gb} GB</div>
                                <div className="text-xs text-slate-400">IDM & Doğrudan İndirme</div>
                            </div>

                            <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-5 space-y-2 hover:border-purple-500/40 transition-all">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20 text-lg">
                                    📺
                                </div>
                                <div className="text-2xl font-black text-white">{breakdown.plex_gb} GB</div>
                                <div className="text-xs text-slate-400">Plex / Jellyfin Akışı</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Usage Activity Table */}
                <div className="rounded-3xl bg-[#0f1422] border border-slate-800 overflow-hidden shadow-xl">
                    <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-bold text-white">Son İndirme & Akış İstatistikleri</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Tüm indirme işlemleriniz anlık olarak kota hesabınıza işlenmektedir.</p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-slate-950/80 text-[11px] font-semibold uppercase text-slate-400 border-b border-slate-800">
                                <tr>
                                    <th className="px-6 py-4">Tarih & Saat</th>
                                    <th className="px-6 py-4">İşlem Türü</th>
                                    <th className="px-6 py-4">Medya İçeriği</th>
                                    <th className="px-6 py-4 text-right">Harcanan Kota</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {recent_usage.length > 0 ? (
                                    recent_usage.map((rec) => (
                                        <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="px-6 py-4 text-slate-400 font-mono">
                                                {new Date(rec.created_at).toLocaleString('tr-TR')}
                                            </td>
                                            <td className="px-6 py-4">
                                                {rec.source === 'download' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                        ⚡ İndirme (IDM)
                                                    </span>
                                                ) : rec.source === 'plex' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                                        📺 Plex Akışı
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-extrabold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                        System Log
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-bold text-white">
                                                {rec.media ? rec.media.title : 'Medya İndirme Bağlantısı'}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono font-bold text-indigo-400">
                                                {(rec.bytes / (1024 * 1024 * 1024)).toFixed(2)} GB
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-12 text-center text-slate-500 text-xs">
                                            Henüz bir indirme hareketiniz bulunmamaktadır.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </AuthenticatedLayout>
    );
}
