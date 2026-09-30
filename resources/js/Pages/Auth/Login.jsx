import InputError from '@/Components/InputError';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';

export default function Login({ status, canResetPassword }) {
    const { data, setData, post, processing, errors, reset } = useForm({
        email: '',
        password: '',
        remember: false,
    });

    const submit = (e) => {
        e.preventDefault();
        post(route('login'), {
            onFinish: () => reset('password'),
        });
    };

    return (
        <GuestLayout>
            <Head title="Giriş Yap - CINEBOX" />

            <div className="space-y-2 text-left">
                <h2 className="font-display font-extrabold text-2xl text-white">Hesabınıza Giriş Yapın</h2>
                <p className="text-xs text-slate-400">Film & dizi kütüphanesine ve yüksek hızlı indirme altyapısına erişin.</p>
            </div>

            {status && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-semibold text-emerald-300 text-left">
                    {status}
                </div>
            )}

            <form onSubmit={submit} className="space-y-4 text-left">
                <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">E-Posta Adresi</label>
                    <input
                        id="email"
                        type="email"
                        name="email"
                        value={data.email}
                        className="w-full px-4 py-3 rounded-xl glass-input text-xs text-white placeholder-slate-500"
                        autoComplete="username"
                        placeholder="eposta@ornek.com"
                        onChange={(e) => setData('email', e.target.value)}
                        required
                    />
                    <InputError message={errors.email} className="mt-1" />
                </div>

                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Şifre</label>
                        {canResetPassword && (
                            <Link
                                href={route('password.request')}
                                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                            >
                                Şifremi Unuttum
                            </Link>
                        )}
                    </div>
                    <input
                        id="password"
                        type="password"
                        name="password"
                        value={data.password}
                        className="w-full px-4 py-3 rounded-xl glass-input text-xs text-white placeholder-slate-500"
                        autoComplete="current-password"
                        placeholder="••••••••"
                        onChange={(e) => setData('password', e.target.value)}
                        required
                    />
                    <InputError message={errors.password} className="mt-1" />
                </div>

                <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            name="remember"
                            checked={data.remember}
                            onChange={(e) => setData('remember', e.target.checked)}
                            className="rounded bg-slate-900 border-white/10 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-xs text-slate-300 font-medium">Beni Hatırla</span>
                    </label>
                </div>

                <button
                    type="submit"
                    disabled={processing}
                    className="w-full py-3.5 rounded-xl gradient-button text-white font-bold text-xs shadow-glow-purple transition-all duration-200 mt-2"
                >
                    {processing ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
                </button>

                <div className="pt-4 border-t border-white/5 text-center text-xs text-slate-400">
                    Hesabınız yok mu?{' '}
                    <Link href={route('register')} className="text-indigo-400 font-bold hover:text-indigo-300">
                        Hemen Kayıt Olun
                    </Link>
                </div>
            </form>
        </GuestLayout>
    );
}
