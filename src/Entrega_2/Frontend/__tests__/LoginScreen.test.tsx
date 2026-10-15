import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { LoginScreen } from '../screens/LoginScreen';
import { ApiClientError } from '../services/apiClient';
import { MESSAGES } from '../utils/messages';

const mockSignIn = jest.fn<Promise<void>, [string, string]>();
const mockClearSignOutReason = jest.fn();
let mockSignOutReason: 'expired' | null = null;

jest.mock('../hooks/useSession', () => ({
  useSession: () => ({
    status: 'unauthenticated',
    user: null,
    student: null,
    signOutReason: mockSignOutReason,
    signIn: mockSignIn,
    signOut: jest.fn(),
    refresh: jest.fn(),
    clearSignOutReason: mockClearSignOutReason,
  }),
}));

function fill(email: string, password: string) {
  fireEvent.changeText(screen.getByLabelText('E-mail'), email);
  fireEvent.changeText(screen.getByLabelText('Senha'), password);
}

describe('LoginScreen', () => {
  beforeEach(() => {
    mockSignIn.mockReset();
    mockClearSignOutReason.mockReset();
    mockSignOutReason = null;
  });

  it('valida campos obrigatórios antes de enviar', () => {
    render(<LoginScreen />);
    fireEvent.press(screen.getByLabelText('Entrar na sua conta'));
    expect(screen.getByText('Informe seu e-mail.')).toBeTruthy();
    expect(screen.getByText('Informe sua senha.')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('valida formato de e-mail', () => {
    render(<LoginScreen />);
    fill('nao-e-email', 'Demo@2026');
    fireEvent.press(screen.getByLabelText('Entrar na sua conta'));
    expect(screen.getByText('Informe um e-mail válido.')).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('desabilita o botão durante o envio e evita duplo envio', async () => {
    let resolveSignIn: () => void = () => undefined;
    mockSignIn.mockImplementation(() => new Promise<void>((resolve) => (resolveSignIn = resolve)));
    render(<LoginScreen />);
    fill('estudante.exemplo@demo.asa', 'Demo@2026');
    const button = screen.getByLabelText('Entrar na sua conta');
    fireEvent.press(button);
    fireEvent.press(button);
    await waitFor(() => expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true }));
    expect(screen.getByLabelText('Entrando, aguarde')).toBeTruthy();
    fireEvent.press(button);
    expect(mockSignIn).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledWith('estudante.exemplo@demo.asa', 'Demo@2026', { rememberMe: false });
    resolveSignIn();
  });

  it('mostra erro de credenciais inválidas', async () => {
    mockSignIn.mockRejectedValueOnce(new ApiClientError({ kind: 'unauthorized', message: 'x', reason: 'invalid_credentials', status: 401 }));
    render(<LoginScreen />);
    fill('estudante.exemplo@demo.asa', 'errada');
    fireEvent.press(screen.getByLabelText('Entrar na sua conta'));
    await screen.findByText(MESSAGES.errorCredentials);
    expect(screen.getByTestId('login-error').props.accessibilityRole).toBe('alert');
    expect(screen.getByLabelText('Entrar na sua conta').props.accessibilityState.disabled).toBe(false);
  });

  it('mostra erro de rede e de conexão', async () => {
    mockSignIn.mockRejectedValueOnce(new ApiClientError({ kind: 'network', message: 'x' }));
    render(<LoginScreen />);
    fill('estudante.exemplo@demo.asa', 'Demo@2026');
    fireEvent.press(screen.getByLabelText('Entrar na sua conta'));
    await screen.findByText(MESSAGES.errorNetwork);

    mockSignIn.mockRejectedValueOnce(new ApiClientError({ kind: 'offline', message: 'x' }));
    fireEvent.press(screen.getByLabelText('Entrar na sua conta'));
    await screen.findByText(MESSAGES.errorOffline);
  });

  it('alterna visibilidade da senha com rótulo acessível', () => {
    render(<LoginScreen />);
    const toggle = screen.getByLabelText('Mostrar senha');
    expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(true);
    fireEvent.press(toggle);
    expect(screen.getByLabelText('Ocultar senha')).toBeTruthy();
    expect(screen.getByLabelText('Senha').props.secureTextEntry).toBe(false);
  });

  it('exibe aviso de sessão expirada e não mostra atalhos de demonstração', () => {
    mockSignOutReason = 'expired';
    render(<LoginScreen />);
    expect(screen.getByText(MESSAGES.errorUnauthorized)).toBeTruthy();
    expect(screen.queryByText('Ambiente de demonstração')).toBeNull();
    expect(screen.queryByText(/Demo@2026/)).toBeNull();
    expect(screen.queryByLabelText(/Usar credenciais/)).toBeNull();
  });

  it('organiza os textos em blocos e liga os links de criar conta e redefinir senha', () => {
    const onCreateAccount = jest.fn();
    const onForgotPassword = jest.fn();
    render(<LoginScreen onCreateAccount={onCreateAccount} onForgotPassword={onForgotPassword} />);
    expect(screen.getByText('Bem-vindo ao ASA')).toBeTruthy();
    expect(screen.getByText('Acesse sua conta')).toBeTruthy();
    expect(screen.getByLabelText('Logo ASA')).toBeTruthy();
    expect(screen.getByLabelText('Logo FECAP')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Criar conta de estudante'));
    expect(onCreateAccount).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Esqueci minha senha'));
    expect(onForgotPassword).toHaveBeenCalledTimes(1);
  });
});
