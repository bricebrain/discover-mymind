import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { researchApi } from '../api/research';

export function useResearch() {
  const [selected, setSelected] = useState<string | null>(null);
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['research'] });
    void client.invalidateQueries({ queryKey: ['articles'] });
  };
  const status = useQuery({ queryKey: ['research', 'status'], queryFn: researchApi.status, refetchInterval: 15_000 });
  const drafts = useQuery({ queryKey: ['research', 'drafts'], queryFn: researchApi.drafts, refetchInterval: 15_000 });
  const detail = useQuery({ queryKey: ['research', 'draft', selected], queryFn: () => researchApi.detail(selected!), enabled: !!selected });
  const enable = useMutation({ mutationFn: researchApi.enable, onSuccess: refresh });
  const autoPublish = useMutation({ mutationFn: researchApi.autoPublish, onSuccess: refresh });
  const run = useMutation({ mutationFn: researchApi.run, onSuccess: refresh });
  const publish = useMutation({ mutationFn: researchApi.publish, onSuccess: refresh });
  const reject = useMutation({ mutationFn: researchApi.reject, onSuccess: refresh });
  return { status, drafts, detail, enable, autoPublish, run, publish, reject, selected, setSelected };
}
