import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { Fragment, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function MediaAdminIndex({ media, storageBoxes = [], unsyncedCount = 0, suspiciousCount = 0, activeScan = null, filters = {} }) {
    const flash = usePage().props.flash;

    const [searchQuery, setSearchQuery] = useState(filters.search || '');
    const [perPage, setPerPage] = useState(filters.per_page || '10');
    const [tmdbFilter, setTmdbFilter] = useState(filters.tmdb_filter || 'all');
    const [storageBoxFilter, setStorageBoxFilter] = useState(filters.storage_box_id ? String(filters.storage_box_id) : 'all');
    const [expandedGroups, setExpandedGroups] = useState({});

    const toggleGroupExpand = (id) => {
        setExpandedGroups((prev) => ({
            ...prev,
            [id]: !prev[id],
        }));
    };

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        router.get(route('admin.media.index'), {
            search: searchQuery || undefined,
            per_page: perPage !== '10' ? perPage : undefined,
            tmdb_filter: tmdbFilter !== 'all' ? tmdbFilter : undefined,
            storage_box_id: storageBoxFilter !== 'all' ? storageBoxFilter : undefined,
        }, { preserveState: true, replace: true });
    };

    const handlePerPageChange = (e) => {
        const val = e.target.value;
        setPerPage(val);
        router.get(route('admin.media.index'), {
            search: searchQuery || undefined,
            per_page: val !== '10' ? val : undefined,
            tmdb_filter: tmdbFilter !== 'all' ? tmdbFilter : undefined,
            storage_box_id: storageBoxFilter !== 'all' ? storageBoxFilter : undefined,
        }, { preserveState: true, replace: true });
    };

    const handleTmdbFilterChange = (val) => {
        setTmdbFilter(val);
        router.get(route('admin.media.index'), {
            search: searchQuery || undefined,
            per_page: perPage !== '10' ? perPage : undefined,
            tmdb_filter: val !== 'all' ? val : undefined,
            storage_box_id: storageBoxFilter !== 'all' ? storageBoxFilter : undefined,
        }, { preserveState: true, replace: true });
    };

    const handleStorageBoxFilterChange = (val) => {
        setStorageBoxFilter(val);
        router.get(route('admin.media.index'), {
            search: searchQuery || undefined,
            per_page: perPage !== '10' ? perPage : undefined,
            tmdb_filter: tmdbFilter !== 'all' ? tmdbFilter : undefined,
            storage_box_id: val !== 'all' ? val : undefined,
        }, { preserveState: true, replace: true });
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

    // TMDB Progress Bar Overlay State
    const [syncProgress, setSyncProgress] = useState({
        active: false,
        completed: false,
        current: 0,
        total: 0,
        percent: 0,
        currentTitle: '',
        successCount: 0,
        failCount: 0,
    });
    const syncCancelledRef = useRef(false);

    // Media Scan Progress Bar Overlay State
    const [scanProgress, setScanProgress] = useState({
        active: !!activeScan,
        completed: false,
        scanId: activeScan?.id || null,
        percent: Math.round(activeScan?.progress_percent || 0),
        currentTitle: activeScan?.current_target || 'Kuyrukta bekliyor...',
        addedCount: activeScan?.added_count || 0,
        updatedCount: activeScan?.updated_count || 0,
        missingCount: activeScan?.missing_count || 0,
        scannedTotal: activeScan?.total_scanned || 0,
    });

    useEffect(() => {
        let intervalId = null;

        const isScanning = (scanning || (scanProgress.active && !scanProgress.completed));

        if (!isScanning) {
            return;
        }

        const checkStatus = async () => {
            try {
                const res = await fetch(route('admin.media.scan-status'));
                const data = await res.json();
                if (data.status === 'success') {
                    const active = data.active_scan;
                    if (active) {
                        setScanning(true);
                        setScanProgress({
                            active: true,
                            completed: false,
                            scanId: active.id,
                            percent: Math.round(active.progress_percent || 0),
                            currentTitle: active.current_target || 'Taranıyor...',
                            addedCount: active.added_count || 0,
                            updatedCount: active.updated_count || 0,
                            missingCount: active.missing_count || 0,
                            scannedTotal: active.total_scanned || 0,
                        });
                    } else {
                        const latest = data.latest_scan;
                        setScanning(false);
                        if (latest && (latest.status === 'completed' || latest.status === 'failed' || latest.status === 'cancelled')) {
                            setScanProgress({
                                active: true,
                                completed: true,
                                scanId: latest.id,
                                percent: 100,
                                currentTitle: latest.status === 'completed' 
                                    ? 'Tüm Taramalar Tamamlandı!' 
                                    : (latest.status === 'cancelled' ? 'Tarama İptal Edildi' : `Tarama Hatası: ${latest.error_message || ''}`),
                                addedCount: latest.added_count || 0,
                                updatedCount: latest.updated_count || 0,
                                missingCount: latest.missing_count || 0,
                                scannedTotal: latest.total_scanned || 0,
                            });
                            router.reload({ preserveScroll: true });
                        } else {
                            setScanProgress((prev) => ({ ...prev, active: false }));
                        }
                    }
                }
            } catch (err) {
                console.error(err);
            }
        };

        checkStatus();
        intervalId = setInterval(checkStatus, 2000);

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [scanning, scanProgress.active, scanProgress.completed]);

    const [selectedIds, setSelectedIds] = useState([]);
    const [selectionMode, setSelectionMode] = useState(false);
    const [deletingBulk, setDeletingBulk] = useState(false);

    // Bulk Download Links State
    const [downloadModalOpen, setDownloadModalOpen] = useState(false);
    const [downloadLinks, setDownloadLinks] = useState([]);
    const [fetchingLinks, setFetchingLinks] = useState(false);
    const [copiedMap, setCopiedMap] = useState({});
    const [linksFilter, setLinksFilter] = useState('');

    // Single Item TMDB Modal State
    const [singleTmdbModalOpen, setSingleTmdbModalOpen] = useState(false);
    const [editingMedia, setEditingMedia] = useState(null);
    const [singleTmdbQuery, setSingleTmdbQuery] = useState('');
    const [singleTmdbResults, setSingleTmdbResults] = useState([]);
    const [searchingSingleTmdb, setSearchingSingleTmdb] = useState(false);
    const [updatingSingleTmdbId, setUpdatingSingleTmdbId] = useState(null);

    const generateDownloadLinks = (targetIds = null) => {
        const idsToFetch = targetIds ? (Array.isArray(targetIds) ? targetIds : [targetIds]) : selectedIds;
        if (!idsToFetch || idsToFetch.length === 0) return;

        setFetchingLinks(true);
        setDownloadModalOpen(true);
        setDownloadLinks([]);
        setCopiedMap({});
        setLinksFilter('');

        fetch(route('admin.media.bulk-download-links'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
            body: JSON.stringify({ ids: idsToFetch }),
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.success && data.links) {
                    setDownloadLinks(data.links);
                } else {
                    alert(data.message || 'İndirme linkleri oluşturulamadı.');
                    setDownloadModalOpen(false);
                }
            })
            .catch((err) => {
                console.error(err);
                alert('İndirme linkleri oluşturulurken bir hata meydana geldi.');
                setDownloadModalOpen(false);
            })
            .finally(() => {
                setFetchingLinks(false);
            });
    };

    const copyToClipboard = (text, key) => {
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            setCopiedMap((prev) => ({ ...prev, [key]: true }));
            setTimeout(() => {
                setCopiedMap((prev) => ({ ...prev, [key]: false }));
            }, 2000);
        });
    };

    const handleCopyAllRawUrls = () => {
        const validUrls = downloadLinks.filter((item) => item.success && item.download_url).map((item) => item.download_url).join('\n');
        copyToClipboard(validUrls, 'all_raw');
    };

    const handleCopyAllFormatted = () => {
        const formatted = downloadLinks
            .filter((item) => item.success && item.download_url)
            .map((item) => {
                const label = item.quality_label ? ` [${item.quality_label}]` : '';
                return `${item.title}${label}: ${item.download_url}`;
            })
            .join('\n');
        copyToClipboard(formatted, 'all_formatted');
    };

    const handleExportTxtFile = () => {
        const validUrls = downloadLinks.filter((item) => item.success && item.download_url).map((item) => item.download_url).join('\n');
        const blob = new Blob([validUrls], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `indirme_linkleri_${new Date().toISOString().slice(0, 10)}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const showCheckboxes = selectionMode || selectedIds.length > 0;

    const clearSelection = () => {
        setSelectedIds([]);
        setSelectionMode(false);
    };

    const getAllPageVersionIds = () => {
        const ids = [];
        if (media?.data) {
            media.data.forEach((m) => {
                if (m.versions && m.versions.length > 0) {
                    m.versions.forEach((v) => ids.push(v.id));
                } else {
                    ids.push(m.id);
                }
            });
        }
        return ids;
    };

    const isAllSelected = () => {
        const allIds = getAllPageVersionIds();
        if (allIds.length === 0) return false;
        return allIds.every((id) => selectedIds.includes(id));
    };

    const toggleSelectAll = () => {
        const allIds = getAllPageVersionIds();
        if (isAllSelected()) {
            setSelectedIds(selectedIds.filter((id) => !allIds.includes(id)));
        } else {
            setSelectedIds(Array.from(new Set([...selectedIds, ...allIds])));
        }
    };

    const handleHeaderCheckboxClick = () => {
        if (!showCheckboxes) {
            setSelectionMode(true);
            const allIds = getAllPageVersionIds();
            setSelectedIds(allIds);
        } else {
            if (isAllSelected()) {
                clearSelection();
            } else {
                toggleSelectAll();
            }
        }
    };

    const getGroupVersionIds = (m) => {
        return m.versions && m.versions.length > 0 ? m.versions.map((v) => v.id) : [m.id];
    };

    const isGroupSelected = (m) => {
        const gIds = getGroupVersionIds(m);
        return gIds.length > 0 && gIds.every((id) => selectedIds.includes(id));
    };

    const toggleSelectGroup = (m) => {
        const gIds = getGroupVersionIds(m);
        if (isGroupSelected(m)) {
            setSelectedIds(selectedIds.filter((id) => !gIds.includes(id)));
        } else {
            setSelectedIds(Array.from(new Set([...selectedIds, ...gIds])));
        }
    };

    const toggleSelectId = (id) => {
        if (selectedIds.includes(id)) {
            const next = selectedIds.filter((item) => item !== id);
            setSelectedIds(next);
            if (next.length === 0) setSelectionMode(false);
        } else {
            setSelectedIds([...selectedIds, id]);
        }
    };

    const handleBulkDeleteSelected = () => {
        if (selectedIds.length === 0) return;
        if (confirm(`Seçilen ${selectedIds.length} içeriği kütüphaneden silmek istediğinize emin misiniz?`)) {
            setDeletingBulk(true);
            router.post(route('admin.media.bulk-delete'), { ids: selectedIds }, {
                onSuccess: () => {
                    clearSelection();
                    setDeletingBulk(false);
                },
                onError: () => setDeletingBulk(false),
            });
        }
    };

    const handleClearEntireArchive = () => {
        if (confirm('DİKKAT: Kütüphanedeki TÜM içerikleri silmek istediğinize emin misiniz?\n\nBu işlem tüm arşiv kayıtlarını temizler ve geri alınamaz!')) {
            if (confirm('Tüm arşivi silmek için son onay veriyor musunuz?')) {
                setDeletingBulk(true);
                router.post(route('admin.media.bulk-delete'), { delete_all: true }, {
                    onSuccess: () => {
                        clearSelection();
                        setDeletingBulk(false);
                    },
                    onError: () => setDeletingBulk(false),
                });
            }
        }
    };

    const [selectDropdownOpen, setSelectDropdownOpen] = useState(false);

    const selectByFilter = (filterType) => {
        setSelectDropdownOpen(false);
        if (!media?.data) return;

        if (filterType === 'none') {
            clearSelection();
            return;
        }

        let targetIds = [];

        if (filterType === 'all') {
            targetIds = getAllPageVersionIds();
        } else if (filterType === 'suspicious_tmdb') {
            media.data.forEach((m) => {
                if (m.tmdb_match_status?.status === 'suspicious') {
                    targetIds.push(...getGroupVersionIds(m));
                }
            });
        } else if (filterType === 'missing_tmdb') {
            media.data.forEach((m) => {
                if (!m.tmdb_id) {
                    targetIds.push(...getGroupVersionIds(m));
                }
            });
        } else if (filterType === 'movies') {
            media.data.forEach((m) => {
                if (m.type === 'movie' || (!m.type && !m.group_info?.is_series)) {
                    targetIds.push(...getGroupVersionIds(m));
                }
            });
        } else if (filterType === 'series') {
            media.data.forEach((m) => {
                if (m.type === 'series' || m.type === 'episode' || m.group_info?.is_series) {
                    targetIds.push(...getGroupVersionIds(m));
                }
            });
        } else if (filterType === 'inactive') {
            media.data.forEach((m) => {
                if (m.versions && m.versions.length > 0) {
                    m.versions.forEach((v) => {
                        if (!v.is_active) targetIds.push(v.id);
                    });
                } else if (!m.is_active) {
                    targetIds.push(m.id);
                }
            });
        } else if (filterType === 'zero_size') {
            const isZeroSizeBytes = (bytes) => {
                if (bytes === null || bytes === undefined || bytes === '' || Number(bytes) === 0) return true;
                const gb = Number(bytes) / 1073741824;
                return gb < 0.01;
            };

            media.data.forEach((m) => {
                const groupTotalBytes = m.group_info?.total_size_bytes ?? m.file_size ?? 0;
                if (isZeroSizeBytes(groupTotalBytes)) {
                    targetIds.push(...getGroupVersionIds(m));
                } else if (m.versions && m.versions.length > 0) {
                    m.versions.forEach((v) => {
                        if (isZeroSizeBytes(v.file_size)) {
                            targetIds.push(v.id);
                        }
                    });
                }
            });
        }

        setSelectedIds(targetIds);
        setSelectionMode(targetIds.length > 0);
    };

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

    const openSingleTmdbModal = (mediaItem) => {
        setEditingMedia(mediaItem);
        setSingleTmdbModalOpen(true);
        setSingleTmdbResults([]);

        const initialQuery = mediaItem.tmdb_id
            ? String(mediaItem.tmdb_id)
            : (mediaItem.original_title || mediaItem.title || mediaItem.file_name || '');
        setSingleTmdbQuery(initialQuery);

        if (initialQuery) {
            executeSingleTmdbSearch(initialQuery, mediaItem.type);
        }
    };

    const closeSingleTmdbModal = () => {
        setSingleTmdbModalOpen(false);
        setEditingMedia(null);
        setSingleTmdbQuery('');
        setSingleTmdbResults([]);
        setSearchingSingleTmdb(false);
        setUpdatingSingleTmdbId(null);
    };

    const executeSingleTmdbSearch = (queryStr, mediaType = 'multi') => {
        if (!queryStr || queryStr.trim().length === 0) return;
        setSearchingSingleTmdb(true);
        fetch(route('admin.media.tmdb-search') + `?query=${encodeURIComponent(queryStr.trim())}&type=${mediaType || 'multi'}`)
            .then((res) => res.json())
            .then((data) => {
                if (data.status === 'success') {
                    setSingleTmdbResults(data.results || []);
                }
            })
            .catch((err) => console.error(err))
            .finally(() => setSearchingSingleTmdb(false));
    };

    const handleSingleTmdbSearchSubmit = (e) => {
        e.preventDefault();
        executeSingleTmdbSearch(singleTmdbQuery, editingMedia?.type || 'multi');
    };

    const applySingleTmdbSelection = (candidate) => {
        if (!editingMedia || !candidate?.id) return;
        setUpdatingSingleTmdbId(candidate.id);

        fetch(route('admin.media.tmdb-sync', editingMedia.id), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
            },
            body: JSON.stringify({ tmdb_id: candidate.id }),
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.success) {
                    closeSingleTmdbModal();
                    router.reload({ preserveScroll: true });
                } else {
                    alert(data.message || 'TMDB verisi uygulanamadı.');
                }
            })
            .catch((err) => {
                console.error(err);
                alert('TMDB verisi güncellenirken bir hata oluştu.');
            })
            .finally(() => setUpdatingSingleTmdbId(null));
    };

    const syncTmdbSingle = (id) => {
        setSyncingId(id);
        router.post(route('admin.media.tmdb-sync', id), {}, {
            onFinish: () => setSyncingId(null),
        });
    };

    const syncAllTmdb = () => {
        setSyncingAll(true);
        setSyncProgress({
            active: true,
            completed: false,
            current: 0,
            total: unsyncedCount || 1,
            percent: 10,
            currentTitle: 'TMDB kuyruğuna gönderiliyor...',
            successCount: 0,
            failCount: 0,
        });

        router.post(route('admin.media.tmdb-sync-all'), {}, {
            onSuccess: (page) => {
                setSyncProgress((prev) => ({
                    ...prev,
                    completed: true,
                    percent: 100,
                    currentTitle: page?.props?.flash?.message || 'TMDB verileri arka plan kuyruğuna (tmdb_sync) başarıyla eklendi!',
                }));
            },
            onError: () => {
                setSyncProgress((prev) => ({
                    ...prev,
                    completed: true,
                    percent: 100,
                    currentTitle: 'TMDB kuyruğuna eklenirken bir hata oluştu.',
                }));
            },
            onFinish: () => setSyncingAll(false),
        });
    };

    const cancelTmdbSync = () => {
        syncCancelledRef.current = true;
    };

    const closeSyncProgress = () => {
        setSyncProgress((prev) => ({ ...prev, active: false }));
    };

    const toggleActive = (id) => {
        router.patch(route('admin.media.toggle', id));
    };

    const deleteMedia = (id, title) => {
        if (confirm(`"${title}" medyasını kütüphaneden silmek istediğinize emin misiniz?`)) {
            router.delete(route('admin.media.destroy', id));
        }
    };

    const deleteSeason = (mediaId, seasonNum, count) => {
        if (confirm(`Sezon ${seasonNum} altındaki toplam ${count} içeriği kütüphaneden silmek istediğinize emin misiniz?`)) {
            router.delete(route('admin.media.destroy-season', mediaId), {
                data: { season_number: seasonNum },
            });
        }
    };

    const triggerScan = async () => {
        if (scanning || (scanProgress.active && !scanProgress.completed)) return;

        setScanning(true);
        try {
            const response = await fetch(route('admin.media.scan-async'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
            });
            const data = await response.json();
            if (data.status === 'success' || data.status === 'already_running') {
                const scan = data.scan;
                setScanProgress({
                    active: true,
                    completed: false,
                    scanId: scan.id,
                    percent: Math.round(scan.progress_percent || 0),
                    currentTitle: scan.current_target || 'Kuyrukta bekliyor...',
                    addedCount: scan.added_count || 0,
                    updatedCount: scan.updated_count || 0,
                    missingCount: scan.missing_count || 0,
                    scannedTotal: scan.total_scanned || 0,
                });
            } else {
                setScanning(false);
            }
        } catch (err) {
            console.error(err);
            alert('Tarama başlatılırken bir hata oluştu.');
            setScanning(false);
        }
    };

    const cancelScan = async () => {
        if (!scanProgress.scanId) return;
        try {
            await fetch(route('admin.media.scan-cancel', { scan: scanProgress.scanId }), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '',
                },
            });
            setScanProgress((prev) => ({
                ...prev,
                completed: true,
                currentTitle: 'Tarama İptal Edildi',
            }));
            setScanning(false);
        } catch (err) {
            console.error(err);
        }
    };

    const closeScanProgress = () => {
        setScanProgress((prev) => ({ ...prev, active: false }));
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

                        <button
                            onClick={handleClearEntireArchive}
                            disabled={deletingBulk}
                            className="inline-flex items-center gap-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 border border-rose-500/30 text-rose-300 hover:text-white px-4 py-2.5 text-xs font-semibold transition-all disabled:opacity-50"
                        >
                            {deletingBulk ? 'Siliniyor...' : 'Tüm Arşivi Temizle'}
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

                {selectedIds.length > 0 && (
                    <div className="rounded-2xl bg-indigo-500/10 border border-indigo-500/30 p-4 text-xs text-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg animate-fadeIn">
                        <div className="flex items-center gap-3">
                            <span className="font-semibold text-white">{selectedIds.length} içerik seçildi</span>
                            <button
                                type="button"
                                onClick={() => setSelectedIds([])}
                                className="text-slate-400 hover:text-white underline text-[11px]"
                            >
                                Seçimi Temizle
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={() => generateDownloadLinks(selectedIds)}
                                disabled={fetchingLinks}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold transition-all disabled:opacity-50 shadow-md flex items-center gap-2 text-xs"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <span>{fetchingLinks ? 'Hazırlanıyor...' : `İndirme Linki Oluştur (${selectedIds.length})`}</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleBulkDeleteSelected}
                                disabled={deletingBulk}
                                className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded-xl font-bold transition-all disabled:opacity-50 shadow-md text-xs"
                            >
                                {deletingBulk ? 'Siliniyor...' : `Seçilenleri Sil (${selectedIds.length})`}
                            </button>
                        </div>
                    </div>
                )}

                {/* Media Management Table */}
                <div className="rounded-3xl bg-[#0f1422] border border-slate-800 overflow-hidden shadow-2xl">
                    <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h3 className="text-base font-bold text-white">Kütüphanedeki Tüm Medyalar</h3>
                                {tmdbFilter === 'suspicious' && (
                                    <span className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-[11px] font-semibold px-2 py-0.5 rounded-lg flex items-center gap-1 animate-fadeIn">
                                        <span>⚠️ Hatalı/Şüpheli Eşleşmeler Filtrelendi</span>
                                    </span>
                                )}
                                {tmdbFilter === 'missing' && (
                                    <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-semibold px-2 py-0.5 rounded-lg flex items-center gap-1 animate-fadeIn">
                                        <span>⚠️ TMDB Eksik Olanlar Filtrelendi</span>
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                                {media.from && media.to
                                    ? `${media.from} - ${media.to} arası gösteriliyor (${media.total} toplam içerik)`
                                    : `Toplam ${media.total || media.data.length} İçerik`}
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Storage Box Filtre Seçeneği */}
                            <div className="relative">
                                <select
                                    value={storageBoxFilter}
                                    onChange={(e) => handleStorageBoxFilterChange(e.target.value)}
                                    className={`bg-slate-950 border rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer transition-all ${
                                        storageBoxFilter !== 'all'
                                            ? 'border-indigo-500/60 text-indigo-300 bg-indigo-500/10'
                                            : 'border-slate-800 text-slate-300'
                                    }`}
                                >
                                    <option value="all" className="bg-slate-900 text-slate-200">Tüm Storage Box'lar</option>
                                    {storageBoxes.map((box) => (
                                        <option key={box.id} value={box.id} className="bg-slate-900 text-slate-200 font-semibold">
                                            📦 {box.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* TMDB Filtre Seçeneği */}
                            <div className="relative">
                                <select
                                    value={tmdbFilter}
                                    onChange={(e) => handleTmdbFilterChange(e.target.value)}
                                    className={`bg-slate-950 border rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-indigo-500 cursor-pointer transition-all ${
                                        tmdbFilter === 'suspicious'
                                            ? 'border-rose-500/60 text-rose-400 bg-rose-500/10'
                                            : tmdbFilter === 'missing'
                                            ? 'border-amber-500/60 text-amber-400 bg-amber-500/10'
                                            : tmdbFilter === 'synced'
                                            ? 'border-emerald-500/60 text-emerald-400 bg-emerald-500/10'
                                            : 'border-slate-800 text-slate-300'
                                    }`}
                                >
                                    <option value="all" className="bg-slate-900 text-slate-200">Tüm TMDB Durumları</option>
                                    <option value="suspicious" className="bg-slate-900 text-rose-400 font-bold">
                                        ⚠️ Hatalı / Şüpheli Eşleşmeler {suspiciousCount > 0 ? `(${suspiciousCount})` : ''}
                                    </option>
                                    <option value="missing" className="bg-slate-900 text-amber-400 font-bold">
                                        ⚠️ TMDB Eksik Olanlar {unsyncedCount > 0 ? `(${unsyncedCount})` : ''}
                                    </option>
                                    <option value="synced" className="bg-slate-900 text-emerald-400 font-bold">✓ TMDB Eşleşmiş</option>
                                </select>
                            </div>

                            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder="İçerik, IMDb ID (tt...), TMDB ID veya dosya adı ara..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-48 md:w-64"
                                />
                                <button type="submit" className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-xl text-xs font-semibold">
                                    Ara
                                </button>
                            </form>

                            {/* Toplu Seçim Dropdown */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setSelectDropdownOpen(!selectDropdownOpen)}
                                    className="inline-flex items-center gap-1.5 bg-slate-950 hover:bg-slate-900 text-indigo-300 border border-indigo-500/30 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all shadow-sm"
                                >
                                    <span>Toplu Seçim</span>
                                    <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${selectDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {selectDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-20" onClick={() => setSelectDropdownOpen(false)}></div>
                                        <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl py-1.5 z-30 divide-y divide-slate-800/60 text-xs">
                                            <div className="py-1">
                                                <button
                                                    type="button"
                                                    onClick={() => selectByFilter('suspicious_tmdb')}
                                                    className="w-full text-left px-4 py-2 text-rose-400 hover:bg-slate-800/80 font-medium flex items-center justify-between transition-colors"
                                                >
                                                    <span>Hatalı/Şüpheli Eşleşmeleri Seç</span>
                                                    <span className="text-[10px] bg-rose-400/10 border border-rose-400/30 px-1.5 py-0.5 rounded font-mono">⚠️ Şüpheli</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => selectByFilter('missing_tmdb')}
                                                    className="w-full text-left px-4 py-2 text-amber-400 hover:bg-slate-800/80 font-medium flex items-center justify-between transition-colors"
                                                >
                                                    <span>TMDB Eksik Olanları Seç</span>
                                                    <span className="text-[10px] bg-amber-400/10 border border-amber-400/30 px-1.5 py-0.5 rounded font-mono">Filtre</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => selectByFilter('zero_size')}
                                                    className="w-full text-left px-4 py-2 text-rose-400 hover:bg-slate-800/80 font-medium flex items-center justify-between transition-colors"
                                                >
                                                    <span>Boyutu 0 GB Olanları Seç</span>
                                                    <span className="text-[10px] bg-rose-400/10 border border-rose-400/30 px-1.5 py-0.5 rounded font-mono">0 GB</span>
                                                </button>
                                            </div>

                                            <div className="py-1">
                                                <button
                                                    type="button"
                                                    onClick={() => selectByFilter('movies')}
                                                    className="w-full text-left px-4 py-2 text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors"
                                                >
                                                    Sadece Filmleri Seç
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => selectByFilter('series')}
                                                    className="w-full text-left px-4 py-2 text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors"
                                                >
                                                    Sadece Dizileri Seç
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => selectByFilter('inactive')}
                                                    className="w-full text-left px-4 py-2 text-slate-300 hover:bg-slate-800/80 hover:text-white transition-colors"
                                                >
                                                    Pasif İçerikleri Seç
                                                </button>
                                            </div>

                                            <div className="py-1">
                                                <button
                                                    type="button"
                                                    onClick={() => selectByFilter('all')}
                                                    className="w-full text-left px-4 py-2 text-indigo-400 hover:bg-slate-800/80 font-semibold transition-colors"
                                                >
                                                    Tümünü Seç
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => selectByFilter('none')}
                                                    className="w-full text-left px-4 py-2 text-slate-400 hover:bg-slate-800/80 transition-colors"
                                                >
                                                    Seçimi Temizle
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="flex items-center gap-2 text-xs text-slate-400">
                                <span>Göster:</span>
                                <select
                                    value={perPage}
                                    onChange={handlePerPageChange}
                                    className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                                >
                                    <option value="10">10 / sayfa</option>
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
                                    <th className="px-4 py-3.5">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={showCheckboxes && isAllSelected()}
                                                onChange={handleHeaderCheckboxClick}
                                                title={showCheckboxes ? 'Tümünü Seç / Seçimi Kaldır' : 'Toplu Seçimi Etkinleştir'}
                                                className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                            />
                                            <span>Afiş & Başlık</span>
                                        </div>
                                    </th>
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
                                        <td colSpan={7} className="px-6 py-12 text-center text-slate-500">
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
                                                    className={`hover:bg-slate-800/40 transition-colors cursor-pointer border-b border-slate-800/50 ${isExpanded ? 'bg-slate-900/80' : ''
                                                        }`}
                                                >
                                                    {/* İçerik Başlığı & Detay */}
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-3">
                                                            {showCheckboxes && (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isGroupSelected(m)}
                                                                    onChange={() => toggleSelectGroup(m)}
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-indigo-500 w-4 h-4 cursor-pointer shrink-0"
                                                                />
                                                            )}
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
                                                                <div className="relative shrink-0">
                                                                    <img src={m.poster_url} alt="" className={`w-9 h-13 object-cover rounded-md border ${m.tmdb_match_status?.status === 'suspicious' ? 'border-rose-500/80 shadow-rose-900/50 shadow-md' : 'border-slate-800'}`} />
                                                                    {m.tmdb_match_status?.status === 'suspicious' && (
                                                                        <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold border border-slate-950 shadow-sm" title="Hatalı / Şüpheli Eşleşme">!</span>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <div className="relative shrink-0">
                                                                    <div className={`w-9 h-13 rounded-md bg-slate-900 border flex items-center justify-center text-xs shrink-0 ${m.tmdb_match_status?.status === 'suspicious' ? 'border-rose-500/80 text-rose-400 bg-rose-500/10' : 'border-slate-800 text-slate-600'}`}>?</div>
                                                                    {m.tmdb_match_status?.status === 'suspicious' && (
                                                                        <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[9px] w-4 h-4 rounded-full flex items-center justify-center font-bold border border-slate-950 shadow-sm" title="Hatalı / Şüpheli Eşleşme">!</span>
                                                                    )}
                                                                </div>
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
                                                        {m.tmdb_match_status?.status === 'suspicious' ? (
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="text-xs font-bold text-rose-400 bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 rounded-lg inline-flex items-center gap-1.5 shadow-sm" title={m.tmdb_match_status.issues?.join(', ')}>
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                                                    <span>⚠️ Şüpheli Eşleşme</span>
                                                                </span>
                                                                {m.tmdb_match_status.issues?.length > 0 && (
                                                                    <span className="text-[10px] font-medium text-rose-300/80 font-mono">
                                                                        {m.tmdb_match_status.issues.join(', ')}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        ) : m.tmdb_id ? (
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
                                                            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${m.is_active
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
                                                                    const gIds = getGroupVersionIds(m);
                                                                    generateDownloadLinks(gIds);
                                                                }}
                                                                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                                                            >
                                                                Link Al
                                                            </button>
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
                                                                    openSingleTmdbModal(m);
                                                                }}
                                                                className="text-xs text-slate-300 hover:text-white font-medium"
                                                            >
                                                                TMDB
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
                                                        <td colSpan={7} className="p-0">
                                                            <div className="bg-slate-950/80 border-b border-slate-800">
                                                                {(() => {
                                                                    const isSeriesGroup = m.type === 'series' || m.type === 'episode' || m.group_info?.is_series;
                                                                    if (isSeriesGroup) {
                                                                        const seasonsGrouped = {};
                                                                        versions.forEach((ver) => {
                                                                            const sNum = ver.season_number || 1;
                                                                            if (!seasonsGrouped[sNum]) {
                                                                                seasonsGrouped[sNum] = [];
                                                                            }
                                                                            seasonsGrouped[sNum].push(ver);
                                                                        });

                                                                        const seasonNumbers = Object.keys(seasonsGrouped).sort((a, b) => Number(a) - Number(b));

                                                                        return seasonNumbers.map((seasonNum) => (
                                                                            <div key={seasonNum} className="border-b border-slate-800/80 last:border-b-0">
                                                                                {/* Season Header */}
                                                                                <div className="px-6 py-2 bg-slate-900/90 text-xs font-bold text-indigo-300 flex items-center justify-between border-y border-slate-800/60">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                                                                                        <span>Sezon {seasonNum}</span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-4">
                                                                                        <span className="text-[11px] font-normal text-slate-400">
                                                                                            {seasonsGrouped[seasonNum].length} Bölüm
                                                                                        </span>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => deleteSeason(m.id, Number(seasonNum), seasonsGrouped[seasonNum].length)}
                                                                                            className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors"
                                                                                        >
                                                                                            Sezonu Sil
                                                                                        </button>
                                                                                    </div>
                                                                                </div>

                                                                                {/* Episodes List */}
                                                                                <div className="divide-y divide-slate-800/30">
                                                                                    {seasonsGrouped[seasonNum].map((ver) => (
                                                                                        <div
                                                                                            key={ver.id}
                                                                                            className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-900/60 transition-colors text-xs"
                                                                                        >
                                                                                            <div className="flex items-center gap-3 min-w-0 flex-1 pl-6">
                                                                                                <span className="text-slate-600 text-xs font-mono select-none">└</span>
                                                                                                {showCheckboxes && (
                                                                                                    <input
                                                                                                        type="checkbox"
                                                                                                        checked={selectedIds.includes(ver.id)}
                                                                                                        onChange={() => toggleSelectId(ver.id)}
                                                                                                        className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                                                                                                    />
                                                                                                )}
                                                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shrink-0">
                                                                                                    {ver.quality_label}
                                                                                                </span>
                                                                                                <span className="font-mono text-slate-300 truncate text-[11px]" title={ver.file_path || ver.file_name}>
                                                                                                    {ver.file_path || ver.file_name}
                                                                                                </span>
                                                                                            </div>

                                                                                            <div className="flex items-center gap-6 shrink-0 text-slate-400">
                                                                                                <span className="text-slate-400 text-xs">{ver.storage_box?.name || 'Storage Box'}</span>
                                                                                                <span className="font-mono font-semibold text-emerald-400 text-xs w-20 text-right">
                                                                                                    {(ver.file_size / 1073741824).toFixed(2)} GB
                                                                                                </span>
                                                                                                <button
                                                                                                    type="button"
                                                                                                    onClick={() => toggleActive(ver.id)}
                                                                                                    className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${ver.is_active
                                                                                                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                                                                            : 'bg-slate-800 text-slate-500 border border-slate-700'
                                                                                                        }`}
                                                                                                >
                                                                                                    {ver.is_active ? 'Aktif' : 'Pasif'}
                                                                                                </button>
                                                                                                <div className="flex items-center gap-3 shrink-0 justify-end">
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => generateDownloadLinks(ver.id)}
                                                                                                        className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                                                                                                    >
                                                                                                        Link Al
                                                                                                    </button>
                                                                                                    <button
                                                                                                        type="button"
                                                                                                        onClick={() => openSingleTmdbModal(ver)}
                                                                                                        className="text-xs text-slate-300 hover:text-white font-medium"
                                                                                                    >
                                                                                                        TMDB
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
                                                                            </div>
                                                                        ));
                                                                    }

                                                                    return (
                                                                        <div className="divide-y divide-slate-800/40">
                                                                            {versions.map((ver) => (
                                                                                <div
                                                                                    key={ver.id}
                                                                                    className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-900/60 transition-colors text-xs"
                                                                                >
                                                                                    <div className="flex items-center gap-3 min-w-0 flex-1 pl-6">
                                                                                        <span className="text-slate-600 text-xs font-mono select-none">└</span>
                                                                                        {showCheckboxes && (
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={selectedIds.includes(ver.id)}
                                                                                                onChange={() => toggleSelectId(ver.id)}
                                                                                                className="rounded bg-slate-900 border-slate-700 text-indigo-500 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                                                                                            />
                                                                                        )}
                                                                                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 shrink-0">
                                                                                            {ver.quality_label}
                                                                                        </span>
                                                                                        <span className="font-mono text-slate-300 truncate text-[11px]" title={ver.file_path || ver.file_name}>
                                                                                            {ver.file_path || ver.file_name}
                                                                                        </span>
                                                                                    </div>

                                                                                    <div className="flex items-center gap-6 shrink-0 text-slate-400">
                                                                                        <span className="text-slate-400 text-xs">{ver.storage_box?.name || 'Storage Box'}</span>
                                                                                        <span className="font-mono font-semibold text-emerald-400 text-xs w-20 text-right">
                                                                                            {(ver.file_size / 1073741824).toFixed(2)} GB
                                                                                        </span>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => toggleActive(ver.id)}
                                                                                            className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${ver.is_active
                                                                                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                                                                                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                                                                                                }`}
                                                                                        >
                                                                                            {ver.is_active ? 'Aktif' : 'Pasif'}
                                                                                        </button>
                                                                                        <div className="flex items-center gap-3 shrink-0 justify-end">
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => generateDownloadLinks(ver.id)}
                                                                                                className="text-xs text-emerald-400 hover:text-emerald-300 font-medium"
                                                                                            >
                                                                                                Link Al
                                                                                            </button>
                                                                                            <button
                                                                                                type="button"
                                                                                                onClick={() => openSingleTmdbModal(ver)}
                                                                                                className="text-xs text-slate-300 hover:text-white font-medium"
                                                                                            >
                                                                                                TMDB
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
                                                                    );
                                                                })()}
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
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${link.active
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
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${box.status === 'online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
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
                                                        className={`p-2.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${addForm.tmdb_id === item.id
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

            {/* Toplu İndirme Linkleri Modalı */}
            {downloadModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="w-full max-w-4xl bg-[#121724] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-fadeIn">
                        {/* Modal Header */}
                        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-white">Toplu İndirme Linkleri</h3>
                                    <p className="text-xs text-slate-400">
                                        {fetchingLinks
                                            ? 'Linkler hazırlanıyor, lütfen bekleyin...'
                                            : `${downloadLinks.filter((l) => l.success).length} / ${downloadLinks.length} medya için indirme linki üretildi.`}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setDownloadModalOpen(false)}
                                className="text-slate-400 hover:text-white font-bold text-xl px-2 py-1 rounded-lg hover:bg-slate-800/50 transition-colors"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Body */}
                        {fetchingLinks ? (
                            <div className="p-12 text-center flex flex-col items-center justify-center space-y-4">
                                <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-sm font-semibold text-slate-300">Güvenli oturumlar ve imzalı URL'ler oluşturuluyor...</p>
                            </div>
                        ) : (
                            <div className="p-6 overflow-y-auto flex-1 space-y-5">
                                {/* Actions Toolbar */}
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 bg-slate-950 rounded-2xl border border-slate-800">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={handleCopyAllRawUrls}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                            <span>{copiedMap['all_raw'] ? 'Tüm Linkler Kopyalandı!' : 'Tüm Linkleri Kopyala (IDM / JDownloader)'}</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleCopyAllFormatted}
                                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                                        >
                                            <span>{copiedMap['all_formatted'] ? 'Kopyalandı!' : 'Başlık + Link Kopyala'}</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleExportTxtFile}
                                            className="bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/20 px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <span>TXT İndir</span>
                                        </button>
                                    </div>

                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Linklerde ara..."
                                            value={linksFilter}
                                            onChange={(e) => setLinksFilter(e.target.value)}
                                            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-full sm:w-48"
                                        />
                                    </div>
                                </div>

                                {/* Items list */}
                                <div className="space-y-3">
                                    {downloadLinks
                                        .filter((item) => {
                                            if (!linksFilter) return true;
                                            const q = linksFilter.toLowerCase();
                                            return (
                                                (item.title && item.title.toLowerCase().includes(q)) ||
                                                (item.file_name && item.file_name.toLowerCase().includes(q)) ||
                                                (item.quality_label && item.quality_label.toLowerCase().includes(q))
                                            );
                                        })
                                        .map((item, idx) => (
                                            <div
                                                key={item.id || idx}
                                                className={`p-4 rounded-2xl border transition-all ${
                                                    item.success
                                                        ? 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                                                        : 'bg-rose-500/5 border-rose-500/20'
                                                }`}
                                            >
                                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-bold text-white text-xs">{item.title}</span>
                                                            {item.quality_label && (
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                                                                    {item.quality_label}
                                                                </span>
                                                            )}
                                                            {item.season_number && (
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                                                                    S{String(item.season_number).padStart(2, '0')}
                                                                    {item.episode_number ? `E${String(item.episode_number).padStart(2, '0')}` : ''}
                                                                </span>
                                                            )}
                                                            {item.file_size > 0 && (
                                                                <span className="text-[11px] font-mono text-emerald-400 font-semibold">
                                                                    {(item.file_size / 1073741824).toFixed(2)} GB
                                                                </span>
                                                            )}
                                                        </div>

                                                        {item.success ? (
                                                            <div className="mt-2 flex items-center gap-2">
                                                                <input
                                                                    type="text"
                                                                    readOnly
                                                                    value={item.download_url}
                                                                    className="bg-slate-900 border border-slate-800 text-slate-300 text-[11px] font-mono rounded-xl px-3 py-1.5 w-full focus:outline-none select-all"
                                                                    onClick={(e) => e.target.select()}
                                                                />
                                                            </div>
                                                        ) : (
                                                            <p className="mt-1 text-xs text-rose-400 font-semibold">{item.error || 'Link üretilemedi'}</p>
                                                        )}
                                                    </div>

                                                    {item.success && (
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => copyToClipboard(item.download_url, `item_${item.id}`)}
                                                                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-all flex items-center gap-1.5"
                                                            >
                                                                {copiedMap[`item_${item.id}`] ? (
                                                                    <span className="text-emerald-400 font-bold">✓ Kopyalandı</span>
                                                                ) : (
                                                                    <>
                                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                                                        </svg>
                                                                        <span>Kopyala</span>
                                                                    </>
                                                                )}
                                                            </button>
                                                            <a
                                                                href={item.download_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                                </svg>
                                                                <span>İndir</span>
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Floating Bottom-Right TMDB Sync Progress Overlay (Portal to document.body) */}
            {syncProgress.active && typeof document !== 'undefined' && createPortal(
                <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-[99999] w-80 md:w-96 rounded-3xl bg-[#0f1422]/95 border border-indigo-500/40 p-5 shadow-2xl backdrop-blur-xl text-xs transition-all space-y-3 animate-fadeIn">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2.5 font-bold text-white text-sm">
                            {!syncProgress.completed ? (
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                                </span>
                            ) : (
                                <span className="text-emerald-400 text-sm">✓</span>
                            )}
                            <span>TMDB Senkronizasyonu</span>
                        </div>

                        {!syncProgress.completed ? (
                            <button
                                type="button"
                                onClick={cancelTmdbSync}
                                className="text-slate-400 hover:text-rose-400 text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-slate-800/60 hover:bg-rose-500/10 border border-slate-700/60 transition-all"
                            >
                                İptal Et
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={closeSyncProgress}
                                className="text-slate-400 hover:text-white text-xs font-semibold p-1 rounded-lg hover:bg-slate-800 transition-all"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Title & Progress info */}
                    <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-slate-400 flex justify-between items-center">
                            <span className="truncate max-w-[220px] text-slate-200 font-mono">
                                {syncProgress.completed
                                    ? syncProgress.currentTitle
                                    : `Taranıyor: ${syncProgress.currentTitle || 'Hazırlanıyor...'}`}
                            </span>
                            <span className="font-bold text-indigo-400 font-mono text-xs">
                                %{syncProgress.percent}
                            </span>
                        </div>

                        {/* Progress Track */}
                        <div className="h-2 w-full rounded-full bg-slate-950 border border-slate-800 overflow-hidden p-0.5">
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                    syncProgress.completed
                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                        : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-400 animate-pulse'
                                }`}
                                style={{ width: `${Math.max(syncProgress.percent, 3)}%` }}
                            />
                        </div>
                    </div>

                    {/* Summary Numbers */}
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                        <div>
                            Durum: <strong className="text-white">{syncProgress.current}</strong> / <strong className="text-white">{syncProgress.total}</strong> taranıyor
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-emerald-400 font-semibold" title="Başarıyla güncellendi">✓ {syncProgress.successCount}</span>
                            <span className="text-rose-400 font-semibold" title="Eşleşmedi veya hata">✕ {syncProgress.failCount}</span>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Floating Bottom-Right Media Scan Progress Overlay (Portal to document.body) */}
            {scanProgress.active && typeof document !== 'undefined' && createPortal(
                <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-[99999] w-80 md:w-96 rounded-3xl bg-[#0f1422]/95 border border-emerald-500/40 p-5 shadow-2xl backdrop-blur-xl text-xs transition-all space-y-3 animate-fadeIn">
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2.5 font-bold text-white text-sm">
                            {!scanProgress.completed ? (
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                                </span>
                            ) : (
                                <span className="text-emerald-400 text-sm">✓</span>
                            )}
                            <span>Otomatik Medya Taraması</span>
                        </div>

                        {!scanProgress.completed ? (
                            <button
                                type="button"
                                onClick={cancelScan}
                                className="text-slate-400 hover:text-rose-400 text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-slate-800/60 hover:bg-rose-500/10 border border-slate-700/60 transition-all"
                            >
                                İptal Et
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={closeScanProgress}
                                className="text-slate-400 hover:text-white text-xs font-semibold p-1 rounded-lg hover:bg-slate-800 transition-all"
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    {/* Title & Progress info */}
                    <div className="space-y-1.5">
                        <div className="text-[11px] font-medium text-slate-400 flex justify-between items-center">
                            <span className="truncate max-w-[220px] text-slate-200 font-mono">
                                {scanProgress.completed
                                    ? scanProgress.currentTitle
                                    : `Taranıyor: ${scanProgress.currentTitle || 'Hazırlanıyor...'}`}
                            </span>
                            <span className="font-bold text-emerald-400 font-mono text-xs">
                                %{scanProgress.percent}
                            </span>
                        </div>

                        {/* Progress Track */}
                        <div className="h-2 w-full rounded-full bg-slate-950 border border-slate-800 overflow-hidden p-0.5">
                            <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                    scanProgress.completed
                                        ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                                        : 'bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-400 animate-pulse'
                                }`}
                                style={{ width: `${Math.max(scanProgress.percent, 3)}%` }}
                            />
                        </div>
                    </div>

                    {/* Summary Numbers */}
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1">
                        <div>
                            Hedef: <strong className="text-white">{scanProgress.current}</strong> / <strong className="text-white">{scanProgress.total}</strong>
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                            <span className="text-emerald-400 font-semibold" title="Yeni Eklendi">+{scanProgress.addedCount}</span>
                            <span className="text-amber-400 font-semibold" title="Güncellendi">~{scanProgress.updatedCount}</span>
                            <span className="text-slate-400 font-semibold" title="Erişilemedi">-{scanProgress.missingCount}</span>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Single Media TMDB Search & Update Modal */}
            {singleTmdbModalOpen && editingMedia && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
                    <div className="w-full max-w-3xl bg-[#121724] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
                        {/* Modal Header */}
                        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {editingMedia.poster_url ? (
                                    <img src={editingMedia.poster_url} alt="" className="w-9 h-12 object-cover rounded-lg border border-slate-700 shrink-0" />
                                ) : (
                                    <div className="w-9 h-12 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-xs text-slate-500 font-bold shrink-0">
                                        ?
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                                        <span>TMDB Bilgilerini Güncelle</span>
                                        {editingMedia.tmdb_id ? (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                                TMDB ID: {editingMedia.tmdb_id}
                                            </span>
                                        ) : (
                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                                TMDB Eksik
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-xs text-slate-400 truncate max-w-md mt-0.5 font-mono">
                                        {editingMedia.title} {editingMedia.file_name ? `• ${editingMedia.file_name}` : ''}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={closeSingleTmdbModal}
                                className="text-slate-400 hover:text-white font-bold text-xl p-1 rounded-lg hover:bg-slate-800 transition-all shrink-0"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-6 overflow-y-auto flex-1 space-y-5">
                            {/* Search Form */}
                            <form onSubmit={handleSingleTmdbSearchSubmit} className="space-y-2">
                                <label className="text-xs font-bold text-indigo-300 flex items-center justify-between">
                                    <span>TMDB ID, IMDb ID veya Başlık ile Arama Yapın:</span>
                                    <span className="text-[10px] font-normal text-slate-400">Örn: 550976, tt0440492 veya Death Note</span>
                                </label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            value={singleTmdbQuery}
                                            onChange={(e) => setSingleTmdbQuery(e.target.value)}
                                            placeholder="TMDB ID, IMDb ID (tt...) veya içerik adı yazın..."
                                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-mono shadow-inner"
                                        />
                                        {singleTmdbQuery && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSingleTmdbQuery('');
                                                    setSingleTmdbResults([]);
                                                }}
                                                className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 text-xs"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={searchingSingleTmdb || !singleTmdbQuery.trim()}
                                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all shadow-md flex items-center gap-2 shrink-0"
                                    >
                                        {searchingSingleTmdb ? (
                                            <>
                                                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                                <span>Aranıyor...</span>
                                            </>
                                        ) : (
                                            <span>Ara</span>
                                        )}
                                    </button>
                                </div>
                            </form>

                            {/* Results List */}
                            <div className="space-y-3 pt-2">
                                <div className="flex items-center justify-between text-xs text-slate-400">
                                    <span className="font-semibold text-slate-300">TMDB Arama Sonuçları</span>
                                    <span>{singleTmdbResults.length} sonuç bulundu</span>
                                </div>

                                {searchingSingleTmdb ? (
                                    <div className="p-10 text-center text-xs text-slate-400 space-y-2">
                                        <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                                        <p>TMDB sunucularında arama yapılıyor...</p>
                                    </div>
                                ) : singleTmdbResults.length === 0 ? (
                                    <div className="p-10 text-center bg-slate-950/60 rounded-2xl border border-slate-800/80 text-xs text-slate-400 space-y-1">
                                        <p className="font-semibold text-slate-300">Sonuç Bulunamadı</p>
                                        <p className="text-[11px] text-slate-500">Lütfen geçerli bir TMDB ID (ör: 550976), IMDb ID (ör: tt0440492) veya filmin İngilizce adını yazarak arayın.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {singleTmdbResults.map((item) => (
                                            <div
                                                key={item.id}
                                                className="p-4 bg-slate-950/80 hover:bg-slate-900 border border-slate-800/80 hover:border-indigo-500/50 rounded-2xl transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                                            >
                                                <div className="flex items-start gap-3.5 min-w-0 flex-1">
                                                    {item.poster_url ? (
                                                        <img src={item.poster_url} alt="" className="w-12 h-16 object-cover rounded-xl border border-slate-800 shrink-0 shadow-md" />
                                                    ) : (
                                                        <div className="w-12 h-16 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xs text-slate-600 font-bold shrink-0">
                                                            ?
                                                        </div>
                                                    )}
                                                    <div className="min-w-0 flex-1 space-y-1">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="font-bold text-white text-sm group-hover:text-indigo-300 transition-colors">
                                                                {item.title}
                                                            </span>
                                                            {item.year && (
                                                                <span className="text-xs text-slate-400 font-normal">({item.year})</span>
                                                            )}
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                                                                {item.media_type === 'movie' ? 'Film' : 'Dizi'}
                                                            </span>
                                                            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                                                                TMDB #{item.id}
                                                            </span>
                                                            {item.vote_average && (
                                                                <span className="text-xs font-semibold text-amber-400">
                                                                    ★ {item.vote_average.toFixed(1)}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {item.original_title && item.original_title !== item.title && (
                                                            <p className="text-xs text-slate-400 font-mono">
                                                                Orijinal Adı: <span className="text-slate-300">{item.original_title}</span>
                                                            </p>
                                                        )}

                                                        {item.overview && (
                                                            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                                                                {item.overview}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={() => applySingleTmdbSelection(item)}
                                                    disabled={updatingSingleTmdbId === item.id}
                                                    className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all shadow-md shrink-0 flex items-center justify-center gap-1.5 disabled:opacity-50"
                                                >
                                                    {updatingSingleTmdbId === item.id ? (
                                                        <>
                                                            <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                                            <span>Güncelleniyor...</span>
                                                        </>
                                                    ) : (
                                                        <span>Seç & Güncelle</span>
                                                    )}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </AuthenticatedLayout>
    );
}
