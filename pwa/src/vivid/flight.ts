import { animate } from 'motion';
import { useLayoutEffect, type RefObject } from 'react';

/**
 * Transition « la pochette vole de la carte au détail ». Au toucher, la carte mémorise la position de sa vignette à l'écran ;
 * le détail, une fois affiché (en haut de page), anime sa grande image depuis cette position. Fait à la main plutôt qu'avec
 * `layoutId`, parce que le fil remonte en haut de page à l'ouverture du détail, ce qui fausse les positions mesurées.
 */
let origin: { key: string; rect: DOMRect; at: number } | null = null;

export function rememberOrigin(key: string, element: Element | null | undefined) {
  if (element) origin = { key, rect: element.getBoundingClientRect(), at: Date.now() };
}

export function useFlightFrom(key: string | null, target: RefObject<HTMLElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const from = origin;
    if (!enabled || !key || !from || from.key !== key || Date.now() - from.at > 1500 || !target.current) return;
    origin = null;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const el = target.current, to = el.getBoundingClientRect();
    if (!to.width) return;
    el.style.transformOrigin = 'top left';
    const controls = animate(el, {
      x: [from.rect.left - to.left, 0], y: [from.rect.top - to.top, 0],
      scale: [from.rect.width / to.width, 1], borderRadius: ['14px', '16px'],
    }, { type: 'spring', stiffness: 230, damping: 26 });
    return () => controls.stop();
  }, [key, enabled, target]);
}
