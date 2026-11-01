import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useGsapMotion } from '@/components/motion/useGsapMotion';
import { fecapUrls } from '@/features/institutional/content';
import { HermesFloatingAction } from '@/features/assistant/HermesFloatingAction';

const NAV = [
  ['Conheça o ASA', '/conheca-o-asa'], ['Cesta de Serviços', '/cesta-de-servicos'], ['Carreira', '/carreira'],
  ['Para Empresas', '/empresas'], ['Equipe', '/equipe'], ['Atendimento', '/atendimento'],
] as const;

export function BrandBlock({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`rounded-md border border-action bg-action ${size === 'lg' ? 'px-3 py-2' : 'px-2.5 py-1.5'}`}>
        <img src="/brand/asa-logo-white.svg" alt="ASA — Área do Sucesso Alvarista" className={size === 'lg' ? 'h-8 w-auto' : 'h-5 w-auto'} />
      </span>
      <img src="/brand/fecap-logo.svg" alt="FECAP" className={size === 'lg' ? 'h-6 w-auto' : 'h-4 w-auto'} />
    </div>
  );
}

/** Páginas públicas institucionais. O acesso autenticado existente continua disponível no ASA Conecta. */
export function PublicLayout({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  const location = useLocation();
  useGsapMotion(contentRef, location.pathname);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:shadow-md">Pular para o conteúdo</a>
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className={`mx-auto flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 ${wide ? 'max-w-7xl' : 'max-w-5xl'}`}>
          <Link to="/asa-conecta" aria-label="ASA — início"><BrandBlock /></Link>
          <nav aria-label="Navegação principal" className="hidden items-center gap-0.5 xl:flex">
            {NAV.map(([label, href]) => <Link key={href} to={href} className={`rounded-md px-2.5 py-2 text-small font-semibold ${location.pathname === href ? 'bg-action-soft text-action' : 'text-slate hover:bg-snow hover:text-action'}`}>{label}</Link>)}
          </nav>
          <div className="hidden items-center gap-2 sm:flex">
            <a href="https://portal.fecap.br/" target="_blank" rel="noreferrer" className="rounded-md px-3 py-2 text-small font-semibold text-action hover:bg-action-soft">Portal do Aluno</a>
            <Link to="/login" className="rounded-md bg-action px-4 py-2 text-small font-semibold text-white hover:bg-action-hover">Entrar</Link>
          </div>
          <button ref={menuButton} type="button" aria-label={menuOpen ? 'Fechar navegação' : 'Abrir navegação'} aria-expanded={menuOpen} aria-controls="public-navigation" onClick={() => setMenuOpen((value) => !value)} className="rounded-md border border-line p-2 text-action hover:bg-action-soft xl:hidden">
            {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
          </button>
        </div>
        {menuOpen && <nav id="public-navigation" aria-label="Navegação principal" className="border-t border-line bg-white px-4 py-3 xl:hidden">
          <ul className="mx-auto grid max-w-7xl gap-1 sm:grid-cols-2">
            {NAV.map(([label, href]) => <li key={href}><Link to={href} onClick={() => setMenuOpen(false)} className="block rounded-md px-3 py-2.5 font-semibold text-ink hover:bg-action-soft">{label}</Link></li>)}
            <li><a href="https://portal.fecap.br/" onClick={() => setMenuOpen(false)} className="block rounded-md px-3 py-2.5 font-semibold text-action">Portal do Aluno ↗</a></li>
            <li><Link to="/login" onClick={() => setMenuOpen(false)} className="block rounded-md px-3 py-2.5 font-semibold text-action">Entrar no ASA Conecta</Link></li>
          </ul>
        </nav>}
      </header>
      <main ref={contentRef} id="conteudo" tabIndex={-1} className="flex-1 focus:outline-none">{children}</main>
      <footer className="border-t border-line bg-white">
        <div className={`mx-auto grid gap-8 px-4 py-8 text-small text-slate sm:px-6 md:grid-cols-[1fr_2fr] ${wide ? 'max-w-7xl' : 'max-w-5xl'}`}>
          <div><BrandBlock /><p className="mt-4 max-w-sm text-caption text-mist">Área do Sucesso Alvarista — acolhimento, permanência e sucesso do estudante.</p></div>
          <div className="grid gap-6 sm:grid-cols-3">
            <div><p className="font-semibold text-ink">ASA</p><ul className="mt-2 space-y-2">{NAV.slice(0, 2).map(([label, href]) => <li key={href}><Link to={href} className="hover:text-action hover:underline">{label}</Link></li>)}<li><Link to="/equipe" className="hover:text-action hover:underline">Nossa equipe</Link></li></ul></div>
            <div><p className="font-semibold text-ink">Acesso rápido</p><ul className="mt-2 space-y-2"><li><a href={fecapUrls.portal} className="hover:text-action hover:underline">Portal do Aluno</a></li><li><a href={fecapUrls.fecap} className="hover:text-action hover:underline">Site FECAP</a></li><li><a href={fecapUrls.diplomaValidation} className="hover:text-action hover:underline">Validação de Diplomas</a></li><li><a href={fecapUrls.documentValidation} className="hover:text-action hover:underline">Validação de Documentos</a></li><li><a href={fecapUrls.cebas} className="hover:text-action hover:underline">Bolsas de Assistência Social · CEBAS</a></li><li><a href={fecapUrls.emec} className="hover:text-action hover:underline">Cadastro da FECAP no e-MEC</a></li><li><a href={fecapUrls.privacy} className="hover:text-action hover:underline">Privacidade e LGPD</a></li><li><a href={fecapUrls.accessibility} className="hover:text-action hover:underline">Acessibilidade</a></li><li><a href="https://www.facebook.com/Fecap" className="hover:text-action hover:underline">Facebook FECAP</a></li></ul></div>
            <div><p className="font-semibold text-ink">Atendimento</p><ul className="mt-2 space-y-2"><li><a href="mailto:sucessoalvarista@fecap.br" className="hover:text-action hover:underline">sucessoalvarista@fecap.br</a></li><li><a href="tel:+551132722222" className="hover:text-action hover:underline">(11) 3272-2222</a></li><li>Av. da Liberdade, 532 · São Paulo</li></ul></div>
          </div>
          <p className="border-t border-line pt-4 text-caption text-mist md:col-span-2">© Fundação Escola de Comércio Álvares Penteado — FECAP. Conteúdo de serviços vinculado às fontes institucionais oficiais.</p>
        </div>
      </footer>
      <HermesFloatingAction />
    </div>
  );
}
