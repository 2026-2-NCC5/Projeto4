import { useEffect, type RefObject } from 'react';
import gsap from 'gsap';

const CARD_SELECTOR = '[data-gsap-card], [class*="rounded-lg"][class*="border"][class*="bg-white"], [class*="rounded-xl"][class*="border"][class*="bg-white"]';
const REVEAL_SELECTOR = `[data-gsap-reveal], ${CARD_SELECTOR}, main > section, main > article`;
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Entrance animations and gentle hover/focus lift for the card and block system. */
export function useGsapMotion(containerRef: RefObject<HTMLElement | null>, routeKey?: string) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const shouldReduceMotion = prefersReducedMotion();
    const animated = new WeakSet<Element>();
    const targets = new Set<Element>();
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer?.unobserve(entry.target);
        const target = entry.target as HTMLElement;
        if (shouldReduceMotion) continue;
        gsap.fromTo(target, { autoAlpha: 0, y: 20 }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.56,
          ease: 'power3.out',
          clearProps: 'opacity,visibility,transform',
        });
      }
    }, { threshold: 0.08, rootMargin: '0px 0px -36px 0px' });

    const observe = (element: Element) => {
      if (animated.has(element) || element.closest('[data-gsap-managed]')) return;
      animated.add(element);
      targets.add(element);
      if (observer) observer.observe(element);
    };

    const scan = (node: ParentNode) => {
      if (node instanceof Element && node.matches(REVEAL_SELECTOR)) observe(node);
      node.querySelectorAll(REVEAL_SELECTOR).forEach(observe);
    };

    scan(container);
    const mutations = new MutationObserver((records) => {
      for (const record of records) record.addedNodes.forEach((node) => { if (node instanceof Element) scan(node); });
    });
    mutations.observe(container, { childList: true, subtree: true });

    const cardFrom = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>(CARD_SELECTOR) : null;
    const animateCard = (card: HTMLElement, raised: boolean) => {
      if (!prefersReducedMotion()) gsap.to(card, { y: raised ? -3 : 0, scale: raised ? 1.006 : 1, duration: raised ? 0.2 : 0.24, ease: 'power2.out', overwrite: 'auto' });
    };
    const onPointerOver = (event: PointerEvent) => {
      const card = cardFrom(event.target);
      if (card && !card.contains(event.relatedTarget as Node | null)) animateCard(card, true);
    };
    const onPointerOut = (event: PointerEvent) => {
      const card = cardFrom(event.target);
      if (card && !card.contains(event.relatedTarget as Node | null)) animateCard(card, false);
    };
    const onFocusIn = (event: FocusEvent) => { const card = cardFrom(event.target); if (card) animateCard(card, true); };
    const onFocusOut = (event: FocusEvent) => {
      const card = cardFrom(event.target);
      if (card && !card.contains(event.relatedTarget as Node | null)) animateCard(card, false);
    };

    container.addEventListener('pointerover', onPointerOver);
    container.addEventListener('pointerout', onPointerOut);
    container.addEventListener('focusin', onFocusIn);
    container.addEventListener('focusout', onFocusOut);

    return () => {
      observer?.disconnect();
      mutations.disconnect();
      container.removeEventListener('pointerover', onPointerOver);
      container.removeEventListener('pointerout', onPointerOut);
      container.removeEventListener('focusin', onFocusIn);
      container.removeEventListener('focusout', onFocusOut);
      targets.forEach((target) => {
        gsap.killTweensOf(target);
        gsap.set(target, { clearProps: 'opacity,visibility,transform' });
      });
    };
  }, [containerRef, routeKey]);
}
