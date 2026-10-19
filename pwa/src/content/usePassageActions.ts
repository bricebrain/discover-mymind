import { useEffect, useRef, useState } from 'react';
import type { ContentSegment } from '../api/contents';
import type { OriginalMenuState } from '../listening/OriginalAccess';

/** La sélection doit appartenir au seul texte anglais d'un passage, sans traduction ni contrôle. */
export function passageSelection(element: HTMLElement): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return '';
  const text = element.querySelector('[data-passage-text]');
  const range = selection.getRangeAt(0);
  return text?.contains(range.startContainer) && text.contains(range.endContainer) ? selection.toString().trim() : '';
}
export function usePassageActions(english: boolean) {
  const [menu, setMenu] = useState<OriginalMenuState | null>(null);
  const [pick, setPick] = useState<{ segment: ContentSegment; index: number; word: string } | null>(null);
  const selectedWord = useRef('');
  const swallowedUntil = useRef(0);
  const frame = useRef<number>();
  useEffect(() => () => { if (frame.current !== undefined) cancelAnimationFrame(frame.current); }, []);
  function open(state: OriginalMenuState, word = '') {
    selectedWord.current = word || passageSelection(state.anchor);
    swallowedUntil.current = Date.now() + 600;
    setMenu(state);
  }
  function afterSelection(anchor: HTMLElement, segment: ContentSegment) {
    if (!english) return;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const word = passageSelection(anchor);
      if (word) open({ segment, anchor }, word);
    });
  }
  function keepWord(index: number) {
    if (!menu) return;
    setPick({ segment: menu.segment, index, word: selectedWord.current });
    setMenu(null);
    window.getSelection()?.removeAllRanges();
  }
  return { menu, pick, open, afterSelection, keepWord, closeMenu: () => setMenu(null), closePick: () => setPick(null),
    swallowClick: () => Date.now() < swallowedUntil.current || !!window.getSelection()?.toString().trim() };
}
