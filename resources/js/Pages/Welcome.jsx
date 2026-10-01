import { Head, Link } from '@inertiajs/react';

export default function Welcome({ auth }) {
    return (
        <>
            <Head title="CINEBOX - Yüksek Hızlı Medya ve İndirme Platformu" />
            <div className="min-h-screen bg-[#08090d] text-slate-100 font-sans selection:bg-indigo-600 selection:text-white antialiased overflow-hidden relative">
                {/* Background Ambient Glows */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-indigo-600/20 via-purple-600/10 to-transparent blur-[140px] pointer-events-none rounded-full" />
                <div className="absolute top-1/3 -right-40 w-96 h-96 bg-cyan-500/10 blur-[130px] pointer-events-none rounded-full" />

                {/* Header */}
                <header className="relative z-50 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-24 flex items-center justify-between">
                    <Link href="/" className="flex items-center gap-3 group">
                        <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 p-2.5 shadow-lg shadow-indigo-500/30 group-hover:scale-105 transition-all duration-300 flex items-center justify-center">
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

                    <nav className="flex items-center gap-3">
                        {auth.user ? (
                            <Link
                                href={route('dashboard')}
                                className="px-5 py-2.5 rounded-2xl gradient-button text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 flex items-center gap-2"
                            >
                                Kontrol Paneline Git
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </Link>
                        ) : (
                            <>
                                <Link
                                    href={route('login')}
                                    className="px-4 py-2.5 rounded-2xl text-slate-300 hover:text-white hover:bg-white/5 font-semibold text-sm transition-all"
                                >
                                    Giriş Yap
                                </Link>
                                <Link
                                    href={route('register')}
                                    className="px-5 py-2.5 rounded-2xl gradient-button text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 hover:scale-105 transition-all"
                                >
                                    Kayıt Ol
                                </Link>
                            </>
                        )}
                    </nav>
                </header>

                {/* Hero Section */}
                <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-24 text-center lg:text-left grid lg:grid-cols-12 gap-12 items-center">
                    <div className="lg:col-span-7 space-y-8">
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold backdrop-blur-md">
                            <span className="flex h-2 w-2 rounded-full bg-indigo-400 animate-pulse" />
                            Hetzner Storage Box & IDM Destekli Medya Platformu
                        </div>

                        <h1 className="font-display text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-none">
                            En Yüksek Kalitede <br />
                            <span className="gradient-text-purple">Film & Dizi Arşivi</span>
                        </h1>

                        <p className="text-slate-400 text-base sm:text-lg max-w-2xl leading-relaxed">
                            CINEBOX ile 4K Ultra HD filmleri, dual ses seçenekli dizileri ve yüksek hızlı indirme altyapısını keşfedin. Storage Box entegrasyonu sayesinde IDM ve çoklu bağlantı desteğiyle maksimum hızda indirin.
                        </p>

                        <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 pt-4">
                            <Link
                                href={auth.user ? route('media.index') : route('register')}
                                className="px-8 py-4 rounded-2xl gradient-button text-white font-bold text-base shadow-xl shadow-indigo-600/40 hover:scale-105 transition-all duration-300 flex items-center gap-3"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {auth.user ? 'Kütüphaneyi İncele' : 'Hemen Aramıza Katıl'}
                            </Link>

                            <Link
                                href={auth.user ? route('dashboard') : route('login')}
                                className="px-7 py-4 rounded-2xl glass-panel text-slate-200 hover:text-white hover:border-white/20 font-bold text-base transition-all duration-300 flex items-center gap-2"
                            >
                                <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Yüksek Hızlı İndirme
                            </Link>
                        </div>

                        {/* Feature Tags Badges */}
                        <div className="pt-6 border-t border-white/5 flex flex-wrap items-center justify-center lg:justify-start gap-6 text-slate-400 text-xs font-semibold">
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-emerald-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                IDM Multi-Thread Desteği
                            </div>
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                Plex & Jellyfin Uyumlu
                            </div>
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                TR-EN Çift Ses & Altyazı
                            </div>
                        </div>
                    </div>

                    {/* Right Interactive Movie Card Showcase */}
                    <div className="lg:col-span-5 relative flex justify-center">
                        <div className="w-full max-w-md glass-card rounded-3xl p-5 border border-white/10 shadow-2xl relative group overflow-hidden">
                            <div className="relative aspect-[16/9] rounded-2xl overflow-hidden mb-5 bg-slate-900 border border-white/5">
                                <div className="absolute inset-0 bg-gradient-to-t from-[#08090d] via-transparent to-transparent z-10" />
                                <div className="absolute top-3 left-3 z-20 flex gap-2">
                                    <span className="px-2.5 py-1 rounded-lg gradient-badge-4k text-[10px] tracking-wider uppercase">4K Remux</span>
                                    <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white font-bold text-[10px]">DUAL AUDIO</span>
                                </div>
                                <div className="absolute top-3 right-3 z-20 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-amber-400 font-extrabold text-xs flex items-center gap-1">
                                    ★ 8.9
                                </div>
                                <div className="absolute inset-0 bg-indigo-900/30 group-hover:scale-105 transition-transform duration-700 flex items-center justify-center">
                                    <div className="w-14 h-14 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white shadow-2xl group-hover:scale-110 transition-all">
                                        <svg className="w-6 h-6 fill-current translate-x-0.5" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3 text-left">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-display font-bold text-xl text-white">Dune: Part Two</h3>
                                    <span className="text-xs font-semibold text-slate-400">2024 • 2s 46d</span>
                                </div>
                                <p className="text-xs text-slate-400 line-clamp-2">
                                    Paul Atreides, ailesini yok eden komplo kurucularına karşı intikam mücadelesinde Chani ve Fremen'lerle birleşiyor.
                                </p>
                                
                                <div className="pt-3 border-t border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-2 text-xs font-semibold text-indigo-300">
                                        <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        10 Gbps Hızlı İndirme
                                    </div>
                                    <span className="text-xs text-slate-400 font-mono">42.8 GB</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                {/* Platform Features Grid */}
                <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 border-t border-white/5">
                    <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
                        <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">
                            Neden <span className="gradient-text-purple">CINEBOX</span> Kullanmalısınız?
                        </h2>
                        <p className="text-slate-400 text-sm sm:text-base">
                            Kullanıcı dostu arayüz ve güçlü Hetzner Storage Box mimarisiyle medya deneyiminizi üst seviyeye taşıyoruz.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Feature 1 */}
                        <div className="glass-card rounded-3xl p-8 border border-white/5 text-left space-y-4">
                            <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            </div>
                            <h3 className="font-display font-bold text-xl text-white">IDM & Yüksek Hız</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Internet Download Manager (IDM) desteği sayesinde çoklu bağlantı ile bant genişliğinizin son limitine kadar yüksek hızda indirme yapabilirsiniz.
                            </p>
                        </div>

                        {/* Feature 2 */}
                        <div className="glass-card rounded-3xl p-8 border border-white/5 text-left space-y-4">
                            <div className="w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <h3 className="font-display font-bold text-xl text-white">Plex & Jellyfin Yayını</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                İndirmekle kalmayın; Smart TV, mobil ve bilgisayar cihazlarınızdan Plex ve Jellyfin entegrasyonuyla anında canlı akış gerçekleştirin.
                            </p>
                        </div>

                        {/* Feature 3 */}
                        <div className="glass-card rounded-3xl p-8 border border-white/5 text-left space-y-4">
                            <div className="w-12 h-12 rounded-2xl bg-cyan-600/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                            </div>
                            <h3 className="font-display font-bold text-xl text-white">Sınırsız İndirme Hızı</h3>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Herhangi bir kota veya indirme limiti olmadan tüm medya kütüphanesine yüksek hızda kesintisiz erişim sağlayın.
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </>
    );
}
