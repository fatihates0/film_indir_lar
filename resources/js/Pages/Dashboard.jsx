import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';

export default function Dashboard({ recent_downloads = [] }) {
    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="font-display font-black text-3xl text-white tracking-tight">Kullanıcı Kontrol Paneli</h1>
                        <p className="text-xs text-slate-400 mt-1">Medya kütüphanesine erişin, aktif indirme ve akış geçmişinizi görüntüleyin.</p>
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
                {/* Hero Banner / Quick Access */}
                <div className="relative overflow-hidden rounded-3xl glass-card p-6 md:p-8 border border-white/10 shadow-2xl">
                    <div className="absolute top-0 right-0 -mt-16 -mr-16 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

                    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
                        <div className="lg:col-span-8 space-y-4">
                            <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                Sınırsız İndirme & Akış Erişimi
                            </span>
                            <h2 className="font-display font-black text-2xl sm:text-3xl text-white tracking-tight">
                                Yüksek Hızlı Medya Platformuna Hoş Geldiniz
                            </h2>
                            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                                CINEBOX platformunda tüm film ve dizi içeriklerini sınırsız bant genişliği ve IDM çoklu bağlantı desteği ile en yüksek kalitede indirebilir veya Jellyfin/Plex üzerinden direkt izleyebilirsiniz.
                            </p>
                        </div>

                        <div className="lg:col-span-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="rounded-2xl glass-panel p-4 border border-white/5 space-y-2">
                                <div className="text-2xl">⚡</div>
                                <div className="font-bold text-white text-sm">Çoklu Bağlantı</div>
                                <div className="text-[11px] text-slate-400">IDM ve tarayıcı ile max hızda indirme</div>
                            </div>
                            <div className="rounded-2xl glass-panel p-4 border border-white/5 space-y-2">
                                <div className="text-2xl">🍿</div>
                                <div className="font-bold text-white text-sm">Jellyfin & Plex</div>
                                <div className="text-[11px] text-slate-400">Doğrudan medya akışı desteği</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Downloads Table */}
                <div className="rounded-3xl glass-panel border border-white/10 overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-white/5 flex items-center justify-between">
                        <div>
                            <h3 className="font-display font-bold text-lg text-white">Son İndirme Aktiviteniz</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Gerçekleştirilen medya indirmeleriniz ve oluşturulan oturumlar.</p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-slate-950/60 text-[11px] font-semibold uppercase text-slate-400 border-b border-white/5">
                                <tr>
                                    <th className="px-6 py-4">Tarih & Saat</th>
                                    <th className="px-6 py-4">Medya Başlığı</th>
                                    <th className="px-6 py-4 text-right">Dosya Boyutu</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {recent_downloads && recent_downloads.length > 0 ? (
                                    recent_downloads.map((session) => (
                                        <tr key={session.id} className="hover:bg-white/5 transition-colors">
                                            <td className="px-6 py-4 text-slate-400 font-mono">
                                                {new Date(session.created_at).toLocaleString('tr-TR')}
                                            </td>
                                            <td className="px-6 py-4 font-semibold text-white">
                                                {session.media ? session.media.title : 'Medya İndirme Bağlantısı'}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono font-bold text-indigo-300">
                                                {session.file_size ? (session.file_size / (1024 * 1024 * 1024)).toFixed(2) + ' GB' : '-'}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="3" className="px-6 py-12 text-center text-slate-500 text-xs">
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
