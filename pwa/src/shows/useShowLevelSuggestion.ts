import { useState } from 'react';
import { useLevelSuggestion, useUpdateShow, type Show } from '../api/shows';
import { ignoreLevel, ignoredLevelKey, isLevelIgnored, shouldOfferLevel } from './suggestionLogic';

export function useShowLevelSuggestion(show: Show) {
  const query = useLevelSuggestion(show.id);
  const update = useUpdateShow();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const suggestion = query.data?.levelSuggestion;
  const key = suggestion ? ignoredLevelKey(show.id, suggestion.suggestedLevel) : '';
  const ignored = hidden.has(key) || (!!suggestion && isLevelIgnored(show.id, suggestion.suggestedLevel));
  const visible = shouldOfferLevel(suggestion, show.id, show.autoLevel, ignored);
  const hide = () => setHidden((previous) => new Set(previous).add(key));

  return {
    query, update, suggestion: visible ? suggestion : null,
    dismiss: () => {
      if (!visible) return;
      ignoreLevel(show.id, suggestion.suggestedLevel);
      hide();
    },
    apply: () => {
      if (!visible || update.isPending) return;
      update.mutate({ id: show.id, autoLevel: suggestion.suggestedLevel });
    },
  };
}
