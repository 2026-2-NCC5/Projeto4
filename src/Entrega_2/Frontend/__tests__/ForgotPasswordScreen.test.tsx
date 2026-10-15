import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { ApiClientError } from '../services/apiClient';
import { AUTH_ERROR_MESSAGES } from '../services/authErrors';

const mockForgot = jest.fn();
const mockResend = jest.fn();
const mockVerify = jest.fn();
const mockReset = jest.fn();
const mockForgetBiometrics = jest.fn(async () => undefined);

jest.mock('../hooks/useSession', () => ({
  useSession: () => ({ forgetBiometricsForEmail: mockForgetBiometrics }),
}));

jest.mock('../hooks/useAuthPolicy', () => ({
  useAuthPolicy: () => ({ policy: jest.requireActual('../config/authPolicy').DEFAULT_AUTH_POLICY, source: 'fallback', reload: jest.fn() }),
}));

jest.mock('../services/authService', () => ({
  authService: {
    forgotPassword: (email: string) => mockForgot(email),
    resendResetCode: (email: string) => mockResend(email),
    verifyResetCode: (email: string, code: string) => mockVerify(email, code),
    resetPassword: (token: string, password: string) => mockReset(token, password),
  },
}));

const CODE_RESPONSE = { message: 'Se existir uma conta, enviamos um código.', codeLength: 6, expiresInSeconds: 600, resendAvailableInSeconds: 60 };

async function renderScreen() {
  const onBack = jest.fn();
  const onDone = jest.fn();
  const utils = render(<ForgotPasswordScreen onBack={onBack} onDone={onDone} now={() => 1_000_000} />);
  await act(async () => undefined);
  return { ...utils, onBack, onDone };
}

describe('ForgotPasswordScreen', () => {
  beforeEach(() => {
    mockForgot.mockReset().mockResolvedValue(CODE_RESPONSE);
    mockResend.mockReset().mockResolvedValue(CODE_RESPONSE);
    mockVerify.mockReset().mockResolvedValue({ resetToken: 'tok-123', expiresInSeconds: 300 });
    mockReset.mockReset().mockResolvedValue({ message: 'ok' });
    mockForgetBiometrics.mockClear();
  });

  it('fluxo completo: e-mail → código → nova senha → concluído', async () => {
    const t = await renderScreen();
    fireEvent.press(screen.getByLabelText('Enviar código de recuperação'));
    expect(screen.getByText('Informe seu e-mail.')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText('E-mail'), 'Maria@edu.fecap.br');
    fireEvent.press(screen.getByLabelText('Enviar código de recuperação'));
    await screen.findByLabelText('Código');
    expect(mockForgot).toHaveBeenCalledWith('Maria@edu.fecap.br');
    expect(screen.getByText(CODE_RESPONSE.message)).toBeTruthy();
    // E-mail mascarado no subtítulo; reenvio bloqueado durante o cooldown.
    expect(screen.getByText(/Ma\*\*\*@edu\.fecap\.br/)).toBeTruthy();
    expect(screen.getByLabelText('Reenviar código em 01:00').props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.changeText(screen.getByLabelText('Código'), '12ab34');
    fireEvent.press(screen.getByLabelText('Confirmar código'));
    expect(screen.getByText('Digite o código de 6 dígitos.')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Código'), '123456');
    fireEvent.press(screen.getByLabelText('Confirmar código'));
    await screen.findByLabelText('Nova senha');
    expect(mockVerify).toHaveBeenCalledWith('Maria@edu.fecap.br', '123456');

    fireEvent.changeText(screen.getByLabelText('Nova senha'), 'Senha@Forte1');
    fireEvent.changeText(screen.getByLabelText('Confirmar nova senha'), 'Senha@Forte1');
    fireEvent.press(screen.getByLabelText('Salvar nova senha'));
    await screen.findByTestId('forgot-done');
    expect(mockReset).toHaveBeenCalledWith('tok-123', 'Senha@Forte1');
    expect(mockForgetBiometrics).toHaveBeenCalledWith('Maria@edu.fecap.br');
    fireEvent.press(screen.getByLabelText('Voltar para entrar'));
    expect(t.onDone).toHaveBeenCalled();
  });

  it('código incorreto mostra tentativas restantes; token expirado volta ao início', async () => {
    mockVerify.mockRejectedValueOnce(new ApiClientError({ kind: 'validation', message: 'x', reason: 'code_invalid', status: 400, attemptsRemaining: 2 }));
    await renderScreen();
    fireEvent.changeText(screen.getByLabelText('E-mail'), 'maria@edu.fecap.br');
    fireEvent.press(screen.getByLabelText('Enviar código de recuperação'));
    await screen.findByLabelText('Código');
    fireEvent.changeText(screen.getByLabelText('Código'), '000000');
    fireEvent.press(screen.getByLabelText('Confirmar código'));
    await screen.findByText('Código incorreto. Você tem 2 tentativas.');

    mockVerify.mockResolvedValueOnce({ resetToken: 'tok-1', expiresInSeconds: 300 });
    fireEvent.press(screen.getByLabelText('Confirmar código'));
    await screen.findByLabelText('Nova senha');
    mockReset.mockRejectedValueOnce(new ApiClientError({ kind: 'validation', message: 'x', reason: 'reset_token_invalid', status: 400 }));
    fireEvent.changeText(screen.getByLabelText('Nova senha'), 'Senha@Forte1');
    fireEvent.changeText(screen.getByLabelText('Confirmar nova senha'), 'Senha@Forte1');
    fireEvent.press(screen.getByLabelText('Salvar nova senha'));
    await screen.findByText(AUTH_ERROR_MESSAGES.resetTokenInvalid);
    await waitFor(() => expect(screen.getByLabelText('E-mail')).toBeTruthy());
  });
});
