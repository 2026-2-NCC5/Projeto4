import * as Expo from 'expo';
import { Platform } from 'react-native';

import { canLoadNativeNotifications, loadNativeNotifications } from '../features/dynamicNotifications/nativeNotifications';

jest.mock('expo-notifications', () => ({ __esModule: true }));

describe('native notification runtime guard', () => {
  const platformDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
  const isRunningInExpoGo = Expo.isRunningInExpoGo as jest.MockedFunction<typeof Expo.isRunningInExpoGo>;

  afterEach(() => {
    if (platformDescriptor) Object.defineProperty(Platform, 'OS', platformDescriptor);
    jest.clearAllMocks();
  });

  it('does not evaluate expo-notifications in Expo Go on Android', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    isRunningInExpoGo.mockReturnValue(true);

    expect(canLoadNativeNotifications()).toBe(false);
    expect(loadNativeNotifications()).toBeNull();
  });

  it('loads expo-notifications in a native development build', () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    isRunningInExpoGo.mockReturnValue(false);

    expect(canLoadNativeNotifications()).toBe(true);
    expect(loadNativeNotifications()).toEqual({ __esModule: true });
  });
});
