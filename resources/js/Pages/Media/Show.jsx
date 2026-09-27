import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link } from '@inertiajs/react';
import axios from 'axios';
import { useState } from 'react';

export default function MediaShow({ item, quota }) {
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState(null);
    const [downloadModal, setDownloadModal] = useState(null);

    const handleDownload = async () => {
        setLoading(true);
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
            setLoading(false);
        }
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex items-center gap-4">
                    <Link href={route('media.index')} className="text-slate-400 hover:text-white transition-colors">
                        &larr; Geri
                    </Link>
                    <h2 className="text-2xl font-bold text-white tracking-tight">{item.title}</h2>
                </div>
            }
        >
            <Head title={`${item.title} - MedyaHub`} />

            <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 space-y-8">
                {errorMessage && (
                    <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-sm text-rose-300">
                        {errorMessage}
                    </div>
                )}

                <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 md:p-8 space-y-6 shadow-2xl">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-slate-800 pb-6">
                        <div>
                            <div className="flex items-center gap-3">
                                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                    {item.type === 'movie' ? 'Film' : 'Dizi'}
                                </span>
                                {item.year && <span className="text-sm font-semibold text-slate-400">{item.year}</span>}
                            </div>
                            <h1 className="text-3xl font-extrabold text-white mt-2">{item.title}</h1>
                            {item.original_title && <p className="text-sm text-slate-400 mt-0.5">{item.original_title}</p>}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleDownload}
                                disabled={loading}
                                className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 font-bold text-sm text-white shadow-lg shadow-indigo-600/30 hover:scale-105 transition-all disabled:opacity-50"
                            >
                                {loading ? 'Hazırlanıyor...' : 'İndir (IDM)'}
                            </button>
                        </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="rounded-2xl bg-slate-950/60 p-4 border border-slate-800">
                            <div className="text-xs text-slate-400">Dosya Boyutu</div>
                            <div className="text-base font-bold text-white mt-1">{(item.file_size / 1073741824).toFixed(2)} GB</div>
                        </div>

                        <div className="rounded-2xl bg-slate-950/60 p-4 border border-slate-800">
                            <div className="text-xs text-slate-400">Çözünürlük</div>
                            <div className="text-base font-bold text-white mt-1">{item.width ? `${item.width}x${item.height}` : '1080p'}</div>
                        </div>

                        <div className="rounded-2xl bg-slate-950/60 p-4 border border-slate-800">
                            <div className="text-xs text-slate-400">Video Kodek</div>
                            <div className="text-base font-bold text-indigo-400 uppercase mt-1">{item.video_codec || 'H.264'}</div>
                        </div>

                        <div className="rounded-2xl bg-slate-950/60 p-4 border border-slate-800">
                            <div className="text-xs text-slate-400">Ses Kodek</div>
                            <div className="text-base font-bold text-purple-400 uppercase mt-1">{item.audio_codec || 'AAC'}</div>
                        </div>
                    </div>

                    {/* File Path & Technical details */}
                    <div className="rounded-2xl bg-slate-950/40 p-5 border border-slate-800/80 space-y-2 text-xs text-slate-400">
                        <div><strong className="text-slate-200">Dosya Adı:</strong> {item.file_name}</div>
                        <div><strong className="text-slate-200">Bitrate:</strong> {item.bitrate ? `${(item.bitrate / 1000000).toFixed(1)} Mbps` : 'Otomatik'}</div>
                        <div><strong className="text-slate-200">Ses Dili:</strong> {item.audio_language || 'Türkçe, İngilizce'}</div>
                        <div><strong className="text-slate-200">Altyazı:</strong> {item.subtitle_languages || 'Türkçe, İngilizce'}</div>
                    </div>
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
                                    IDM veya tarayıcınız üzerinden indirme başlatabilirsiniz.
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
