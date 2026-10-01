import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router } from '@inertiajs/react';
import axios from 'axios';
import { useState } from 'react';

export default function MediaIndex({ media, allGenres = [], filters = {}, quota = {} }) {
    // Sanitize props
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

    // Featured Hero Item (first item with backdrop or first item in list)
    const featuredItem = mediaList.find(item => item.backdrop_url || item.poster_url) || mediaList[0];

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

    const handleTypeChange = (newType) => {
        setType(newType);
        router.get(
            route('media.index'),
            { search, type: newType, genre, sort: sortBy },
            { preserveState: true, replace: true }
        );
    };

    const handleGenreChange = (newGenre) => {
        setGenre(newGenre);
        router.get(
            route('media.index'),
            { search, type, genre: newGenre, sort: sortBy },
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
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="font-display font-black text-3xl text-white tracking-tight flex items-center gap-3">
                            <span>Film & Dizi Kütüphanesi</span>
                            <span className="text-xs font-bold px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                {rawMedia.total || mediaList.length || 0} İçerik Mevcut
                            </span>
                        </h1>
                        <p className="text-xs text-slate-400 mt-1">4K Ultra HD ve Dual ses seçeneğiyle yüksek hızlı indirme kataloğu.</p>
                    </div>

                    <div className="flex items-center gap-3 glass-panel px-4 py-2.5 rounded-2xl border border-white/10 text-xs">
                        <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold">
                            ⚡
                        </div>
                        <div>
                            <div className="text-slate-400 text-[11px]">Kalan Kullanım Kotanız</div>
                            <div className="text-emerald-400 font-bold text-sm">{rawQuota.remaining_gb ?? 0} GB</div>
                        </div>
                    </div>
                </div>
            }
        >
            <Head title="Film & Dizi Kütüphanesi - CINEBOX" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
                {/* Error Banner */}
                {errorMessage && (
                    <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 flex items-center justify-between animate-slide-up">
                        <div className="flex items-center gap-3">
                            <span className="text-xl">⚠️</span>
                            <span className="text-sm font-semibold">{errorMessage}</span>
                        </div>
                        <button onClick={() => setErrorMessage(null)} className="text-slate-400 hover:text-white p-1">✕</button>
                    </div>
                )}

                {/* Hero Featured Spotlight Card (If available on first page) */}
                {featuredItem && !search && !genre && !type && (
                    <div className="relative rounded-3xl overflow-hidden glass-panel border border-white/10 min-h-[340px] flex items-end p-6 md:p-10 shadow-2xl group">
                        <div 
                            className="absolute inset-0 bg-cover bg-center transition-transform duration-1000 group-hover:scale-105"
                            style={{ backgroundImage: `url(${featuredItem.backdrop_url || featuredItem.poster_url || '/placeholder.jpg'})` }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#08090d] via-[#08090d]/70 to-transparent" />
                        <div className="absolute inset-0 bg-gradient-to-r from-[#08090d] via-[#08090d]/50 to-transparent" />

                        <div className="relative z-10 max-w-2xl space-y-4 text-left">
                            <div className="flex items-center gap-2">
                                <span className="px-3 py-1 rounded-lg gradient-badge-4k text-[10px] uppercase font-bold tracking-wider">
                                    ÖNE ÇIKAN İÇERİK
                                </span>
                                {featuredItem.tmdb_rating > 0 && (
                                    <span className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-amber-400 text-xs font-bold border border-white/10 flex items-center gap-1">
                                        ★ {featuredItem.tmdb_rating}
                                    </span>
                                )}
                            </div>

                            <h2 className="font-display font-black text-3xl sm:text-5xl text-white tracking-tight leading-tight">
                                {featuredItem.title}
                            </h2>

                            {featuredItem.overview && (
                                <p className="text-slate-300 text-xs sm:text-sm line-clamp-2 leading-relaxed">
                                    {featuredItem.overview}
                                </p>
                            )}

                            <div className="flex items-center gap-4 pt-2">
                                <Link
                                    href={route('media.show', featuredItem.id)}
                                    className="px-6 py-3 rounded-2xl gradient-button text-white font-bold text-xs sm:text-sm shadow-xl flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                    Detaylar & İzle
                                </Link>

                                <button
                                    onClick={() => handleDownload(featuredItem)}
                                    disabled={loadingId === featuredItem.id}
                                    className="px-6 py-3 rounded-2xl glass-panel text-white font-bold text-xs sm:text-sm hover:border-white/30 transition-all flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    {loadingId === featuredItem.id ? 'Yetkilendiriliyor...' : 'Hızlı İndir'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Filter Controls & Search Toolbar */}
                <div className="space-y-4">
                    <form onSubmit={handleSearch} className="rounded-2xl glass-panel border border-white/10 p-3 sm:p-4 shadow-xl flex flex-col md:flex-row items-center gap-3">
                        <div className="flex-1 w-full relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Film veya dizi adı ile arayın..."
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-xs sm:text-sm text-white placeholder-slate-400"
                            />
                        </div>

                        <div className="flex items-center gap-2 w-full md:w-auto">
                            {/* Type selector */}
                            <div className="flex p-1 rounded-xl bg-slate-950 border border-white/10 text-xs font-semibold">
                                <button
                                    type="button"
                                    onClick={() => handleTypeChange('')}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${!type ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                                >
                                    Tümü
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleTypeChange('movie')}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${type === 'movie' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                                >
                                    Filmler
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleTypeChange('series')}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${type === 'series' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-white'}`}
                                >
                                    Diziler
                                </button>
                            </div>

                            {/* Sort Selector */}
                            <select
                                value={sortBy}
                                onChange={(e) => {
                                    setSortBy(e.target.value);
                                    router.get(route('media.index'), { search, type, genre, sort: e.target.value }, { preserveState: true, replace: true });
                                }}
                                className="py-2.5 px-3 rounded-xl glass-input text-xs text-white bg-slate-900 border border-white/10"
                            >
                                <option value="created_at" className="bg-slate-900 text-white">Son Eklenenler</option>
                                <option value="rating" className="bg-slate-900 text-white">TMDB Puanı</option>
                                <option value="title" className="bg-slate-900 text-white">Alfabetik (A-Z)</option>
                                <option value="year" className="bg-slate-900 text-white">Yayın Yılı</option>
                            </select>

                            <button
                                type="submit"
                                className="px-5 py-2.5 rounded-xl gradient-button text-white text-xs font-bold shadow-lg shrink-0"
                            >
                                Ara
                            </button>
                        </div>
                    </form>

                    {/* Genre Pills */}
                    {safeGenres.length > 0 && (
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                            <button
                                onClick={() => handleGenreChange('')}
                                className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                                    !genre ? 'bg-indigo-600 text-white shadow-glow-purple' : 'glass-panel text-slate-300 hover:text-white hover:border-white/20'
                                }`}
                            >
                                Tüm Türler
                            </button>
                            {safeGenres.map((g) => (
                                <button
                                    key={g}
                                    onClick={() => handleGenreChange(g)}
                                    className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                                        genre === g ? 'bg-indigo-600 text-white shadow-glow-purple' : 'glass-panel text-slate-300 hover:text-white hover:border-white/20'
                                    }`}
                                >
                                    {g}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Media Cards Grid */}
                {mediaList.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
                        {mediaList.map((item) => {
                            const groupInfo = item.group_info || {};
                            const isSeries = groupInfo.is_series ?? (item.type === 'episode' || item.type === 'series');
                            const versionsCount = groupInfo.versions_count || 1;
                            const totalSizeGb = groupInfo.total_size_bytes ? (groupInfo.total_size_bytes / 1073741824).toFixed(1) : (item.file_size ? (item.file_size / 1073741824).toFixed(1) : null);
                            const rating = item.vote_average || item.tmdb_rating;

                            return (
                                <div
                                    key={item.id}
                                    className="group relative rounded-2xl glass-card overflow-hidden border border-white/5 hover:border-indigo-500/40 transition-all duration-300 flex flex-col"
                                >
                                    {/* Poster Container */}
                                    <div className="relative aspect-[2/3] w-full overflow-hidden bg-slate-900">
                                        <img
                                            src={item.poster_url || '/placeholder.jpg'}
                                            alt={item.title}
                                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                                            loading="lazy"
                                        />

                                        {/* Overlay Shadow */}
                                        <div className="absolute inset-0 bg-gradient-to-t from-[#08090d] via-transparent to-transparent opacity-80 group-hover:opacity-60 transition-opacity" />

                                        {/* Type Tag & Rating / Group Info Badge */}
                                        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1 z-10">
                                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase tracking-wider bg-black/75 backdrop-blur-md border border-white/10 ${isSeries ? 'text-indigo-400 border-indigo-500/30' : 'text-emerald-400 border-emerald-500/30'}`}>
                                                {isSeries ? 'Dizi' : 'Film'}
                                            </span>

                                            {rating > 0 ? (
                                                <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-black/75 backdrop-blur-md text-amber-400 border border-white/10 flex items-center gap-1">
                                                    ★ {rating.toFixed ? rating.toFixed(1) : rating}
                                                </span>
                                            ) : (
                                                versionsCount > 1 && (
                                                    <span className="px-2 py-0.5 rounded-md text-[9px] font-bold bg-indigo-600/80 text-white backdrop-blur-md">
                                                        {isSeries ? `${groupInfo.episodes_count || versionsCount} Bölüm` : `${versionsCount} Sürüm`}
                                                    </span>
                                                )
                                            )}
                                        </div>

                                        {/* Center Quick Play / View Details Button */}
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20 bg-black/40 backdrop-blur-xs">
                                            <Link
                                                href={route('media.show', item.id)}
                                                className="w-12 h-12 rounded-full gradient-button text-white flex items-center justify-center shadow-glow-purple hover:scale-110 transition-transform"
                                            >
                                                <svg className="w-5 h-5 fill-current translate-x-0.5" viewBox="0 0 24 24">
                                                    <path d="M8 5v14l11-7z" />
                                                </svg>
                                            </Link>
                                        </div>
                                    </div>

                                    {/* Content Info */}
                                    <div className="p-3.5 flex-1 flex flex-col justify-between space-y-2 text-left bg-slate-950/40">
                                        <div>
                                            <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium mb-1">
                                                <span>{item.year || '2024'}</span>
                                                {isSeries ? (
                                                    <span className="font-semibold text-indigo-300">
                                                        {groupInfo.seasons?.length ? `${groupInfo.seasons.join(',')}. Sezon` : `${groupInfo.episodes_count || 1} Bölüm`}
                                                    </span>
                                                ) : (
                                                    versionsCount > 1 ? (
                                                        <span className="font-semibold text-emerald-300">{versionsCount} Versiyon</span>
                                                    ) : (
                                                        totalSizeGb && <span className="font-mono text-indigo-300 font-bold">{totalSizeGb} GB</span>
                                                    )
                                                )}
                                            </div>
                                            <Link href={route('media.show', item.id)}>
                                                <h3 className="font-display font-bold text-sm text-white group-hover:text-indigo-300 transition-colors line-clamp-1">
                                                    {item.title}
                                                </h3>
                                            </Link>
                                            {item.original_title && item.original_title !== item.title && (
                                                <div className="text-[10px] text-slate-400 truncate">{item.original_title}</div>
                                            )}
                                        </div>

                                        <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                                            <Link
                                                href={route('media.show', item.id)}
                                                className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300"
                                            >
                                                İncele →
                                            </Link>

                                            <button
                                                onClick={() => handleDownload(item)}
                                                disabled={loadingId === item.id}
                                                className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[11px] font-bold transition-all border border-indigo-500/30 flex items-center gap-1"
                                            >
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                </svg>
                                                {loadingId === item.id ? '...' : 'İndir'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="py-20 text-center glass-panel rounded-3xl space-y-4">
                        <div className="w-16 h-16 mx-auto rounded-full bg-slate-900 border border-white/10 flex items-center justify-center text-3xl">
                            🔍
                        </div>
                        <h3 className="font-display font-bold text-lg text-white">İçerik Bulunamadı</h3>
                        <p className="text-slate-400 text-xs max-w-sm mx-auto">
                            Arama kriterlerinize uygun içerik bulunamadı. Lütfen arama terimini değiştirin veya filtreleri temizleyin.
                        </p>
                        <button
                            onClick={() => { setSearch(''); setType(''); setGenre(''); router.get(route('media.index')); }}
                            className="px-4 py-2 rounded-xl gradient-button text-white text-xs font-bold"
                        >
                            Filtreleri Sıfırla
                        </button>
                    </div>
                )}

                {/* Pagination */}
                {rawMedia.links && rawMedia.links.length > 3 && (
                    <div className="flex justify-center items-center gap-1.5 pt-6">
                        {rawMedia.links.map((link, idx) => (
                            <button
                                key={idx}
                                disabled={!link.url || link.active}
                                onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                                    link.active
                                        ? 'bg-indigo-600 text-white shadow-glow-purple'
                                        : link.url
                                        ? 'glass-panel text-slate-300 hover:bg-white/10 hover:text-white'
                                        : 'opacity-40 cursor-not-allowed text-slate-600'
                                }`}
                                dangerouslySetInnerHTML={{ __html: link.label }}
                            />
                        ))}
                    </div>
                )}

                {/* Download Authorization Modal */}
                {downloadModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
                        <div className="w-full max-w-lg glass-panel rounded-3xl border border-white/15 p-6 shadow-2xl space-y-6 text-left relative">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-xl font-bold">
                                        ✓
                                    </div>
                                    <div>
                                        <h3 className="font-display font-bold text-lg text-white">İndirme Bağlantısı Hazır!</h3>
                                        <p className="text-xs text-slate-400">IDM ve yüksek hızlı indirme yöneticileri ile uyumludur.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setDownloadModal(null)}
                                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="p-4 rounded-2xl bg-slate-950/80 border border-white/5 space-y-3">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-bold text-white truncate max-w-xs">{downloadModal.title}</span>
                                    <span className="font-mono font-bold text-indigo-300">{downloadModal.size_gb} GB</span>
                                </div>
                                <div className="text-[11px] text-slate-400">
                                    Geçerlilik Süresi: <strong className="text-amber-400 font-mono">1 Saat</strong>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                    İndirme / Stream Bağlantısı (IDM için kopyalayın)
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        readOnly
                                        value={downloadModal.download_url}
                                        className="w-full px-3 py-2.5 rounded-xl glass-input font-mono text-xs text-indigo-300 select-all"
                                    />
                                    <button
                                        onClick={() => copyToClipboard(downloadModal.download_url)}
                                        className="px-4 py-2.5 rounded-xl gradient-button text-white text-xs font-bold shrink-0 shadow-md"
                                    >
                                        {copied ? 'Kopyalandı!' : 'Kopyala'}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    onClick={() => setDownloadModal(null)}
                                    className="px-5 py-2.5 rounded-xl glass-panel text-slate-300 text-xs font-bold hover:text-white"
                                >
                                    Kapat
                                </button>
                                <a
                                    href={downloadModal.download_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-6 py-2.5 rounded-xl gradient-button text-white text-xs font-bold shadow-glow-purple"
                                >
                                    Doğrudan İndirmeyi Başlat
                                </a>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
