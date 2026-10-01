import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { Fragment, useState } from 'react';

export default function MediaAdminIndex({ media, storageBoxes = [], filters = {} }) {
    const flash = usePage().props.flash;

    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [perPage, setPerPage] = useState(filters.per_page || '15');
    const [expandedGroups, setExpandedGroups] = useState({});

    const toggleGroupExpand = (id) => {
        setExpandedGroups((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        router.get(route('admin.media.index'), { search: searchQuery, per_page: perPage }, { preserveState: true, replace: true });
    };

    const handlePerPageChange = (e) => {
        const val = e.target.value;
        setPerPage(val);
        router.get(route('admin.media.index'), { search: searchQuery, per_page: val }, { preserveState: true, replace: true });
    };

    // Modal & Picker state
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const [selectedBox, setSelectedBox] = useState(null);
    const [currentPath, setCurrentPath] = useState('');
    const [browseLoading, setBrowseLoading] = useState(false);
    const [browseData, setBrowseData] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);

    // TMDB Search State
    const [tmdbQuery, setTmdbQuery] = useState('');
    const [tmdbResults, setTmdbResults] = useState([]);
    const [searchingTmdb, setSearchingTmdb] = useState(false);
    const [selectedTmdb, setSelectedTmdb] = useState(null);

    // Form state for confirming addition
    const [addForm, setAddForm] = useState({
        storage_box_id: '',
        file_path: '',
        title: '',
        type: 'movie',
        year: '',
        tmdb_id: '',
    });

    const [probing, setProbing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [syncingAll, setSyncingAll] = useState(false);
    const [syncingId, setSyncingId] = useState(null);

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
        setSelectedTmdb(null);
        setTmdbResults([]);
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

        const defaultTitle = file.name.replace(/\.[^/.]+$/, '');
        const defaultType = file.relative_path.toLowerCase().includes('diziler') || /s\d+e\d+/i.test(file.name) ? 'episode' : 'movie';

        setAddForm({
            storage_box_id: selectedBox.id,
            file_path: file.relative_path,
            title: defaultTitle,
            type: defaultType,
            year: '',
            file_size: file.size_bytes || 0,
            tmdb_id: '',
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
                    if (data.tmdb_matches && data.tmdb_matches.length > 0) {
                        setTmdbResults(data.tmdb_matches);
                    }
                }
            })
            .finally(() => setProbing(false));
    };

    const searchTmdb = () => {
        if (!tmdbQuery || tmdbQuery.length < 2) return;
        setSearchingTmdb(true);
        fetch(route('admin.media.tmdb-search') + `?query=${encodeURIComponent(tmdbQuery)}&type=${addForm.type}`)
            .then((res) => res.json())
            .then((data) => {
                if (data.status === 'success') {
                    setTmdbResults(data.results || []);
                }
            })
            .finally(() => setSearchingTmdb(false));
    };

    const selectTmdbCandidate = (item) => {
        setSelectedTmdb(item);
        const title = item.title || item.name;
        const releaseDate = item.release_date || item.first_air_date;
        const year = releaseDate ? releaseDate.substring(0, 4) : addForm.year;

        setAddForm((prev) => ({
            ...prev,
            title: title,
            year: year,
            tmdb_id: item.id,
        }));
    };

    const handleFormSubmit = (e) => {
        e.preventDefault();
        setSubmitting(true);

        router.post(route('admin.media.store'), addForm, {
            onSuccess: () => {
                setSubmitting(false);
                setSelectedFile(null);
                setSelectedTmdb(null);
                fetchDirectory(selectedBox.id, currentPath);
            },
            onError: () => setSubmitting(false),
        });
    };

    const syncTmdbSingle = (id) => {
        setSyncingId(id);
        router.post(route('admin.media.tmdb-sync', id), {}, {
            onFinish: () => setSyncingId(null),
        });
    };

    const syncAllTmdb = () => {
        setSyncingAll(true);
        router.post(route('admin.media.tmdb-sync-all'), {}, {
            onFinish: () => setSyncingAll(false),
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
                        <h2 className="text-2xl font-black text-white tracking-tight">İçerik & TMDB Yönetimi</h2>
                        <p className="text-xs text-slate-400 mt-1">Filmleri ve dizileri TMDB entegrasyonu ile otomatik veya manuel ekleyin.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        <button
                            onClick={openPicker}
                            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-semibold text-white shadow-md hover:scale-[1.02] transition-all"
                        >
                            Dosya Seç & Medya Ekle
                        </button>

                        <button
                            onClick={syncAllTmdb}
                            disabled={syncingAll}
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white transition-all disabled:opacity-50"
                        >
                            {syncingAll ? 'TMDB Eşitleniyor...' : 'Tüm TMDB Bilgilerini Çek'}
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
            <Head title="İçerik Yönetimi - CINEMAFLIX Admin" />

            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
                {flash?.message && (
                    <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-xs text-emerald-300 flex items-center justify-between shadow-lg">
                        <span>{flash.message}</span>
                    </div>
                )}

                {/* Media Management Table */}
                <div className="rounded-3xl bg-[#0f1422] border border-slate-800 overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-base font-bold text-white">Kütüphanedeki Tüm Medyalar</h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {media.from && media.to
                                    ? `${media.from} - ${media.to} arası gösteriliyor (${media.total} toplam içerik)`
                                    : `Toplam ${media.total || media.data.length} İçerik`}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="İçerik veya dosya adı ara..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-48 md:w-64"
                                />
                                <button type="submit" className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold">
                                    Ara
                                </button>
                            </form>
                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <span>Göster:</span>
                                <select
                                    value={perPage}
                                    onChange={handlePerPageChange}
                                    className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                                >
                                    <option value="15">15 / sayfa</option>
                                    <option value="30">30 / sayfa</option>
                                    <option value="50">50 / sayfa</option>
                                    <option value="100">100 / sayfa</option>
                                    <option value="all">Tümü ({media.total || media.data.length})</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs text-slate-300">
                            <thead className="bg-slate-950/80 text-[11px] font-semibold uppercase text-slate-400 border-b border-slate-800">
                                <tr>
                                    <th className="px-4 py-3.5">Afiş & Başlık</th>
                                    <th className="px-4 py-3.5">TMDB Durum</th>
                                    <th className="px-4 py-3.5">Tür</th>
                                    <th className="px-4 py-3.5">Storage Box</th>
                                    <th className="px-4 py-3.5">Boyut</th>
                                    <th className="px-4 py-3.5">Durum</th>
                                    <th className="px-4 py-3.5 text-right">İşlemler</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60">
                                {media.data.length === 0 ? (
                                    <tr>
                                        <td colSpan="7" className="px-6 py-12 text-center text-slate-500">
                                            Kütüphanenizde henüz medya bulunmuyor. "Dosya Seç & Medya Ekle" butonundan ekleyebilirsiniz.
                                        </td>
                                    </tr>
                                ) : (
                                    media.data.map((m) => {
                                        const isExpanded = !!expandedGroups[m.id];
                                        const versions = m.versions || [];
                                        const versionsCount = m.group_info?.versions_count || versions.length || 1;
                                        const totalSizeGb = m.group_info?.total_size_bytes
                                            ? (m.group_info.total_size_bytes / 1073741824).toFixed(2)
                                            : (m.file_size / 1073741824).toFixed(2);
                                        const qualities = m.group_info?.qualities || [];

                                        return (
                                            <Fragment key={m.id}>
                                                <tr
                                                    onClick={() => toggleGroupExpand(m.id)}
                                                    className={`hover:bg-slate-800/40 transition-colors cursor-pointer border-b border-slate-800/50 ${
                                                        isExpanded ? 'bg-slate-900/80' : ''
                                                    }`}
                                                >
                                                    {/* İçerik Başlığı & Detay */}
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleGroupExpand(m.id);
                                                                }}
                                                                className="text-slate-400 hover:text-white transition-colors p-1"
                                                            >
                                                                <svg
                                                                    className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-indigo-400' : ''}`}
                                                                    fill="none"
                                                                    stroke="currentColor"
                                                                    viewBox="0 0 24 24"
                                                                >
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                                                                </svg>
                                                            </button>

                                                            {m.poster_url ? (
                                                                <img src={m.poster_url} alt="" className="w-9 h-13 object-cover rounded-md border border-slate-800 shrink-0" />
                                                            ) : (
                                                                <div className="w-9 h-13 rounded-md bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600 text-xs shrink-0">?</div>
                                                            )}

                                                            <div>
                                                                <div className="font-semibold text-white text-sm">
                                                                    {m.title} {m.year && <span className="text-slate-400 font-normal">({m.year})</span>}
                                                                </div>
                                                                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                                                                    <span>{versionsCount} Sürüm</span>
                                                                    {qualities.length > 0 && (
                                                                        <>
                                                                            <span>•</span>
                                                                            <span className="text-slate-300">{qualities.join(', ')}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* TMDB Status */}
                                                    <td className="px-4 py-3">
                                                        {m.tmdb_id ? (
                                                            <span className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                                                {m.vote_average ? `★ ${m.vote_average.toFixed(1)}` : 'Eşleşti'}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                                                TMDB Eksik
                                                            </span>
                                                        )}
                                                    </td>

                                                    {/* Tür */}
                                                    <td className="px-4 py-3 text-xs text-slate-300 font-medium">
                                                        {m.type === 'movie' || !m.group_info?.is_series ? 'Film' : 'Dizi'}
                                                    </td>

                                                    {/* Storage Box */}
                                                    <td className="px-4 py-3 text-xs text-slate-400">
                                                        {m.storage_box?.name || (versions[0]?.storage_box?.name ?? 'Storage Box')}
                                                    </td>

                                                    {/* Boyut */}
                                                    <td className="px-4 py-3 text-xs font-semibold text-emerald-400">
                                                        {totalSizeGb} GB
                                                    </td>

                                                    {/* Durum */}
                                                    <td className="px-4 py-3">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleActive(m.id);
                                                            }}
                                                            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                                                                m.is_active
                                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                                                            }`}
                                                        >
                                                            {m.is_active ? 'Aktif' : 'Pasif'}
                                                        </button>
                                                    </td>

                                                    {/* İşlemler */}
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex items-center justify-end gap-3">
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleGroupExpand(m.id);
                                                                }}
                                                                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                                                            >
                                                                {isExpanded ? 'Gizle' : `Sürümler (${versionsCount})`}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    syncTmdbSingle(m.id);
                                                                }}
                                                                disabled={syncingId === m.id}
                                                                className="text-xs text-slate-300 hover:text-white font-medium"
                                                            >
                                                                {syncingId === m.id ? 'Yükleniyor...' : 'TMDB'}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    deleteMedia(m.id, m.title);
                                                                }}
                                                                className="text-xs text-slate-400 hover:text-rose-400 font-medium transition-colors"
                                                            >
                                                                Sil
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>

                                                {/* NESTED VERSIONS LIST - FLUSH & SEAMLESS */}
                                                {isExpanded && (
                                                    <tr className="bg-slate-950/90">
                                                        <td colSpan="7" className="p-0">
                                                            <div className="bg-slate-950/80 border-b border-slate-800 divide-y divide-slate-800/40">
                                                                {versions.map((ver) => (
                                                                    <div
                                                                        key={ver.id}
                                                                        className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-900/60 transition-colors text-xs"
                                                                    >
                                                                        {/* File Name & Quality Badge */}
                                                                        <div className="flex items-center gap-3 min-w-0 flex-1 pl-6">
                                                                            <span className="text-slate-600 text-xs font-mono select-none">└</span>
                                                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shrink-0">
                                                                                {ver.quality_label}
                                                                            </span>
                                                                            <span className="font-mono text-slate-300 truncate text-[11px]" title={ver.file_name}>
                                                                                {ver.file_name}
                                                                            </span>
                                                                        </div>

                                                                        {/* Metadata & Actions Right Aligned */}
                                                                        <div className="flex items-center gap-6 shrink-0 text-slate-400">
                                                                            <span className="text-slate-400 text-xs">{ver.storage_box?.name || 'Storage Box'}</span>

                                                                            <span className="font-mono font-semibold text-emerald-400 text-xs w-20 text-right">
                                                                                {(ver.file_size / 1073741824).toFixed(2)} GB
                                                                            </span>

                                                                            <button
                                                                                type="button"
                                                                                onClick={() => toggleActive(ver.id)}
                                                                                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                                                                                    ver.is_active
                                                                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                                                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                                                                                }`}
                                                                            >
                                                                                {ver.is_active ? 'Aktif' : 'Pasif'}
                                                                            </button>

                                                                            <div className="flex items-center gap-3 w-24 justify-end">
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => syncTmdbSingle(ver.id)}
                                                                                    disabled={syncingId === ver.id}
                                                                                    className="text-xs text-slate-300 hover:text-white font-medium"
                                                                                >
                                                                                    {syncingId === ver.id ? '...' : 'TMDB'}
                                                                                </button>

                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => deleteMedia(ver.id, ver.file_name)}
                                                                                    className="text-xs text-slate-400 hover:text-rose-400 font-medium transition-colors"
                                                                                >
                                                                                    Sil
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Links */}
                    {media.links && media.links.length > 3 && (
                        <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-950/40 text-xs text-slate-400">
                            <div>
                                Sayfa <span className="font-bold text-white">{media.current_page}</span> / <span className="font-bold text-white">{media.last_page}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {media.links.map((link, idx) => (
                                    <Link
                                        key={idx}
                                        href={link.url || '#'}
                                        preserveScroll
                                        dangerouslySetInnerHTML={{ __html: link.label }}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                            link.active
                                                ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30'
                                                : link.url
                                                ? 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                                                : 'bg-slate-900/50 text-slate-600 cursor-not-allowed pointer-events-none'
                                        }`}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Storage Box & TMDB Selection Modal */}
            {isPickerOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="w-full max-w-4xl bg-[#121724] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        {/* Modal Header */}
                        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-bold text-white">Storage Box & TMDB Medya Ekle</h3>
                                <p className="text-xs text-slate-400">Medya dosyasını seçip TMDB bilgilerini otomatik eşleyin.</p>
                            </div>
                            <button onClick={closePicker} className="text-slate-400 hover:text-white font-bold text-xl">✕</button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto flex-1 space-y-6">
                            {!selectedBox ? (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">1. Storage Box Seçin:</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {storageBoxes.map((box) => (
                                            <button
                                                key={box.id}
                                                onClick={() => selectBox(box)}
                                                className="flex items-center justify-between p-5 bg-slate-950 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-2xl text-left transition-all group"
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
                                </div>
                            ) : selectedFile ? (
                                /* Step 3: TMDB Search & Form Confirmation */
                                <form onSubmit={handleFormSubmit} className="space-y-6">
                                    <div className="p-4 bg-indigo-600/10 border border-indigo-500/30 rounded-2xl flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] text-indigo-300 font-bold uppercase tracking-wider">Seçilen Dosya</span>
                                            <p className="text-xs font-bold text-white mt-0.5 font-mono">{selectedFile.relative_path}</p>
                                        </div>
                                        <button type="button" onClick={() => setSelectedFile(null)} className="text-xs text-slate-400 hover:text-white underline">Değiştir</button>
                                    </div>

                                    {/* TMDB Candidate Autocomplete Section */}
                                    <div className="space-y-3 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                                        <div className="flex items-center justify-between">
                                            <label className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                                                <span>🎬</span> TMDB Otomatik Eşleştirme Önerileri
                                            </label>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="TMDB'de Ara..."
                                                    value={tmdbQuery || addForm.title}
                                                    onChange={(e) => setTmdbQuery(e.target.value)}
                                                    className="bg-slate-900 border-slate-800 text-xs px-3 py-1.5 rounded-xl text-white"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={searchTmdb}
                                                    disabled={searchingTmdb}
                                                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
                                                >
                                                    {searchingTmdb ? '⌛' : 'Ara'}
                                                </button>
                                            </div>
                                        </div>

                                        {tmdbResults.length > 0 && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                                                {tmdbResults.map((item) => (
                                                    <div
                                                        key={item.id}
                                                        onClick={() => selectTmdbCandidate(item)}
                                                        className={`p-2.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${
                                                            addForm.tmdb_id === item.id
                                                                ? 'bg-indigo-600/20 border-indigo-500 ring-2 ring-indigo-500/50'
                                                                : 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                                        }`}
                                                    >
                                                        {item.poster_path ? (
                                                            <img src={`https://image.tmdb.org/t/p/w92${item.poster_path}`} alt="" className="w-9 h-12 object-cover rounded-md" />
                                                        ) : (
                                                            <div className="w-9 h-12 bg-slate-800 rounded-md flex items-center justify-center text-xs">🎬</div>
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="font-bold text-white text-xs truncate">{item.title || item.name}</div>
                                                            <div className="text-[10px] text-slate-400">
                                                                {item.release_date || item.first_air_date || 'N/A'} • ★ {item.vote_average || 'N/A'}
                                                            </div>
                                                        </div>
                                                        {addForm.tmdb_id === item.id && <span className="text-emerald-400 font-bold text-xs">✓ Seçildi</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Manual Fields */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 mb-1">Medya Başlığı</label>
                                            <input
                                                type="text"
                                                required
                                                value={addForm.title}
                                                onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 mb-1">Medya Türü</label>
                                            <select
                                                value={addForm.type}
                                                onChange={(e) => setAddForm({ ...addForm, type: e.target.value })}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white"
                                            >
                                                <option value="movie">Film</option>
                                                <option value="episode">Dizi Bölümü</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 mb-1">Yapım Yılı</label>
                                            <input
                                                type="number"
                                                placeholder="ör. 2024"
                                                value={addForm.year}
                                                onChange={(e) => setAddForm({ ...addForm, year: e.target.value })}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-slate-300 mb-1">TMDB ID (Opsiyonel)</label>
                                            <input
                                                type="number"
                                                placeholder="ör. 550"
                                                value={addForm.tmdb_id}
                                                onChange={(e) => setAddForm({ ...addForm, tmdb_id: e.target.value })}
                                                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-indigo-300 font-mono"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                                        <button type="button" onClick={() => setSelectedFile(null)} className="px-4 py-2 text-xs text-slate-400 hover:text-white">Geri Dön</button>
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-xs font-bold text-white shadow-lg hover:scale-105 transition-all disabled:opacity-50"
                                        >
                                            {submitting ? 'Ekleniyor & Eşitleniyor...' : 'Kütüphaneye Ekle'}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                /* Step 2: Storage Box Explorer */
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs">
                                        <div className="flex items-center gap-2 truncate">
                                            <button onClick={() => setSelectedBox(null)} className="font-bold text-indigo-400 hover:underline">{selectedBox.name}</button>
                                            <span className="text-slate-600">/</span>
                                            <span className="font-mono text-slate-300 truncate">{currentPath || 'Kök Dizin'}</span>
                                        </div>

                                        {currentPath && (
                                            <button onClick={() => fetchDirectory(selectedBox.id, browseData?.parent_path || '')} className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold">
                                                ⬆️ Üst Klasör
                                            </button>
                                        )}
                                    </div>

                                    {browseLoading ? (
                                        <div className="p-12 text-center text-slate-400 text-xs">Storage Box taranıyor...</div>
                                    ) : (
                                        <div className="space-y-3">
                                            {browseData?.directories?.length > 0 && (
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                    {browseData.directories.map((dir) => (
                                                        <button
                                                            key={dir.relative_path}
                                                            onClick={() => fetchDirectory(selectedBox.id, dir.relative_path)}
                                                            className="flex items-center gap-3 p-3 bg-slate-950 hover:bg-slate-900 border border-slate-800 rounded-xl text-left text-xs font-semibold text-slate-200"
                                                        >
                                                            <span>📁</span>
                                                            <span className="truncate">{dir.name}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {browseData?.files?.length > 0 && (
                                                <div className="divide-y divide-slate-800/50 border border-slate-800 rounded-2xl overflow-hidden bg-slate-950">
                                                    {browseData.files.map((file) => (
                                                        <div key={file.relative_path} className="flex items-center justify-between p-3 hover:bg-slate-900 text-xs">
                                                            <div className="flex items-center gap-3 truncate pr-4">
                                                                <span>🎬</span>
                                                                <div>
                                                                    <p className="font-bold text-slate-200 truncate">{file.name}</p>
                                                                    <p className="text-[10px] text-slate-500 mt-0.5">{file.size_formatted}</p>
                                                                </div>
                                                            </div>

                                                            {file.is_added ? (
                                                                <span className="px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold text-[11px]">✓ Ekli</span>
                                                            ) : (
                                                                <button
                                                                    onClick={() => handleSelectFile(file)}
                                                                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-md"
                                                                >
                                                                    + Seç & Ekle
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
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
