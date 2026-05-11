import { useQuery } from '@tanstack/react-query';
import { requirementsApi } from '../../../services/api/requirements';
import { RequirementListQuery } from '../../../types/requirements';

export function useRequirementList(query: RequirementListQuery) {
  return useQuery({
    queryKey: ['requirements', query],
    queryFn: () => requirementsApi.list(query),
  });
}

export function useRequirementDataTree(requirementId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['requirements', requirementId, 'data-tree'],
    queryFn: () => requirementsApi.dataTree(requirementId),
    enabled,
  });
}
