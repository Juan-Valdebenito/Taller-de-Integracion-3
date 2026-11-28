import * as Notifications from 'expo-notifications';
import type { MaybeNotificationResponse } from 'expo-notifications';

export function useNotificationResponse(): MaybeNotificationResponse {
  return Notifications.useLastNotificationResponse();
}
