import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import { useState } from 'react';

export default function MediaShow({
    item,
    isSeries = false,
    seasonsData = [],
    versionsData = [],
    totalVersionsCount = 1,
    related = [],
    quota,
}) {
    const [selectedSeason, setSelectedSeason] = useState(
        seasonsData.length > 0 ? seasonsData[0].season_number : 1
    );
    const [downloadingId, setDownloadingId] = useState(null);
    const [downloadModal, setDownloadModal] = useState(null);
    const [mediaInfoModal, setMediaInfoModal] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [copied, setCopied] = useState(false);
    const [selectedActor, setSelectedActor] = useState(null);
    const [actorMediaLoading, setActorMediaLoading] = useState(false);
    const [actorMediaList, setActorMediaList] = useState([]);

    const castList = Array.isArray(item.cast) ? item.cast : [];

    const handleActorClick = async (actor) => {
        setSelectedActor(actor);
        setActorMediaLoading(true);
        setActorMediaList([]);
        try {
            const res = await axios.get(route('media.actor', encodeURI(actor.name)));
            setActorMediaList(res.data.media || []);
        } catch (err) {
            console.error('Failed to fetch actor media:', err);
        } finally {
            setActorMediaLoading(false);
        }
    };

    const genresList = Array.isArray(item.genres)
        ? item.genres
        : typeof item.genres === 'string'
            ? item.genres.split(',')
            : [];

    const handleDownloadSingle = async (targetItem) => {
        const targetId = targetItem?.id || item.id;
        setDownloadingId(targetId);
        setErrorMessage(null);

        try {
            const res = await axios.post(route('media.authorize-download', targetId));
            if (res.data.success) {
                const targetSizeGb = targetItem?.size_gb
                    ? targetItem.size_gb
                    : targetItem?.file_size
                        ? (targetItem.file_size / 1073741824).toFixed(2)
                        : item.file_size
                            ? (item.file_size / 1073741824).toFixed(2)
                            : '0.00';

                setDownloadModal({
                    itemTitle: targetItem?.title || item.title,
                    fileName: targetItem?.file_name || item.file_name,
                    download_url: res.data.download_url,
                    expires_at: res.data.expires_at,
                    size_gb: targetSizeGb,
                    quality: targetItem?.quality_label || item.quality_label || '4K UHD',
                });
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'İndirme yetkilendirmesi başarısız oldu.';
            setErrorMessage(msg);
        } finally {
            setDownloadingId(null);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const currentSeasonObj = seasonsData.find((s) => s.season_number === selectedSeason) || seasonsData[0];

    const highestVersion = (!isSeries && versionsData.length > 0)
        ? versionsData[versionsData.length - 1]
        : item;

    return (
        <AuthenticatedLayout>
            <Head title={`${item.title} - CINEBOX`} />

            <div className="-mt-8 space-y-12 pb-16">
                {/* Hero Banner Section */}
                <div className="relative w-full min-h-[480px] md:min-h-[560px] bg-slate-950 overflow-hidden flex items-end">
                    {item.backdrop_url ? (
                        <img
                            src={item.backdrop_url}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover object-center filter brightness-75 scale-105"
                        />
                    ) : (
                        <div className="absolute inset-0 bg-hero-gradient" />
                    )}

                    {/* Gradient Overlays */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#08090d] via-[#08090d]/70 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#08090d] via-[#08090d]/60 to-transparent" />

                    {/* Hero Grid Content */}
                    <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-10 pt-28 w-full">
                        <div className="flex flex-col md:flex-row gap-8 items-start">
                            {/* Poster Card */}
                            <div className="shrink-0 w-44 sm:w-56 md:w-64 aspect-[2/3] rounded-3xl bg-slate-900 border border-white/10 shadow-2xl overflow-hidden relative group">
                                {item.poster_url ? (
                                    <img src={item.poster_url} alt={item.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-slate-900 p-6 flex flex-col justify-between items-center text-center">
                                        <div className="text-4xl mt-12">🎬</div>
                                        <span className="font-bold text-white text-sm">{item.title}</span>
                                    </div>
                                )}

                                <div className="absolute bottom-3 left-3 right-3 px-3 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 text-center font-mono font-bold text-xs text-indigo-300">
                                    {isSeries
                                        ? `${seasonsData.length} Sezon • ${seasonsData.reduce((acc, s) => acc + s.episodes.length, 0)} Bölüm`
                                        : `${totalVersionsCount} Sürüm Seçeneği`}
                                </div>
                            </div>

                            {/* Details Info */}
                            <div className="flex-1 space-y-5 text-slate-100 text-left">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className={`px-3.5 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${isSeries ? 'gradient-button text-white shadow-md' : 'bg-emerald-600 text-white'}`}>
                                        {isSeries ? 'Dizi' : 'Film'}
                                    </span>
                                    {item.year && (
                                        <span className="px-3.5 py-1 rounded-full text-xs font-semibold glass-panel text-slate-300 border border-white/10">
                                            {item.year}
                                        </span>
                                    )}
                                    {item.vote_average > 0 && (
                                        <span className="px-3.5 py-1 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                            ★ {item.vote_average.toFixed(1)} / 10 TMDB
                                        </span>
                                    )}
                                    <span className="px-3.5 py-1 rounded-full text-xs font-bold gradient-badge-4k uppercase">
                                        {highestVersion.quality_label || '4K Ultra HD'}
                                    </span>
                                    <span className="px-3.5 py-1 rounded-full text-xs font-bold bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 uppercase">
                                        TR - EN Dual Ses
                                    </span>
                                </div>

                                <div>
                                    <h1 className="font-display font-black text-3xl sm:text-5xl text-white tracking-tight leading-tight">
                                        {item.title}
                                    </h1>
                                    {item.original_title && item.original_title !== item.title && (
                                        <div className="text-sm text-slate-400 font-medium mt-1">
                                            Orijinal Başlık: <span className="text-slate-300 italic">{item.original_title}</span>
                                        </div>
                                    )}
                                </div>

                                {genresList.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {genresList.map((g, idx) => (
                                            <span key={idx} className="px-3 py-1 rounded-xl text-xs font-medium bg-slate-900/80 border border-white/10 text-slate-300">
                                                {g.trim()}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {item.overview && (
                                    <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-3xl glass-panel p-4 rounded-2xl border border-white/5">
                                        {item.overview}
                                    </p>
                                )}

                                {/* Main Download Action Button */}
                                {!isSeries && (
                                    <div className="flex flex-wrap items-center gap-4 pt-2">
                                        <button
                                            onClick={() => handleDownloadSingle(highestVersion)}
                                            disabled={downloadingId === highestVersion.id}
                                            className="px-8 py-4 rounded-2xl gradient-button text-white font-bold text-sm shadow-glow-purple hover:scale-105 transition-all flex items-center gap-3"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            {downloadingId === highestVersion.id ? 'Yetkilendiriliyor...' : `En Yüksek Kalite İndir (${highestVersion.quality_label || 'IDM'})`}
                                        </button>

                                        <button
                                            onClick={() => setMediaInfoModal(highestVersion)}
                                            className="px-7 py-4 rounded-2xl glass-panel text-white font-bold text-sm hover:border-white/30 transition-all flex items-center gap-2"
                                        >
                                            <span className="text-indigo-400 text-base">📋</span>
                                            Media Info
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                    <div className="max-w-7xl mx-auto px-4">
                        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-200 flex items-center justify-between">
                            <span className="text-sm font-semibold">{errorMessage}</span>
                            <button onClick={() => setErrorMessage(null)} className="text-slate-400 hover:text-white">✕</button>
                        </div>
                    </div>
                )}

                {/* ============================================================== */}
                {/* DİZİLER İÇİN SEZON & BÖLÜM GRUPLAMA LISTESİ */}
                {/* ============================================================== */}
                {isSeries && seasonsData.length > 0 && (
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 text-left">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
                            <div>
                                <h2 className="font-display font-bold text-2xl text-white flex items-center gap-3">
                                    <span>📺 Sezonlar & Bölümler</span>
                                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                        {seasonsData.length} Sezon Arşivde
                                    </span>
                                </h2>
                                <p className="text-xs text-slate-400 mt-1">İndirmek veya detaylarını incelemek istediğiniz bölümü seçin.</p>
                            </div>

                            {/* Season Tabs */}
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                                {seasonsData.map((s) => (
                                    <button
                                        key={s.season_number}
                                        onClick={() => setSelectedSeason(s.season_number)}
                                        className={`px-5 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 ${selectedSeason === s.season_number
                                            ? 'gradient-button text-white shadow-glow-purple scale-105'
                                            : 'glass-panel text-slate-300 hover:text-white hover:border-white/20'
                                            }`}
                                    >
                                        <span>{s.title}</span>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/40 text-slate-300">
                                            {s.episodes.length} Bölüm
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Episodes List for Selected Season (Stacked Rows) */}
                        {currentSeasonObj && (
                            <div className="grid gap-4">
                                {currentSeasonObj.episodes.map((ep) => (
                                    <div
                                        key={ep.id}
                                        className="rounded-2xl glass-card border border-white/10 p-5 hover:border-indigo-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950/40"
                                    >
                                        <div className="space-y-2 text-left">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="px-3 py-1 rounded-xl text-xs font-black bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md">
                                                    Bölüm {ep.episode_number || ep.id}
                                                </span>
                                                <span className="px-2.5 py-0.5 rounded-lg bg-black/60 text-indigo-300 font-mono text-xs border border-white/10 font-bold">
                                                    {ep.quality_label}
                                                </span>
                                                <span className="px-2.5 py-0.5 rounded-lg bg-black/60 text-slate-300 font-mono text-xs border border-white/10">
                                                    {ep.size_gb} GB
                                                </span>
                                                <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
                                                    TR - EN Dual Ses
                                                </span>
                                            </div>
                                            <div className="font-mono text-xs text-slate-300 font-semibold truncate max-w-2xl">
                                                {ep.file_name}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 shrink-0">
                                            <button
                                                onClick={() => setMediaInfoModal(ep)}
                                                className="px-4 py-2.5 rounded-xl glass-panel text-slate-200 text-xs font-bold hover:text-white transition-all flex items-center gap-2"
                                            >
                                                <span className="text-indigo-400 text-sm">📋</span>
                                                Media Info
                                            </button>

                                            <button
                                                onClick={() => handleDownloadSingle(ep)}
                                                disabled={downloadingId === ep.id}
                                                className="px-6 py-2.5 rounded-xl gradient-button text-white text-xs font-bold shadow-glow-purple hover:scale-105 transition-transform flex items-center gap-2"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                </svg>
                                                {downloadingId === ep.id ? 'Yetkilendiriliyor...' : 'İndir'}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ============================================================== */}
                {/* FILMLER İÇİN KALİTE & SÜRÜM SEÇENEKLERİ (4K, REMUX, 1080p, 720p) */}
                {/* ============================================================== */}
                {!isSeries && versionsData.length > 0 && (
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 text-left">
                        <div>
                            <h2 className="font-display font-bold text-2xl text-white flex items-center gap-3">
                                <span>Kalite & Sürüm Seçenekleri</span>
                                <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                    {versionsData.length} Sürüm / Kalite Mevcut
                                </span>
                            </h2>
                            <p className="text-xs text-slate-400 mt-1">İndirmek veya teknik detaylarını incelemek istediğiniz versiyonu aşağıdan seçebilirsiniz.</p>
                        </div>

                        <div className="grid gap-4">
                            {versionsData.map((ver) => (
                                <div
                                    key={ver.id}
                                    className="rounded-2xl glass-card border border-white/10 p-5 hover:border-indigo-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950/40"
                                >
                                    <div className="space-y-2 text-left">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="px-3 py-1 rounded-xl text-xs font-black bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md">
                                                {ver.quality_label}
                                            </span>
                                            <span className="px-2.5 py-0.5 rounded-lg bg-black/60 text-slate-300 font-mono text-xs border border-white/10">
                                                {ver.size_gb} GB
                                            </span>
                                            <span className="px-2.5 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 text-xs font-bold border border-indigo-500/30">
                                                TR - EN Dual Ses
                                            </span>
                                        </div>
                                        <div className="font-mono text-xs text-slate-300 font-semibold truncate max-w-2xl">
                                            {ver.file_name}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <button
                                            onClick={() => setMediaInfoModal(ver)}
                                            className="px-4 py-2.5 rounded-xl glass-panel text-slate-200 text-xs font-bold hover:text-white transition-all flex items-center gap-2"
                                        >
                                            <span className="text-indigo-400 text-sm">📋</span>
                                            Media Info
                                        </button>

                                        <button
                                            onClick={() => handleDownloadSingle(ver)}
                                            disabled={downloadingId === ver.id}
                                            className="px-6 py-2.5 rounded-xl gradient-button text-white text-xs font-bold shadow-glow-purple hover:scale-105 transition-transform flex items-center gap-2"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                            {downloadingId === ver.id ? 'Yetkilendiriliyor...' : 'İndir'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* ============================================================== */}
                {/* OYUNCU KADROSU (CAST LIST) SECTION */}
                {/* ============================================================== */}
                {castList.length > 0 && (
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 text-left">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
                            <div>
                                <h2 className="font-display font-bold text-2xl text-white flex items-center gap-3">
                                    <span>Oyuncu Kadrosu</span>
                                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                        {castList.length} Oyuncu
                                    </span>
                                </h2>
                                <p className="text-xs text-slate-400 mt-1">
                                    Oyuncuya tıklayarak arşivimizde yer alan diğer film ve dizilerini görüntüleyebilirsiniz.
                                </p>
                            </div>
                        </div>

                        {/* Cast Grid Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {castList.map((actor, idx) => (
                                <button
                                    key={actor.id || idx}
                                    onClick={() => handleActorClick(actor)}
                                    className="group flex flex-col items-center text-center p-3.5 rounded-2xl glass-card border border-white/5 hover:border-indigo-500/50 hover:bg-slate-900/80 transition-all duration-300 hover:-translate-y-1 shadow-lg cursor-pointer"
                                >
                                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-indigo-400 transition-colors shadow-md relative bg-slate-900 mb-3 shrink-0">
                                        {actor.profile_url ? (
                                            <img
                                                src={actor.profile_url}
                                                alt={actor.name}
                                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 text-slate-300 font-bold text-2xl">
                                                {actor.name ? actor.name.charAt(0) : '👤'}
                                            </div>
                                        )}
                                    </div>

                                    <h4 className="font-bold text-xs text-white group-hover:text-indigo-300 transition-colors line-clamp-1 w-full">
                                        {actor.name}
                                    </h4>

                                    {actor.character && (
                                        <p className="text-[10px] text-slate-400 font-medium line-clamp-1 w-full mt-0.5">
                                            {actor.character}
                                        </p>
                                    )}

                                    <div className="mt-2 text-[10px] font-bold text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                        <span>Diğer Yapımları</span>
                                        <span>→</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Related Media Section */}
                {related && related.length > 0 && (
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 text-left">
                        <h2 className="font-display font-bold text-2xl text-white">Benzer İçerikler</h2>
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
                            {related.map((rel) => (
                                <Link
                                    key={rel.id}
                                    href={route('media.show', rel.id)}
                                    className="group rounded-2xl glass-card overflow-hidden border border-white/5 hover:border-indigo-500/40 transition-all"
                                >
                                    <div className="aspect-[2/3] w-full overflow-hidden bg-slate-900">
                                        <img
                                            src={rel.poster_url || '/placeholder.jpg'}
                                            alt={rel.title}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                        />
                                    </div>
                                    <div className="p-3">
                                        <h4 className="font-bold text-xs text-white group-hover:text-indigo-300 line-clamp-1">{rel.title}</h4>
                                        <span className="text-[10px] text-slate-400">{rel.year || '2024'}</span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}

                {/* Download Modal */}
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
                                        <p className="text-xs text-slate-400">IDM veya tarayıcınızla doğrudan indirebilirsiniz.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setDownloadModal(null)}
                                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="p-4 rounded-2xl bg-slate-950/80 border border-white/5 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-bold text-white truncate max-w-xs">{downloadModal.itemTitle}</span>
                                    <span className="font-mono font-bold text-indigo-300">{downloadModal.size_gb} GB</span>
                                </div>
                                <div className="text-[11px] font-mono text-slate-400 truncate">{downloadModal.fileName}</div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                    Doğrudan Bağlantı URL (IDM için Kopyalayın)
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
                                        className="px-4 py-2.5 rounded-xl gradient-button text-white text-xs font-bold shrink-0"
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
                                    Hemen İndir
                                </a>
                            </div>
                        </div>
                    </div>
                )}

                {/* Media Info Technical Details Popup Modal */}
                {mediaInfoModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
                        <div className="w-full max-w-2xl glass-panel rounded-3xl border border-white/15 p-6 shadow-2xl space-y-6 text-left relative max-h-[90vh] overflow-y-auto">
                            <div className="flex items-start justify-between border-b border-white/10 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-xl font-bold">
                                        📋
                                    </div>
                                    <div>
                                        <h3 className="font-display font-bold text-lg text-white">Media Info Detayları</h3>
                                        <p className="text-xs text-slate-400 font-mono truncate max-w-md">{mediaInfoModal.file_name}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setMediaInfoModal(null)}
                                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Metadata Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Çözünürlük & Kalite</div>
                                    <div className="text-sm font-bold text-white">
                                        {mediaInfoModal.width && mediaInfoModal.height
                                            ? `${mediaInfoModal.width} x ${mediaInfoModal.height} (${mediaInfoModal.quality_label})`
                                            : mediaInfoModal.quality_label || '4K Ultra HD'}
                                    </div>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Dosya Boyutu</div>
                                    <div className="text-sm font-bold text-indigo-300 font-mono">
                                        {mediaInfoModal.size_gb ? `${mediaInfoModal.size_gb} GB` : 'Bilinmiyor'}
                                    </div>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Video Kodlayıcı & FPS</div>
                                    <div className="text-sm font-bold text-white">
                                        {mediaInfoModal.video_codec || 'HEVC / H.265'} {mediaInfoModal.fps ? `(${mediaInfoModal.fps} fps)` : ''}
                                    </div>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ses Kodlayıcı & Kanal</div>
                                    <div className="text-sm font-bold text-white">
                                        {mediaInfoModal.audio_codec || 'AAC / DTS-HD'} {mediaInfoModal.audio_channels ? `(${mediaInfoModal.audio_channels} Kanal)` : ''}
                                    </div>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ses & Altyazı Dilleri</div>
                                    <div className="text-xs font-semibold text-slate-200">
                                        {mediaInfoModal.audio_language || 'TR (Türkçe Dublaj) - EN (Orijinal Ses)'}
                                    </div>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bitrate (Veri Hızı)</div>
                                    <div className="text-sm font-bold text-emerald-400 font-mono">
                                        {mediaInfoModal.bitrate ? `${(mediaInfoModal.bitrate / 1000).toFixed(0)} kbps` : 'Yüksek Bitrate'}
                                    </div>
                                </div>
                            </div>

                            {/* File Path Information */}
                            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-white/5 space-y-1">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Göreli Dosya Yolu</div>
                                <div className="font-mono text-xs text-indigo-300 break-all select-all">
                                    {mediaInfoModal.file_path || mediaInfoModal.file_name}
                                </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    onClick={() => setMediaInfoModal(null)}
                                    className="px-5 py-2.5 rounded-xl glass-panel text-slate-300 text-xs font-bold hover:text-white"
                                >
                                    Kapat
                                </button>
                                <button
                                    onClick={() => {
                                        const target = mediaInfoModal;
                                        setMediaInfoModal(null);
                                        handleDownloadSingle(target);
                                    }}
                                    className="px-6 py-2.5 rounded-xl gradient-button text-white text-xs font-bold shadow-glow-purple"
                                >
                                    İndirme Bağlantısı Al
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Actor Other Media Popup Modal */}
                {selectedActor && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
                        <div className="w-full max-w-3xl glass-panel rounded-3xl border border-white/15 p-6 shadow-2xl space-y-6 text-left relative max-h-[90vh] overflow-y-auto">
                            {/* Header */}
                            <div className="flex items-start justify-between border-b border-white/10 pb-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-indigo-500/40 shrink-0 bg-slate-900 shadow-md">
                                        {selectedActor.profile_url ? (
                                            <img src={selectedActor.profile_url} alt={selectedActor.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 text-white font-bold text-xl">
                                                {selectedActor.name?.charAt(0) || '👤'}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-display font-bold text-xl text-white">{selectedActor.name}</h3>
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                                Arşiv Arama
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            {selectedActor.character ? `Karakter: ${selectedActor.character}` : 'Oyuncunun arşivimizdeki diğer film ve dizileri'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelectedActor(null)}
                                    className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Body Content */}
                            {actorMediaLoading ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-8">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="animate-pulse space-y-3 p-3 rounded-2xl bg-slate-900/60 border border-white/5">
                                            <div className="aspect-[2/3] bg-slate-800 rounded-xl"></div>
                                            <div className="h-4 bg-slate-800 rounded w-3/4"></div>
                                            <div className="h-3 bg-slate-800 rounded w-1/2"></div>
                                        </div>
                                    ))}
                                </div>
                            ) : actorMediaList.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
                                        <span>🎬 Arşivde Bulunan Yapımları</span>
                                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[11px] border border-emerald-500/30">
                                            {actorMediaList.length} Adet
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                        {actorMediaList.map((m) => (
                                            <Link
                                                key={m.id}
                                                href={route('media.show', m.id)}
                                                onClick={() => setSelectedActor(null)}
                                                className="group rounded-2xl glass-card overflow-hidden border border-white/10 hover:border-indigo-500/50 hover:scale-[1.03] transition-all bg-slate-950/60 flex flex-col"
                                            >
                                                <div className="aspect-[2/3] w-full overflow-hidden bg-slate-900 relative">
                                                    {m.poster_url ? (
                                                        <img
                                                            src={m.poster_url}
                                                            alt={m.title}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full p-4 flex items-center justify-center text-center text-xs font-bold text-slate-400">
                                                            {m.title}
                                                        </div>
                                                    )}
                                                    <div className="absolute top-2 right-2">
                                                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-black/80 backdrop-blur-md text-indigo-300 border border-white/10">
                                                            {m.type === 'series' || m.type === 'episode' ? 'Dizi' : 'Film'}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="p-3 space-y-1 flex-1 flex flex-col justify-between">
                                                    <div>
                                                        <h4 className="font-bold text-xs text-white group-hover:text-indigo-300 line-clamp-1">
                                                            {m.title}
                                                        </h4>
                                                        {m.original_title && m.original_title !== m.title && (
                                                            <p className="text-[10px] text-slate-400 italic line-clamp-1">{m.original_title}</p>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-white/5">
                                                        <span>{m.year || 'N/A'}</span>
                                                        <span className="font-bold text-emerald-400">{m.quality_label}</span>
                                                    </div>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 px-4 space-y-3 rounded-2xl bg-slate-950/40 border border-white/5">
                                    <div className="text-4xl">🎬</div>
                                    <h4 className="font-bold text-slate-200 text-base">Arşivimizde Başka Yapım Bulunamadı</h4>
                                    <p className="text-xs text-slate-400 max-w-sm mx-auto">
                                        <span className="text-indigo-300 font-semibold">{selectedActor.name}</span> isimli oyuncunun bu içerik haricindeki diğer filmleri henüz sistemimize eklenmemiştir.
                                    </p>
                                </div>
                            )}

                            {/* Footer */}
                            <div className="flex items-center justify-end pt-2 border-t border-white/10">
                                <button
                                    onClick={() => setSelectedActor(null)}
                                    className="px-6 py-2.5 rounded-xl gradient-button text-white text-xs font-bold shadow-glow-purple"
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
