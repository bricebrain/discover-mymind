import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { fetchCompleteExport, fetchLegacyExport, hasUnavailableFiles } from '../api/export';

export function useDataExport() {
  const mutation = useMutation({
    mutationFn: async (version: 1 | 2) => {
      const date = new Date().toISOString().slice(0, 10);
      if (version === 1) return {
        date, jsonUrl: URL.createObjectURL(await fetchLegacyExport()), markdownUrl: null, partial: false,
      };
      const data = await fetchCompleteExport();
      return {
        date: data.exportedAt.slice(0, 10),
        jsonUrl: URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json;charset=utf-8' })),
        markdownUrl: URL.createObjectURL(new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' })),
        partial: hasUnavailableFiles(data),
      };
    },
    retry: false,
  });
  useEffect(() => () => {
    if (mutation.data) {
      URL.revokeObjectURL(mutation.data.jsonUrl);
      if (mutation.data.markdownUrl) URL.revokeObjectURL(mutation.data.markdownUrl);
    }
  }, [mutation.data]);
  return mutation;
}
