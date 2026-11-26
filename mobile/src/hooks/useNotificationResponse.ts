import type { MaybeNotificationResponse } from 'expo-notifications';

// Fallback used by TypeScript and other non-native targets without an override.
export function useNotificationResponse(): MaybeNotificationResponse {
  return null;
}
