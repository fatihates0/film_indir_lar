import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import axios from 'axios';
import { useEffect, useState } from 'react';

export default function StorageBoxesIndex({ boxes, storage_summary, recent_transfers = [] }) {
    const flash = usePage().props.flash;
    const [addBoxModal, setAddBoxModal] = useState(false);
    const [editBoxModal, setEditBoxModal] = useState(null);
    const [addMediaModalBox, setAddMediaModalBox] = useState(null);
    const [infoModalBox, setInfoModalBox] = useState(null);

    // Remote Upload State
    const [remoteModalOpen, setRemoteModalOpen] = useState(false);
    const initialTransfers = Array.isArray(recent_transfers)
        ? recent_transfers
        : (recent_transfers?.data || []);
    const initialPagination = recent_transfers?.pagination || {
        current_page: 1,
        last_page: 1,
        per_page: 10,
        total: initialTransfers.length,
    };
    const initialStatusCounts = recent_transfers?.status_counts || {
        completed: 0,
        pending: 0,
        transferring: 0,
        failed: 0,
        cancelled: 0,
        in_progress: 0,
        total: initialTransfers.length,
    };
    const [transfers, setTransfers] = useState(initialTransfers);
    const [pagination, setPagination] = useState(initialPagination);
    const [statusCounts, setStatusCounts] = useState(initialStatusCounts);
    const [currentPage, setCurrentPage] = useState(initialPagination.current_page || 1);
    const [perPage, setPerPage] = useState(initialPagination.per_page || 10);
    const [selectedTransferIds, setSelectedTransferIds] = useState([]);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [probing, setProbing] = useState(false);
    const [probeResult, setProbeResult] = useState(null);
    const [uploadTab, setUploadTab] = useState('single'); // 'single' | 'bulk'

    const remoteForm = useForm({
        source_url: '',
        storage_box_id: 'random',
        target_folder: 'Filmler',
        file_name: '',
        auto_add_media: true,
    });

    const bulkForm = useForm({
        urls: '',
        storage_box_id: 'random',
        target_folder: 'Filmler',
        auto_add_media: true,
    });

    const [testingConn, setTestingConn] = useState(false);
    const [connResult, setConnResult] = useState(null);

    const handleDiskTypeChange = (type, isEdit = false) => {
        let defaultPort = 443;
        if (type === 'sftp' || type === 'pulsedmedia') defaultPort = 22;
        else if (type === 'hetzner_webdav' || type === 'webdav') defaultPort = 443;
        else if (type === 'ftp') defaultPort = 21;
        else if (type === 'cifs_local' || type === 'cifs') defaultPort = 445;

        if (isEdit) {
            editForm.setData(prev => ({ ...prev, disk_type: type, port: defaultPort }));
        } else {
            boxForm.setData(prev => ({ ...prev, disk_type: type, port: defaultPort }));
        }
    };

    const handleTestConn = async (formData) => {
        setTestingConn(true);
        setConnResult(null);
        try {
            const res = await axios.post(route('admin.storage-boxes.test-connection'), formData);
            setConnResult(res.data);
        } catch (err) {
            setConnResult({
                success: false,
                message: 'Test bağlantısı sırasında hata oluştu: ' + (err.response?.data?.message || err.message)
            });
        } finally {
            setTestingConn(false);
        }
    };

    // Storage Box Form
    const boxForm = useForm({
        name: '',
        mount_path: '',
        disk_type: 'sftp',
        host: '',
        username: '',
        password: '',
        port: 22,
        share_name: '',
        capacity_gb: '',
    });

    const editForm = useForm({
        name: '',
        mount_path: '',
        disk_type: 'sftp',
        host: '',
        username: '',
        password: '',
        port: 22,
        share_name: '',
        is_active: true,
        capacity_gb: '',
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

    const fetchTransfers = (page = currentPage, currentPerPage = perPage) => {
        axios.get(route('admin.storage-boxes.transfers'), {
            params: { page, per_page: currentPerPage }
        }).then(res => {
            if (res.data?.transfers) {
                setTransfers(res.data.transfers);
            }
            if (res.data?.pagination) {
                setPagination(res.data.pagination);
            }
            if (res.data?.status_counts) {
                setStatusCounts(res.data.status_counts);
            }
        }).catch(() => {});
    };

    // Poll transfers every 2.5s if any are in progress
    useEffect(() => {
        const hasActive = transfers.some(t => t.status === 'pending' || t.status === 'transferring');
        if (!hasActive) return;

        const interval = setInterval(() => {
            fetchTransfers(currentPage, perPage);
        }, 2500);

        return () => clearInterval(interval);
    }, [transfers, currentPage, perPage]);

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
                setCurrentPage(1);
                fetchTransfers(1);
            }
        });
    };

    const handleBulkSubmit = (e) => {
        e.preventDefault();
        bulkForm.post(route('admin.storage-boxes.bulk-remote-transfer'), {
            onSuccess: () => {
                setRemoteModalOpen(false);
                bulkForm.reset();
                setCurrentPage(1);
                fetchTransfers(1);
            }
        });
    };

    const handleCancelTransfer = (id) => {
        const item = transfers.find(t => t.id === id);
        const isActive = item && (item.status === 'pending' || item.status === 'transferring');
        const confirmMsg = isActive
            ? 'Bu devam eden transfer işlemini durdurup iptal etmek istediğinize emin misiniz?'
            : 'Bu transfer kaydını kuyruk listesinden silmek istediğinize emin misiniz? (Storage Box\'a yüklenmiş film/dizi dosyası KESİNLİKLE silinmez)';

        if (confirm(confirmMsg)) {
            axios.delete(route('admin.storage-boxes.cancel-transfer', id)).then(() => {
                setSelectedTransferIds(prev => prev.filter(tid => tid !== id));
                fetchTransfers(currentPage);
            });
        }
    };

    const handleToggleSelect = (id) => {
        setSelectedTransferIds(prev =>
            prev.includes(id) ? prev.filter(tid => tid !== id) : [...prev, id]
        );
    };

    const isAllPageSelected = transfers.length > 0 && transfers.every(t => selectedTransferIds.includes(t.id));

    const handleToggleSelectAll = () => {
        if (isAllPageSelected) {
            const pageIds = new Set(transfers.map(t => t.id));
            setSelectedTransferIds(prev => prev.filter(id => !pageIds.has(id)));
        } else {
            const merged = new Set([...selectedTransferIds, ...transfers.map(t => t.id)]);
            setSelectedTransferIds(Array.from(merged));
        }
    };

    const activeSelectedTransfers = transfers.filter(
        t => selectedTransferIds.includes(t.id) && (t.status === 'pending' || t.status === 'transferring')
    );

    const handleBulkCancel = async () => {
        const activeIds = activeSelectedTransfers.map(t => t.id);
        if (activeIds.length === 0) {
            alert('Seçilenler arasında çalışan veya kuyrukta bekleyen aktif işlem bulunmuyor.');
            return;
        }

        if (!confirm(`Seçilen ${activeIds.length} adet aktif aktarımı durdurup iptal etmek istediğinize emin misiniz?`)) {
            return;
        }

        setIsBulkDeleting(true);
        try {
            await axios.post(route('admin.storage-boxes.transfers.bulk-cancel'), {
                ids: activeIds
            });
            fetchTransfers(currentPage);
        } catch (err) {
            alert('İptal işlemi başarısız: ' + (err.response?.data?.message || err.message));
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedTransferIds.length === 0) return;

        let confirmMsg = `Seçili ${selectedTransferIds.length} adet aktarım kaydı kuyruk listesinden silinecektir. (Yüklenmiş dosyalarınız KESİNLİKLE silinmez)`;
        if (activeSelectedTransfers.length > 0) {
            confirmMsg = `Seçilen ${selectedTransferIds.length} aktarımdan ${activeSelectedTransfers.length} tanesi şu anda AKTİF ÇALIŞIYOR / KUYRUKTA.\n\nİlk önce çalışan indirmeler güvenle durdurulup iptal edilecek, ardından kuyruk kayıtları temizlenecektir. (Tamamlanmış dosyalar KESİNLİKLE silinmez)\n\nDevam etmek istiyor musunuz?`;
        }

        if (!confirm(confirmMsg)) {
            return;
        }

        setIsBulkDeleting(true);
        try {
            await axios.post(route('admin.storage-boxes.transfers.bulk-delete'), {
                ids: selectedTransferIds
            });
            setSelectedTransferIds([]);
            fetchTransfers(currentPage);
        } catch (err) {
            alert('Toplu silme başarısız: ' + (err.response?.data?.message || err.message));
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const handleClearCompleted = async () => {
        const completedIds = transfers
            .filter(t => ['completed', 'failed', 'cancelled'].includes(t.status))
            .map(t => t.id);

        if (completedIds.length === 0) {
            alert('Bu sayfada silinebilecek tamamlanmış veya hatalı işlem bulunamadı.');
            return;
        }

        if (!confirm(`Bu sayfadaki ${completedIds.length} adet tamamlanmış aktarım kaydı kuyruk listesinden silinsin mi? (Storage Box'taki film/dizi dosyalarınız KESİNLİKLE silinmez)`)) {
            return;
        }

        setIsBulkDeleting(true);
        try {
            await axios.post(route('admin.storage-boxes.transfers.bulk-delete'), {
                ids: completedIds
            });
            setSelectedTransferIds(prev => prev.filter(id => !completedIds.includes(id)));
            fetchTransfers(currentPage);
        } catch (err) {
            alert('Silme işlemi başarısız: ' + (err.response?.data?.message || err.message));
        } finally {
            setIsBulkDeleting(false);
        }
    };

    const handlePageChange = (newPage) => {
        if (newPage < 1 || newPage > (pagination?.last_page || 1) || newPage === currentPage) return;
        setCurrentPage(newPage);
        fetchTransfers(newPage, perPage);
    };

    const handlePerPageChange = (newPerPage) => {
        setPerPage(newPerPage);
        setCurrentPage(1);
        fetchTransfers(1, newPerPage);
    };

    const openRemoteModalForBox = (box) => {
        remoteForm.setData(prev => ({ ...prev, storage_box_id: box.id }));
        bulkForm.setData(prev => ({ ...prev, storage_box_id: box.id }));
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
            capacity_gb: box.capacity_gb || '',
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

                {/* Genel Depolama Durumu Özeti (Storage Overview) */}
                {storage_summary && (
                    <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                                    <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7M4 7c0-2 1-3 3-3h10c2 0 3 1 3 3M4 7h16m-5 4h.01M9 11h.01M9 15h.01M15 15h.01" />
                                    </svg>
                                    Genel Storage Box Depolama Durumu
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Tüm bağlı Storage Box'lardaki medya dosyalarının kapladığı alan ve toplam kapasite verileri.
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                    {storage_summary.online_boxes_count} / {storage_summary.total_boxes_count} Box Çevrimiçi
                                </span>
                            </div>
                        </div>

                        {/* 4 Stat Cards Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {/* Card 1: Toplam Medya Kullanılan */}
                            <div className="rounded-2xl bg-slate-950/60 p-4 border border-slate-800/80 relative overflow-hidden group hover:border-indigo-500/40 transition-all">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-indigo-500/10 transition-all" />
                                <div className="text-xs font-medium text-slate-400">Toplam Kullanılan Alan</div>
                                <div className="text-2xl font-black text-indigo-400 mt-1">
                                    {storage_summary.total_used_formatted}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                                    <span>{storage_summary.total_media_count} Medya Dosyası</span>
                                    <span className="text-slate-600">•</span>
                                    <span className="font-mono text-indigo-300/80">{storage_summary.total_used_gb} GB</span>
                                </div>
                            </div>

                            {/* Card 2: Toplam Kapasite */}
                            <div className="rounded-2xl bg-slate-950/60 p-4 border border-slate-800/80 relative overflow-hidden group hover:border-cyan-500/40 transition-all">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-cyan-500/10 transition-all" />
                                <div className="text-xs font-medium text-slate-400">Toplam Disk Kapasitesi</div>
                                <div className="text-2xl font-black text-cyan-400 mt-1">
                                    {storage_summary.total_capacity_formatted}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1">
                                    {storage_summary.has_known_capacity ? 'Bağlı disklerden okunan toplam' : 'Kapasite bilgisi bekleniyor'}
                                </div>
                            </div>

                            {/* Card 3: Toplam Boş Alan */}
                            <div className="rounded-2xl bg-slate-950/60 p-4 border border-slate-800/80 relative overflow-hidden group hover:border-emerald-500/40 transition-all">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-emerald-500/10 transition-all" />
                                <div className="text-xs font-medium text-slate-400">Toplam Boş Alan</div>
                                <div className="text-2xl font-black text-emerald-400 mt-1">
                                    {storage_summary.total_free_formatted}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1">
                                    {storage_summary.total_free_gb !== null ? `${storage_summary.total_free_gb} GB Boş Yer Mevcut` : 'Kapasite girilmedi'}
                                </div>
                            </div>

                            {/* Card 4: Genel Doluluk Oranı */}
                            <div className="rounded-2xl bg-slate-950/60 p-4 border border-slate-800/80 relative overflow-hidden group hover:border-purple-500/40 transition-all">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-xl pointer-events-none group-hover:bg-purple-500/10 transition-all" />
                                <div className="text-xs font-medium text-slate-400">Genel Doluluk Oranı</div>
                                <div className="text-2xl font-black text-purple-400 mt-1">
                                    {storage_summary.total_usage_percent !== null ? `%${storage_summary.total_usage_percent}` : '-%'}
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1">
                                    {storage_summary.has_known_capacity ? `${storage_summary.total_used_formatted} / ${storage_summary.total_capacity_formatted}` : 'Kapasite girilmedi'}
                                </div>
                            </div>
                        </div>

                        {/* Genel Progress Bar */}
                        {storage_summary.has_known_capacity && (
                            <div className="space-y-1.5 pt-2">
                                <div className="flex justify-between text-xs text-slate-400">
                                    <span>Havuz Doluluk Seviyesi</span>
                                    <span className="font-mono text-slate-300 font-bold">
                                        {storage_summary.total_used_formatted} / {storage_summary.total_capacity_formatted} ({storage_summary.total_usage_percent}%)
                                    </span>
                                </div>
                                <div className="w-full bg-slate-950 rounded-full h-3 p-0.5 border border-slate-800 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${
                                            (storage_summary.total_usage_percent ?? 0) > 90
                                                ? 'bg-gradient-to-r from-rose-500 to-red-600'
                                                : (storage_summary.total_usage_percent ?? 0) > 75
                                                ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                                                : 'bg-gradient-to-r from-indigo-500 via-teal-500 to-emerald-500'
                                        }`}
                                        style={{ width: `${Math.min(100, Math.max(1, storage_summary.total_usage_percent ?? 0))}%` }}
                                    />
                                </div>
                            </div>
                        )}
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
                                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border uppercase font-mono ${
                                                    box.disk_type === 'sftp' || box.disk_type === 'pulsedmedia'
                                                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                        : box.disk_type === 'hetzner_webdav' || box.disk_type === 'hetzner'
                                                        ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                                        : box.disk_type === 'ftp'
                                                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                                        : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30'
                                                }`}>
                                                    {box.disk_type === 'sftp' ? 'SFTP / SSH (PulsedMedia)' : box.disk_type === 'hetzner_webdav' ? 'Hetzner WebDAV' : (box.disk_type || 'LOCAL').toUpperCase()}
                                                </span>
                                            </div>
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
                                        <div><span className="text-slate-500">Mount Yolu:</span> <strong className="text-indigo-300 break-all">{box.mount_path || 'Belirtilmedi (Standart)'}</strong></div>
                                    </div>

                                    {/* Storage Capacity & Used Statistics */}
                                    <div className="space-y-2.5">
                                        <div className="grid grid-cols-2 gap-2 text-xs">
                                            <div className="rounded-xl bg-slate-950/40 p-2.5 border border-slate-800">
                                                <span className="text-slate-400 text-[11px]">İçerik:</span>
                                                <div className="text-sm font-bold text-white mt-0.5">{box.media_count} Medya</div>
                                            </div>
                                            <div className="rounded-xl bg-slate-950/40 p-2.5 border border-slate-800">
                                                <span className="text-slate-400 text-[11px]">Kullanılan Alan:</span>
                                                <div className="text-sm font-bold text-indigo-400 mt-0.5" title={`${box.used_bytes || 0} bytes`}>
                                                    {box.used_formatted || `${box.total_gb} GB`}
                                                </div>
                                            </div>
                                            <div className="rounded-xl bg-slate-950/40 p-2.5 border border-slate-800">
                                                <div className="flex items-center justify-between text-slate-400 text-[11px]">
                                                    <span>Kapasite:</span>
                                                    {box.capacity_source === 'auto' && (
                                                        <span className="text-[10px] text-cyan-400 bg-cyan-500/10 px-1 rounded">Oto</span>
                                                    )}
                                                    {box.capacity_source === 'manual' && (
                                                        <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1 rounded">Manuel</span>
                                                    )}
                                                </div>
                                                <div className="text-sm font-bold text-cyan-300 mt-0.5">
                                                    {box.capacity_formatted || 'Bilinmiyor'}
                                                </div>
                                            </div>
                                            <div className="rounded-xl bg-slate-950/40 p-2.5 border border-slate-800">
                                                <span className="text-slate-400 text-[11px]">Boş Alan:</span>
                                                <div className="text-sm font-bold text-emerald-400 mt-0.5">
                                                    {box.free_formatted || 'Bilinmiyor'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Box Progress Bar */}
                                        {box.capacity_bytes > 0 ? (
                                            <div className="space-y-1">
                                                <div className="flex justify-between items-center text-[11px] text-slate-400">
                                                    <span>Doluluk</span>
                                                    <span className="font-mono font-bold text-slate-200">
                                                        %{box.usage_percent ?? 0}
                                                    </span>
                                                </div>
                                                <div className="w-full bg-slate-950 rounded-full h-2 border border-slate-800 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all duration-500 ${
                                                            (box.usage_percent ?? 0) > 90
                                                                ? 'bg-rose-500'
                                                                : (box.usage_percent ?? 0) > 75
                                                                ? 'bg-amber-500'
                                                                : 'bg-emerald-500'
                                                        }`}
                                                        style={{ width: `${Math.min(100, Math.max(1, box.usage_percent ?? 0))}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-[10px] text-slate-500 text-center py-1">
                                                Kapasite okunamadı. Dilerseniz Düzenle'den GB olarak girebilirsiniz.
                                            </div>
                                        )}
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
                <div className="rounded-3xl bg-[#0f1422] border border-slate-800 overflow-hidden shadow-2xl space-y-0">
                    <div className="p-6 border-b border-slate-800 bg-slate-900/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2.5 flex-wrap">
                                <h3 className="text-base font-bold text-white tracking-tight">Uzaktan Dosya Aktarım Kuyruğu (Remote Transfers)</h3>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                        ✓ {statusCounts.completed} Tamamlandı
                                    </span>

                                    {(statusCounts.transferring > 0 || statusCounts.pending > 0) && (
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30 animate-pulse flex items-center gap-1">
                                            ⏳ {statusCounts.in_progress} İşlem Bekliyor / Aktarılıyor
                                        </span>
                                    )}

                                    {statusCounts.failed > 0 && (
                                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                                            ✕ {statusCounts.failed} Hatalı
                                        </span>
                                    )}

                                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800/80 text-slate-300 border border-slate-700/80 font-mono">
                                        Toplam {statusCounts.total ?? pagination?.total ?? transfers.length} İşlem
                                    </span>
                                </div>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">Harici linklerden doğrudan Storage Box'a aktarılan dosyaların anlık durumu ve indirme hızları.</p>
                        </div>

                        <div className="flex items-center gap-2.5 self-start md:self-auto flex-wrap">
                            <div className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-xs text-slate-300">
                                <span className="font-medium text-slate-400">Sayfa Başı:</span>
                                <select
                                    value={perPage}
                                    onChange={(e) => handlePerPageChange(Number(e.target.value))}
                                    className="bg-transparent text-white text-xs py-0 px-1 font-semibold focus:outline-none cursor-pointer"
                                >
                                    <option value={10} className="bg-slate-900 text-white">10 Adet</option>
                                    <option value={25} className="bg-slate-900 text-white">25 Adet</option>
                                    <option value={50} className="bg-slate-900 text-white">50 Adet</option>
                                    <option value={100} className="bg-slate-900 text-white">100 Adet</option>
                                    <option value={250} className="bg-slate-900 text-white">250 Adet</option>
                                </select>
                            </div>

                            {transfers.some(t => ['completed', 'failed', 'cancelled'].includes(t.status)) && (
                                <button
                                    type="button"
                                    onClick={handleClearCompleted}
                                    disabled={isBulkDeleting}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white transition-all disabled:opacity-50"
                                    title="Bu sayfadaki sonuçlanmış veya hatalı işlemleri siler"
                                >
                                    <span>🧹</span>
                                    <span>Tamamlananları Temizle</span>
                                </button>
                            )}

                            <button
                                onClick={() => setRemoteModalOpen(true)}
                                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-bold text-white shadow-md hover:scale-[1.02] transition-all"
                            >
                                <span>+</span>
                                <span>Yeni Link Ekle</span>
                            </button>
                        </div>
                    </div>

                    {/* Bulk Selection Action Bar */}
                    {selectedTransferIds.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-indigo-500/10 border-b border-indigo-500/20 text-indigo-200 animate-fadeIn">
                            <div className="flex items-center gap-2.5 text-xs font-medium flex-wrap">
                                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[11px] font-bold shadow">
                                    {selectedTransferIds.length}
                                </span>
                                <span className="font-semibold text-white">kayıt seçildi</span>
                                {activeSelectedTransfers.length > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold animate-pulse">
                                        ⚡ {activeSelectedTransfers.length} aktif işlem
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => setSelectedTransferIds([])}
                                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all"
                                >
                                    Seçimi Kaldır
                                </button>
                                {activeSelectedTransfers.length > 0 && (
                                    <button
                                        type="button"
                                        disabled={isBulkDeleting}
                                        onClick={handleBulkCancel}
                                        className="px-3.5 py-1.5 rounded-xl bg-amber-600/90 hover:bg-amber-500 text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50"
                                        title="Seçilen aktif indirmeleri durdurur fakat kayıtlarını korur"
                                    >
                                        <span>⏹</span>
                                        <span>Çalışanları İptal Et ({activeSelectedTransfers.length})</span>
                                    </button>
                                )}
                                <button
                                    type="button"
                                    disabled={isBulkDeleting}
                                    onClick={handleBulkDelete}
                                    className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all disabled:opacity-50"
                                    title={activeSelectedTransfers.length > 0 ? 'Önce çalışanları durdurur, ardından tüm seçilenleri siler' : 'Seçilenleri sil'}
                                >
                                    <span>🗑</span>
                                    <span>
                                        {isBulkDeleting
                                            ? (activeSelectedTransfers.length > 0 ? 'Durduruluyor & Siliniyor...' : 'Siliniyor...')
                                            : `Seçilenleri Sil (${selectedTransferIds.length})`}
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}

                    {transfers.length > 0 ? (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs text-slate-300">
                                    <thead className="bg-slate-950/80 text-[11px] font-semibold uppercase text-slate-400 border-b border-slate-800">
                                        <tr>
                                            <th className="px-4 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={isAllPageSelected}
                                                        onChange={handleToggleSelectAll}
                                                        title="Bu Sayfadaki Tümünü Seç / Kaldır"
                                                        className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                                    />
                                                    <span>Dosya Adı & ID</span>
                                                </div>
                                            </th>
                                            <th className="px-4 py-3.5">Storage Box & Klasör</th>
                                            <th className="px-4 py-3.5">Boyut & İlerleme</th>
                                            <th className="px-4 py-3.5">Tarih</th>
                                            <th className="px-4 py-3.5">Durum</th>
                                            <th className="px-4 py-3.5 text-right">İşlemler</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60">
                                        {transfers.map((t) => {
                                            const isSelected = selectedTransferIds.includes(t.id);
                                            return (
                                                <tr
                                                    key={t.id}
                                                    onClick={() => handleToggleSelect(t.id)}
                                                    className={`hover:bg-slate-800/40 transition-colors cursor-pointer border-b border-slate-800/50 ${
                                                        isSelected ? 'bg-indigo-950/30' : ''
                                                    }`}
                                                >
                                                    {/* Dosya Adı & ID */}
                                                    <td className="px-4 py-3.5">
                                                        <div className="flex items-start gap-3">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => handleToggleSelect(t.id)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="mt-0.5 rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-indigo-500 w-4 h-4 cursor-pointer shrink-0"
                                                            />
                                                            <div className="space-y-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="font-mono font-bold text-white text-xs md:text-sm break-all">
                                                                        {t.file_name}
                                                                    </span>
                                                                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/50 shrink-0">
                                                                        #{t.id}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Storage Box & Klasör */}
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                                                                <span className="text-slate-400 text-xs">📦</span>
                                                                <span>{t.storage_box_name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                                                <span className="text-slate-500">📁</span>
                                                                <span>Klasör:</span>
                                                                <code className="text-indigo-300 font-mono">{t.target_folder}</code>
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Boyut & İlerleme */}
                                                    <td className="px-4 py-3.5 min-w-[210px]">
                                                        <div className="space-y-1">
                                                            <div className="flex justify-between items-center text-[11px] text-slate-300 font-mono">
                                                                <span>{t.transferred_formatted} / {t.total_formatted}</span>
                                                                <span className="font-bold text-slate-200">{t.progress_percent.toFixed(1)}%</span>
                                                            </div>
                                                            <div className="h-1.5 w-full rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                                                                <div
                                                                    className={`h-full transition-all duration-500 rounded-full ${
                                                                        t.status === 'completed'
                                                                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                                                            : t.status === 'failed'
                                                                            ? 'bg-rose-500'
                                                                            : t.status === 'pending'
                                                                            ? 'bg-amber-500'
                                                                            : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-cyan-400 animate-pulse'
                                                                    }`}
                                                                    style={{ width: `${Math.max(t.progress_percent, t.status === 'completed' ? 100 : 2)}%` }}
                                                                />
                                                            </div>
                                                            <div className="flex justify-between items-center text-[11px] font-mono">
                                                                {t.status === 'transferring' && (
                                                                    <span className="text-blue-400 font-semibold flex items-center gap-1">
                                                                        <span className="animate-spin inline-block">⚡</span> {t.speed_formatted}
                                                                    </span>
                                                                )}
                                                                {t.error_message && (
                                                                    <span className="text-rose-400 truncate max-w-[200px]" title={t.error_message}>
                                                                        {t.error_message}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Tarih */}
                                                    <td className="px-4 py-3.5 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                                                        <div className="flex items-center gap-1">
                                                            <span>⏱</span>
                                                            <span>{t.created_at}</span>
                                                        </div>
                                                    </td>

                                                    {/* Durum Badge */}
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold border inline-flex items-center gap-1 ${
                                                            t.status === 'completed'
                                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                                                : t.status === 'transferring'
                                                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30 animate-pulse'
                                                                : t.status === 'pending'
                                                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                                                : t.status === 'failed'
                                                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                                                : 'bg-slate-800 text-slate-400 border-slate-700'
                                                        }`}>
                                                            {t.status === 'completed' && '✓ TAMAMLANDI'}
                                                            {t.status === 'transferring' && '⚡ AKTARILIYOR'}
                                                            {t.status === 'pending' && '⏳ BEKLİYOR'}
                                                            {t.status === 'failed' && '✕ HATA'}
                                                            {t.status === 'cancelled' && 'İPTAL EDİLDİ'}
                                                        </span>
                                                    </td>

                                                    {/* İşlemler */}
                                                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleCancelTransfer(t.id);
                                                            }}
                                                            className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 border border-slate-700/60 text-xs font-semibold transition-all"
                                                            title={t.status === 'transferring' || t.status === 'pending' ? 'İptal Et' : 'Kayıttan Sil'}
                                                        >
                                                            {t.status === 'transferring' || t.status === 'pending' ? 'İptal' : 'Sil'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination Controls Footer */}
                            {pagination && pagination.total > 0 && (
                                <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-3 flex-wrap text-slate-400">
                                        <div>
                                            Toplam <strong className="text-white">{pagination.total}</strong> aktarımdan{' '}
                                            <strong className="text-white">
                                                {(pagination.current_page - 1) * pagination.per_page + 1} - {Math.min(pagination.current_page * pagination.per_page, pagination.total)}
                                            </strong>{' '}
                                            arası gösteriliyor
                                        </div>
                                    </div>

                                    {pagination.last_page > 1 && (
                                        <div className="flex items-center gap-1.5 self-center sm:self-auto">
                                            <button
                                                type="button"
                                                onClick={() => handlePageChange(pagination.current_page - 1)}
                                                disabled={pagination.current_page <= 1}
                                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            >
                                                ← Önceki
                                            </button>

                                            {Array.from({ length: pagination.last_page }, (_, i) => i + 1)
                                                .filter(page => {
                                                    return (
                                                        page === 1 ||
                                                        page === pagination.last_page ||
                                                        Math.abs(page - pagination.current_page) <= 2
                                                    );
                                                })
                                                .reduce((acc, page, idx, arr) => {
                                                    if (idx > 0 && page - arr[idx - 1] > 1) {
                                                        acc.push({ type: 'ellipsis', key: `el-${page}` });
                                                     }
                                                    acc.push({ type: 'page', number: page, key: page });
                                                    return acc;
                                                }, [])
                                                .map(item => {
                                                    if (item.type === 'ellipsis') {
                                                        return (
                                                            <span key={item.key} className="px-2 text-slate-600 text-xs font-mono">
                                                                ...
                                                            </span>
                                                        );
                                                    }
                                                    const isCurrent = item.number === pagination.current_page;
                                                    return (
                                                        <button
                                                            key={item.key}
                                                            type="button"
                                                            onClick={() => handlePageChange(item.number)}
                                                            className={`min-w-[32px] h-8 rounded-xl text-xs font-semibold transition-all ${
                                                                isCurrent
                                                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                                                                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300'
                                                            }`}
                                                        >
                                                            {item.number}
                                                        </button>
                                                    );
                                                })
                                            }

                                            <button
                                                type="button"
                                                onClick={() => handlePageChange(pagination.current_page + 1)}
                                                disabled={pagination.current_page >= pagination.last_page}
                                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            >
                                                Sonraki →
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="p-12 text-center text-slate-400 text-xs">
                            Şu anda aktif veya geçmiş bir uzaktan dosya aktarımı bulunmuyor. Yukarıdaki <strong>"+ Yeni Link Ekle"</strong> butonuna tıklayarak doğrudan film veya dizi indirebilirsiniz.
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
                                    <p className="text-xs text-slate-400">PulsedMedia SFTP, Hetzner WebDAV, FTP veya yerel klasör bağlantınızı tanımlayın.</p>
                                </div>
                                <button onClick={() => { setAddBoxModal(false); setConnResult(null); }} className="text-slate-400 hover:text-white font-bold">&times;</button>
                            </div>

                            <form onSubmit={handleBoxSubmit} className="space-y-4 text-xs">
                                <div>
                                    <label className="block font-semibold text-slate-300 mb-1">Storage Box Adı / Etiketi</label>
                                    <input
                                        type="text"
                                        value={boxForm.data.name}
                                        onChange={(e) => boxForm.setData('name', e.target.value)}
                                        className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-medium focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                        placeholder="Örn: PulsedMedia 4TB veya Hetzner Box 1"
                                        required
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Bağlantı Türü / Protokol</label>
                                        <select
                                            value={boxForm.data.disk_type}
                                            onChange={(e) => handleDiskTypeChange(e.target.value, false)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white focus:border-indigo-500 focus:ring-indigo-500 text-xs font-semibold"
                                        >
                                            <option value="sftp">🚀 SFTP / SSH (PulsedMedia, Seedbox - Port 22)</option>
                                            <option value="hetzner_webdav">📦 Hetzner Storage Box (WebDAV - Port 443)</option>
                                            <option value="webdav">🌐 Özel WebDAV (HTTPS/HTTP)</option>
                                            <option value="ftp">📁 FTP / FTPS (Port 21)</option>
                                            <option value="cifs_local">💻 Yerel Mount / CIFS Dizin (Sunucu Yolu)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Port</label>
                                        <input
                                            type="number"
                                            value={boxForm.data.port}
                                            onChange={(e) => boxForm.setData('port', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white text-xs font-mono"
                                            placeholder="22"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Sunucu Adresi / Host</label>
                                        <input
                                            type="text"
                                            value={boxForm.data.host}
                                            onChange={(e) => boxForm.setData('host', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                            placeholder="lt5-1-56-139...pulsedmedia.com veya uXXXXXX.your-storagebox.de"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Kullanıcı Adı (Username)</label>
                                        <input
                                            type="text"
                                            value={boxForm.data.username}
                                            onChange={(e) => boxForm.setData('username', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                            placeholder="Kullanıcı adınız"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Storage Parolası</label>
                                        <input
                                            type="password"
                                            value={boxForm.data.password}
                                            onChange={(e) => boxForm.setData('password', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                            placeholder="Şifreniz (Veritabanında şifreli saklanır)"
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">
                                            Mount Dizini (Sunucu Yolu) <span className="text-slate-500 font-normal">(Opsiyonel)</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={boxForm.data.mount_path}
                                            onChange={(e) => boxForm.setData('mount_path', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                            placeholder="/mnt/storagebox1"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block font-semibold text-slate-300 mb-1">
                                        Toplam Kapasite (GB) <span className="text-slate-500 font-normal">(Opsiyonel)</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={boxForm.data.capacity_gb}
                                        onChange={(e) => boxForm.setData('capacity_gb', e.target.value)}
                                        className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                        placeholder="Örn: 4000 (4 TB için). Boş bırakılırsa sunucudan otomatik okunur."
                                        min="1"
                                    />
                                </div>

                                {connResult && (
                                    <div className={`p-3.5 rounded-2xl text-xs flex items-start gap-2.5 border transition-all ${
                                        connResult.success 
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                                            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                                    }`}>
                                        <div className="font-bold text-sm leading-none">{connResult.success ? '✅' : '❌'}</div>
                                        <div className="flex-1 space-y-1">
                                            <p className="font-semibold">{connResult.message}</p>
                                            {connResult.details?.total_space && (
                                                <p className="text-[11px] opacity-80">
                                                    Toplam Kapasite: <strong>{connResult.details.total_space}</strong> | Boş: <strong>{connResult.details.free_space}</strong> | Kullanılan: <strong>{connResult.details.used_space}</strong>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="pt-4 border-t border-slate-800 flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={testingConn}
                                        onClick={() => handleTestConn(boxForm.data)}
                                        className="rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 px-3.5 py-2.5 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                                    >
                                        {testingConn ? '⚡ Test Ediliyor...' : '⚡ Bağlantıyı Test Et'}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={boxForm.processing}
                                        className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-600/30 hover:bg-indigo-500 transition-all disabled:opacity-50"
                                    >
                                        Storage Box Kaydet
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setAddBoxModal(false); setConnResult(null); }}
                                        className="rounded-xl bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
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
                                <button onClick={() => { setEditBoxModal(null); setConnResult(null); }} className="text-slate-400 hover:text-white font-bold">&times;</button>
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
                                        <label className="block font-semibold text-slate-300 mb-1">Bağlantı Türü / Protokol</label>
                                        <select
                                            value={editForm.data.disk_type}
                                            onChange={(e) => handleDiskTypeChange(e.target.value, true)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white focus:border-indigo-500 focus:ring-indigo-500 text-xs font-semibold"
                                        >
                                            <option value="sftp">🚀 SFTP / SSH (PulsedMedia, Seedbox - Port 22)</option>
                                            <option value="hetzner_webdav">📦 Hetzner Storage Box (WebDAV - Port 443)</option>
                                            <option value="webdav">🌐 Özel WebDAV (HTTPS/HTTP)</option>
                                            <option value="ftp">📁 FTP / FTPS (Port 21)</option>
                                            <option value="cifs_local">💻 Yerel Mount / CIFS Dizin (Sunucu Yolu)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block font-semibold text-slate-300 mb-1">Port</label>
                                        <input
                                            type="number"
                                            value={editForm.data.port}
                                            onChange={(e) => editForm.setData('port', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white text-xs font-mono"
                                            placeholder="22"
                                        />
                                    </div>
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
                                    <label className="block font-semibold text-slate-300 mb-1">
                                        Mount Dizini (Sunucu Yolu) <span className="text-slate-500 font-normal">(Opsiyonel)</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={editForm.data.mount_path}
                                        onChange={(e) => editForm.setData('mount_path', e.target.value)}
                                        className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono text-xs"
                                        placeholder="/mnt/storagebox1 (İsteğe bağlı)"
                                    />
                                </div>

                                <div>
                                    <label className="block font-semibold text-slate-300 mb-1">
                                        Toplam Kapasite (GB) <span className="text-slate-500 font-normal">(Opsiyonel)</span>
                                    </label>
                                    <input
                                        type="number"
                                        value={editForm.data.capacity_gb}
                                        onChange={(e) => editForm.setData('capacity_gb', e.target.value)}
                                        className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-indigo-500 focus:ring-indigo-500 text-xs"
                                        placeholder="Örn: 4000 (4 TB için). Boş bırakılırsa sunucudan otomatik okunur."
                                        min="1"
                                    />
                                </div>

                                {connResult && (
                                    <div className={`p-3.5 rounded-2xl text-xs flex items-start gap-2.5 border transition-all ${
                                        connResult.success 
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                                            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                                    }`}>
                                        <div className="font-bold text-sm leading-none">{connResult.success ? '✅' : '❌'}</div>
                                        <div className="flex-1 space-y-1">
                                            <p className="font-semibold">{connResult.message}</p>
                                            {connResult.details?.total_space && (
                                                <p className="text-[11px] opacity-80">
                                                    Toplam Kapasite: <strong>{connResult.details.total_space}</strong> | Boş: <strong>{connResult.details.free_space}</strong> | Kullanılan: <strong>{connResult.details.used_space}</strong>
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <div className="pt-4 border-t border-slate-800 flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={testingConn}
                                        onClick={() => handleTestConn(editForm.data)}
                                        className="rounded-xl bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 px-3.5 py-2.5 text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                                    >
                                        {testingConn ? '⚡ Test Ediliyor...' : '⚡ Bağlantıyı Test Et'}
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={editForm.processing}
                                        className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-xs font-bold text-white hover:bg-indigo-500 transition-all disabled:opacity-50"
                                    >
                                        Güncelle
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setEditBoxModal(null); setConnResult(null); }}
                                        className="rounded-xl bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-slate-400 hover:text-white"
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
                                    <p className="text-xs text-slate-400 mt-1">Harici bir web indirme linkini doğrudan Storage Box'a aktarın.</p>
                                </div>
                                <button onClick={() => setRemoteModalOpen(false)} className="text-slate-400 hover:text-white font-bold text-lg">&times;</button>
                            </div>

                            {/* Mode Tabs */}
                            <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setUploadTab('single')}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                        uploadTab === 'single'
                                            ? 'bg-emerald-600 text-white shadow'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    Tek Link İndir
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setUploadTab('bulk')}
                                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                        uploadTab === 'bulk'
                                            ? 'bg-emerald-600 text-white shadow'
                                            : 'text-slate-400 hover:text-white'
                                    }`}
                                >
                                    Toplu Link Ekle (Çoklu İndirme)
                                </button>
                            </div>

                            {uploadTab === 'single' ? (
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
                                                <option value="random">🎲 Rastgele (Otomatik Boş Alan Kontrollü)</option>
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
                                            id="auto_add_media_single"
                                            checked={remoteForm.data.auto_add_media}
                                            onChange={(e) => remoteForm.setData('auto_add_media', e.target.checked)}
                                            className="rounded bg-slate-900 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <label htmlFor="auto_add_media_single" className="text-slate-300 cursor-pointer">
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
                            ) : (
                                <form onSubmit={handleBulkSubmit} className="space-y-4 text-xs">
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="block font-semibold text-slate-300">
                                                İndirme Bağlantıları (Her satıra bir link)
                                            </label>
                                            <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                                                {bulkForm.data.urls.split('\n').filter(l => l.trim().startsWith('http')).length} Link Tespit Edildi
                                            </span>
                                        </div>
                                        <textarea
                                            rows="7"
                                            value={bulkForm.data.urls}
                                            onChange={(e) => bulkForm.setData('urls', e.target.value)}
                                            className="w-full rounded-xl bg-slate-950 border-slate-800 text-white font-mono focus:border-emerald-500 focus:ring-emerald-500 text-xs p-3"
                                            placeholder={`https://cloud.uhdfilmindir.com/link-1\nhttps://cloud.uhdfilmindir.com/link-2\nhttps://cloud.uhdfilmindir.com/link-3`}
                                            required
                                        />
                                        <span className="text-[11px] text-slate-500 mt-1 block">
                                            İstediğiniz kadar linki alt alta yapıştırın. Sistem tüm linkleri tek tek çözüp sırayla kuyrukta Storage Box'a aktaracaktır.
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block font-semibold text-slate-300 mb-1">Hedef Storage Box</label>
                                            <select
                                                value={bulkForm.data.storage_box_id}
                                                onChange={(e) => bulkForm.setData('storage_box_id', e.target.value)}
                                                className="w-full rounded-xl bg-slate-950 border-slate-800 text-white focus:border-emerald-500 focus:ring-emerald-500 text-xs"
                                                required
                                            >
                                                <option value="random">🎲 Rastgele (Her Link İçin Boş Alanlı Kutuya Dağıt)</option>
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
                                                value={bulkForm.data.target_folder}
                                                onChange={(e) => bulkForm.setData('target_folder', e.target.value)}
                                                className="w-full rounded-xl bg-slate-950 border-slate-800 text-white focus:border-emerald-500 focus:ring-emerald-500 text-xs"
                                                placeholder="Filmler (veya 'auto' yazarak otomatik algılatın)"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="rounded-xl bg-slate-950/60 p-3 border border-slate-800 flex items-center gap-3">
                                        <input
                                            type="checkbox"
                                            id="auto_add_media_bulk"
                                            checked={bulkForm.data.auto_add_media}
                                            onChange={(e) => bulkForm.setData('auto_add_media', e.target.checked)}
                                            className="rounded bg-slate-900 border-slate-700 text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <label htmlFor="auto_add_media_bulk" className="text-slate-300 cursor-pointer">
                                            <strong>Medya Kütüphanesine Otomatik Ekle:</strong> İndirilen tüm filmler/diziler tamamlandıkça doğrudan sitenize eklensin.
                                        </label>
                                    </div>

                                    <div className="pt-4 border-t border-slate-800 flex gap-2">
                                        <button
                                            type="submit"
                                            disabled={bulkForm.processing || !bulkForm.data.urls.trim()}
                                            className="flex-1 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/30 hover:scale-105 transition-all disabled:opacity-50"
                                        >
                                            {bulkForm.processing ? 'Kuyruğa Ekleniyor...' : '🚀 Toplu İndirmeleri Kuyruğa Ekle'}
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
                            )}
                        </div>
                    </div>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
