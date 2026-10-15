import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { DataModeBanner, usePlatformInfo } from '@/features/platform/platform';

export function BrandBlock({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div className="flex items-center gap-4">
      {/* logo branco do ASA sobre bloco verde (mesma composição do app) */}
      <span className={size === 'lg' ? 'rounded-lg border-2 border-action bg-action px-4 py-3' : 'rounded-md border-2 border-action bg-action px-3 py-2'}>
        <img src="/brand/asa-logo-white.svg" alt="ASA — Área do Sucesso Alvarista" className={size === 'lg' ? 'h-10 w-auto' : 'h-6 w-auto'} />
      </span>
      <img src="/brand/fecap-logo.svg" alt="FECAP" className={size === 'lg' ? 'h-7 w-auto' : 'h-5 w-auto'} />
    </div>
  );
}

/** Páginas públicas (início e autenticação): faixa de origem dos dados sempre visível. */
export function PublicLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const platform = usePlatformInfo();
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <DataModeBanner info={platform.data} compact />
      <header className="border-b border-line bg-white">
        <div className={`mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-6 ${wide ? 'max-w-6xl' : 'max-w-5xl'}`}>
          <Link to="/" aria-label="ASA Conecta — início">
            <BrandBlock />
          </Link>
          <nav aria-label="Acesso" className="flex items-center gap-2">
            <Link to="/login" className="rounded-md px-3 py-2 text-body font-semibold text-action hover:bg-action-soft">
              Entrar
            </Link>
          </nav>
        </div>
      </header>
      <main id="conteudo" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-line bg-white">
        <div className={`mx-auto flex flex-col gap-1 px-4 py-6 text-caption text-mist sm:px-6 ${wide ? 'max-w-6xl' : 'max-w-5xl'}`}>
          <p>ASA Conecta — projeto acadêmico do Grupo 4 (TDR Devs), Ciência da Computação, FECAP.</p>
          <p>As recomendações do Agente para o Estudante apoiam decisões; matrícula, notas e frequência continuam sob responsabilidade da instituição.</p>
        </div>
      </footer>
    </div>
  );
}
