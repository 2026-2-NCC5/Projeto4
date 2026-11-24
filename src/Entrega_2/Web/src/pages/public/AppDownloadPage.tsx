import { Download, ExternalLink, Smartphone } from 'lucide-react';
import { buttonClasses } from '@/components/ui/Button';
import { PublicLayout } from '@/layouts/PublicLayout';

/** Distribuição do app mobile: APK (Android) e atualização EAS aberta pelo Expo Go (Android e iPhone). */
export const APP_DOWNLOAD = {
  apkUrl: '/downloads/asa-conecta.apk',
  apkVersion: '1.0.0',
  apkSize: '24,7 MB',
  expoGoUrl: 'exp://u.expo.dev/5fdd5c41-1692-4544-b951-e0eee3120aa3?channel-name=production&runtime-version=exposdk%3A58.0.0',
  expoGoSdk: 58,
  expoGoAndroid: 'https://play.google.com/store/apps/details?id=host.exp.exponent',
  expoGoIos: 'https://apps.apple.com/app/expo-go/id982107779',
} as const;

function QrCard({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="hidden shrink-0 rounded-lg border border-line bg-white p-3 sm:block">
      <img src={src} alt={alt} width={176} height={176} className="h-44 w-44" />
    </div>
  );
}

export default function AppDownloadPage() {
  return (
    <PublicLayout>
      <header className="border-b border-line bg-white">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 md:py-14">
          <p className="text-small font-bold uppercase tracking-[.12em] text-assistant-text">App ASA Conecta</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight tracking-tight text-fecap md:text-5xl">Leve o ASA Conecta no celular.</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-slate">
            Chamados, agendamentos, base de conhecimento e o assistente do ASA no seu celular. Entre com a mesma conta do portal.
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-10 sm:px-6 md:py-14">
        <section aria-labelledby="app-android" className="flex flex-col gap-6 rounded-lg border border-line bg-white p-6 sm:flex-row sm:items-start sm:p-8">
          <QrCard src="/app/qr-apk.svg" alt="QR code para baixar o APK do ASA Conecta" />
          <div className="min-w-0">
            <h2 id="app-android" className="flex items-center gap-2 text-2xl font-bold text-fecap"><Smartphone size={20} aria-hidden className="shrink-0" /> Android: instalar o APK</h2>
            <p className="mt-2 leading-7 text-slate">Aponte a câmera para o QR code ou toque no botão pelo próprio celular. Versão {APP_DOWNLOAD.apkVersion} ({APP_DOWNLOAD.apkSize}), para Android 7.0 ou mais recente (64 bits).</p>
            <a href={APP_DOWNLOAD.apkUrl} download className={buttonClasses('primary', 'md', 'mt-5 gap-2')}><Download size={18} aria-hidden /> Baixar o APK</a>
            <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-small leading-6 text-slate">
              <li>Abra o arquivo baixado.</li>
              <li>Se o Android pedir, permita instalar apps desta origem (o app ainda não está na Play Store).</li>
              <li>Toque em <strong>Instalar</strong> e abra o ASA Conecta.</li>
            </ol>
          </div>
        </section>

        <section aria-labelledby="app-expo-go" className="flex flex-col gap-6 rounded-lg border border-line bg-white p-6 sm:flex-row sm:items-start sm:p-8">
          <QrCard src="/app/qr-expo-go.svg" alt="QR code para abrir o ASA Conecta no Expo Go" />
          <div className="min-w-0">
            <h2 id="app-expo-go" className="flex items-center gap-2 text-2xl font-bold text-fecap"><Smartphone size={20} aria-hidden className="shrink-0" /> iPhone e Android: abrir no Expo Go</h2>
            <p className="mt-2 leading-7 text-slate">Sem instalar o APK: o app abre dentro do Expo Go (SDK {APP_DOWNLOAD.expoGoSdk}). No iPhone, este é o caminho.</p>
            <a href={APP_DOWNLOAD.expoGoUrl} className={buttonClasses('primary', 'md', 'mt-5 gap-2')}><ExternalLink size={18} aria-hidden /> Abrir no Expo Go</a>
            <ol className="mt-5 list-decimal space-y-1.5 pl-5 text-small leading-6 text-slate">
              <li>
                Instale o Expo Go:{' '}
                <a href={APP_DOWNLOAD.expoGoAndroid} target="_blank" rel="noreferrer" className="font-semibold text-action hover:underline">Google Play</a> ou{' '}
                <a href={APP_DOWNLOAD.expoGoIos} target="_blank" rel="noreferrer" className="font-semibold text-action hover:underline">App Store</a>.
              </li>
              <li>No iPhone, escaneie o QR code com a câmera; no Android, use o leitor de QR code do Expo Go.</li>
              <li>Pelo próprio celular, toque em <strong>Abrir no Expo Go</strong>.</li>
            </ol>
          </div>
        </section>

        <p className="text-caption text-mist">Entrada por voz e "Hey Asa" funcionam no APK; no Expo Go, use o assistente por texto.</p>
      </div>
    </PublicLayout>
  );
}
