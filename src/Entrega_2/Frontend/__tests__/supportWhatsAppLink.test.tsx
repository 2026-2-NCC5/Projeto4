import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { AppState, Linking, RefreshControl, Text, type AppStateStatus } from 'react-native';

import { setSupportApi } from '../features/support/api';
import { eventsQuery, httpSupportApi } from '../features/support/api/httpSupportApi';
import { createMockSupportApi } from '../features/support/api/mockSupportApi';
import type { SupportApi } from '../features/support/api/types';
import { clearSupportMemoryCache } from '../features/support/cache';
import { SUPPORT } from '../features/support/config';
import { deriveWhatsAppLinkStep } from '../features/support/hooks/useWhatsAppLink';
import { NavigationProvider, useAppNavigation } from '../navigation/AppNavigator';
import { INITIAL_NAVIGATION_STATE, isSupportRoute, navigationReducer, supportRoutes } from '../navigation/navigationReducer';
import { ProfileScreen } from '../screens/ProfileScreen';
import { SupportRouter } from '../screens/support/SupportRouter';
import { ApiClientError, configureApiClient, isApiClientError, resetApiClientForTests } from '../services/apiClient';
import type { SupportContactVerificationView, SupportWhatsAppLinkState } from '../types/api';

import { abortingFetch, fakeResponse, okEnvelope } from './support/fakeFetch';
import { demoSession } from './support/fixtures';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: null })) }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));
jest.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => true, useSystemReduceMotion: () => true }));
jest.mock('../hooks/useSession', () => {
  const session = {
    status: 'authenticated',
    user: { id: 'user-demo-001', fullName: 'Maria Silva Souza', email: 'estudante.exemplo@demo.asa', role: 'student' },
    student: null,
    signOut: jest.fn(async () => undefined),
    biometric: { availability: { status: 'unavailable', kind: null, label: 'biometria', iconName: 'finger-print' }, enabled: false, accountHint: null },
    enableBiometrics: jest.fn(),
    disableBiometrics: jest.fn(),
  };
  return { useSession: () => session, useOptionalSession: () => session };
});
jest.mock('../services/studentService', () => ({
  studentService: {
    getMe: async () => ({ id: 'student-demo-001', userId: 'user-demo-001', fullName: 'Maria Silva Souza', email: 'estudante.exemplo@demo.asa', registrationNumber: '20261234', program: 'Ciência da Computação', role: 'student' }),
  },
}));

configure({ asyncUtilTimeout: 10_000 });
jest.setTimeout(45_000);

const clipboardMock = jest.requireMock('expo-clipboard') as { setStringAsync: jest.Mock };
const CODE = 'ASA-K7M2QX9P';
const OPEN_URL = `https://wa.me/5511999990000?text=${CODE}`;

function linkState(overrides: Partial<SupportWhatsAppLinkState> = {}): SupportWhatsAppLinkState {
  return { available: true, demoMode: false, consentVersion: '2026-11-v1', consentText: 'Ao vincular, você autoriza o ASA a associar seu WhatsApp à sua conta.', links: [], pending: null, ...overrides };
}

function verification(overrides: Partial<SupportContactVerificationView> = {}): SupportContactVerificationView {
  return { id: 'ver-1', status: 'pending', code: null, expiresAt: '2030-01-01T15:10:00.000Z', contactMasked: null, institutionalNumber: '+5511999990000', openUrl: null, previousTicketsCount: 0, ...overrides };
}

const LINK = { id: 'link-1', contactMasked: '+55 11 *****-1234', verifiedAt: '2026-11-01T12:00:00.000Z' };

function setupApi(state: SupportWhatsAppLinkState) {
  const api = {
    ...createMockSupportApi({ latencyMs: 0, seed: false }),
    mode: 'api' as const,
    getWhatsAppLink: jest.fn<Promise<SupportWhatsAppLinkState>, []>(async () => state),
    createWhatsAppVerification: jest.fn<Promise<SupportContactVerificationView>, [{ consentAccepted: boolean; consentVersion: string }]>(async () => verification({ code: CODE, openUrl: OPEN_URL })),
    getWhatsAppVerification: jest.fn<Promise<SupportContactVerificationView>, [string]>(async () => verification()),
    confirmWhatsAppVerification: jest.fn<Promise<SupportWhatsAppLinkState>, [string, { linkPreviousTickets: boolean }]>(async () => linkState({ links: [LINK] })),
    revokeWhatsAppLink: jest.fn<Promise<SupportWhatsAppLinkState>, [string]>(async () => linkState()),
  } satisfies SupportApi;
  setSupportApi(api);
  return api;
}

function Harness() {
  const navigation = useAppNavigation();
  return isSupportRoute(navigation.detail) ? <SupportRouter route={navigation.detail} /> : <Text testID="outside">{navigation.tab}</Text>;
}

function renderLink() {
  return render(
    <NavigationProvider initialState={{ detail: { screen: 'support-whatsapp' } }}>
      <Harness />
    </NavigationProvider>,
  );
}

const accept = () => fireEvent(screen.getByLabelText('Li e aceito este aviso'), 'valueChange', true);

const advance = (ms: number) =>
  act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });

beforeEach(async () => {
  clearSupportMemoryCache();
  await AsyncStorage.clear();
  clipboardMock.setStringAsync.mockClear();
  jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

afterAll(() => setSupportApi(null));

describe('etapas (função pura)', () => {
  it('cada estado do servidor leva a uma etapa', () => {
    expect(deriveWhatsAppLinkStep(null, null, false)).toBe('loading');
    expect(deriveWhatsAppLinkStep(null, null, true)).toBe('error');
    expect(deriveWhatsAppLinkStep(linkState({ available: false }), null, false)).toBe('unavailable');
    expect(deriveWhatsAppLinkStep(linkState({ available: false }), verification(), false)).toBe('unavailable');
    expect(deriveWhatsAppLinkStep(linkState(), null, false)).toBe('consent');
    expect(deriveWhatsAppLinkStep(linkState(), verification(), false)).toBe('pending');
    expect(deriveWhatsAppLinkStep(linkState(), verification({ status: 'proven' }), false)).toBe('proven');
    expect(deriveWhatsAppLinkStep(linkState(), verification({ status: 'review_required' }), false)).toBe('review');
    expect(deriveWhatsAppLinkStep(linkState(), verification({ status: 'expired' }), false)).toBe('restart');
    expect(deriveWhatsAppLinkStep(linkState(), verification({ status: 'cancelled' }), false)).toBe('restart');
    expect(deriveWhatsAppLinkStep(linkState(), verification({ status: 'confirmed' }), false)).toBe('loading');
    expect(deriveWhatsAppLinkStep(linkState({ links: [LINK] }), null, false)).toBe('linked');
  });
});

describe('canal indisponível e demonstração', () => {
  it('sem canal: só a explicação, sem aviso, botão ou rótulo de demonstração', async () => {
    setupApi(linkState({ available: false, demoMode: true }));
    renderLink();
    expect(await screen.findByText('O atendimento pelo WhatsApp não está disponível.')).toBeTruthy();
    expect(screen.queryByTestId('whatsapp-start')).toBeNull();
    expect(screen.queryByTestId('whatsapp-consent-text')).toBeNull();
    expect(screen.queryByText('Modo de demonstração')).toBeNull();
  });

  it('o modo de demonstração do app (mockSupportApi) cai em "não disponível" e não finge um vínculo', async () => {
    const api = createMockSupportApi({ latencyMs: 0 });
    setSupportApi(api);
    expect(await api.getWhatsAppLink()).toMatchObject({ available: false, demoMode: true, links: [], pending: null });
    await expect(api.createWhatsAppVerification({ consentAccepted: true, consentVersion: 'x' })).rejects.toMatchObject({ reason: 'provider_unavailable' });
    renderLink();
    expect(await screen.findByTestId('whatsapp-unavailable')).toBeTruthy();
  });

  it('`demoMode` com canal disponível mostra "Modo de demonstração"', async () => {
    setupApi(linkState({ demoMode: true }));
    renderLink();
    await screen.findByTestId('whatsapp-start');
    expect(screen.getByText('Modo de demonstração')).toBeTruthy();
  });
});

describe('aviso de privacidade', () => {
  it('sem aceite não cria o pedido; com o aceite envia a versão do aviso', async () => {
    const api = setupApi(linkState());
    renderLink();
    await screen.findByText('Ao vincular, você autoriza o ASA a associar seu WhatsApp à sua conta.');

    fireEvent.press(screen.getByTestId('whatsapp-start'));
    expect(api.createWhatsAppVerification).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Li e aceito este aviso').props.value).toBe(false);

    accept();
    fireEvent.press(screen.getByTestId('whatsapp-start'));
    await screen.findByTestId('whatsapp-code');
    expect(api.createWhatsAppVerification).toHaveBeenCalledWith({ consentAccepted: true, consentVersion: '2026-11-v1' });
  });

  it('muitas tentativas (429): mensagem amigável, sem sair do aviso', async () => {
    const api = setupApi(linkState());
    api.createWhatsAppVerification.mockRejectedValueOnce(new ApiClientError({ kind: 'rate_limited', status: 429, message: 'Too many', retryAfterSeconds: 3600 }));
    renderLink();
    await screen.findByTestId('whatsapp-start');
    accept();
    fireEvent.press(screen.getByTestId('whatsapp-start'));
    expect(await screen.findByText('Muitas tentativas seguidas. Aguarde um pouco e tente novamente.')).toBeTruthy();
    expect(screen.getByTestId('whatsapp-consent-text')).toBeTruthy();
    expect(screen.queryByText(/Too many/)).toBeNull();
  });

  it('aviso novo no servidor (409): mostra o motivo e recarrega a versão atual', async () => {
    const api = setupApi(linkState());
    api.createWhatsAppVerification.mockRejectedValueOnce(new ApiClientError({ kind: 'unknown', status: 409, code: 'CONFLICT', reason: 'consent_version_outdated', message: 'O aviso de privacidade mudou. Leia a versão atual e tente de novo.' }));
    renderLink();
    await screen.findByTestId('whatsapp-start');
    accept();
    fireEvent.press(screen.getByTestId('whatsapp-start'));
    expect(await screen.findByText('O aviso de privacidade mudou. Leia a versão atual e tente de novo.')).toBeTruthy();
    await waitFor(() => expect(api.getWhatsAppLink).toHaveBeenCalledTimes(2));
  });
});

describe('pedido pendente', () => {
  async function createPending(api: ReturnType<typeof setupApi>) {
    renderLink();
    await screen.findByTestId('whatsapp-start');
    accept();
    fireEvent.press(screen.getByTestId('whatsapp-start'));
    await screen.findByTestId('whatsapp-code');
    return api;
  }

  /** Relógio controlado desde antes de criar o pedido: a consulta periódica é avançada exatamente. */
  async function createPendingWithFakeTimers() {
    const view = renderLink();
    await screen.findByTestId('whatsapp-start');
    jest.useFakeTimers();
    accept();
    fireEvent.press(screen.getByTestId('whatsapp-start'));
    await advance(0);
    expect(screen.getByTestId('whatsapp-code')).toBeTruthy();
    return view;
  }

  it('mostra o código selecionável, o número do ASA, o prazo e o botão do WhatsApp', async () => {
    const api = setupApi(linkState());
    await createPending(api);
    const code = screen.getByTestId('whatsapp-code');
    expect(code.props.children).toBe(CODE);
    expect(code.props.selectable).toBe(true);
    expect(screen.getByTestId('whatsapp-number').props.accessibilityLabel).toBe('Número do ASA: +5511999990000');
    expect(screen.getByTestId('whatsapp-expiry')).toBeTruthy();
    expect(screen.getByText(/a partir do seu próprio WhatsApp/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('whatsapp-open'));
    expect(Linking.openURL).toHaveBeenCalledWith(OPEN_URL);

    fireEvent.press(screen.getByTestId('whatsapp-copy-code'));
    expect(clipboardMock.setStringAsync).toHaveBeenCalledWith(CODE);
    expect(await screen.findByText('Copiado')).toBeTruthy();
  });

  it('se o WhatsApp não abrir, orienta a enviar o código para o número mostrado', async () => {
    const api = setupApi(linkState());
    await createPending(api);
    jest.spyOn(Linking, 'openURL').mockRejectedValueOnce(new Error('sem app'));
    fireEvent.press(screen.getByTestId('whatsapp-open'));
    expect(await screen.findByText('Não conseguimos abrir o WhatsApp. Envie o código para o número acima.')).toBeTruthy();
    expect(screen.getByTestId('whatsapp-code').props.children).toBe(CODE);
  });

  it('nunca guarda o código no armazenamento local', async () => {
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    const api = setupApi(linkState());
    await createPending(api);
    const written = JSON.stringify(setItem.mock.calls);
    expect(written).not.toContain(CODE);
    const stored = await AsyncStorage.multiGet(await AsyncStorage.getAllKeys());
    expect(JSON.stringify(stored)).not.toContain(CODE);
  });

  it('sem `openUrl` (demonstração) não mostra o botão do WhatsApp', async () => {
    const api = setupApi(linkState({ demoMode: true }));
    api.createWhatsAppVerification.mockResolvedValue(verification({ code: CODE, openUrl: null }));
    await createPending(api);
    expect(screen.queryByTestId('whatsapp-open')).toBeNull();
    expect(screen.getByText('Modo de demonstração')).toBeTruthy();
  });

  it('endereço que não é do WhatsApp nunca é aberto', async () => {
    const api = setupApi(linkState());
    api.createWhatsAppVerification.mockResolvedValue(verification({ code: CODE, openUrl: 'https://exemplo.test/phishing' }));
    await createPending(api);
    expect(screen.queryByTestId('whatsapp-open')).toBeNull();
  });

  it('depois de recarregar, sem o código: orienta a começar de novo se ele foi perdido', async () => {
    const api = setupApi(linkState({ pending: verification() }));
    renderLink();
    expect(await screen.findByText('O código só aparece uma vez')).toBeTruthy();
    expect(screen.queryByTestId('whatsapp-code')).toBeNull();
    expect(screen.queryByTestId('whatsapp-open')).toBeNull();

    fireEvent.press(screen.getByTestId('whatsapp-restart'));
    expect(await screen.findByTestId('whatsapp-consent-text')).toBeTruthy();
    expect(screen.getByLabelText('Li e aceito este aviso').props.value).toBe(false);
    expect(api.getWhatsAppVerification).not.toHaveBeenCalled();
  });

  it('consulta a cada 3 s, mantém o código e passa para "proven" quando o código chega', async () => {
    const api = setupApi(linkState());
    await createPendingWithFakeTimers();
    await advance(SUPPORT.WHATSAPP_POLL_MS - 1);
    expect(api.getWhatsAppVerification).not.toHaveBeenCalled();
    await advance(1);
    expect(api.getWhatsAppVerification).toHaveBeenCalledTimes(1);
    expect(api.getWhatsAppVerification).toHaveBeenCalledWith('ver-1');
    // a consulta devolve o pedido sem código e sem atalho: os dois continuam na tela
    expect(screen.getByTestId('whatsapp-code').props.children).toBe(CODE);
    expect(screen.getByTestId('whatsapp-open')).toBeTruthy();

    await advance(SUPPORT.WHATSAPP_POLL_MS);
    expect(api.getWhatsAppVerification).toHaveBeenCalledTimes(2);

    api.getWhatsAppVerification.mockResolvedValue(verification({ status: 'proven', contactMasked: '+55 11 *****-1234' }));
    await advance(SUPPORT.WHATSAPP_POLL_MS);
    expect(screen.getByText('É este o seu número?')).toBeTruthy();
    expect(screen.queryByTestId('whatsapp-code')).toBeNull();

    // com o código recebido, a consulta periódica para
    const calls = api.getWhatsAppVerification.mock.calls.length;
    await advance(SUPPORT.WHATSAPP_POLL_MS * 5);
    expect(api.getWhatsAppVerification.mock.calls.length).toBe(calls);
  });

  it('não consulta em segundo plano nem depois de sair da tela', async () => {
    let listener: ((state: AppStateStatus) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, next: (state: AppStateStatus) => void) => {
      listener = next;
      return { remove: () => undefined };
    }) as never);
    const api = setupApi(linkState());
    const view = await createPendingWithFakeTimers();

    act(() => listener?.('background'));
    await advance(SUPPORT.WHATSAPP_POLL_MS * 5);
    expect(api.getWhatsAppVerification).not.toHaveBeenCalled();

    act(() => listener?.('active'));
    await advance(SUPPORT.WHATSAPP_POLL_MS);
    expect(api.getWhatsAppVerification).toHaveBeenCalledTimes(1);

    view.unmount();
    await advance(SUPPORT.WHATSAPP_POLL_MS * 5);
    expect(api.getWhatsAppVerification).toHaveBeenCalledTimes(1);
  });

  it('de volta ao app, o pedido em tela que deixou de valer não fica esperando para sempre', async () => {
    let listener: ((state: AppStateStatus) => void) | null = null;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_type: string, next: (state: AppStateStatus) => void) => {
      listener = next;
      return { remove: () => undefined };
    }) as never);
    const api = setupApi(linkState());
    await createPendingWithFakeTimers();
    act(() => listener?.('background'));
    // o servidor não considera mais o pedido aberto: nada de "pending" na volta
    api.getWhatsAppLink.mockResolvedValue(linkState({ pending: null }));
    act(() => listener?.('active'));
    await advance(0);
    expect(screen.getByTestId('whatsapp-restart-step')).toBeTruthy();
    expect(screen.queryByTestId('whatsapp-code')).toBeNull();
  });

  it('falha na consulta vira aviso discreto e a tela continua tentando', async () => {
    const api = setupApi(linkState());
    await createPendingWithFakeTimers();
    api.getWhatsAppVerification.mockRejectedValueOnce(new ApiClientError({ kind: 'offline', message: 'Sem conexão com a internet.' }));
    await advance(SUPPORT.WHATSAPP_POLL_MS);
    expect(screen.getByText('Você está offline. Tente de novo quando a conexão voltar.')).toBeTruthy();
    expect(screen.getByTestId('whatsapp-code').props.children).toBe(CODE);

    await advance(SUPPORT.WHATSAPP_POLL_MS * 2);
    expect(api.getWhatsAppVerification).toHaveBeenCalledTimes(2);
  });

  it('muitas consultas (429): espera o tempo pedido pelo servidor', async () => {
    const api = setupApi(linkState());
    await createPendingWithFakeTimers();
    api.getWhatsAppVerification.mockRejectedValueOnce(new ApiClientError({ kind: 'rate_limited', status: 429, message: 'x', retryAfterSeconds: 20 }));
    await advance(SUPPORT.WHATSAPP_POLL_MS);
    expect(screen.getByText('Muitas tentativas seguidas. Aguarde um pouco e tente novamente.')).toBeTruthy();
    await advance(19_999);
    expect(api.getWhatsAppVerification).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(api.getWhatsAppVerification).toHaveBeenCalledTimes(2);
  });

  it('prazo vencido sem conexão: a própria tela percebe e oferece começar de novo', async () => {
    const api = setupApi(linkState());
    api.createWhatsAppVerification.mockResolvedValue(verification({ code: CODE, openUrl: OPEN_URL, expiresAt: '2020-01-01T00:00:00.000Z' }));
    await createPendingWithFakeTimers();
    api.getWhatsAppVerification.mockRejectedValue(new ApiClientError({ kind: 'offline', message: 'Sem conexão com a internet.' }));
    await advance(SUPPORT.WHATSAPP_POLL_MS);
    expect(screen.getByTestId('whatsapp-restart-step')).toBeTruthy();
  });
});

describe('número comprovado', () => {
  const proven = (overrides: Partial<SupportContactVerificationView> = {}) => verification({ status: 'proven', contactMasked: '+55 11 *****-1234', ...overrides });

  it('pergunta "É este o seu número?" e, com chamados anteriores, o interruptor começa desligado', async () => {
    const api = setupApi(linkState({ pending: proven({ previousTicketsCount: 2 }) }));
    renderLink();
    expect(await screen.findByText('É este o seu número?')).toBeTruthy();
    expect(screen.getByTestId('whatsapp-masked').props.children).toBe('+55 11 *****-1234');
    const toggle = screen.getByLabelText('Trazer 2 atendimentos anteriores para a minha conta');
    expect(toggle.props.value).toBe(false);

    fireEvent.press(screen.getByTestId('whatsapp-confirm'));
    await screen.findByTestId('whatsapp-linked');
    expect(api.confirmWhatsAppVerification).toHaveBeenCalledWith('ver-1', { linkPreviousTickets: false });
  });

  it('só autoriza os chamados anteriores quando o estudante liga o interruptor', async () => {
    const api = setupApi(linkState({ pending: proven({ previousTicketsCount: 1 }) }));
    renderLink();
    const toggle = await screen.findByLabelText('Trazer 1 atendimento anterior para a minha conta');
    fireEvent(toggle, 'valueChange', true);
    fireEvent.press(screen.getByTestId('whatsapp-confirm'));
    await screen.findByTestId('whatsapp-linked');
    expect(api.confirmWhatsAppVerification).toHaveBeenCalledWith('ver-1', { linkPreviousTickets: true });
  });

  it('sem chamados anteriores não há interruptor', async () => {
    const api = setupApi(linkState({ pending: proven({ previousTicketsCount: 0 }) }));
    renderLink();
    await screen.findByText('É este o seu número?');
    expect(screen.queryByTestId('whatsapp-link-previous')).toBeNull();
    fireEvent.press(screen.getByTestId('whatsapp-confirm'));
    await screen.findByTestId('whatsapp-linked');
    expect(api.confirmWhatsAppVerification).toHaveBeenCalledWith('ver-1', { linkPreviousTickets: false });
  });

  it('pedido vencido ao confirmar (409): explica e oferece começar de novo', async () => {
    const api = setupApi(linkState({ pending: proven() }));
    api.confirmWhatsAppVerification.mockRejectedValueOnce(new ApiClientError({ kind: 'unknown', status: 409, code: 'CONFLICT', reason: 'verification_not_ready', message: 'Este pedido não está mais disponível. Comece de novo.' }));
    api.getWhatsAppVerification.mockResolvedValue(verification({ status: 'expired' }));
    renderLink();
    await screen.findByText('É este o seu número?');
    fireEvent.press(screen.getByTestId('whatsapp-confirm'));
    expect(await screen.findByTestId('whatsapp-restart-step')).toBeTruthy();
    expect(screen.getByText('Este pedido não está mais disponível. Comece de novo.')).toBeTruthy();
  });

  it('conflito descoberto ao confirmar cai na análise da equipe, sem falar do número', async () => {
    const api = setupApi(linkState({ pending: proven() }));
    api.confirmWhatsAppVerification.mockResolvedValueOnce(linkState({ pending: verification({ status: 'review_required' }) }));
    renderLink();
    await screen.findByText('É este o seu número?');
    fireEvent.press(screen.getByTestId('whatsapp-confirm'));
    expect(await screen.findByTestId('whatsapp-review')).toBeTruthy();
    expect(screen.queryByText(/1234/)).toBeNull();
  });

  it('"Não é o meu número" volta ao início sem confirmar nada', async () => {
    const api = setupApi(linkState({ pending: proven() }));
    renderLink();
    await screen.findByText('É este o seu número?');
    fireEvent.press(screen.getByTestId('whatsapp-not-mine'));
    expect(await screen.findByTestId('whatsapp-consent-text')).toBeTruthy();
    expect(api.confirmWhatsAppVerification).not.toHaveBeenCalled();
  });
});

describe('análise da equipe', () => {
  it('só o texto genérico, mesmo se o servidor mandar dados do contato', async () => {
    setupApi(linkState({ pending: verification({ status: 'review_required', contactMasked: '+55 11 *****-9999', previousTicketsCount: 3, institutionalNumber: '+5511999990000' }) }));
    renderLink();
    expect(await screen.findByText(/A equipe do ASA vai analisar este pedido/)).toBeTruthy();
    expect(screen.queryByText(/9999/)).toBeNull();
    expect(screen.queryByText(/outra conta|outro dono|já vinculado|já está vinculado/i)).toBeNull();
    expect(screen.queryByTestId('whatsapp-confirm')).toBeNull();
    expect(screen.queryByTestId('whatsapp-link-previous')).toBeNull();
    expect(screen.queryByTestId('whatsapp-number')).toBeNull();
    expect(screen.queryByTestId('whatsapp-restart')).toBeNull();
  });
});

describe('expirado ou cancelado', () => {
  async function createPending() {
    renderLink();
    await screen.findByTestId('whatsapp-start');
    jest.useFakeTimers();
    accept();
    fireEvent.press(screen.getByTestId('whatsapp-start'));
    await advance(0);
    expect(screen.getByTestId('whatsapp-code')).toBeTruthy();
  }

  it('prazo vencido durante a espera: oferece começar de novo e recomeça pelo aceite', async () => {
    const api = setupApi(linkState());
    await createPending();
    api.getWhatsAppVerification.mockResolvedValue(verification({ status: 'expired' }));
    await advance(SUPPORT.WHATSAPP_POLL_MS);
    expect(screen.getByText('O prazo deste código terminou.')).toBeTruthy();
    expect(screen.queryByTestId('whatsapp-code')).toBeNull();

    fireEvent.press(screen.getByTestId('whatsapp-restart'));
    await advance(0);
    expect(screen.getByTestId('whatsapp-consent-text')).toBeTruthy();
    expect(screen.getByLabelText('Li e aceito este aviso').props.value).toBe(false);

    api.createWhatsAppVerification.mockResolvedValue(verification({ id: 'ver-2', code: 'ASA-NEWCODE2', openUrl: null }));
    accept();
    fireEvent.press(screen.getByTestId('whatsapp-start'));
    await advance(0);
    expect(screen.getByTestId('whatsapp-code').props.children).toBe('ASA-NEWCODE2');
  });

  it('cancelado: oferece começar de novo', async () => {
    const api = setupApi(linkState());
    await createPending();
    api.getWhatsAppVerification.mockResolvedValue(verification({ status: 'cancelled' }));
    await advance(SUPPORT.WHATSAPP_POLL_MS);
    expect(screen.getByText('Este pedido não está mais ativo.')).toBeTruthy();
    expect(screen.getByTestId('whatsapp-restart')).toBeTruthy();
  });

  it('pedido que sumou do servidor (404) também oferece começar de novo, sem falar de "chamado"', async () => {
    const api = setupApi(linkState());
    await createPending();
    api.getWhatsAppVerification.mockRejectedValue(new ApiClientError({ kind: 'not_found', status: 404, message: 'Pedido de vinculação não encontrado.' }));
    await advance(SUPPORT.WHATSAPP_POLL_MS);
    expect(screen.getByTestId('whatsapp-restart-step')).toBeTruthy();
    expect(screen.queryByText(/chamado/i)).toBeNull();
  });

  it('a mesma vinculação repetida pelo estudante (confirmed) recarrega e mostra o vínculo', async () => {
    const api = setupApi(linkState());
    await createPending();
    api.getWhatsAppVerification.mockResolvedValue(verification({ status: 'confirmed' }));
    api.getWhatsAppLink.mockResolvedValue(linkState({ links: [LINK] }));
    await advance(SUPPORT.WHATSAPP_POLL_MS);
    await advance(0);
    expect(screen.getByTestId('whatsapp-linked')).toBeTruthy();
  });
});

describe('vínculo ativo', () => {
  it('mostra o número mascarado e desfaz o vínculo só depois de confirmar', async () => {
    const api = setupApi(linkState({ links: [LINK] }));
    renderLink();
    await screen.findByTestId('whatsapp-linked');
    expect(screen.getByText('+55 11 *****-1234')).toBeTruthy();
    expect(screen.getByText(/Os atendimentos que já existem continuam na sua conta\.$/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('whatsapp-revoke-link-1'));
    await screen.findByText('Desfazer o vínculo?');
    expect(api.revokeWhatsAppLink).not.toHaveBeenCalled();
    expect(screen.getByText(/Os atendimentos que já existem continuam na sua conta, e novas mensagens/)).toBeTruthy();

    fireEvent.press(screen.getByTestId('whatsapp-revoke-keep'));
    await waitFor(() => expect(screen.queryByText('Desfazer o vínculo?')).toBeNull());
    expect(api.revokeWhatsAppLink).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('whatsapp-revoke-link-1'));
    fireEvent.press(await screen.findByTestId('whatsapp-revoke-confirm'));
    await waitFor(() => expect(api.revokeWhatsAppLink).toHaveBeenCalledWith('link-1'));
    expect(await screen.findByTestId('whatsapp-consent-text')).toBeTruthy();
    expect(screen.queryByText('+55 11 *****-1234')).toBeNull();
  });

  it('falha ao desfazer mantém o vínculo e a folha aberta, com a mensagem', async () => {
    const api = setupApi(linkState({ links: [LINK] }));
    api.revokeWhatsAppLink.mockRejectedValueOnce(new ApiClientError({ kind: 'offline', message: 'Sem conexão com a internet.' }));
    renderLink();
    await screen.findByTestId('whatsapp-linked');
    fireEvent.press(screen.getByTestId('whatsapp-revoke-link-1'));
    fireEvent.press(await screen.findByTestId('whatsapp-revoke-confirm'));
    expect(await screen.findByText('Você está offline. Tente de novo quando a conexão voltar.')).toBeTruthy();
    expect(screen.getByText('Desfazer o vínculo?')).toBeTruthy();
    expect(screen.getByTestId('whatsapp-linked')).toBeTruthy();
  });

  it('canal desligado com vínculo existente: ainda dá para desfazer (o aviso promete isso)', async () => {
    setupApi(linkState({ available: false, links: [LINK] }));
    renderLink();
    expect(await screen.findByTestId('whatsapp-linked-unavailable')).toBeTruthy();
    expect(screen.getByTestId('whatsapp-revoke-link-1')).toBeTruthy();
    expect(screen.queryByTestId('whatsapp-start')).toBeNull();
  });
});

describe('falha ao carregar', () => {
  it('erro de conexão, sem dados: mensagem amigável e "Tentar novamente"', async () => {
    const api = setupApi(linkState());
    api.getWhatsAppLink.mockRejectedValueOnce(new ApiClientError({ kind: 'offline', message: 'Network request failed' }));
    renderLink();
    expect(await screen.findByText('Não conseguimos carregar esta tela.')).toBeTruthy();
    expect(screen.getByText('Você está offline. Tente de novo quando a conexão voltar.')).toBeTruthy();
    expect(screen.queryByText(/Network request failed/)).toBeNull();
    fireEvent.press(screen.getByTestId('whatsapp-retry'));
    expect(await screen.findByTestId('whatsapp-consent-text')).toBeTruthy();
  });

  it('leitura antiga que chega depois de uma ação não apaga o código', async () => {
    const api = setupApi(linkState());
    renderLink();
    await screen.findByTestId('whatsapp-start');
    let release: (state: SupportWhatsAppLinkState) => void = () => undefined;
    api.getWhatsAppLink.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    // Atualização pendente (puxar a tela) e, enquanto isso, o estudante cria o pedido.
    act(() => screen.UNSAFE_getByType(RefreshControl).props.onRefresh());
    await waitFor(() => expect(api.getWhatsAppLink).toHaveBeenCalledTimes(2));
    accept();
    fireEvent.press(screen.getByTestId('whatsapp-start'));
    await screen.findByTestId('whatsapp-code');
    await act(async () => {
      release(linkState());
    });
    expect(screen.getByTestId('whatsapp-code').props.children).toBe(CODE);
    expect(screen.queryByTestId('whatsapp-restart-step')).toBeNull();
  });
});

describe('navegação', () => {
  it('rota do Atendimento, com voltar para a aba de origem', () => {
    const route = supportRoutes.whatsapp();
    expect(isSupportRoute(route)).toBe(true);
    const fromProfile = navigationReducer({ ...INITIAL_NAVIGATION_STATE, tab: 'profile' }, { type: 'OPEN_SUPPORT_ROUTE', route });
    expect(fromProfile.detail).toEqual({ screen: 'support-whatsapp' });
    const back = navigationReducer(fromProfile, { type: 'GO_BACK' });
    expect(back.detail).toBeNull();
    expect(back.tab).toBe('profile');
  });

  it('Perfil tem a linha "WhatsApp do atendimento", que abre a tela', async () => {
    setupApi(linkState());
    function WithProfile() {
      const navigation = useAppNavigation();
      return isSupportRoute(navigation.detail) ? <SupportRouter route={navigation.detail} /> : <ProfileScreen />;
    }
    render(
      <NavigationProvider initialState={{ tab: 'profile' }}>
        <WithProfile />
      </NavigationProvider>,
    );
    await screen.findByText(demoSession.user.fullName);
    fireEvent.press(screen.getByTestId('profile-whatsapp'));
    expect(await screen.findByTestId('whatsapp-link')).toBeTruthy();
  });

  it('Perfil fora da navegação (testes isolados) simplesmente não mostra a linha', async () => {
    render(<ProfileScreen />);
    await screen.findByText(demoSession.user.fullName);
    expect(screen.queryByTestId('profile-whatsapp')).toBeNull();
  });
});

describe('API HTTP', () => {
  afterEach(() => resetApiClientForTests());

  function client(body: unknown = {}) {
    const fetchFn = jest.fn(async () => fakeResponse(200, okEnvelope(body)));
    configureApiClient({ baseUrl: 'http://api.test', getAccessToken: () => 'token-123', fetchFn: fetchFn as unknown as typeof fetch });
    return fetchFn;
  }

  it('feed: cursor na query, com escape; sem cursor, só a espera', () => {
    expect(eventsQuery({ since: 'abc=/+', wait: 25 })).toBe('/api/support/me/events?since=abc%3D%2F%2B&wait=25');
    expect(eventsQuery({ since: null, wait: 0 })).toBe('/api/support/me/events?wait=0');
  });

  it('long polling: tempo limite acima da espera do servidor, e a chamada pode ser abortada', async () => {
    jest.useFakeTimers();
    const fetchFn = abortingFetch();
    configureApiClient({ baseUrl: 'http://api.test', getAccessToken: () => 'token-123', fetchFn: fetchFn as unknown as typeof fetch });

    let outcome: unknown = null;
    const polling = httpSupportApi.getEvents({ since: 'c1', wait: 25 }).catch((error: unknown) => {
      outcome = error;
    });
    await jest.advanceTimersByTimeAsync(SUPPORT.EVENTS_WAIT_SECONDS * 1000 + 1_000);
    expect(outcome).toBeNull();
    await jest.advanceTimersByTimeAsync(SUPPORT.EVENTS_TIMEOUT_MS);
    await polling;
    expect(isApiClientError(outcome) && outcome.kind).toBe('timeout');

    const controller = new AbortController();
    let cancelled: unknown = null;
    const aborted = httpSupportApi.getEvents({ since: 'c1', wait: 25 }, { signal: controller.signal }).catch((error: unknown) => {
      cancelled = error;
    });
    await jest.advanceTimersByTimeAsync(0);
    controller.abort();
    await aborted;
    expect(isApiClientError(cancelled) && cancelled.kind).toBe('cancelled');
  });

  it('vinculação: rotas, métodos e corpos, sem identificar o estudante', async () => {
    const fetchFn = client();
    await httpSupportApi.getWhatsAppLink();
    await httpSupportApi.createWhatsAppVerification({ consentAccepted: true, consentVersion: 'v1' });
    await httpSupportApi.getWhatsAppVerification('ver/1');
    await httpSupportApi.confirmWhatsAppVerification('ver-1', { linkPreviousTickets: false });
    await httpSupportApi.revokeWhatsAppLink('link-1');
    const calls = (fetchFn.mock.calls as unknown as [string, RequestInit][]).map(([url, init]) => [init.method, url.replace('http://api.test', ''), init.body ?? null]);
    expect(calls).toEqual([
      ['GET', '/api/support/me/whatsapp', null],
      ['POST', '/api/support/me/whatsapp/verifications', JSON.stringify({ consentAccepted: true, consentVersion: 'v1' })],
      ['GET', '/api/support/me/whatsapp/verifications/ver%2F1', null],
      ['POST', '/api/support/me/whatsapp/verifications/ver-1/confirm', JSON.stringify({ linkPreviousTickets: false })],
      ['DELETE', '/api/support/me/whatsapp/links/link-1', null],
    ]);
    const headers = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-123');
    expect(Object.keys(headers).map((name) => name.toLowerCase())).not.toContain('x-api-key');
  });
});
