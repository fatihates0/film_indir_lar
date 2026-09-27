import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router } from '@inertiajs/react';
import axios from 'axios';
import { useState } from 'react';

export default function MediaIndex({ media, filters, quota }) {
    const [search, setSearch] = useState(filters.search || '');
    const [type, setType] = useState(filters.type || '');
    const [loadingId, setLoadingId] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [downloadModal, setDownloadModal] = useState(null);

    const handleSearch = (e) => {
        e.preventDefault();
        router.get(route('media.index'), { search, type }, { preserveState: true });
    };

    const handleDownload = async (item) => {
        setLoadingId(item.id);
        setErrorMessage(null);

        try {
            const res = await axios.post(route('media.authorize-download', item.id));
            if (res.data.success) {
                setDownloadModal({
                    title: item.title,
                    download_url: res.data.download_url,
                    expires_at: res.data.expires_at,
                    size_gb: (item.file_size / 1073741824).toFixed(2),
                });
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'İndirme yetkilendirmesi başarısız oldu.';
            setErrorMessage(msg);
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Medya Kütüphanesi</h2>
                        <p className="text-sm text-slate-400 mt-1">Yüksek kaliteli film ve dizileri keşfedin, doğrudan indirin veya Plex'te izleyin.</p>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-900/80 px-4 py-2 rounded-xl border border-slate-800 text-xs">
                        <span className="text-slate-400">Kalan Kotanız:</span>
                        <strong className="text-emerald-400 font-bold text-sm">{quota.remaining_gb} GB</strong>
                    </div>
                </div>
            }
        >
            <Head title="Medya Kütüphanesi - MedyaHub" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
                {/* Search & Filter Bar */}
                <form onSubmit={handleSearch} className="rounded-2xl bg-slate-900 border border-slate-800 p-4 flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="Film veya dizi adı ile ara..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-indigo-500"
                        />
                    </div>

                    <select
                        value={type}
                        onChange={(e) => setType(e.target.value)}
                        className="rounded-xl bg-slate-950 border-slate-800 text-sm text-slate-300 focus:border-indigo-500 focus:ring-indigo-500"
                    >
                        <option value="">Tüm Türler</option>
                        <option value="movie">Filmler</option>
                        <option value="episode">Diziler & Bölümler</option>
                    </select>

                    <button
                        type="submit"
                        className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all"
                    >
                        Filtrele
                    </button>
                </form>

                {/* Error Banner */}
                {errorMessage && (
                    <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-300 flex items-center justify-between">
                        <span>{errorMessage}</span>
                        <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white font-bold">&times;</button>
                    </div>
                )}

                {/* Media Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                    {media.data.length > 0 ? (
                        media.data.map((item) => (
                            <div key={item.id} className="group rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col hover:border-indigo-500/50 hover:shadow-xl hover:shadow-indigo-950/40 transition-all duration-300">
                                {/* Poster Header Aspect */}
                                <div className="relative h-48 bg-gradient-to-tr from-slate-950 via-slate-900 to-indigo-950/60 p-4 flex flex-col justify-between overflow-hidden">
                                    <div className="flex justify-between items-start z-10">
                                        <span className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-900/90 text-indigo-300 border border-indigo-500/30">
                                            {item.type === 'movie' ? 'Film' : 'Dizi'}
                                        </span>
                                        {item.year && (
                                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-800/80 text-slate-300">
                                                {item.year}
                                            </span>
                                        )}
                                    </div>

                                    <div className="z-10">
                                        <h4 className="text-lg font-bold text-white line-clamp-1 group-hover:text-indigo-300 transition-colors">
                                            {item.title}
                                        </h4>
                                        <div className="text-xs text-slate-400 mt-0.5">
                                            {(item.file_size / 1073741824).toFixed(2)} GB
                                        </div>
                                    </div>
                                </div>

                                {/* Body Info & Actions */}
                                <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                                    <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-400">
                                        {item.video_codec && (
                                            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/50 uppercase font-mono">{item.video_codec}</span>
                                        )}
                                        {item.audio_codec && (
                                            <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/50 uppercase font-mono">{item.audio_codec}</span>
                                        )}
                                        <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/50 uppercase font-mono">1080p</span>
                                    </div>

                                    <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                                        <Link
                                            href={route('media.show', item.id)}
                                            className="flex-1 text-center rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 py-2.5 transition-all"
                                        >
                                            Detay
                                        </Link>
                                        <button
                                            onClick={() => handleDownload(item)}
                                            disabled={loadingId === item.id}
                                            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white py-2.5 shadow-md shadow-indigo-600/30 transition-all disabled:opacity-50"
                                        >
                                            {loadingId === item.id ? (
                                                <span className="animate-spin text-xs">⌛</span>
                                            ) : (
                                                <>
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                    </svg>
                                                    İndir
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full rounded-2xl bg-slate-900 border border-slate-800 p-12 text-center text-slate-400">
                            Arama kriterlerinize uygun medya bulunamadı.
                        </div>
                    )}
                </div>

                {/* Signed Download Modal */}
                {downloadModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                        <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
                            <div className="flex justify-between items-start">
                                <h3 className="text-lg font-bold text-white">İndirme Bağlantısı Hazır</h3>
                                <button onClick={() => setDownloadModal(null)} className="text-slate-400 hover:text-white font-bold">&times;</button>
                            </div>

                            <div className="text-sm text-slate-300 space-y-2">
                                <p><strong>{downloadModal.title}</strong> ({downloadModal.size_gb} GB)</p>
                                <p className="text-xs text-slate-400">
                                    IDM veya tarayıcınız üzerinden indirme başlatabilirsiniz. HTTP Range ve duraklat/devam et desteklenmektedir.
                                </p>
                            </div>

                            <div className="pt-4 border-t border-slate-800 flex flex-col gap-2">
                                <a
                                    href={downloadModal.download_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full text-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 hover:scale-[1.02] transition-all"
                                >
                                    İndirmeyi Başlat ({downloadModal.size_gb} GB)
                                </a>
                                <button
                                    onClick={() => setDownloadModal(null)}
                                    className="w-full text-center rounded-xl bg-slate-800 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
                                >
                                    Kapat
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
