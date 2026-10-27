import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

/** Remote push requires a development/production build with the native module included. */
export function canLoadNativeNotifications(): boolean {
  return (Platform.OS === 'ios' || Platform.OS === 'android') && !isRunningInExpoGo();
}

/** Keep expo-notifications from being evaluated in Expo Go: Android loads an unavailable native module eagerly. */
export function loadNativeNotifications(): typeof import('expo-notifications') | null {
  if (!canLoadNativeNotifications()) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- Evaluate only after the Expo Go guard.
  return require('expo-notifications') as typeof import('expo-notifications');
}
