import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { BottomNav } from '../components/BottomNav';
import { StateView } from '../components/StateView';
import { ProfileScreen } from '../screens/ProfileScreen';
import { MESSAGES } from '../utils/messages';

import { demoSession } from './support/fixtures';

const mockSignOut = jest.fn(async () => undefined);
const mockUser = { ...demoSession.user };
const mockStudent = demoSession.student ? { ...demoSession.student } : null;
jest.mock('../hooks/useSession', () => ({
  useSession: () => ({
    status: 'authenticated',
    user: mockUser,
    student: mockStudent,
    signOutReason: null,
    signOut: mockSignOut,
    biometric: { availability: { status: 'unavailable', kind: null, label: 'biometria', iconName: 'finger-print' }, enabled: false, accountHint: null },
    enableBiometrics: jest.fn(),
    disableBiometrics: jest.fn(),
  }),
}));
jest.mock('../services/studentService', () => ({
  studentService: {
    getMe: async () => ({
      id: 'student-demo-001',
      userId: 'user-demo-001',
      fullName: 'Maria Silva Souza',
      email: 'estudante.exemplo@demo.asa',
      role: 'student',
      registrationNumber: '20261234',
      program: 'Ciência da Computação',
    }),
  },
}));

describe('acessibilidade dos controles críticos', () => {
  it('abas da navegação têm role tab, rótulo e estado selecionado', () => {
    const onChange = jest.fn();
    render(<BottomNav active="home" onChange={onChange} />);
    for (const label of ['Início, aba', 'Acadêmico, aba', 'Assistente, aba', 'Serviços, aba', 'Perfil, aba']) {
      const tab = screen.getByLabelText(label);
      expect(tab.props.accessibilityRole).toBe('tab');
    }
    expect(screen.getByLabelText('Início, aba').props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByLabelText('Assistente, aba'));
    expect(onChange).toHaveBeenCalledWith('assistant');
  });

  it('StateView de erro é um alert com botão "Tentar novamente" acessível', () => {
    const onRetry = jest.fn();
    render(<StateView kind="timeout" onRetry={onRetry} testID="state" />);
    expect(screen.getByTestId('state').props.accessibilityRole).toBe('alert');
    expect(screen.getByText(MESSAGES.errorAnalysisTimeout)).toBeTruthy();
    const retry = screen.getByLabelText(MESSAGES.retry);
    expect(retry.props.accessibilityRole).toBe('button');
    fireEvent.press(retry);
    expect(onRetry).toHaveBeenCalled();
  });

  it('StateView de loading expõe o ActivityIndicator com rótulo', () => {
    render(<StateView kind="loading" />);
    expect(screen.getByLabelText(MESSAGES.loadingData)).toBeTruthy();
  });

  it('perfil mostra dados reais e o botão "Sair da conta" acessível chama signOut', async () => {
    render(<ProfileScreen />);
    await screen.findByText('Maria Silva Souza');
    expect(screen.getByLabelText('Matrícula: 20261234')).toBeTruthy();
    expect(screen.getByLabelText('Curso: Ciência da Computação')).toBeTruthy();
    const button = screen.getByLabelText('Sair da conta');
    expect(button.props.accessibilityRole).toBe('button');
    fireEvent.press(button);
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });
});
