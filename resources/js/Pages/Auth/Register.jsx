import InputError from '@/Components/InputError';
import GuestLayout from '@/Layouts/GuestLayout';
import { Head, Link, useForm } from '@inertiajs/react';

export default function Register() {
    const { data, setData, post, processing, errors, reset } = useForm({
        name: '',
        email: '',
        password: '',
        password_confirmation: '',
    });

    const submit = (e) => {
        e.preventDefault();
        post(route('register'), {
            onFinish: () => reset('password', 'password_confirmation'),
        });
    };

    return (
        <GuestLayout>
            <Head title="Kayıt Ol - CINEBOX" />

            <div className="space-y-2 text-left">
                <h2 className="font-display font-extrabold text-2xl text-white">Yeni Hesap Oluştur</h2>
                <p className="text-xs text-slate-400">Ücretsiz üye olun ve zengin film ve dizi kütüphanesini kullanmaya başlayın.</p>
            </div>

            <form onSubmit={submit} className="space-y-4 text-left">
                <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ad Soyad</label>
                    <input
                        id="name"
                        type="text"
                        name="name"
                        value={data.name}
                        className="w-full px-4 py-3 rounded-xl glass-input text-xs text-white placeholder-slate-500"
                        autoComplete="name"
                        placeholder="Ahmet Yılmaz"
                        onChange={(e) => setData('name', e.target.value)}
                        required
                    />
                    <InputError message={errors.name} className="mt-1" />
                </div>

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
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Şifre</label>
                    <input
                        id="password"
                        type="password"
                        name="password"
                        value={data.password}
                        className="w-full px-4 py-3 rounded-xl glass-input text-xs text-white placeholder-slate-500"
                        autoComplete="new-password"
                        placeholder="En az 8 karakter"
                        onChange={(e) => setData('password', e.target.value)}
                        required
                    />
                    <InputError message={errors.password} className="mt-1" />
                </div>

                <div className="space-y-1">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Şifre Tekrarı</label>
                    <input
                        id="password_confirmation"
                        type="password"
                        name="password_confirmation"
                        value={data.password_confirmation}
                        className="w-full px-4 py-3 rounded-xl glass-input text-xs text-white placeholder-slate-500"
                        autoComplete="new-password"
                        placeholder="Şifrenizi tekrar girin"
                        onChange={(e) => setData('password_confirmation', e.target.value)}
                        required
                    />
                    <InputError message={errors.password_confirmation} className="mt-1" />
                </div>

                <button
                    type="submit"
                    disabled={processing}
                    className="w-full py-3.5 rounded-xl gradient-button text-white font-bold text-xs shadow-glow-purple transition-all duration-200 mt-2"
                >
                    {processing ? 'Hesap Oluşturuluyor...' : 'Kayıt Ol'}
                </button>

                <div className="pt-4 border-t border-white/5 text-center text-xs text-slate-400">
                    Zaten hesabınız var mı?{' '}
                    <Link href={route('login')} className="text-indigo-400 font-bold hover:text-indigo-300">
                        Giriş Yapın
                    </Link>
                </div>
            </form>
        </GuestLayout>
    );
}
