import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import axios from 'axios';
import { useEffect, useState } from 'react';

export default function StorageBoxesIndex({ boxes, recent_transfers = [] }) {
    const flash = usePage().props.flash;
    const [addBoxModal, setAddBoxModal] = useState(false);
    const [editBoxModal, setEditBoxModal] = useState(null);
    const [addMediaModalBox, setAddMediaModalBox] = useState(null);
    const [infoModalBox, setInfoModalBox] = useState(null);

    // Remote Upload State
    const [remoteModalOpen, setRemoteModalOpen] = useState(false);
    const [transfers, setTransfers] = useState(recent_transfers);
    const [probing, setProbing] = useState(false);
    const [probeResult, setProbeResult] = useState(null);

    const remoteForm = useForm({
        source_url: '',
        storage_box_id: boxes.length > 0 ? boxes[0].id : '',
        target_folder: 'Filmler',
        file_name: '',
        auto_add_media: true,
    });

    // Storage Box Form
    const boxForm = useForm({
        name: '',
        mount_path: '',
        disk_type: 'cifs',
        host: '',
        username: '',
        password: '',
        port: 445,
        share_name: 'backup',
    });

    const editForm = useForm({
        name: '',
        mount_path: '',
        disk_type: 'cifs',
        host: '',
        username: '',
        password: '',
        port: 445,
        share_name: 'backup',
        is_active: true,
    });

    // Add Media Form
    const mediaForm = useForm({
        title: '',
        type: 'movie',
        year: new Date().getFullYear(),
        file_name: '',
        sub_folder: '',
        size_mb: 50,
    });

    // Poll transfers every 2.5s if any are in progress
    useEffect(() => {
        const hasActive = transfers.some(t => t.status === 'pending' || t.status === 'transferring');
        if (!hasActive) return;

        const interval = setInterval(() => {
            axios.get(route('admin.storage-boxes.transfers')).then(res => {
                if (res.data?.transfers) {
                    setTransfers(res.data.transfers);
                }
            }).catch(() => {});
        }, 2500);

        return () => clearInterval(interval);
    }, [transfers]);

    const handleProbeUrl = async () => {
        if (!remoteForm.data.source_url) return;
        setProbing(true);
        try {
            const res = await axios.post(route('admin.storage-boxes.probe-url'), {
                url: remoteForm.data.source_url
            });
            if (res.data?.success) {
                setProbeResult(res.data);
                remoteForm.setData(prev => ({
                    ...prev,
                    file_name: res.data.file_name,
                    target_folder: res.data.suggested_folder || 'Filmler',
                }));
            }
        } catch (err) {
            alert('URL bilgisi alınamadı: ' + (err.response?.data?.message || err.message));
        } finally {
            setProbing(false);
        }
    };

    const handleRemoteSubmit = (e) => {
        e.preventDefault();
        remoteForm.post(route('admin.storage-boxes.remote-transfer'), {
            onSuccess: () => {
                setRemoteModalOpen(false);
                remoteForm.reset();
                setProbeResult(null);
                axios.get(route('admin.storage-boxes.transfers')).then(res => {
                    if (res.data?.transfers) setTransfers(res.data.transfers);
                });
            }
        });
    };

    const handleCancelTransfer = (id) => {
        if (confirm('Bu transfer işlemini iptal etmek/silmek istediğinize emin misiniz?')) {
            axios.delete(route('admin.storage-boxes.cancel-transfer', id)).then(() => {
                setTransfers(prev => prev.filter(t => t.id !== id));
            });
        }
    };

    const openRemoteModalForBox = (box) => {
        remoteForm.setData(prev => ({ ...prev, storage_box_id: box.id }));
        setRemoteModalOpen(true);
    };

    const handleBoxSubmit = (e) => {
        e.preventDefault();
        boxForm.post(route('admin.storage-boxes.store'), {
            onSuccess: () => {
                setAddBoxModal(false);
                boxForm.reset();
            },
        });
    };

    const handleEditBoxSubmit = (e) => {
        e.preventDefault();
        if (!editBoxModal) return;

        editForm.patch(route('admin.storage-boxes.update', editBoxModal.id), {
            onSuccess: () => {
                setEditBoxModal(null);
                editForm.reset();
            },
        });
    };

    const openEditModal = (box) => {
        setEditBoxModal(box);
        editForm.setData({
            name: box.name,
            mount_path: box.mount_path,
            disk_type: box.disk_type,
            host: box.host || '',
            username: box.username || '',
            password: '',
            port: box.port || 445,
            share_name: box.share_name || 'backup',
            is_active: box.is_active,
        });
    };

    const handleMediaSubmit = (e) => {
        e.preventDefault();
        if (!addMediaModalBox) return;

        mediaForm.post(route('admin.storage-boxes.add-media', addMediaModalBox.id), {
            onSuccess: () => {
                setAddMediaModalBox(null);
                mediaForm.reset();
            },
        });
    };

    const triggerScan = (boxId) => {
        router.post(route('admin.storage-boxes.scan', boxId));
    };

    const deleteBox = (box) => {
        if (confirm(`"${box.name}" Storage Box kaydını silmek istediğinize emin misiniz?`)) {
            router.delete(route('admin.storage-boxes.destroy', box.id));
        }
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Hetzner Storage Box Yönetimi</h2>
                        <p className="text-sm text-slate-400 mt-1">Sunucu adresi, kullanıcı adı, şifre ve mount bilgileriyle birden fazla Storage Box ekleyin.</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setRemoteModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 hover:scale-105 transition-all"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            + URL'den İndir & Yükle
                        </button>

                        <button
                            onClick={() => setAddBoxModal(true)}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:scale-105 transition-all"
                        >
                            + Yeni Storage Box Ekle
                        </button>
                    </div>
                </div>
            }
        >
            <Head title="Storage Box Yönetimi - MedyaHub" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
                {flash?.message && (
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm text-emerald-300">
                        {flash.message}
                    </div>
                )}

                {/* Storage Boxes Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {boxes.length > 0 ? (
                        boxes.map((box) => (
                            <div key={box.id} className="rounded-3xl bg-slate-900 border border-slate-800 p-6 flex flex-col justify-between shadow-2xl hover:border-indigo-500/40 transition-all space-y-4">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="text-lg font-bold text-white">{box.name}</h3>
                                            <span className="text-xs font-mono text-indigo-400 uppercase">{box.disk_type}</span>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                                            box.status === 'online'
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                        }`}>
                                            ● {box.status.toUpperCase()}
                                        </span>
                                    </div>

                                    {/* Credentials Summary */}
                                    <div className="rounded-2xl bg-slate-950/60 p-3.5 border border-slate-800 text-xs space-y-1.5 font-mono">
                                        <div><span className="text-slate-500">Host:</span> <strong className="text-slate-200">{box.host || 'Belirtilmedi'}</strong></div>
                                        <div><span className="text-slate-500">Kullanıcı:</span> <strong className="text-slate-200">{box.username || 'Belirtilmedi'}</strong></div>
                                        <div><span className="text-slate-500">Şifre:</span> <strong className="text-emerald-400">{box.has_password ? '•••••••• (Şifrelenmiş)' : 'Yok'}</strong></div>
                                        <div><span className="text-slate-500">Mount Yolu:</span> <strong className="text-indigo-300 break-all">{box.mount_path}</strong></div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-xl bg-slate-950/40 p-2.5 border border-slate-800">
                                            <span className="text-slate-400">İçerik:</span>
                                            <div className="text-sm font-bold text-white mt-0.5">{box.media_count} Medya</div>
                                        </div>
                                        <div className="rounded-xl bg-slate-950/40 p-2.5 border border-slate-800">
                                            <span className="text-slate-400">Toplam Boyut:</span>
                                            <div className="text-sm font-bold text-indigo-400 mt-0.5">{box.total_gb} GB</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-800 flex flex-col gap-2">
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setAddMediaModalBox(box)}
                                            className="flex-1 text-center rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 py-2.5 text-xs font-bold text-indigo-300 transition-all"
                                        >
                                            + Medya Ekle
                                        </button>
                                        <button
                                            onClick={() => openRemoteModalForBox(box)}
                                            className="flex-1 text-center rounded-xl bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 py-2.5 text-xs font-bold text-emerald-300 transition-all"
                                            title="URL adresinden bu Storage Box'a doğrudan indirip yükleyin"
                                        >
                                            ☁ URL'den Çek
                                        </button>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => triggerScan(box.id)}
                                            className="flex-1 rounded-xl bg-slate-800 hover:bg-slate-700 py-2 text-xs font-semibold text-slate-300 transition-all"
                                        >
                                            Tarama Çalıştır
                                        </button>
                                        <button
                                            onClick={() => openEditModal(box)}
                                            className="px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700"
                                        >
                                            Düzenle
                                        </button>
                                        <button
                                            onClick={() => setInfoModalBox(box)}
                                            className="px-3 rounded-xl bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-semibold border border-blue-500/20"
                                            title="Mount Rehberi"
                                        >
                                            Bilgi
                                        </button>
                                        <button
                                            onClick={() => deleteBox(box)}
                                            className="px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/20"
                                        >
                                            Sil
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="col-span-full rounded-3xl bg-slate-900 border border-slate-800 p-12 text-center text-slate-400">
                            Henüz eklenmiş bir Storage Box bulunmuyor. "+ Yeni Storage Box Ekle" butonunu kullanarak sunucu adresi ve şifresiyle ekleyebilirsiniz.
                        </div>
                    )}
                </div>

                {/* Remote File Transfers Queue Section */}
                <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-800">
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h3 className="text-lg font-bold text-white tracking-tight">Uzaktan Dosya Aktarım Kuyruğu (Remote Transfers)</h3>
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                    {transfers.length} İşlem
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">Harici linklerden doğrudan Storage Box'a aktarılan dosyaların anlık durumu ve indirme hızları.</p>
                        </div>

                        <button
                            onClick={() => setRemoteModalOpen(true)}
                            className="inline-flex items-center gap-2 self-start rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-bold text-white shadow-lg transition-all"
                        >
                            + Yeni Link Ekle
                        </button>
                    </div>

                    {transfers.length > 0 ? (
                        <div className="divide-y divide-slate-800/60">
                            {transfers.map((t) => (
                                <div key={t.id} className="py-4 first:pt-0 last:pb-0 space-y-2.5">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-sm font-bold text-white break-all">{t.file_name}</span>
                                                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                                                    #{t.id}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                                                <span>📦 <strong>{t.storage_box_name}</strong></span>
                                                <span>📁 Klasör: <code className="text-indigo-300">{t.target_folder}</code></span>
                                                <span>⏱ {t.created_at}</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3 self-end sm:self-center">
                                            {/* Status Badge */}
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                                                t.status === 'completed'
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                    : t.status === 'transferring'
                                                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse'
                                                    : t.status === 'pending'
                                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                            }`}>
                                                {t.status === 'completed' && '✓ TAMAMLANDI'}
                                                {t.status === 'transferring' && `⚡ AKTARILIYOR (${t.speed_formatted})`}
                                                {t.status === 'pending' && '⏳ BEKLİYOR'}
                                                {t.status === 'failed' && '✕ HATA'}
                                                {t.status === 'cancelled' && 'İPTAL EDİLDİ'}
                                            </span>

                                            <button
                                                onClick={() => handleCancelTransfer(t.id)}
                                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 text-xs font-medium transition-all"
                                                title={t.status === 'transferring' || t.status === 'pending' ? 'İptal Et' : 'Kayıttan Sil'}
                                            >
                                                {t.status === 'transferring' || t.status === 'pending' ? 'İptal' : 'Sil'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* Progress Bar & Stats */}
                                    <div className="space-y-1">
                                        <div className="h-2 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                                            <div
                                                className={`h-full transition-all duration-500 rounded-full ${
                                                    t.status === 'completed'
                                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                                        : t.status === 'failed'
                                                        ? 'bg-rose-500'
                                                        : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                                                }`}
                                                style={{ width: `${Math.max(t.progress_percent, t.status === 'completed' ? 100 : 2)}%` }}
                                            />
                                        </div>

                                        <div className="flex justify-between items-center text-[11px] text-slate-400 font-mono">
                                            <span>
                                                {t.transferred_formatted} / {t.total_formatted} ({t.progress_percent.toFixed(1)}%)
                                            </span>
                                            {t.error_message && (
                                                <span className="text-rose-400 truncate max-w-md">{t.error_message}</span>
                                            )}
                                            {t.status === 'transferring' && (
                                                <span className="text-blue-400 font-semibold">{t.speed_formatted}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-2xl bg-slate-950/40 border border-slate-800/80 p-8 text-center text-slate-400 text-xs">
                            Şu anda aktif veya geçmiş bir uzaktan dosya aktarımı bulunmuyor. Yukarıdaki <strong>"+ URL'den İndir & Yükle"</strong> butonuna tıklayarak doğrudan film veya dizi indirebilirsiniz.
                        </div>
                    )}
                </div>

                {/* Add Storage Box Modal */}
                {addBoxModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                        <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg font-bold text-white">Yeni Storage Box Ekle</h3>
                                    <p className="text-xs text-slate-400">Hetzner sunucu adresi, kullanıcı adı ve şifresi tanımlayın.</p>
                                </div>
                                <button onClick={() => setAddBoxModal(false)} className="text-slate-400 hover:text-white font-bold">&times;</button>
                            </div>

                            <form onSubmit={handleBoxSubmit} className="space-y-4 text-xs">
                                <div>
                                    <label className="block font-semibold text-slate-300 mb-1">Storage Box Adı / Etiketi</label>
                                    <input
                                        type="text"
                                        value={boxForm.data.name}
                                        onChange={(e) => boxForm.setData('name', e.target.value)}
                                        className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-medium focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                        placeholder="Örn: Storage Box 1 - Filmler"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Sunucu Adresi / Host</label>
                                        <input
                                            type="text"
                                            value={boxForm.data.host}
                                            onChange={(e) => boxForm.setData('host', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                            placeholder="uXXXXXX.your-storagebox.de"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Kullanıcı Adı (Username)</label>
                                        <input
                                            type="text"
                                            value={boxForm.data.username}
                                            onChange={(e) => boxForm.setData('username', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                            placeholder="uXXXXXX"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Storage Box Parolası</label>
                                        <input
                                            type="password"
                                            value={boxForm.data.password}
                                            onChange={(e) => boxForm.setData('password', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                            placeholder="Şifreniz (Veritabanında şifreli saklanır)"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Port & Paylaşım Adı</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="number"
                                                value={boxForm.data.port}
                                                onChange={(e) => boxForm.setData('port', e.target.value)}
                                                className="w-20 rounded-xl bg-slate-950 border-slate-800 text-white text-xs"
                                                placeholder="445"
                                            />
                                            <input
                                                type="text"
                                                value={boxForm.data.share_name}
                                                onChange={(e) => boxForm.setData('share_name', e.target.value)}
                                                className="flex-1 rounded-xl bg-slate-950 border-slate-800 text-white text-xs"
                                                placeholder="backup"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Bağlantı Türü</label>
                                        <select
                                            value={boxForm.data.disk_type}
                                            onChange={(e) => boxForm.setData('disk_type', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                        >
                                            <option value="cifs">CIFS / SMB (Önerilen)</option>
                                            <option value="sshfs">SSHFS</option>
                                            <option value="local">Local Directory</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Mount Dizini (Sunucu Yolu)</label>
                                        <input
                                            type="text"
                                            value={boxForm.data.mount_path}
                                            onChange={(e) => boxForm.setData('mount_path', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                            placeholder="/mnt/storagebox1"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-800 flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={boxForm.processing}
                                        className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all disabled:opacity-50"
                                    >
                                        Storage Box Kaydet
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAddBoxModal(false)}
                                        className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
                                    >
                                        İptal
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Edit Storage Box Modal */}
                {editBoxModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                        <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg font-bold text-white">Storage Box Düzenle</h3>
                                    <p className="text-xs text-slate-400">{editBoxModal.name}</p>
                                </div>
                                <button onClick={() => setEditBoxModal(null)} className="text-slate-400 hover:text-white font-bold">&times;</button>
                            </div>

                            <form onSubmit={handleEditBoxSubmit} className="space-y-4 text-xs">
                                <div>
                                    <label className="block font-semibold text-slate-300 mb-1">Storage Box Adı</label>
                                    <input
                                        type="text"
                                        value={editForm.data.name}
                                        onChange={(e) => editForm.setData('name', e.target.value)}
                                        className="w-full rounded-xl bg-slate-950 border-slate-800 text-white text-xs"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Host / Sunucu</label>
                                        <input
                                            type="text"
                                            value={editForm.data.host}
                                            onChange={(e) => editForm.setData('host', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Kullanıcı Adı</label>
                                        <input
                                            type="text"
                                            value={editForm.data.username}
                                            onChange={(e) => editForm.setData('username', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono text-xs"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block font-semibold text-slate-300 mb-1">Yeni Şifre (Boş bırakırsanız mevcut şifre korunur)</label>
                                    <input
                                        type="password"
                                        value={editForm.data.password}
                                        onChange={(e) => editForm.setData('password', e.target.value)}
                                        className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono text-xs"
                                        placeholder="Mevcut şifreyi korumak için boş bırakın"
                                    />
                                </div>

                                <div>
                                    <label className="block font-semibold text-slate-300 mb-1">Mount Dizini</label>
                                    <input
                                        type="text"
                                        value={editForm.data.mount_path}
                                        onChange={(e) => editForm.setData('mount_path', e.target.value)}
                                        className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono text-xs"
                                        required
                                    />
                                </div>

                                <div className="pt-4 border-t border-slate-800 flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={editForm.processing}
                                        className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 transition-all disabled:opacity-50"
                                    >
                                        Güncelle
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditBoxModal(null)}
                                        className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
                                    >
                                        İptal
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Storage Box Linux Mount Info Modal */}
                {infoModalBox && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                        <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg font-bold text-white">Linux Mount Komutu</h3>
                                    <p className="text-xs text-slate-400">{infoModalBox.name}</p>
                                </div>
                                <button onClick={() => setInfoModalBox(null)} className="text-slate-400 hover:text-white font-bold">&times;</button>
                            </div>

                            <div className="space-y-3 text-xs">
                                <p className="text-slate-300">
                                    Hetzner Storage Box'ınızı Linux sunucunuzda `/etc/fstab` ile otomatik bağlamak için aşağıdaki komutları kullanabilirsiniz:
                                </p>

                                <div className="rounded-xl bg-slate-950 p-4 border border-slate-800 font-mono text-[11px] text-emerald-400 space-y-2 select-all overflow-x-auto">
                                    <div># Credential Dosyası:</div>
                                    <div>username={infoModalBox.username || 'uXXXXXX'}</div>
                                    <div>password=YOUR_PASSWORD</div>
                                    <br />
                                    <div># /etc/fstab Satırı:</div>
                                    <div>//{infoModalBox.host || 'uXXXXXX.your-storagebox.de'}/{infoModalBox.share_name || 'backup'} {infoModalBox.mount_path} cifs credentials=/etc/storagebox/credentials,iocharset=utf8,rw,uid=www-data,gid=www-data 0 0</div>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-slate-800 flex justify-end">
                                <button
                                    onClick={() => setInfoModalBox(null)}
                                    className="rounded-xl bg-slate-800 px-6 py-2.5 text-xs font-semibold text-white"
                                >
                                    Kapat
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Add Film or Series into Specific Storage Box Modal */}
                {addMediaModalBox && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                        <div className="w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg font-bold text-white">Film veya Dizi Ekle</h3>
                                    <p className="text-xs text-indigo-400 font-semibold">{addMediaModalBox.name} ({addMediaModalBox.mount_path})</p>
                                </div>
                                <button onClick={() => setAddMediaModalBox(null)} className="text-slate-400 hover:text-white font-bold">&times;</button>
                            </div>

                            <form onSubmit={handleMediaSubmit} className="space-y-4 text-xs">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Medya Türü</label>
                                        <select
                                            value={mediaForm.data.type}
                                            onChange={(e) => mediaForm.setData('type', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                        >
                                            <option value="movie">Film</option>
                                            <option value="series">Dizi / Bölüm</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Yapım Yılı</label>
                                        <input
                                            type="number"
                                            value={mediaForm.data.year}
                                            onChange={(e) => mediaForm.setData('year', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block font-semibold text-slate-300 mb-1">Medya Başlığı</label>
                                    <input
                                        type="text"
                                        value={mediaForm.data.title}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            mediaForm.setData({
                                                ...mediaForm.data,
                                                title: val,
                                                file_name: mediaForm.data.file_name || `${val.replace(/\s+/g, '.')}.mkv`,
                                            });
                                        }}
                                        className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-medium focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                        placeholder="Örn: Inception"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block font-semibold text-slate-300 mb-1">Dosya Adı</label>
                                    <input
                                        type="text"
                                        value={mediaForm.data.file_name}
                                        onChange={(e) => mediaForm.setData('file_name', e.target.value)}
                                        className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                        placeholder="Inception.2010.1080p.mkv"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Alt Klasör (İsteğe Bağlı)</label>
                                        <input
                                            type="text"
                                            value={mediaForm.data.sub_folder}
                                            onChange={(e) => mediaForm.setData('sub_folder', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                            placeholder="Filmler veya Diziler/The Wire"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Dosya Boyutu (MB)</label>
                                        <input
                                            type="number"
                                            value={mediaForm.data.size_mb}
                                            onChange={(e) => mediaForm.setData('size_mb', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                            min="1"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-slate-800 flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={mediaForm.processing}
                                        className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 hover:scale-105 transition-all disabled:opacity-50"
                                    >
                                        Storage Box'a Ekle
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAddMediaModalBox(null)}
                                        className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
                                    >
                                        İptal
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Remote URL Download & Upload Modal */}
                {remoteModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
                        <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        <span className="text-emerald-400">☁</span> URL'den İndir & Storage Box'a Yükle
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-1">Harici bir web indirme linkini (örneğin uhdfilmindir.com) doğrudan Storage Box'a aktarın.</p>
                                </div>
                                <button onClick={() => setRemoteModalOpen(false)} className="text-slate-400 hover:text-white font-bold text-lg">&times;</button>
                            </div>

                            <form onSubmit={handleRemoteSubmit} className="space-y-4 text-xs">
                                <div>
                                    <label className="block font-semibold text-slate-300 mb-1">Kaynak İndirme Linki (URL)</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="url"
                                            value={remoteForm.data.source_url}
                                            onChange={(e) => remoteForm.setData('source_url', e.target.value)}
                                            className="flex-1 rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-emerald-500 focus:ring-emerald-500 text-xs"
                                            placeholder="https://cloud.uhdfilmindir.com/..."
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={handleProbeUrl}
                                            disabled={probing || !remoteForm.data.source_url}
                                            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 font-bold border border-emerald-500/30 transition-all disabled:opacity-50"
                                        >
                                            {probing ? 'Taranıyor...' : 'Algıla'}
                                        </button>
                                    </div>
                                    <span className="text-[11px] text-slate-500 mt-1 block">"Algıla" butonuna basarak dosya adı ve boyutunu linkten otomatik çekebilirsiniz.</span>
                                </div>

                                {probeResult && (
                                    <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/20 p-3.5 space-y-1.5 font-mono text-xs">
                                        <div className="text-emerald-300 font-bold">✓ Dosya Bilgileri Tespit Edildi:</div>
                                        <div className="text-slate-300">Boyut: <strong className="text-white">{probeResult.file_size_formatted}</strong></div>
                                        <div className="text-slate-300">Önerilen Tür: <strong className="text-indigo-300 uppercase">{probeResult.suggested_type}</strong></div>
                                    </div>
                                )}

                                <div>
                                    <label className="block font-semibold text-slate-300 mb-1">Kaydedilecek Dosya Adı</label>
                                    <input
                                        type="text"
                                        value={remoteForm.data.file_name}
                                        onChange={(e) => remoteForm.setData('file_name', e.target.value)}
                                        className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-emerald-500 focus:ring-emerald-500 text-xs"
                                        placeholder="Örn: Christy.2025.1080p.WEB-DL.mkv"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Hedef Storage Box</label>
                                        <select
                                            value={remoteForm.data.storage_box_id}
                                            onChange={(e) => remoteForm.setData('storage_box_id', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white focus:border-emerald-500 focus:ring-emerald-500 text-xs"
                                            required
                                        >
                                            {boxes.map((b) => (
                                                <option key={b.id} value={b.id}>
                                                    {b.name} ({b.host || 'Yerel Mount'})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Hedef Klasör</label>
                                        <input
                                            type="text"
                                            value={remoteForm.data.target_folder}
                                            onChange={(e) => remoteForm.setData('target_folder', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white focus:border-emerald-500 focus:ring-emerald-500 text-xs"
                                            placeholder="Filmler veya Diziler/Game of Thrones/Season 01"
                                            required
                                        />
                                    </div>
                                </div>

                                <div className="rounded-xl bg-slate-950/60 p-3 border border-slate-800 flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        id="auto_add_media"
                                        checked={remoteForm.data.auto_add_media}
                                        onChange={(e) => remoteForm.setData('auto_add_media', e.target.checked)}
                                        className="rounded bg-slate-900 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <label htmlFor="auto_add_media" className="text-slate-300 cursor-pointer">
                                        <strong>Medya Kütüphanesine Otomatik Ekle:</strong> Dosya indiğinde doğrudan film/dizi listenize eklensin ve kullanıcılar indirebilsin.
                                    </label>
                                </div>

                                <div className="pt-4 border-t border-slate-800 flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={remoteForm.processing || !remoteForm.data.file_name}
                                        className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 hover:scale-105 transition-all disabled:opacity-50"
                                    >
                                        {remoteForm.processing ? 'Başlatılıyor...' : '🚀 İndirme & Yüklemeyi Başlat'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setRemoteModalOpen(false)}
                                        className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
                                    >
                                        İptal
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
