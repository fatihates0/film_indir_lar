import ApplicationLogo from '@/Components/ApplicationLogo';
import Dropdown from '@/Components/Dropdown';
import NavLink from '@/Components/NavLink';
import ResponsiveNavLink from '@/Components/ResponsiveNavLink';
import { Link, usePage } from '@inertiajs/react';
import { useState } from 'react';

export default function AuthenticatedLayout({ header, children }) {
    const user = usePage().props.auth.user;
    const [showingNavigationDropdown, setShowingNavigationDropdown] = useState(false);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500 selection:text-white">
            <nav className="sticky top-0 z-50 backdrop-blur-md bg-slate-900/80 border-b border-slate-800/80 shadow-lg shadow-indigo-950/10">
                <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 justify-between items-center">
                        <div className="flex items-center space-x-8">
                            <div className="flex shrink-0 items-center">
                                <Link href="/" className="flex items-center gap-2 group">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 p-2 shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-all">
                                        <svg className="w-full h-full text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                                        </svg>
                                    </div>
                                    <span className="font-extrabold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                                        MEDYA<span className="text-indigo-400">HUB</span>
                                    </span>
                                </Link>
                            </div>

                            <div className="hidden space-x-6 sm:flex">
                                <NavLink
                                    href={route('dashboard')}
                                    active={route().current('dashboard')}
                                    className="text-slate-300 hover:text-white active:text-indigo-400 font-medium"
                                >
                                    Dashboard
                                </NavLink>
                                <NavLink
                                    href={route('media.index')}
                                    active={route().current('media.*')}
                                    className="text-slate-300 hover:text-white active:text-indigo-400 font-medium"
                                >
                                    Medya Kütüphanesi
                                </NavLink>

                                {user.role === 'admin' && (
                                    <>
                                        <NavLink
                                            href={route('admin.dashboard')}
                                            active={route().current('admin.dashboard')}
                                            className="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1.5"
                                        >
                                            <span className="px-1.5 py-0.5 text-xs rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase">Admin</span>
                                            Yönetim
                                        </NavLink>
                                        <NavLink
                                            href={route('admin.storage-boxes.index')}
                                            active={route().current('admin.storage-boxes.*')}
                                            className="text-slate-300 hover:text-white font-medium"
                                        >
                                            Storage Box'lar
                                        </NavLink>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="hidden sm:flex sm:items-center sm:gap-4">
                            <div className="relative">
                                <Dropdown>
                                    <Dropdown.Trigger>
                                        <button
                                            type="button"
                                            className="inline-flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/90 px-3.5 py-2 text-sm font-medium text-slate-200 shadow-sm transition hover:bg-slate-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
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

                                    <Dropdown.Content align="right" className="bg-slate-900 border border-slate-800 text-slate-200">
                                        <div className="px-4 py-2 text-xs text-slate-400 border-b border-slate-800">
                                            {user.email}
                                        </div>
                                        <Dropdown.Link href={route('profile.edit')} className="hover:bg-slate-800 text-slate-300 hover:text-white">
                                            Hesap Ayarları
                                        </Dropdown.Link>
                                        <Dropdown.Link href={route('logout')} method="post" as="button" className="hover:bg-slate-800 text-rose-400 hover:text-rose-300">
                                            Çıkış Yap
                                        </Dropdown.Link>
                                    </Dropdown.Content>
                                </Dropdown>
                            </div>
                        </div>

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

                {showingNavigationDropdown && (
                    <div className="sm:hidden border-b border-slate-800 bg-slate-900 px-4 pt-2 pb-4 space-y-2">
                        <ResponsiveNavLink href={route('dashboard')} active={route().current('dashboard')}>
                            Dashboard
                        </ResponsiveNavLink>
                        <ResponsiveNavLink href={route('media.index')} active={route().current('media.*')}>
                            Medya Kütüphanesi
                        </ResponsiveNavLink>
                        {user.role === 'admin' && (
                            <ResponsiveNavLink href={route('admin.dashboard')} active={route().current('admin.*')}>
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
