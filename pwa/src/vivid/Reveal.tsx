import { motion, useReducedMotion } from 'motion/react';
import type { PropsWithChildren } from 'react';

/** Apparition au défilement : l'élément monte et grandit légèrement en entrant à l'écran (une seule fois). */
export function Reveal({ children, className, delay = 0 }: PropsWithChildren<{ className?: string; delay?: number }>) {
  const reduce = useReducedMotion();
  return <motion.div className={className} initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }} whileInView={{ opacity: 1, y: 0, scale: 1 }}
    viewport={{ once: true, margin: '0px 0px -8% 0px' }} transition={{ type: 'spring', stiffness: 170, damping: 22, delay }}>{children}</motion.div>;
}
