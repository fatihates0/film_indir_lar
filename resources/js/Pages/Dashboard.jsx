import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';

export default function Dashboard({ quota, breakdown, recent_usage }) {
    const percentage = Math.min(100, Math.round((quota.used_bytes / (quota.limit_bytes || 1)) * 100));

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="font-display font-black text-3xl text-white tracking-tight">Kullanıcı Kontrol Paneli</h1>
                        <p className="text-xs text-slate-400 mt-1">Kota harcamalarınız, dönemsel istatistikleriniz ve geçmiş aktiviteleriniz.</p>
                    </div>
                    <Link
                        href={route('media.index')}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl gradient-button px-6 py-3 text-xs font-bold text-white shadow-xl shadow-indigo-600/30 hover:scale-105 transition-all"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                        Film & Dizi Kütüphanesine Git
                    </Link>
                </div>
            }
        >
            <Head title="Kontrol Paneli - CINEBOX" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
                {/* Main Quota Gauge Card */}
                <div className="relative overflow-hidden rounded-3xl glass-card p-6 md:p-8 border border-white/10 shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-16 -mr-16 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

                    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                        <div className="lg:col-span-7 space-y-6">
                            <div className="flex items-center justify-between sm:justify-start gap-4 flex-wrap">
                                <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                                    30 Günlük Kota Dönemi
                                </span>
                                <span className="text-xs text-slate-400 font-medium">
                                    Yenilenmeye: <strong className="text-white font-bold">{quota.days_left} gün</strong> kaldı
                                </span>
                            </div>

                            <div>
                                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Tüketilen Kota</div>
                                <div className="flex items-baseline gap-3">
                                    <span className="font-display font-black text-4xl sm:text-5xl text-white tracking-tight">
                                        {quota.used_gb} <span className="text-xl font-bold text-indigo-400">GB</span>
                                    </span>
                                    <span className="text-sm font-semibold text-slate-400">
                                        / {quota.limit_gb} GB Toplam
                                    </span>
                                </div>
                            </div>

                            {/* Glowing Progress Bar */}
                            <div className="space-y-2">
                                <div className="h-4 w-full rounded-full bg-slate-950 p-0.5 overflow-hidden border border-white/10 shadow-inner">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${
                                            percentage >= 90
                                                ? 'bg-gradient-to-r from-rose-500 to-red-600 shadow-glow-pink'
                                                : percentage >= 75
                                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-glow-amber'
                                                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-cyan-400 shadow-glow-purple'
                                        }`}
                                        style={{ width: `${percentage}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs text-slate-400 font-medium">
                                    <span>%{percentage} Tüketildi</span>
                                    <span>Kalan Kullanım: <strong className="text-emerald-400 font-bold">{quota.remaining_gb} GB</strong></span>
                                </div>
                            </div>
                        </div>

                        {/* Breakdown Stats */}
                        <div className="lg:col-span-5 grid grid-cols-2 gap-4">
                            <div className="rounded-2xl glass-panel p-5 space-y-2 border border-white/5 hover:border-indigo-500/30 transition-all">
                                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20 text-lg">
                                    ⚡
                                </div>
                                <div className="font-display font-bold text-2xl text-white">{breakdown.download_gb} GB</div>
                                <div className="text-xs text-slate-400 font-medium">IDM & Doğrudan İndirme</div>
                            </div>

                            <div className="rounded-2xl glass-panel p-5 space-y-2 border border-white/5 hover:border-purple-500/30 transition-all">
                                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center border border-purple-500/20 text-lg">
                                    📺
                                </div>
                                <div className="font-display font-bold text-2xl text-white">{breakdown.plex_gb} GB</div>
                                <div className="text-xs text-slate-400 font-medium">Plex & Jellyfin Akışı</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Usage Activity Table */}
                <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <div>
                            <h3 className="font-display font-bold text-lg text-white">Son İndirme & Akış Geçmişi</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Tüm medya aktarımlarınız anlık olarak kota havuzunuzdan düşülmektedir.</p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-slate-950/60 text-[11px] font-semibold uppercase text-slate-400 border-b border-white/5">
                                <tr>
                                    <th className="px-6 py-4">Tarih & Saat</th>
                                    <th className="px-6 py-4">İşlem Tipi</th>
                                    <th className="px-6 py-4">Medya Başlığı</th>
                                    <th className="px-6 py-4 text-right">Tüketilen Kota</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {recent_usage && recent_usage.length > 0 ? (
                                    recent_usage.map((rec) => (
                                        <tr key={rec.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4 text-slate-400 font-mono">
                                                {new Date(rec.created_at).toLocaleString('tr-TR')}
                                            </td>
                                            <td className="px-6 py-4">
                                                {rec.source === 'download' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                                        ⚡ İndirme (IDM)
                                                    </span>
                                                ) : rec.source === 'plex' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                                                        📺 Plex / Jellyfin
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                                        Sistem İşlemi
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-semibold text-white">
                                                {rec.media ? rec.media.title : 'Medya İndirme Bağlantısı'}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono font-bold text-indigo-300">
                                                {(rec.bytes / (1024 * 1024 * 1024)).toFixed(2)} GB
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-12 text-center text-slate-500 text-xs">
                                            Henüz kaydedilmiş bir indirme hareketiniz bulunmamaktadır.
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
