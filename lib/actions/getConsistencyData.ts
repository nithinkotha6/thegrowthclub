import { getConsistencyData as getConsistencyDataAction } from '@/app/actions/dailyGoals';

export async function getConsistencyData(
  userId?: string,
  groupId?: string,
  metric: string = 'all'
) {
  return getConsistencyDataAction(userId, groupId, metric);
}
