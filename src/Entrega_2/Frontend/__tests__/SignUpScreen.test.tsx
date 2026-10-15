import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { DEFAULT_AUTH_POLICY } from '../config/authPolicy';
import { SignUpScreen, validateSignUpFields } from '../screens/SignUpScreen';
import { ApiClientError } from '../services/apiClient';
import { AUTH_ERROR_MESSAGES } from '../services/authErrors';

const mockRegister = jest.fn<Promise<void>, [unknown]>();
const mockGetPrograms = jest.fn();

jest.mock('../hooks/useSession', () => ({
  useSession: () => ({ register: mockRegister, canRememberSession: true }),
}));

jest.mock('../hooks/useAuthPolicy', () => ({
  useAuthPolicy: () => ({ policy: jest.requireActual('../config/authPolicy').DEFAULT_AUTH_POLICY, source: 'fallback', reload: jest.fn() }),
}));

jest.mock('../services/authService', () => ({
  authService: { getPrograms: () => mockGetPrograms() },
}));

const VALID = { fullName: 'Maria Souza', email: 'maria.souza@edu.fecap.br', registrationNumber: '24026962', password: 'Senha@Forte1', confirmPassword: 'Senha@Forte1' };

async function renderScreen() {
  const onBack = jest.fn();
  const utils = render(<SignUpScreen onBack={onBack} />);
  await act(async () => undefined);
  return { ...utils, onBack };
}

function fillValid() {
  fireEvent.changeText(screen.getByLabelText('Nome completo'), VALID.fullName);
  fireEvent.changeText(screen.getByLabelText('E-mail institucional'), VALID.email);
  fireEvent.changeText(screen.getByLabelText('RA (matrícula)'), VALID.registrationNumber);
  fireEvent.changeText(screen.getByLabelText('Senha'), VALID.password);
  fireEvent.changeText(screen.getByLabelText('Confirmar senha'), VALID.confirmPassword);
}

describe('validateSignUpFields', () => {
  it('aplica a política: domínio institucional, RA no padrão, senha forte e confirmação', () => {
    expect(validateSignUpFields(VALID, DEFAULT_AUTH_POLICY)).toEqual({});
    const errors = validateSignUpFields({ ...VALID, email: 'maria@gmail.com', registrationNumber: '12', password: 'fraca', confirmPassword: 'outra' }, DEFAULT_AUTH_POLICY);
    expect(errors.email).toMatch(/e-mail institucional/);
    expect(errors.registrationNumber).toMatch(/RA válido/);
    expect(errors.password).toBeTruthy();
    expect(errors.confirmPassword).toBe('As senhas não coincidem.');
  });
});

describe('SignUpScreen', () => {
  beforeEach(() => {
    mockRegister.mockReset();
    mockGetPrograms.mockReset();
    mockGetPrograms.mockResolvedValue([{ code: 'CC', name: 'Ciência da Computação' }]);
  });

  it('valida localmente antes de enviar e mostra os requisitos de senha ao digitar', async () => {
    await renderScreen();
    fireEvent.press(screen.getByLabelText('Criar minha conta'));
    expect(screen.getByText('Informe seu nome completo.')).toBeTruthy();
    expect(screen.getByText('Informe seu e-mail.')).toBeTruthy();
    expect(screen.getByText('Informe seu RA.')).toBeTruthy();
    expect(mockRegister).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByLabelText('Senha'), 'abc');
    expect(screen.getByText('Pelo menos 8 caracteres')).toBeTruthy();
    expect(screen.getByText('Fraca')).toBeTruthy();
  });

  it('envia os dados normalizados com o curso escolhido e "manter conectado"', async () => {
    mockRegister.mockResolvedValue(undefined);
    await renderScreen();
    fillValid();
    fireEvent.press(await screen.findByLabelText('Ciência da Computação'));
    fireEvent.press(screen.getByLabelText('Criar minha conta'));
    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(1));
    expect(mockRegister).toHaveBeenCalledWith({
      fullName: VALID.fullName,
      email: VALID.email,
      password: VALID.password,
      registrationNumber: VALID.registrationNumber,
      programCode: 'CC',
      rememberMe: false,
    });
  });

  it('erros da API viram mensagens oficiais: conta existente (banner) e domínio não permitido (no campo)', async () => {
    mockRegister.mockRejectedValueOnce(new ApiClientError({ kind: 'validation', message: 'x', reason: 'account_exists', status: 409 }));
    await renderScreen();
    fillValid();
    fireEvent.press(screen.getByLabelText('Criar minha conta'));
    await screen.findByText(AUTH_ERROR_MESSAGES.accountExists);
    expect(screen.getByTestId('signup-error').props.accessibilityRole).toBe('alert');

    mockRegister.mockRejectedValueOnce(new ApiClientError({ kind: 'validation', message: 'x', reason: 'email_domain_not_allowed', status: 422 }));
    fireEvent.press(screen.getByLabelText('Criar minha conta'));
    await waitFor(() => expect(screen.getAllByText(AUTH_ERROR_MESSAGES.emailDomainNotAllowed).length).toBeGreaterThan(0));
    expect(screen.getByLabelText('Criar minha conta').props.accessibilityState.disabled).toBe(false);
  });

  it('"Já tem conta? Entrar" volta para o login', async () => {
    const t = await renderScreen();
    fireEvent.press(screen.getByLabelText('Já tenho conta, entrar'));
    expect(t.onBack).toHaveBeenCalled();
  });
});
