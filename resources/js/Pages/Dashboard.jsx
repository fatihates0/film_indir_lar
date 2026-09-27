import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';

export default function Dashboard({ quota, breakdown, recent_usage }) {
    const percentage = Math.min(100, Math.round((quota.used_bytes / (quota.limit_bytes || 1)) * 100));

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Kullanıcı Paneli</h2>
                        <p className="text-sm text-slate-400 mt-1">Aylık kotanızı ve medya tüketim hareketlerinizi takip edin.</p>
                    </div>
                    <Link
                        href={route('media.index')}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:scale-105 hover:shadow-indigo-500/40"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Medya Kütüphanesine Git
                    </Link>
                </div>
            }
        >
            <Head title="Dashboard - MedyaHub" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
                {/* Main Quota Gauge Card */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-indigo-950/60 p-6 md:p-8 border border-slate-800 shadow-2xl shadow-indigo-950/20">
                    <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>

                    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                        <div className="lg:col-span-7 space-y-6">
                            <div className="flex items-center gap-3">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                    <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse"></span>
                                    30 Günlük Dönem Kotası
                                </span>
                                <span className="text-xs text-slate-400">
                                    Sıfırlanmaya: <strong className="text-white">{quota.days_left} gün</strong> kaldı
                                </span>
                            </div>

                            <div>
                                <div className="text-sm font-medium text-slate-400">Kullanılan Kota</div>
                                <div className="flex items-baseline gap-3 mt-1">
                                    <span className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
                                        {quota.used_gb} <span className="text-2xl font-bold text-slate-400">GB</span>
                                    </span>
                                    <span className="text-lg font-semibold text-slate-400">
                                        / {quota.limit_gb} GB
                                    </span>
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div className="space-y-2">
                                <div className="h-4 w-full rounded-full bg-slate-800 p-0.5 overflow-hidden border border-slate-700/50">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${
                                            percentage >= 90
                                                ? 'bg-gradient-to-r from-rose-500 to-red-600 shadow-lg shadow-rose-500/50'
                                                : percentage >= 75
                                                ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-lg shadow-amber-500/50'
                                                : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 shadow-lg shadow-indigo-500/50'
                                        }`}
                                        style={{ width: `${percentage}%` }}
                                    ></div>
                                </div>
                                <div className="flex justify-between text-xs text-slate-400 font-medium">
                                    <span>%{percentage} kullanıldı</span>
                                    <span>Kalan: <strong className="text-emerald-400">{quota.remaining_gb} GB</strong></span>
                                </div>
                            </div>

                            <div className="pt-2 flex flex-wrap gap-4 text-xs text-slate-400 border-t border-slate-800/80">
                                <div>Dönem Başlangıcı: <strong className="text-slate-200">{new Date(quota.period_started_at).toLocaleDateString('tr-TR')}</strong></div>
                                <div>Dönem Bitişi: <strong className="text-slate-200">{new Date(quota.period_expires_at).toLocaleDateString('tr-TR')}</strong></div>
                            </div>
                        </div>

                        {/* Quota Breakdown Stats */}
                        <div className="lg:col-span-5 grid grid-cols-2 gap-4">
                            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-2 hover:border-indigo-500/40 transition-all">
                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                </div>
                                <div className="text-2xl font-bold text-white">{breakdown.download_gb} GB</div>
                                <div className="text-xs text-slate-400">IDM / Doğrudan İndirme</div>
                            </div>

                            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-2 hover:border-amber-500/40 transition-all">
                                <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div className="text-2xl font-bold text-white">{breakdown.plex_gb} GB</div>
                                <div className="text-xs text-slate-400">Tahmini Plex Akışı</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Usage Activity Table */}
                <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
                    <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-white">Son Kullanım Hareketleri</h3>
                            <p className="text-xs text-slate-400">İndirmeleriniz ve Plex izlemeleriniz tek kota havuzundan düşer.</p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-300">
                            <thead className="bg-slate-950/60 text-xs font-semibold uppercase text-slate-400 border-b border-slate-800">
                                <tr>
                                    <th className="px-6 py-4">Tarih</th>
                                    <th className="px-6 py-4">Kaynak</th>
                                    <th className="px-6 py-4">Medya Başlığı</th>
                                    <th className="px-6 py-4 text-right">Tüketilen Miktar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {recent_usage.length > 0 ? (
                                    recent_usage.map((rec) => (
                                        <tr key={rec.id} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="px-6 py-4 text-xs text-slate-400">
                                                {new Date(rec.created_at).toLocaleString('tr-TR')}
                                            </td>
                                            <td className="px-6 py-4">
                                                {rec.source === 'download' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                        İndirme (IDM)
                                                    </span>
                                                ) : rec.source === 'plex' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                        Plex (Tahmini)
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                                        Admin Düzeltmesi
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-white">
                                                {rec.media ? rec.media.title : 'Genel İşlem'}
                                            </td>
                                            <td className="px-6 py-4 text-right font-semibold text-indigo-400">
                                                {(rec.bytes / (1024 * 1024 * 1024)).toFixed(2)} GB
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-8 text-center text-slate-500 text-sm">
                                            Henüz bir kullanım hareketiniz bulunmuyor.
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
