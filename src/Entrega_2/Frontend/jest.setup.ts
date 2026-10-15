// Mocks globais de módulos nativos do Expo para o ambiente de testes (jest-expo).

// Reanimated 4: o módulo nativo de worklets não existe no Jest — usamos o mock oficial do pacote
// (worklets rodam na thread JS) e setUpTests registra os matchers/timer do Reanimated.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/src/mock'));

// eslint-disable-next-line import/first
import { setUpTests } from 'react-native-reanimated';

setUpTests();

jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-secure-store', () => {
  const memory = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => memory.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      memory.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      memory.delete(key);
    }),
    isAvailableAsync: jest.fn(async () => true),
    __memory: memory,
  };
});

jest.mock('expo-network', () => ({
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, isInternetReachable: true, type: 'WIFI' })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  NetworkStateType: { WIFI: 'WIFI', NONE: 'NONE' },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
  default: { expoConfig: { hostUri: 'localhost:8081' }, manifest: null, executionEnvironment: 'bare' },
}));

// Ícones: evita carregamento assíncrono de fontes (e avisos de act()) nos testes.
jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  const Icon = ({ name, ...props }: { name: string } & Record<string, unknown>) =>
    React.createElement(Text, { ...props, testID: `icon-${name}` }, String(name));
  return { Ionicons: Icon, __esModule: true };
});

// Safe area: insets zerados e sem exigir provider nos testes de tela.
jest.mock('react-native-safe-area-context', () => jest.requireActual('react-native-safe-area-context/jest/mock').default);

// ------------------------------------------------------------------ assistente por voz
// Text-to-Speech: nenhum áudio real nos testes.
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(async () => undefined),
  isSpeakingAsync: jest.fn(async () => false),
  getAvailableVoicesAsync: jest.fn(async () => []),
  maxSpeechInputLength: 4000,
}));

// expo (isRunningInExpoGo / requireOptionalNativeModule): nenhum módulo nativo opcional nos testes.
jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  isRunningInExpoGo: jest.fn(() => false),
  requireOptionalNativeModule: jest.fn(() => null),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Reconhecimento de fala: módulo inerte. Testes do adapter injetam um emissor de eventos próprio.
jest.mock('expo-speech-recognition', () => ({
  ExpoSpeechRecognitionModule: {
    start: jest.fn(),
    stop: jest.fn(),
    abort: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    getPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'undetermined', canAskAgain: true })),
    requestPermissionsAsync: jest.fn(async () => ({ granted: false, status: 'denied', canAskAgain: false })),
    isRecognitionAvailable: jest.fn(() => false),
  },
}));
