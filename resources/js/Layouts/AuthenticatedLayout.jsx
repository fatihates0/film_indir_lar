import ApplicationLogo from '@/Components/ApplicationLogo';
import Dropdown from '@/Components/Dropdown';
import NavLink from '@/Components/NavLink';
import ResponsiveNavLink from '@/Components/ResponsiveNavLink';
import { Link, usePage } from '@inertiajs/react';
import { useState } from 'react';

export default function AuthenticatedLayout({ header, children }) {
    const user = usePage().props.auth.user;
    const [showingNavigationDropdown, setShowingNavigationDropdown] = useState(false);

    // Safe route checker to prevent Ziggy parameter sorting errors on wildcard routes
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
        <div className="min-h-screen bg-[#0a0d14] text-slate-100 font-sans selection:bg-indigo-600 selection:text-white antialiased">
            {/* Top Navigation */}
            <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#0e131f]/85 border-b border-slate-800/80 shadow-2xl shadow-indigo-950/20">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 justify-between items-center">
                        <div className="flex items-center space-x-8">
                            <Link href="/" className="flex items-center gap-2.5 group">
                                <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 p-2 shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-all duration-300">
                                    <svg className="w-full h-full text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                                    </svg>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-black text-xl tracking-tight text-white flex items-center gap-1">
                                        CINEMA<span className="text-indigo-400 font-normal">FLIX</span>
                                    </span>
                                    <span className="text-[9px] text-slate-400 uppercase tracking-widest -mt-1 font-semibold">Premium Download</span>
                                </div>
                            </Link>

                            <div className="hidden space-x-6 sm:flex items-center">
                                <NavLink
                                    href={route('dashboard')}
                                    active={isCurrentRoute('dashboard')}
                                    className="text-slate-300 hover:text-white active:text-indigo-400 font-medium text-sm transition-colors"
                                >
                                    Dashboard
                                </NavLink>
                                <NavLink
                                    href={route('media.index')}
                                    active={isCurrentRoute('media.*')}
                                    className="text-slate-300 hover:text-white active:text-indigo-400 font-medium text-sm transition-colors"
                                >
                                    Film & Dizi Kütüphanesi
                                </NavLink>

                                {user.role === 'admin' && (
                                    <>
                                        <div className="h-4 w-px bg-slate-800 my-auto"></div>
                                        <NavLink
                                            href={route('admin.dashboard')}
                                            active={isCurrentRoute('admin.dashboard')}
                                            className="text-amber-400 hover:text-amber-300 font-medium text-sm flex items-center gap-1.5"
                                        >
                                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase">Admin</span>
                                            Yönetim
                                        </NavLink>
                                        <NavLink
                                            href={route('admin.media.index')}
                                            active={isCurrentRoute('admin.media.*')}
                                            className="text-slate-300 hover:text-white font-medium text-sm transition-colors"
                                        >
                                            İçerik Yönetimi
                                        </NavLink>
                                        <NavLink
                                            href={route('admin.storage-boxes.index')}
                                            active={isCurrentRoute('admin.storage-boxes.*')}
                                            className="text-slate-300 hover:text-white font-medium text-sm transition-colors"
                                        >
                                            Storage Box
                                        </NavLink>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* User Profile */}
                        <div className="hidden sm:flex sm:items-center sm:gap-4">
                            <div className="relative">
                                <Dropdown>
                                    <Dropdown.Trigger>
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-900/90 px-3 py-1.5 text-sm font-medium text-slate-200 shadow-md transition hover:bg-slate-800 hover:border-slate-700 hover:text-white focus:outline-none"
                                        >
                                            <div className="h-7 w-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center font-bold text-indigo-300 text-xs">
                                                {user.name.charAt(0).toUpperCase()}
                                            </div>
                                            <span>{user.name}</span>
                                            <svg className="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>
                                    </Dropdown.Trigger>

                                    <Dropdown.Content align="right" className="bg-[#121724] border border-slate-800 text-slate-200 shadow-2xl rounded-2xl p-1">
                                        <div className="px-4 py-2 text-xs text-slate-400 border-b border-slate-800/80">
                                            {user.email}
                                        </div>
                                        <Dropdown.Link href={route('profile.edit')} className="hover:bg-slate-800/80 rounded-xl text-slate-300 hover:text-white">
                                            Hesap Ayarları
                                        </Dropdown.Link>
                                        <Dropdown.Link href={route('logout')} method="post" as="button" className="hover:bg-rose-500/10 rounded-xl text-rose-400 hover:text-rose-300">
                                            Çıkış Yap
                                        </Dropdown.Link>
                                    </Dropdown.Content>
                                </Dropdown>
                            </div>
                        </div>

                        {/* Mobile Menu Button */}
                        <div className="-me-2 flex items-center sm:hidden">
                            <button
                                onClick={() => setShowingNavigationDropdown((prev) => !prev)}
                                className="inline-flex items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white focus:outline-none"
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

                {/* Mobile Navigation Dropdown */}
                {showingNavigationDropdown && (
                    <div className="sm:hidden border-b border-slate-800 bg-[#0e131f] px-4 pt-2 pb-4 space-y-2">
                        <ResponsiveNavLink href={route('dashboard')} active={isCurrentRoute('dashboard')}>
                            Dashboard
                        </ResponsiveNavLink>
                        <ResponsiveNavLink href={route('media.index')} active={isCurrentRoute('media.*')}>
                            Film & Dizi Kütüphanesi
                        </ResponsiveNavLink>
                        {user.role === 'admin' && (
                            <ResponsiveNavLink href={route('admin.dashboard')} active={isCurrentRoute('admin.*')}>
                                Yönetim Paneli
                            </ResponsiveNavLink>
                        )}
                        <div className="pt-4 border-t border-slate-800">
                            <div className="text-sm font-semibold text-white">{user.name}</div>
                            <div className="text-xs text-slate-400">{user.email}</div>
                            <div className="mt-2 space-y-1">
                                <ResponsiveNavLink href={route('profile.edit')}>Hesap Ayarları</ResponsiveNavLink>
                                <ResponsiveNavLink method="post" href={route('logout')} as="button">Çıkış Yap</ResponsiveNavLink>
                            </div>
                        </div>
                    </div>
                )}
            </nav>

            {header && (
                <header className="bg-slate-900/40 border-b border-slate-800/60 py-6">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{header}</div>
                </header>
            )}

            <main className="py-8">{children}</main>
        </div>
    );
}
