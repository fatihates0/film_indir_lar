import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, usePage } from '@inertiajs/react';
import { useState } from 'react';

export default function MediaAdminIndex({ media, storageBoxes = [] }) {
    const flash = usePage().props.flash;

    // Modal state
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [selectedBox, setSelectedBox] = useState(null);
    const [currentPath, setCurrentPath] = useState('');
    const [browseLoading, setBrowseLoading] = useState(false);
    const [browseData, setBrowseData] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);

    // Form state for confirming addition
    const [addForm, setAddForm] = useState({
        storage_box_id: '',
        file_path: '',
        title: '',
        type: 'movie',
        year: '',
    });
    const [probing, setProbing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [scanning, setScanning] = useState(false);

    const openPicker = () => {
        setIsPickerOpen(true);
        setSelectedBox(null);
        setBrowseData(null);
        setSelectedFile(null);
        setCurrentPath('');
    };

    const closePicker = () => {
        setIsPickerOpen(false);
        setSelectedBox(null);
        setBrowseData(null);
        setSelectedFile(null);
    };

    const selectBox = (box) => {
        setSelectedBox(box);
        fetchDirectory(box.id, '');
    };

    const fetchDirectory = (boxId, path) => {
        setBrowseLoading(true);
        setCurrentPath(path);
        fetch(route('admin.storage-boxes.browse', { storage_box: boxId, path: path }))
            .then((res) => res.json())
            .then((data) => {
                if (data.status === 'success') {
                    setBrowseData(data);
                } else {
                    alert(data.message || 'Klasör yüklenemedi.');
                }
            })
            .catch(() => alert('Klasör yüklenirken hata oluştu.'))
            .finally(() => setBrowseLoading(false));
    };

    const handleSelectFile = (file) => {
        setSelectedFile(file);
        setProbing(true);

        setAddForm({
            storage_box_id: selectedBox.id,
            file_path: file.relative_path,
            title: file.name.replace(/\.[^/.]+$/, ''),
            type: file.relative_path.toLowerCase().includes('diziler') || /s\d+e\d+/i.test(file.name) ? 'episode' : 'movie',
            year: '',
            file_size: file.size_bytes || 0,
        });

        fetch(route('admin.media.probe'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
            body: JSON.stringify({
                storage_box_id: selectedBox.id,
                file_path: file.relative_path,
            }),
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.status === 'success') {
                    setAddForm((prev) => ({
                        ...prev,
                        title: data.title || prev.title,
                        type: data.type || prev.type,
                        year: data.year || prev.year || '',
                    }));
                }
            })
            .finally(() => setProbing(false));
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        setSubmitting(true);

        router.post(route('admin.media.store'), addForm, {
            onSuccess: () => {
                setSubmitting(false);
                setSelectedFile(null);
                fetchDirectory(selectedBox.id, currentPath);
            },
            onError: () => setSubmitting(false),
        });
    };

    const toggleActive = (id) => {
        router.patch(route('admin.media.toggle', id));
    };

    const deleteMedia = (id, title) => {
        if (confirm(`"${title}" medyasını kütüphaneden silmek istediğinize emin misiniz?`)) {
            router.delete(route('admin.media.destroy', id));
        }
    };

    const triggerScan = () => {
        setScanning(true);
        router.post(route('admin.media.scan'), {}, {
            onFinish: () => setScanning(false),
        });
    };

    return (
        <AuthenticatedLayout
            header={
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Medya & Depolama Yönetimi</h2>
                        <p className="text-sm text-slate-400 mt-1">Storage Box üzerindeki dosyaları seçip kütüphaneye ekleyin veya yönetin.</p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={openPicker}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 hover:scale-105 transition-all"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                            </svg>
                            Dosya Seç & Medya Ekle
                        </button>

                        <button
                            onClick={triggerScan}
                            disabled={scanning}
                            className="inline-flex items-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2.5 text-xs font-semibold text-slate-300 border border-slate-700 transition-all disabled:opacity-50"
                        >
                            {scanning ? 'Taranıyor...' : 'Otomatik Tarama'}
                        </button>
                    </div>
                </div>
            }
        >
            <Head title="Medya Yönetimi - MedyaHub" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
                {flash?.message && (
                    <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-sm text-emerald-300 flex items-center justify-between">
                        <span>{flash.message}</span>
                    </div>
                )}

                <div className="rounded-3xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                        <h3 className="text-lg font-bold text-white">Ekli Medya Kütüphanesi</h3>
                        <span className="text-xs font-semibold text-slate-400">Toplam {media.total || media.data.length} İçerik</span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-300">
                            <thead className="bg-slate-950/80 text-xs font-semibold uppercase text-slate-400 border-b border-slate-800">
                                <tr>
                                    <th className="px-6 py-4">Başlık</th>
                                    <th className="px-6 py-4">Storage Box</th>
                                    <th className="px-6 py-4">Tür</th>
                                    <th className="px-6 py-4">Dosya Yolu</th>
                                    <th className="px-6 py-4">Boyut</th>
                                    <th className="px-6 py-4">Durum</th>
                                    <th className="px-6 py-4 text-right">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {media.data.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-6 py-12 text-center text-slate-500">
                                            Henüz eklenmiş medya bulunmuyor. Yukarıdaki "Dosya Seç & Medya Ekle" butonunu kullanarak ekleyebilirsiniz.
                                        </td>
                                    </tr>
                                ) : (
                                    media.data.map((m) => (
                                        <tr key={m.id} className="hover:bg-slate-800/40 transition-colors">
                                            <td className="px-6 py-4 font-bold text-white">
                                                {m.title} {m.year && `(${m.year})`}
                                            </td>
                                            <td className="px-6 py-4 text-xs text-indigo-400 font-semibold">
                                                {m.storage_box?.name || 'Varsayılan'}
                                            </td>
                                            <td className="px-6 py-4 text-xs font-semibold uppercase">
                                                <span className={`px-2 py-0.5 rounded text-[11px] ${
                                                    m.type === 'movie' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                                }`}>
                                                    {m.type === 'movie' ? 'FILM' : 'DIZI BOLUMU'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-xs font-mono text-slate-400 max-w-xs truncate" title={m.file_path}>
                                                {m.file_path}
                                            </td>
                                            <td className="px-6 py-4 text-xs font-semibold text-emerald-400">
                                                {(m.file_size / 1073741824).toFixed(2)} GB
                                            </td>
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => toggleActive(m.id)}
                                                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                                        m.is_active
                                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                            : 'bg-slate-800 text-slate-400 border-slate-700'
                                                    }`}
                                                >
                                                    {m.is_active ? 'AKTİF' : 'PASİF'}
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 text-right space-x-2">
                                                <button
                                                    onClick={() => deleteMedia(m.id, m.title)}
                                                    className="px-2.5 py-1 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-all"
                                                >
                                                    Sil
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Dosya Seçim & Medya Ekle Modalı */}
            {isPickerOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
                    <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        {/* Modal Header */}
                        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-white">Storage Box Dosya Seçici</h3>
                                <p className="text-xs text-slate-400">Storage Box içerisindeki medya dosyasını seçerek kütüphaneye ekleyin.</p>
                            </div>
                            <button
                                onClick={closePicker}
                                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto flex-1 space-y-6">
                            {!selectedBox ? (
                                /* Step 1: Storage Box Seçimi */
                                <div className="space-y-4">
                                    <h4 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Storage Box Seçin:</h4>
                                    {storageBoxes.length === 0 ? (
                                        <div className="p-8 text-center bg-slate-950/50 rounded-2xl border border-slate-800 text-slate-400">
                                            Aktif Storage Box bulunamadı. Lütfen önce Storage Box ekleyin.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {storageBoxes.map((box) => (
                                                <button
                                                    key={box.id}
                                                    onClick={() => selectBox(box)}
                                                    className="flex items-center justify-between p-5 bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-indigo-500/50 rounded-2xl text-left transition-all group"
                                                >
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-white group-hover:text-indigo-400 transition-colors">{box.name}</span>
                                                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                box.status === 'online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                                            }`}>
                                                                {box.status}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-400 mt-1 font-mono truncate max-w-xs">{box.mount_path}</p>
                                                    </div>
                                                    <span className="text-indigo-400 font-semibold text-xs group-hover:translate-x-1 transition-transform">Gözat →</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : selectedFile ? (
                                /* Step 3: Bilgi Onay Formu */
                                <form onSubmit={handleFormSubmit} className="space-y-6">
                                    <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl flex items-center justify-between">
                                        <div>
                                            <span className="text-xs text-indigo-300 font-semibold uppercase">Seçilen Dosya:</span>
                                            <p className="text-sm font-bold text-white mt-0.5 font-mono">{selectedFile.relative_path}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedFile(null)}
                                            className="text-xs text-slate-400 hover:text-white underline"
                                        >
                                            Değiştir
                                        </button>
                                    </div>

                                    {probing && (
                                        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300">
                                            Dosya bilgileri ve çözünürlük/kodlama taranıyor...
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 mb-1">Medya Başlığı</label>
                                            <input
                                                type="text"
                                                required
                                                value={addForm.title}
                                                onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 mb-1">Medya Türü</label>
                                            <select
                                                value={addForm.type}
                                                onChange={(e) => setAddForm({ ...addForm, type: e.target.value })}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                                            >
                                                <option value="movie">Film</option>
                                                <option value="episode">Dizi Bölümü</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 mb-1">Yapım Yılı (Opsiyonel)</label>
                                            <input
                                                type="number"
                                                placeholder="ör. 2024"
                                                value={addForm.year}
                                                onChange={(e) => setAddForm({ ...addForm, year: e.target.value })}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 mb-1">Dosya Boyutu</label>
                                            <input
                                                type="text"
                                                disabled
                                                value={selectedFile.size_formatted}
                                                className="w-full bg-slate-950/50 border border-slate-800/80 rounded-xl px-4 py-2.5 text-sm text-slate-400 cursor-not-allowed"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedFile(null)}
                                            className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                                        >
                                            Geri Dön
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-sm font-semibold text-white shadow-lg hover:scale-105 transition-all disabled:opacity-50"
                                        >
                                            {submitting ? 'Ekleniyor...' : 'Kütüphaneye Ekle'}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                /* Step 2: Dosya & Klasör Gezgini */
                                <div className="space-y-4">
                                    {/* Navigation Bar */}
                                    <div className="flex items-center justify-between bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs">
                                        <div className="flex items-center gap-2 truncate">
                                            <button
                                                onClick={() => setSelectedBox(null)}
                                                className="font-bold text-indigo-400 hover:underline"
                                            >
                                                {selectedBox.name}
                                            </button>
                                            <span className="text-slate-600">/</span>
                                            <span className="font-mono text-slate-300 truncate">
                                                {currentPath || 'Kök Dizin'}
                                            </span>
                                        </div>

                                        {currentPath && (
                                            <button
                                                onClick={() => fetchDirectory(selectedBox.id, browseData?.parent_path || '')}
                                                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition-colors"
                                            >
                                                ⬆️ Üst Klasör
                                            </button>
                                        )}
                                    </div>

                                    {browseLoading ? (
                                        <div className="p-12 text-center text-slate-400 space-y-2">
                                            <div className="animate-spin inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full"></div>
                                            <p className="text-xs">Storage Box içeriği taranıyor...</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {/* Directories */}
                                            {browseData?.directories?.length > 0 && (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                    {browseData.directories.map((dir) => (
                                                        <button
                                                            key={dir.relative_path}
                                                            onClick={() => fetchDirectory(selectedBox.id, dir.relative_path)}
                                                            className="flex items-center gap-3 p-3 bg-slate-950 hover:bg-slate-800/60 border border-slate-800/80 hover:border-slate-700 rounded-xl text-left transition-all text-xs font-semibold text-slate-200"
                                                        >
                                                            <span className="text-lg">📁</span>
                                                            <span className="truncate">{dir.name}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Files */}
                                            {browseData?.files?.length > 0 && (
                                                <div className="divide-y divide-slate-800/50 border border-slate-800 rounded-2xl overflow-hidden bg-slate-950">
                                                    {browseData.files.map((file) => (
                                                        <div
                                                            key={file.relative_path}
                                                            className="flex items-center justify-between p-3 hover:bg-slate-800/40 transition-colors text-xs"
                                                        >
                                                            <div className="flex items-center gap-3 truncate pr-4">
                                                                <span className="text-base">🎬</span>
                                                                <div>
                                                                    <p className="font-bold text-slate-200 truncate">{file.name}</p>
                                                                    <p className="text-[11px] text-slate-500 mt-0.5">{file.size_formatted}</p>
                                                                </div>
                                                            </div>

                                                            {file.is_added ? (
                                                                <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/20">
                                                                    ✓ Ekli
                                                                </span>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleSelectFile(file)}
                                                                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-all shadow-md shadow-indigo-600/20"
                                                                >
                                                                    + Seç & Ekle
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {browseData?.directories?.length === 0 && browseData?.files?.length === 0 && (
                                                <div className="p-12 text-center text-slate-500 text-xs">
                                                    Bu klasörde gösterilecek video dosyası veya alt klasör bulunamadı.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </AuthenticatedLayout>
    );
}
