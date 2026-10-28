import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export function useStat(id, kind, params = {}, enabled = true) {
  const qs = new URLSearchParams(params).toString();
  return useQuery({ queryKey: ['stats', id, kind, qs], queryFn: () => api(`/projects/${id}/stats/${kind}?${qs}`), enabled });
}
