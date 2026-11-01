import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Pause, Play } from 'lucide-react';
import gsap from 'gsap';
import { fecapPartners } from './fecapPartners';

export function AsaPartnersCarousel() {
  const viewport = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const [autoScroll, setAutoScroll] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const stopForReducedMotion = (event: MediaQueryListEvent) => { if (event.matches) setAutoScroll(false); };
    motionPreference.addEventListener('change', stopForReducedMotion);
    return () => motionPreference.removeEventListener('change', stopForReducedMotion);
  }, []);

  useEffect(() => {
    const element = viewport.current;
    const section = root.current;
    if (!element || !section) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const context = gsap.context(() => {
      if (!prefersReducedMotion) gsap.fromTo(Array.from(section.querySelectorAll('[data-partner-card]')).slice(0, 8),
        { y: 14, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45, stagger: 0.06, ease: 'power2.out', clearProps: 'all' },
      );
    }, section);
    return () => context.revert();
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element || !autoScroll || hovered || focused) return;

    const maxScroll = element.scrollWidth - element.clientWidth;
    if (maxScroll <= 0) return;

    const tween = gsap.to(element, {
      scrollLeft: maxScroll,
      duration: Math.max(22, maxScroll / 65),
      delay: 1,
      repeat: -1,
      yoyo: true,
      repeatDelay: 1.2,
      ease: 'none',
    });
    return () => { tween.kill(); };
  }, [autoScroll, focused, hovered]);

  const move = (direction: -1 | 1) => {
    const element = viewport.current;
    if (!element) return;
    setAutoScroll(false);
    gsap.killTweensOf(element, 'scrollLeft');
    const card = element.querySelector<HTMLElement>('[data-partner-card]');
    const step = card ? card.offsetWidth + 16 : 240;
    gsap.to(element, {
      scrollLeft: Math.max(0, Math.min(element.scrollWidth - element.clientWidth, element.scrollLeft + direction * step * 2)),
      duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.55,
      ease: 'power2.out',
      overwrite: true,
    });
  };

  return <section ref={root} data-gsap-managed aria-labelledby="fecap-partners-title" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!root.current?.contains(event.relatedTarget as Node | null)) setFocused(false); }} className="border-y border-[#dce7e1] bg-[#f4f8f5]">
    <div className="mx-auto max-w-[1240px] px-4 py-9 sm:px-6 sm:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.14em] text-[#08734f]">Conexões institucionais</p><h2 id="fecap-partners-title" className="mt-2 text-2xl font-semibold tracking-tight text-[#063d30] sm:text-3xl">Empresas parceiras da FECAP</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#5b7067]">Conheça organizações listadas no catálogo público do FECAP Presente. Os nomes, logotipos e perfis abaixo são os publicados pela instituição.</p></div>
        <div className="flex gap-2" aria-label="Controles do carrossel de empresas">
          <button type="button" onClick={() => move(-1)} aria-label="Mostrar empresas anteriores" className="grid h-10 w-10 place-items-center rounded-full border border-[#cbdad2] bg-white text-[#063d30] transition-colors hover:border-[#00885f] hover:bg-[#edf6f2]"><ArrowLeft size={18} aria-hidden /></button>
          <button type="button" onClick={() => move(1)} aria-label="Mostrar próximas empresas" className="grid h-10 w-10 place-items-center rounded-full border border-[#cbdad2] bg-white text-[#063d30] transition-colors hover:border-[#00885f] hover:bg-[#edf6f2]"><ArrowRight size={18} aria-hidden /></button>
          <button type="button" onClick={() => { setFocused(false); setAutoScroll((current) => !current); }} aria-label={autoScroll ? 'Pausar rolagem automática' : 'Retomar rolagem automática'} aria-pressed={autoScroll} className="grid h-10 w-10 place-items-center rounded-full border border-[#cbdad2] bg-white text-[#063d30] transition-colors hover:border-[#00885f] hover:bg-[#edf6f2]">
            {autoScroll ? <Pause size={17} aria-hidden /> : <Play size={17} aria-hidden />}
          </button>
        </div>
      </div>
      <div ref={viewport} role="region" aria-label="Empresas parceiras publicadas pela FECAP" tabIndex={0} aria-live={autoScroll ? 'off' : 'polite'} className="mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00885f]">
        {fecapPartners.map((partner) => <a data-partner-card key={partner.href} href={partner.href} target="_blank" rel="noreferrer" className="group flex min-h-[132px] w-[190px] shrink-0 snap-start flex-col items-center justify-between rounded-xl border border-[#dce7e1] bg-white p-4 transition-colors hover:border-[#00a875] sm:w-[220px]">
          <span className="flex h-[76px] w-full items-center justify-center"><img src={partner.logo} alt={`Logo ${partner.name}`} loading="lazy" decoding="async" className="max-h-[68px] max-w-full object-contain" /></span>
          <span className="flex w-full items-center justify-between gap-2 text-xs font-semibold text-[#16483d]"><span className="truncate">{partner.name}</span><ExternalLink size={14} aria-hidden className="shrink-0 text-[#08734f]" /></span>
        </a>)}
      </div>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-[#687b73]"><p>Relação consultada no catálogo oficial FECAP Presente em 31/10/2026.</p><a href="https://www.fecap.br/fecap-presente/nas-empresas/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-[#08734f] hover:underline">Ver catálogo oficial completo <ExternalLink size={13} aria-hidden /></a></div>
    </div>
  </section>;
}
