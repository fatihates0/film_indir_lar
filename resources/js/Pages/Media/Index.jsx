import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router } from '@inertiajs/react';
import axios from 'axios';
import { useState } from 'react';

export default function MediaIndex({ media, allGenres = [], filters = {}, quota = {} }) {
    // Sanitize props against browser extensions or null props
    const rawFilters = (filters && typeof filters === 'object') ? filters : {};
    const rawQuota = (quota && typeof quota === 'object') ? quota : {};
    const rawMedia = (media && typeof media === 'object') ? media : { data: [], total: 0, links: [] };
    const safeGenres = Array.isArray(allGenres) ? allGenres : [];
    const mediaList = Array.isArray(rawMedia.data) ? rawMedia.data : [];

    const [search, setSearch] = useState(rawFilters.search ? String(rawFilters.search) : '');
    const [type, setType] = useState(rawFilters.type ? String(rawFilters.type) : '');
    const [genre, setGenre] = useState(rawFilters.genre ? String(rawFilters.genre) : '');
    const [sortBy, setSortBy] = useState(rawFilters.sort ? String(rawFilters.sort) : 'created_at');
    
    const [loadingId, setLoadingId] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [downloadModal, setDownloadModal] = useState(null);
    const [copied, setCopied] = useState(false);

    const handleSearch = (e) => {
        if (e && typeof e.preventDefault === 'function') {
            e.preventDefault();
        }
        router.get(
            route('media.index'),
            { search, type, genre, sort: sortBy },
            { preserveState: true, replace: true }
        );
    };

    const handleDownload = async (item) => {
        if (!item || !item.id) return;
        setLoadingId(item.id);
        setErrorMessage(null);

        try {
            const res = await axios.post(route('media.authorize-download', item.id));
            if (res?.data?.success) {
                setDownloadModal({
                    title: item.title,
                    original_title: item.original_title,
                    poster_url: item.poster_url,
                    download_url: res.data.download_url,
                    expires_at: res.data.expires_at,
                    size_gb: item.file_size ? (item.file_size / 1073741824).toFixed(2) : '0.00',
                });
            }
        } catch (err) {
            const msg = err?.response?.data?.message || 'İndirme yetkilendirmesi başarısız oldu.';
            setErrorMessage(msg);
        } finally {
            setLoadingId(null);
        }
    };

    const copyToClipboard = (text) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
                            <span>Film & Dizi Kütüphanesi</span>
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                {rawMedia.total || mediaList.length || 0} İçerik
                            </span>
                        </h2>
                        <p className="text-xs text-slate-400 mt-1">Yüksek çözünürlüklü filmleri ve dizileri IDM ile tam hızda indirin.</p>
                    </div>

                    <div className="flex items-center gap-3 bg-slate-900/90 px-4 py-2 rounded-2xl border border-slate-800 shadow-sm text-xs">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
                            ⚡
                        </div>
                        <div>
                            <div className="text-slate-400 text-[11px]">Kalan İndirme Kotanız</div>
                            <div className="text-emerald-400 font-bold text-sm">{rawQuota.remaining_gb ?? 0} GB</div>
                        </div>
                    </div>
                </div>
            }
        >
            <Head title="Film & Dizi Kütüphanesi - CINEMAFLIX" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
                {/* Search & Filter Toolbar */}
                <form onSubmit={handleSearch} className="rounded-2xl bg-[#0f1422] border border-slate-800/80 p-4 shadow-xl space-y-3 md:space-y-0 md:flex md:items-center md:gap-3">
                    <div className="flex-1 relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Film, dizi adı veya konu ile ara..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950/80 border-slate-800 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
                        />
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        <select
                            value={type}
                            onChange={(e) => { setType(e.target.value); handleSearch(); }}
                            className="rounded-xl bg-slate-950/80 border-slate-800 text-xs text-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 py-2.5"
                        >
                            <option value="">Tüm Türler</option>
                            <option value="movie">🎬 Filmler</option>
                            <option value="episode">📺 Diziler</option>
                        </select>

                        {safeGenres.length > 0 && (
                            <select
                                value={genre}
                                onChange={(e) => { setGenre(e.target.value); handleSearch(); }}
                                className="rounded-xl bg-slate-950/80 border-slate-800 text-xs text-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 py-2.5"
                            >
                                <option value="">Tüm Kategoriler</option>
                                {safeGenres.map((g) => (
                                    <option key={String(g)} value={String(g)}>{String(g)}</option>
                                ))}
                            </select>
                        )}

                        <select
                            value={sortBy}
                            onChange={(e) => { setSortBy(e.target.value); handleSearch(); }}
                            className="col-span-2 md:col-span-1 rounded-xl bg-slate-950/80 border-slate-800 text-xs text-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 py-2.5"
                        >
                            <option value="created_at">En Son Eklenenler</option>
                            <option value="rating">En Yüksek Puanlı</option>
                            <option value="year">Yayın Yılı</option>
                        </select>
                    </div>

                    <button
                        type="submit"
                        className="w-full md:w-auto rounded-xl bg-indigo-600 hover:bg-indigo-500 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 transition-all"
                    >
                        Ara
                    </button>
                </form>

                {/* Error Banner */}
                {errorMessage && (
                    <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-4 text-xs text-rose-300 flex items-center justify-between shadow-lg">
                        <span>{errorMessage}</span>
                        <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-white font-bold text-lg">&times;</button>
                    </div>
                )}

                {/* Media Posters Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                    {mediaList.length > 0 ? (
                        mediaList.map((item) => (
                            <div
                                key={item.id}
                                className="group relative rounded-2xl bg-[#0f1422] border border-slate-800/80 overflow-hidden flex flex-col hover:border-indigo-500/60 hover:shadow-2xl hover:shadow-indigo-950/50 transition-all duration-300"
                            >
                                {/* Media Poster Aspect Ratio */}
                                <div className="relative aspect-[2/3] w-full bg-slate-950 overflow-hidden">
                                    {item.poster_url ? (
                                        <img
                                            src={item.poster_url}
                                            alt={item.title || ''}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="w-full h-full bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-950 p-4 flex flex-col justify-between items-center text-center">
                                            <div className="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mt-8">
                                                🎬
                                            </div>
                                            <span className="font-bold text-sm text-slate-200 line-clamp-3">{item.title}</span>
                                            <span className="text-[10px] text-slate-500">{item.year || 'N/A'}</span>
                                        </div>
                                    )}

                                    {/* Overlay Gradient */}
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#0f1422] via-transparent to-black/60 opacity-80 group-hover:opacity-90 transition-opacity"></div>

                                    {/* Top Badges */}
                                    <div className="absolute top-2 left-2 right-2 flex justify-between items-center z-10">
                                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                                            item.type === 'movie'
                                                ? 'bg-indigo-600/90 text-white shadow-md'
                                                : 'bg-purple-600/90 text-white shadow-md'
                                        }`}>
                                            {item.type === 'movie' ? 'Film' : 'Dizi'}
                                        </span>

                                        {item.vote_average > 0 && (
                                            <span className="px-2 py-0.5 rounded-md text-[11px] font-extrabold bg-black/80 backdrop-blur-md text-amber-400 border border-amber-500/30 flex items-center gap-1 shadow-md">
                                                ★ {item.vote_average.toFixed(1)}
                                            </span>
                                        )}
                                    </div>

                                    {/* Play / Download Quick Hover Overlay */}
                                    <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 bg-black/40 backdrop-blur-[2px]">
                                        <Link
                                            href={route('media.show', item.id)}
                                            className="h-10 w-10 rounded-full bg-slate-900/90 hover:bg-white hover:text-slate-950 text-white flex items-center justify-center transition-all shadow-xl"
                                            title="Detayları Gör"
                                        >
                                            <svg className="w-5 h-5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        </Link>

                                        <button
                                            onClick={() => handleDownload(item)}
                                            disabled={loadingId === item.id}
                                            className="h-10 w-10 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-all shadow-xl shadow-indigo-600/50"
                                            title="Doğrudan İndir"
                                        >
                                            {loadingId === item.id ? (
                                                <span className="animate-spin text-xs">⌛</span>
                                            ) : (
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Content Details */}
                                <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                                    <div>
                                        <h3 className="font-bold text-sm text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                                            {item.title}
                                        </h3>
                                        <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1 font-medium">
                                            <span>{item.year || 'N/A'}</span>
                                            <span className="text-slate-300 font-mono font-semibold">
                                                {item.file_size ? (item.file_size / 1073741824).toFixed(2) : '0.00'} GB
                                            </span>
                                        </div>
                                    </div>

                                    {/* Technical Specs Tags */}
                                    <div className="flex flex-wrap gap-1 text-[10px] text-slate-400 font-mono">
                                        {item.height && (
                                            <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                                                {item.height >= 2160 ? '4K UHD' : item.height >= 1080 ? '1080p' : '720p'}
                                            </span>
                                        )}
                                        {item.video_codec && (
                                            <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 uppercase">
                                                {item.video_codec}
                                            </span>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="pt-2 border-t border-slate-800/80 flex gap-2">
                                        <Link
                                            href={route('media.show', item.id)}
                                            className="flex-1 text-center rounded-xl bg-slate-800/80 hover:bg-slate-700 text-[11px] font-semibold text-slate-200 py-2 transition-colors"
                                        >
                                            İncele
                                        </Link>
                                        <button
                                            onClick={() => handleDownload(item)}
                                            disabled={loadingId === item.id}
                                            className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-[11px] font-semibold text-white py-2 shadow-sm transition-all"
                                        >
                                            İndir
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full rounded-3xl bg-[#0f1422] border border-slate-800 p-16 text-center space-y-3">
                            <div className="text-4xl">🔍</div>
                            <h4 className="text-lg font-bold text-white">Aradığınız Kriterlere Uygun İçerik Bulunamadı</h4>
                            <p className="text-xs text-slate-400">Arama kelimenizi değiştirebilir veya tüm türleri seçebilirsiniz.</p>
                        </div>
                    )}
                </div>

                {/* Pagination */}
                {rawMedia.links && Array.isArray(rawMedia.links) && rawMedia.links.length > 3 && (
                    <div className="flex justify-center gap-1 pt-6">
                        {rawMedia.links.map((link, idx) => (
                            <Link
                                key={idx}
                                href={link.url || '#'}
                                dangerouslySetInnerHTML={{ __html: link.label }}
                                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                                    link.active
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                                        : link.url
                                        ? 'bg-slate-900 hover:bg-slate-800 text-slate-300'
                                        : 'bg-slate-950 text-slate-600 cursor-not-allowed'
                                }`}
                            />
                        ))}
                    </div>
                )}

                {/* Direct Download Signed URL Modal */}
                {downloadModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
                        <div className="w-full max-w-md rounded-3xl bg-[#121724] border border-slate-800 p-6 shadow-2xl space-y-5">
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-3">
                                    {downloadModal.poster_url && (
                                        <img src={downloadModal.poster_url} alt="" className="w-12 h-16 object-cover rounded-xl border border-slate-700" />
                                    )}
                                    <div>
                                        <h3 className="text-base font-bold text-white line-clamp-1">{downloadModal.title}</h3>
                                        <div className="text-xs text-indigo-400 font-semibold mt-0.5">Boyut: {downloadModal.size_gb} GB</div>
                                    </div>
                                </div>
                                <button onClick={() => setDownloadModal(null)} className="text-slate-400 hover:text-white font-bold text-xl">&times;</button>
                            </div>

                            <div className="rounded-2xl bg-slate-950 p-4 border border-slate-800 space-y-2 text-xs">
                                <div className="text-slate-300 font-medium flex items-center gap-1.5">
                                    <span>💡 IDM & Tarayıcı Uyumlu İndirme</span>
                                </div>
                                <p className="text-slate-400 leading-relaxed text-[11px]">
                                    İndirme bağlantısı size özel oluşturuldu. IDM veya JDownloader programınıza ekleyebilir, kesintisiz tam hızda indirebilirsiniz.
                                </p>
                            </div>

                            <div className="space-y-2">
                                <a
                                    href={downloadModal.download_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 hover:scale-[1.02] transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    Doğrudan İndir ({downloadModal.size_gb} GB)
                                </a>

                                <button
                                    onClick={() => copyToClipboard(downloadModal.download_url)}
                                    className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 py-2.5 text-xs font-semibold text-slate-300 transition-all"
                                >
                                    {copied ? '✅ Bağlantı Kopyalandı!' : '📋 İndirme Bağlantısını Kopyala (IDM)'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
