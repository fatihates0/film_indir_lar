import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import { useState } from 'react';

export default function MediaShow({ item, related = [], quota }) {
    const [downloading, setDownloading] = useState(false);
    const [downloadModal, setDownloadModal] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [copied, setCopied] = useState(false);
    const [showPlayer, setShowPlayer] = useState(false);

    const sizeGb = item?.file_size ? (item.file_size / 1073741824).toFixed(2) : '0.00';

    const handleDownload = async () => {
        setDownloading(true);
        setErrorMessage(null);

        try {
            const res = await axios.post(route('media.authorize-download', item.id));
            if (res.data.success) {
                setDownloadModal({
                    download_url: res.data.download_url,
                    expires_at: res.data.expires_at,
                    size_gb: sizeGb,
                });
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'İndirme yetkilendirmesi başarısız oldu.';
            setErrorMessage(msg);
        } finally {
            setDownloading(false);
        }
    };

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <AuthenticatedLayout>
            <Head title={`${item.title} - CINEBOX`} />

            <div className="-mt-8 space-y-12 pb-12">
                {/* Backdrop Hero Banner */}
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

                    {/* Gradient Overlay Shadows */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#08090d] via-[#08090d]/70 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#08090d] via-[#08090d]/60 to-transparent" />

                    {/* Hero Content Grid */}
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

                                {sizeGb && (
                                    <div className="absolute bottom-3 left-3 right-3 px-3 py-1.5 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 text-center font-mono font-bold text-xs text-indigo-300">
                                        {sizeGb} GB
                                    </div>
                                )}
                            </div>

                            {/* Details & Specs */}
                            <div className="flex-1 space-y-5 text-slate-100 text-left">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider gradient-button text-white shadow-md">
                                        {item.type === 'movie' ? 'Film' : 'Dizi'}
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
                                        4K Ultra HD
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

                                {item.genres && (
                                    <div className="flex flex-wrap gap-2">
                                        {item.genres.split(',').map((g, idx) => (
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

                                {/* Main Action Buttons */}
                                <div className="flex flex-wrap items-center gap-4 pt-2">
                                    <button
                                        onClick={handleDownload}
                                        disabled={downloading}
                                        className="px-8 py-4 rounded-2xl gradient-button text-white font-bold text-sm shadow-glow-purple hover:scale-105 transition-all flex items-center gap-3"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        {downloading ? 'Yetkilendiriliyor...' : 'Yüksek Hızlı İndir (IDM)'}
                                    </button>

                                    <button
                                        onClick={() => setShowPlayer(!showPlayer)}
                                        className="px-7 py-4 rounded-2xl glass-panel text-white font-bold text-sm hover:border-white/30 transition-all flex items-center gap-2"
                                    >
                                        <svg className="w-5 h-5 text-indigo-400 fill-current" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                        {showPlayer ? 'Oynatıcıyı Gizle' : 'Anında Önizleme Oynat'}
                                    </button>
                                </div>
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

                {/* Embedded Video Player Modal/Container */}
                {showPlayer && downloadModal?.download_url && (
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 animate-fade-in">
                        <div className="rounded-3xl glass-panel border border-white/10 p-4 shadow-2xl overflow-hidden space-y-3">
                            <div className="flex items-center justify-between px-2">
                                <h3 className="font-display font-bold text-base text-white flex items-center gap-2">
                                    <span>🎥 Canlı Medya Akış Oynatıcısı</span>
                                </h3>
                                <button onClick={() => setShowPlayer(false)} className="text-xs text-slate-400 hover:text-white">✕ Kapat</button>
                            </div>
                            <div className="aspect-video w-full rounded-2xl bg-black overflow-hidden shadow-inner">
                                <video
                                    controls
                                    autoPlay
                                    src={downloadModal.download_url}
                                    className="w-full h-full"
                                >
                                    Tarayıcınız HTML5 video oynatımını desteklememektedir.
                                </video>
                            </div>
                        </div>
                    </div>
                )}

                {/* File Technical Details Grid */}
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid md:grid-cols-3 gap-6">
                    <div className="glass-card rounded-3xl p-6 border border-white/5 text-left space-y-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Dosya Kalitesi</div>
                        <div className="font-display font-black text-2xl text-white">4K UHD Remux</div>
                        <p className="text-xs text-slate-400">Hetzner Storage Box üzerinde doğrudan yüksek veri hızıyla saklanmaktadır.</p>
                    </div>

                    <div className="glass-card rounded-3xl p-6 border border-white/5 text-left space-y-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Ses Dilleri</div>
                        <div className="font-display font-bold text-lg text-white flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs">TR Türkçe Dublaj</span>
                            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-xs">EN Orijinal Ses</span>
                        </div>
                        <p className="text-xs text-slate-400">Çoklu ses kanalı ve Türkçe altyazı akışı entegredir.</p>
                    </div>

                    <div className="glass-card rounded-3xl p-6 border border-white/5 text-left space-y-3">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Kota Durumu</div>
                        <div className="font-display font-black text-2xl text-emerald-400">{sizeGb} GB</div>
                        <p className="text-xs text-slate-400">Bu içeriği indirdiğinizde 30 günlük dönemsel kotanızdan düşülecektir.</p>
                    </div>
                </div>

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
                                        <h3 className="font-display font-bold text-lg text-white">Bağlantı Oluşturuldu!</h3>
                                        <p className="text-xs text-slate-400">IDM ile doğrudan indirmeye başlayabilirsiniz.</p>
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
                                    <span className="font-bold text-white truncate max-w-xs">{item.title}</span>
                                    <span className="font-mono font-bold text-indigo-300">{downloadModal.size_gb} GB</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                    İndirme Bağlantısı
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
                                    Doğrudan İndir
                                </a>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
