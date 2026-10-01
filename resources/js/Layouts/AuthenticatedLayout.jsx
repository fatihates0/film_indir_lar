import Dropdown from '@/Components/Dropdown';
import NavLink from '@/Components/NavLink';
import ResponsiveNavLink from '@/Components/ResponsiveNavLink';
import { Link, usePage } from '@inertiajs/react';
import { useState, useEffect } from 'react';

export default function AuthenticatedLayout({ header, children }) {
    const { auth, flash } = usePage().props;
    const user = auth.user;
    const [showingNavigationDropdown, setShowingNavigationDropdown] = useState(false);
    const [showFlash, setShowFlash] = useState(true);

    useEffect(() => {
        if (flash?.success || flash?.error || flash?.info) {
            setShowFlash(true);
        }
    }, [flash]);

    // Safe route checker to prevent Ziggy parameter sorting errors
    const isCurrentRoute = (prefix) => {
        try {
            const current = route().current();
            if (!current) return false;
            if (prefix.endsWith('*')) {
                const base = prefix.slice(0, -1);
                return current.startsWith(base);
            }
            return current === prefix;
        } catch (e) {
            return false;
        }
    };

    return (
        <div className="min-h-screen bg-[#08090d] text-slate-100 font-sans selection:bg-indigo-600 selection:text-white antialiased relative">
            {/* Top Glowing Ambient Background */}
            <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-64 bg-indigo-600/10 blur-[120px] pointer-events-none rounded-full z-0" />

            {/* Top Navigation */}
            <nav className="sticky top-0 z-50 glass-nav border-b border-white/5 shadow-2xl">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex h-20 justify-between items-center">
                        {/* Brand Logo & Main Nav */}
                        <div className="flex items-center space-x-8 lg:space-x-10">
                            <Link href="/" className="flex items-center gap-3 group">
                                <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-2.5 shadow-lg shadow-indigo-500/25 group-hover:scale-105 group-hover:shadow-indigo-500/40 transition-all duration-300 flex items-center justify-center">
                                    <svg className="w-full h-full text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                                    </svg>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-display font-black text-2xl tracking-wider text-white flex items-center gap-0.5">
                                        CINE<span className="gradient-text-purple">BOX</span>
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase -mt-1">Media Platform</span>
                                </div>
                            </Link>

                            {/* Nav Links Desktop */}
                            <div className="hidden md:flex items-center space-x-1 lg:space-x-2">
                                <NavLink
                                    href={route('dashboard')}
                                    active={isCurrentRoute('dashboard')}
                                    className="px-3.5 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
                                >
                                    Dashboard
                                </NavLink>
                                <NavLink
                                    href={route('media.index')}
                                    active={isCurrentRoute('media.*')}
                                    className="px-3.5 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
                                >
                                    Kütüphane
                                </NavLink>

                                {user.role === 'admin' && (
                                    <div className="flex items-center space-x-1 pl-3 border-l border-white/10">
                                        <span className="mr-2 px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                            Admin
                                        </span>
                                        <NavLink
                                            href={route('admin.dashboard')}
                                            active={isCurrentRoute('admin.dashboard')}
                                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5"
                                        >
                                            Genel Bakış
                                        </NavLink>
                                        <NavLink
                                            href={route('admin.media.index')}
                                            active={isCurrentRoute('admin.media.*')}
                                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5"
                                        >
                                            İçerikler
                                        </NavLink>
                                        <NavLink
                                            href={route('admin.storage-boxes.index')}
                                            active={isCurrentRoute('admin.storage-boxes.*')}
                                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5"
                                        >
                                            Storage Box
                                        </NavLink>
                                        <NavLink
                                            href={route('admin.users.index')}
                                            active={isCurrentRoute('admin.users.*')}
                                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5"
                                        >
                                            Kullanıcılar
                                        </NavLink>
                                        <NavLink
                                            href={route('admin.jellyfin.index')}
                                            active={isCurrentRoute('admin.jellyfin.*')}
                                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/5"
                                        >
                                            Jellyfin
                                        </NavLink>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right Section: User Profile */}
                        <div className="hidden sm:flex sm:items-center sm:gap-4">
                            {/* User Menu Dropdown */}
                            <div className="relative">
                                <Dropdown>
                                    <Dropdown.Trigger>
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/80 px-3.5 py-2 text-sm font-medium text-slate-200 shadow-lg hover:bg-slate-800 hover:border-white/20 transition-all duration-200 focus:outline-none"
                                        >
                                            <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center font-bold text-white text-xs shadow-md">
                                                {user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="font-semibold text-slate-200">{user.name}</span>
                                            <svg className="h-4 w-4 text-slate-400 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                    </Dropdown.Trigger>

                                    <Dropdown.Content align="right" className="bg-[#10131d] border border-white/10 text-slate-200 shadow-2xl rounded-2xl p-2 w-56 backdrop-blur-2xl">
                                        <div className="px-3 py-2.5 mb-1 rounded-xl bg-slate-900/90 border border-white/5">
                                            <div className="text-xs font-bold text-white truncate">{user.name}</div>
                                            <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
                                            <div className="mt-1.5 flex items-center gap-1.5">
                                                <span className={`inline-block w-2 h-2 rounded-full ${user.role === 'admin' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                                                <span className="text-[10px] font-semibold text-slate-300 capitalize">{user.role || 'Kullanıcı'}</span>
                                            </div>
                                        </div>

                                        <Dropdown.Link href={route('dashboard')} className="hover:bg-white/5 rounded-xl text-slate-300 hover:text-white px-3 py-2 text-xs flex items-center gap-2">
                                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                            </svg>
                                            Kontrol Paneli
                                        </Dropdown.Link>
                                        <Dropdown.Link href={route('profile.edit')} className="hover:bg-white/5 rounded-xl text-slate-300 hover:text-white px-3 py-2 text-xs flex items-center gap-2">
                                            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            Hesap Ayarları
                                        </Dropdown.Link>
                                        
                                        <div className="my-1 border-t border-white/5" />
                                        
                                        <Dropdown.Link href={route('logout')} method="post" as="button" className="hover:bg-rose-500/10 rounded-xl text-rose-400 hover:text-rose-300 px-3 py-2 text-xs flex items-center gap-2 w-full text-left">
                                            <svg className="w-4 h-4 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                            </svg>
                                            Güvenli Çıkış
                                        </Dropdown.Link>
                                    </Dropdown.Content>
                                </Dropdown>
                            </div>
                        </div>

                        {/* Mobile Navigation Toggle Button */}
                        <div className="-me-2 flex items-center md:hidden">
                            <button
                                onClick={() => setShowingNavigationDropdown((prev) => !prev)}
                                className="inline-flex items-center justify-center rounded-xl p-2 text-slate-400 hover:bg-white/5 hover:text-white focus:outline-none"
                            >
                                <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
                                    <path
                                        className={!showingNavigationDropdown ? 'inline-flex' : 'hidden'}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M4 6h16M4 12h16M4 18h16"
                                    />
                                    <path
                                        className={showingNavigationDropdown ? 'inline-flex' : 'hidden'}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth="2"
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Mobile Drawer */}
                {showingNavigationDropdown && (
                    <div className="md:hidden border-b border-white/10 bg-[#0c0e17]/95 px-4 pt-3 pb-6 space-y-2 animate-fade-in">
                        <ResponsiveNavLink href={route('dashboard')} active={isCurrentRoute('dashboard')}>
                            Dashboard
                        </ResponsiveNavLink>
                        <ResponsiveNavLink href={route('media.index')} active={isCurrentRoute('media.*')}>
                            Film & Dizi Kütüphanesi
                        </ResponsiveNavLink>
                        
                        {user.role === 'admin' && (
                            <div className="pt-2 border-t border-white/5 space-y-1">
                                <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider px-3 mb-1">Yönetim Modülleri</div>
                                <ResponsiveNavLink href={route('admin.dashboard')} active={isCurrentRoute('admin.dashboard')}>
                                    Admin Genel Bakış
                                </ResponsiveNavLink>
                                <ResponsiveNavLink href={route('admin.media.index')} active={isCurrentRoute('admin.media.*')}>
                                    İçerik Yönetimi
                                </ResponsiveNavLink>
                                <ResponsiveNavLink href={route('admin.storage-boxes.index')} active={isCurrentRoute('admin.storage-boxes.*')}>
                                    Storage Box Sunucuları
                                </ResponsiveNavLink>
                                <ResponsiveNavLink href={route('admin.users.index')} active={isCurrentRoute('admin.users.*')}>
                                    Kullanıcı Yönetimi
                                </ResponsiveNavLink>
                                <ResponsiveNavLink href={route('admin.jellyfin.index')} active={isCurrentRoute('admin.jellyfin.*')}>
                                    Jellyfin Entegrasyonu
                                </ResponsiveNavLink>
                            </div>
                        )}

                        <div className="pt-4 border-t border-white/10">
                            <div className="flex items-center justify-between px-3 mb-2">
                                <div>
                                    <div className="text-sm font-bold text-white">{user.name}</div>
                                    <div className="text-xs text-slate-400">{user.email}</div>
                                </div>
                            </div>
                            <div className="mt-2 space-y-1">
                                <ResponsiveNavLink href={route('profile.edit')}>Hesap Ayarları</ResponsiveNavLink>
                                <ResponsiveNavLink method="post" href={route('logout')} as="button">Çıkış Yap</ResponsiveNavLink>
                            </div>
                        </div>
                    </div>
                )}
            </nav>

            {/* Global Toast / Flash Messages */}
            {showFlash && (flash?.success || flash?.error || flash?.info) && (
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4 animate-slide-up z-40 relative">
                    <div className={`p-4 rounded-2xl flex items-center justify-between border backdrop-blur-xl shadow-xl ${
                        flash?.error 
                            ? 'bg-rose-950/40 border-rose-500/30 text-rose-200' 
                            : flash?.info 
                                ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-200'
                                : 'bg-emerald-950/40 border-emerald-500/30 text-emerald-200'
                    }`}>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-xl ${
                                flash?.error ? 'bg-rose-500/20 text-rose-400' : flash?.info ? 'bg-cyan-500/20 text-cyan-400' : 'bg-emerald-500/20 text-emerald-400'
                            }`}>
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <span className="text-sm font-medium">{flash.success || flash.error || flash.info}</span>
                        </div>
                        <button onClick={() => setShowFlash(false)} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            {/* Optional Page Header */}
            {header && (
                <header className="border-b border-white/5 bg-slate-900/20 backdrop-blur-sm py-6">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{header}</div>
                </header>
            )}

            {/* Main Content Area */}
            <main className="py-8 relative">{children}</main>

            {/* Footer */}
            <footer className="border-t border-white/5 bg-[#06070a] py-8 mt-12 text-center text-slate-500 text-xs relative">
                <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="font-display font-black text-sm text-slate-300">CINEBOX</span>
                        <span>• Yüksek Hızlı Medya ve İndirme Platformu</span>
                    </div>
                    <div className="text-slate-400 text-[11px]">
                        IDM & High-Speed Multi-Thread Streaming Ready
                    </div>
                </div>
            </footer>
        </div>
    );
}

