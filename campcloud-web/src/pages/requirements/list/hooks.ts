import { useQuery } from '@tanstack/react-query';
import { requirementsApi } from '../../../services/api/requirements';
import { RequirementListQuery } from '../../../types/requirements';

export function useRequirementList(query: RequirementListQuery) {
  return useQuery({
    queryKey: ['requirements', query],
    queryFn: () => requirementsApi.list(query),
  });
}

export function useRequirementDataTree(
  requirementId: string,
  enabled: boolean,
  options?: { page?: number; pageSize?: number },
) {
  const page = options?.page ?? 1;
  const pageSize = options?.pageSize ?? 20;
  return useQuery({
    queryKey: ['requirements', requirementId, 'data-tree', page, pageSize],
    queryFn: () => requirementsApi.dataTree(requirementId, { page, pageSize }),
    enabled,
  });
}
