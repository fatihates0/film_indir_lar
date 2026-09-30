import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import { useState } from 'react';

export default function MediaShow({ item, related = [], quota }) {
    const [downloading, setDownloading] = useState(false);
    const [downloadModal, setDownloadModal] = useState(null);
    const [errorMessage, setErrorMessage] = useState(null);
    const [copied, setCopied] = useState(false);

    const handleDownload = async () => {
        setDownloading(true);
        setErrorMessage(null);

        try {
            const res = await axios.post(route('media.authorize-download', item.id));
            if (res.data.success) {
                setDownloadModal({
                    download_url: res.data.download_url,
                    expires_at: res.data.expires_at,
                    size_gb: (item.file_size / 1073741824).toFixed(2),
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
            <Head title={`${item.title} - CINEMAFLIX`} />

            <div className="-mt-8 space-y-8">
                {/* Backdrop Hero Header */}
                <div className="relative w-full min-h-[440px] md:min-h-[520px] bg-slate-950 overflow-hidden flex items-end">
                    {item.backdrop_url ? (
                        <img
                            src={item.backdrop_url}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover object-center filter brightness-75 scale-105"
                        />
                    ) : (
                        <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-indigo-950/40 to-slate-900"></div>
                    )}

                    {/* Gradient Mask Overlays */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0a0d14] via-[#0a0d14]/70 to-transparent"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-[#0a0d14] via-transparent to-transparent"></div>

                    {/* Hero Content Container */}
                    <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-8 pt-24 w-full">
                        <div className="flex flex-col md:flex-row gap-8 items-start">
                            {/* Poster Card */}
                            <div className="shrink-0 w-44 sm:w-56 md:w-64 aspect-[2/3] rounded-3xl bg-slate-900 border-2 border-slate-700/60 shadow-2xl overflow-hidden relative group">
                                {item.poster_url ? (
                                    <img src={item.poster_url} alt={item.title} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full bg-slate-900 p-6 flex flex-col justify-between items-center text-center">
                                        <div className="text-4xl mt-12">🎬</div>
                                        <span className="font-bold text-white text-sm">{item.title}</span>
                                    </div>
                                )}
                            </div>

                            {/* Info & Metadata */}
                            <div className="flex-1 space-y-4 text-slate-100">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-indigo-600 text-white shadow-md shadow-indigo-600/30">
                                        {item.type === 'movie' ? 'Film' : 'Dizi'}
                                    </span>
                                    {item.year && (
                                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-slate-800/80 text-slate-300 border border-slate-700">
                                            {item.year}
                                        </span>
                                    )}
                                    {item.vote_average > 0 && (
                                        <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                            ★ {item.vote_average.toFixed(1)} / 10 TMDB
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight">
                                        {item.title}
                                    </h1>
                                    {item.original_title && item.original_title !== item.title && (
                                        <div className="text-sm text-slate-400 font-medium mt-1">
                                            Orijinal İsim: <span className="text-slate-300 italic">{item.original_title}</span>
                                        </div>
                                    )}
                                </div>

                                {item.tagline && (
                                    <p className="text-sm italic text-indigo-300 font-medium">"{item.tagline}"</p>
                                )}

                                {/* Genres Pills */}
                                {item.genres && item.genres.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {item.genres.map((g) => (
                                            <span key={g} className="px-3 py-1 rounded-xl bg-slate-900/80 border border-slate-700/60 text-xs font-semibold text-slate-300">
                                                {g}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Plot Overview */}
                                {item.overview && (
                                    <p className="text-sm text-slate-300 leading-relaxed max-w-3xl pt-2">
                                        {item.overview}
                                    </p>
                                )}

                                {/* Primary Action Bar */}
                                <div className="pt-4 flex flex-wrap gap-4 items-center">
                                    <button
                                        onClick={handleDownload}
                                        disabled={downloading}
                                        className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 px-8 py-4 text-base font-bold text-white shadow-xl shadow-indigo-600/40 hover:scale-[1.02] transition-all disabled:opacity-50"
                                    >
                                        {downloading ? (
                                            <span className="animate-spin text-sm">⌛ Hazırlanıyor...</span>
                                        ) : (
                                            <>
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                </svg>
                                                Hemen İndir ({(item.file_size / 1073741824).toFixed(2)} GB)
                                            </>
                                        )}
                                    </button>

                                    <Link
                                        href={route('media.index')}
                                        className="inline-flex items-center gap-2 rounded-2xl bg-slate-900/80 border border-slate-800 hover:bg-slate-800 px-6 py-4 text-sm font-semibold text-slate-300 transition-colors"
                                    >
                                        ← Kütüphaneye Dön
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Technical Specifications & Details Section */}
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
                    {errorMessage && (
                        <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-300 flex items-center justify-between">
                            <span>{errorMessage}</span>
                            <button onClick={() => setErrorMessage(null)} className="text-rose-400 font-bold">&times;</button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Specs Card 1 */}
                        <div className="rounded-3xl bg-[#0f1422] border border-slate-800 p-6 space-y-4">
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <span className="text-indigo-400">📹</span> Video & Çözünürlük
                            </h3>
                            <dl className="space-y-2 text-xs divide-y divide-slate-800/80">
                                <div className="pt-2 flex justify-between">
                                    <dt className="text-slate-400">Çözünürlük</dt>
                                    <dd className="font-mono font-bold text-white">
                                        {item.width && item.height ? `${item.width}x${item.height}` : '1080p HD'}
                                    </dd>
                                </div>
                                <div className="pt-2 flex justify-between">
                                    <dt className="text-slate-400">Video Kodek</dt>
                                    <dd className="font-mono uppercase text-indigo-300 font-semibold">{item.video_codec || 'x264 / HEVC'}</dd>
                                </div>
                                <div className="pt-2 flex justify-between">
                                    <dt className="text-slate-400">Kare Hızı (FPS)</dt>
                                    <dd className="font-mono text-slate-300">{item.fps ? `${item.fps} fps` : '23.976 fps'}</dd>
                                </div>
                            </dl>
                        </div>

                        {/* Specs Card 2 */}
                        <div className="rounded-3xl bg-[#0f1422] border border-slate-800 p-6 space-y-4">
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <span className="text-indigo-400">🔊</span> Ses & Diller
                            </h3>
                            <dl className="space-y-2 text-xs divide-y divide-slate-800/80">
                                <div className="pt-2 flex justify-between">
                                    <dt className="text-slate-400">Ses Kodeği</dt>
                                    <dd className="font-mono uppercase text-indigo-300 font-semibold">{item.audio_codec || 'AAC / AC3'}</dd>
                                </div>
                                <div className="pt-2 flex justify-between">
                                    <dt className="text-slate-400">Ses Kanalları</dt>
                                    <dd className="font-mono text-slate-300">{item.audio_channels ? `${item.audio_channels} Kanal` : '5.1 / 2.0 Stereo'}</dd>
                                </div>
                                <div className="pt-2 flex justify-between">
                                    <dt className="text-slate-400">Ses Dilleri</dt>
                                    <dd className="font-semibold text-emerald-400">{item.audio_language || 'Türkçe / İngilizce Dual'}</dd>
                                </div>
                            </dl>
                        </div>

                        {/* Specs Card 3 */}
                        <div className="rounded-3xl bg-[#0f1422] border border-slate-800 p-6 space-y-4">
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <span className="text-indigo-400">💾</span> Dosya & Depolama
                            </h3>
                            <dl className="space-y-2 text-xs divide-y divide-slate-800/80">
                                <div className="pt-2 flex justify-between">
                                    <dt className="text-slate-400">Dosya Boyutu</dt>
                                    <dd className="font-mono font-bold text-emerald-400">{(item.file_size / 1073741824).toFixed(2)} GB</dd>
                                </div>
                                <div className="pt-2 flex justify-between">
                                    <dt className="text-slate-400">Dosya Biçimi</dt>
                                    <dd className="font-mono uppercase text-slate-300">{item.extension || 'MKV'}</dd>
                                </div>
                                <div className="pt-2 flex justify-between">
                                    <dt className="text-slate-400">Kalan İndirme Kotanız</dt>
                                    <dd className="font-bold text-indigo-400">{quota.remaining_gb} GB</dd>
                                </div>
                            </dl>
                        </div>
                    </div>

                    {/* Related Media Section */}
                    {related.length > 0 && (
                        <div className="space-y-4 pt-6">
                            <h3 className="text-xl font-bold text-white">Benzer İçerikler</h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
                                {related.map((rel) => (
                                    <Link
                                        key={rel.id}
                                        href={route('media.show', rel.id)}
                                        className="group rounded-2xl bg-[#0f1422] border border-slate-800 overflow-hidden hover:border-indigo-500/50 transition-all"
                                    >
                                        <div className="aspect-[2/3] w-full bg-slate-950 overflow-hidden">
                                            {rel.poster_url ? (
                                                <img src={rel.poster_url} alt={rel.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 p-2 text-center">{rel.title}</div>
                                            )}
                                        </div>
                                        <div className="p-2.5">
                                            <div className="text-xs font-bold text-white line-clamp-1 group-hover:text-indigo-300">{rel.title}</div>
                                            <div className="text-[10px] text-slate-500 mt-0.5">{rel.year}</div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Signed URL Download Modal */}
                {downloadModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
                        <div className="w-full max-w-md rounded-3xl bg-[#121724] border border-slate-800 p-6 shadow-2xl space-y-5">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-base font-bold text-white line-clamp-1">{item.title}</h3>
                                    <div className="text-xs text-indigo-400 font-semibold mt-0.5">Boyut: {downloadModal.size_gb} GB</div>
                                </div>
                                <button onClick={() => setDownloadModal(null)} className="text-slate-400 hover:text-white font-bold text-xl">&times;</button>
                            </div>

                            <div className="rounded-2xl bg-slate-950 p-4 border border-slate-800 space-y-2 text-xs">
                                <div className="text-slate-300 font-medium flex items-center gap-1.5">
                                    <span>🚀 IDM & Tam Hız İndirme</span>
                                </div>
                                <p className="text-slate-400 leading-relaxed text-[11px]">
                                    Bağlantı başarıyla oluşturuldu. IDM, JDownloader veya tarayıcınız ile indirebilirsiniz. HTTP Range desteği mevcuttur.
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
