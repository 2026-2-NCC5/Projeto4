import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { HomeScreen } from '../screens/HomeScreen';
import { ApiClientError } from '../services/apiClient';
import { MESSAGES } from '../utils/messages';

import { demoSession, emptySummaryFixture, summaryFixture } from './support/fixtures';

const mockGetSummary = jest.fn();
const mockUser = { ...demoSession.user };
const mockStudent = demoSession.student ? { ...demoSession.student } : null;

const mockGetSubjects = jest.fn(async () => []);
const mockGetPendingItems = jest.fn(async () => []);
const mockGetAssessments = jest.fn(async () => []);

jest.mock('../services/studentService', () => ({
  studentService: {
    getSummary: () => mockGetSummary(),
    getSubjects: () => mockGetSubjects(),
    getPendingItems: () => mockGetPendingItems(),
    getAssessments: () => mockGetAssessments(),
  },
}));

/** Quinta-feira, 17/09/2026 às 9h: saudação "Bom dia" determinística. */
const NOW = new Date(2026, 8, 17, 9, 0, 0);

jest.mock('../hooks/useSession', () => ({
  useSession: () => ({ status: 'authenticated', user: mockUser, student: mockStudent, signOutReason: null }),
}));

describe('HomeScreen', () => {
  beforeEach(() => mockGetSummary.mockReset());

  it('mostra loading oficial e depois o resumo com dados reais', async () => {
    mockGetSummary.mockResolvedValue(summaryFixture);
    const onNavigate = jest.fn();
    render(<HomeScreen onNavigate={onNavigate} now={NOW} />);
    expect(screen.getByTestId('summary-skeleton')).toBeTruthy();
    await screen.findByText('Bom dia, Maria');
    expect(screen.getByText('Quinta-feira, 17 de setembro')).toBeTruthy();
    expect(screen.getByLabelText(/Pendências: 1/)).toBeTruthy();
    expect(screen.getByLabelText('Média geral: 8,2, escala 0 a 10')).toBeTruthy();
    expect(screen.getByLabelText('Frequência: 90%, média')).toBeTruthy();
    // "Para você": recomendação real da última análise (nunca inventada)
    expect(screen.getByText(summaryFixture.lastAnalysis!.summary)).toBeTruthy();
    expect(screen.getByText('Como posso ajudar hoje?')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Abrir o assistente'));
    expect(onNavigate).toHaveBeenCalledWith('assistant');
    fireEvent.press(screen.getByLabelText('Falar com o assistente'));
    expect(onNavigate).toHaveBeenCalledWith('assistant');
  });

  it('estado vazio (sem disciplinas) não é tratado como erro', async () => {
    mockGetSummary.mockResolvedValue(emptySummaryFixture);
    render(<HomeScreen onNavigate={jest.fn()} now={NOW} />);
    await screen.findByText('Nenhuma disciplina no período atual');
    expect(screen.queryByText(MESSAGES.errorGeneric)).toBeNull();
    expect(screen.getByText(new RegExp(MESSAGES.noAnalysisYet))).toBeTruthy();
    expect(screen.getByTestId('upcoming-empty')).toBeTruthy();
  });

  it('erro de carregamento mostra a mensagem oficial e permite tentar novamente', async () => {
    mockGetSummary.mockRejectedValueOnce(new ApiClientError({ kind: 'server', message: 'x' })).mockResolvedValueOnce(summaryFixture);
    render(<HomeScreen onNavigate={jest.fn()} now={NOW} />);
    await screen.findByText('Não conseguimos carregar suas informações agora');
    fireEvent.press(screen.getByLabelText(MESSAGES.retry));
    await screen.findByLabelText('Frequência: 90%, média');
  });
});
