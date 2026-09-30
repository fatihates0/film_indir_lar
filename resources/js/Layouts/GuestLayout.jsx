import { Link } from '@inertiajs/react';

export default function GuestLayout({ children }) {
    return (
        <div className="min-h-screen bg-[#08090d] text-slate-100 font-sans selection:bg-indigo-600 selection:text-white antialiased flex flex-col items-center justify-center p-4 relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/15 blur-[140px] pointer-events-none rounded-full" />
            <div className="absolute top-1/4 right-1/4 w-80 h-80 bg-purple-600/10 blur-[120px] pointer-events-none rounded-full" />

            <div className="relative z-10 w-full max-w-md space-y-6">
                {/* Brand Header */}
                <div className="flex flex-col items-center text-center space-y-2">
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-3 shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-all duration-300 flex items-center justify-center">
                            <svg className="w-full h-full text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                            </svg>
                        </div>
                        <div className="flex flex-col text-left">
                            <span className="font-display font-black text-2xl tracking-wider text-white flex items-center gap-0.5">
                                CINE<span className="gradient-text-purple">BOX</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-semibold tracking-widest uppercase -mt-1">Media Platform</span>
                        </div>
                    </Link>
                </div>

                {/* Glass Container Card */}
                <div className="glass-panel rounded-3xl border border-white/10 p-6 sm:p-8 shadow-2xl space-y-6 backdrop-blur-2xl">
                    {children}
                </div>

                {/* Footer Back Link */}
                <div className="text-center">
                    <Link href="/" className="text-xs text-slate-400 hover:text-white transition-colors font-medium">
                        ← Ana Sayfaya Dön
                    </Link>
                </div>
            </div>
        </div>
    );
}
