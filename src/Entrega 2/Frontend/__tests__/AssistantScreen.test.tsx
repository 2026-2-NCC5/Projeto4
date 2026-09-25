import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { AssistantScreen } from '../screens/AssistantScreen';
import { ApiClientError } from '../services/apiClient';
import { MESSAGES } from '../utils/messages';

import { makeAnalysis, recommendationFixture } from './support/fixtures';

const mockAnalyze = jest.fn();
const mockGetLatest = jest.fn();

jest.mock('../services/agentService', () => ({
  agentService: {
    analyze: (...args: unknown[]) => mockAnalyze(...args),
    getLatest: () => mockGetLatest(),
    getRecommendation: jest.fn(),
    getHistory: jest.fn(),
    getRun: jest.fn(),
  },
}));

async function renderReady(onViewSubject = jest.fn()) {
  render(<AssistantScreen onViewSubject={onViewSubject} initialMode="analysis" />);
  await screen.findByText(MESSAGES.emptyRecommendations);
  return onViewSubject;
}

describe('AssistantScreen (modo Análise completa)', () => {
  beforeEach(() => {
    mockAnalyze.mockReset();
    mockGetLatest.mockReset();
    mockGetLatest.mockResolvedValue(null);
  });

  it('carrega a última análise ao abrir e mostra estado vazio quando não há', async () => {
    await renderReady();
    expect(mockGetLatest).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Solicitar análise')).toBeTruthy();
  });

  it('mostra a última análise existente ao abrir', async () => {
    mockGetLatest.mockResolvedValue(makeAnalysis());
    render(<AssistantScreen onViewSubject={jest.fn()} initialMode="analysis" />);
    await screen.findByText(recommendationFixture.message);
    expect(mockAnalyze).not.toHaveBeenCalled();
  });

  it('mostra loading acessível e bloqueia envios duplicados', async () => {
    let resolveAnalyze: (value: unknown) => void = () => undefined;
    mockAnalyze.mockImplementation(() => new Promise((resolve) => (resolveAnalyze = resolve)));
    await renderReady();
    const button = screen.getByLabelText('Solicitar análise');
    fireEvent.press(button);
    fireEvent.press(button);
    await screen.findByText(MESSAGES.analyzing);
    expect(screen.getAllByLabelText(MESSAGES.analyzing).length).toBeGreaterThan(0);
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    expect(mockAnalyze).toHaveBeenCalledTimes(1);
    expect(mockAnalyze.mock.calls[0]?.[0]).toMatch(/^corr-/);
    resolveAnalyze(makeAnalysis());
    await screen.findByText(recommendationFixture.message);
  });

  it('sucesso: mostra mensagem, evidências e próxima ação; "Ver disciplina" navega', async () => {
    mockAnalyze.mockResolvedValue(makeAnalysis());
    const onViewSubject = await renderReady();
    fireEvent.press(screen.getByLabelText('Solicitar análise'));
    await screen.findByText(recommendationFixture.message);
    expect(screen.getByText('Por que estou vendo isso?')).toBeTruthy();
    expect(screen.getByText('Trabalho prático sem entrega registrada')).toBeTruthy();
    expect(screen.getByText(recommendationFixture.nextAction as string)).toBeTruthy();
    expect(screen.getAllByText('90% de confiança').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('⚠ Atividade pendente')).toBeTruthy();
    expect(screen.getByText(/runId: run-001/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Ver disciplina'));
    expect(onViewSubject).toHaveBeenCalledWith('subject-demo-002');
  });

  it('no_action: mostra card de nenhuma situação identificada', async () => {
    mockAnalyze.mockResolvedValue(makeAnalysis({ status: 'no_action', recommendations: [], summary: 'Tudo em dia.' }));
    await renderReady();
    fireEvent.press(screen.getByLabelText('Solicitar análise'));
    await screen.findByText(MESSAGES.noAction);
    expect(screen.queryByTestId('analysis-error')).toBeNull();
  });

  it('abstenção: mostra motivo e não é tratada como erro', async () => {
    mockAnalyze.mockResolvedValue(
      makeAnalysis({ status: 'abstained', abstained: true, abstentionReason: 'Dados insuficientes para o período.', recommendations: [], confidence: null }),
    );
    await renderReady();
    fireEvent.press(screen.getByLabelText('Solicitar análise'));
    await screen.findByText(MESSAGES.abstained);
    expect(screen.getByText('Dados insuficientes para o período.')).toBeTruthy();
    expect(screen.queryByTestId('analysis-error')).toBeNull();
    expect(screen.queryByText(MESSAGES.retry)).toBeNull();
    expect(screen.getByLabelText('Solicitar nova análise')).toBeTruthy();
  });

  it('validação humana: mostra o banner e a próxima ação', async () => {
    mockAnalyze.mockResolvedValue(
      makeAnalysis({
        requiresHumanValidation: true,
        recommendations: [
          { ...recommendationFixture, type: 'institutional_validation', requiresHumanValidation: true, nextAction: 'Procure a secretaria acadêmica.' },
        ],
      }),
    );
    await renderReady();
    fireEvent.press(screen.getByLabelText('Solicitar análise'));
    await screen.findByText(MESSAGES.humanValidation);
    expect(screen.getAllByText('Procure a secretaria acadêmica.').length).toBeGreaterThan(0);
    expect(screen.getByText('ⓘ Validação humana')).toBeTruthy();
  });

  it.each([
    ['timeout', MESSAGES.errorAnalysisTimeout],
    ['dependency', MESSAGES.errorAnalysisDependency],
    ['contract', MESSAGES.errorAnalysisContract],
    ['offline', MESSAGES.errorOffline],
  ] as const)('erro %s mostra a mensagem oficial e permite tentar novamente', async (kind, message) => {
    mockAnalyze.mockRejectedValueOnce(new ApiClientError({ kind, message: 'x' })).mockResolvedValueOnce(makeAnalysis());
    await renderReady();
    fireEvent.press(screen.getByLabelText('Solicitar análise'));
    await screen.findByText(message);
    expect(screen.getByTestId('analysis-error').props.accessibilityRole).toBe('alert');
    fireEvent.press(screen.getByLabelText(MESSAGES.retry));
    await screen.findByText(recommendationFixture.message);
    expect(mockAnalyze).toHaveBeenCalledTimes(2);
  });

  it('mostra o seletor de modo com "Análise completa" selecionado', async () => {
    await renderReady();
    expect(screen.getByLabelText('Análise completa').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByLabelText('Conversar').props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByText('As recomendações apoiam sua decisão. Elas não alteram registros acadêmicos oficiais.')).toBeTruthy();
  });

  it('assistente de voz desativado (VOICE.ENABLED=false): só a análise, com o cabeçalho original e sem seletor', async () => {
    render(<AssistantScreen onViewSubject={jest.fn()} voiceEnabled={false} />);
    await screen.findByText(MESSAGES.emptyRecommendations);
    expect(screen.getByText('Assistente ASA')).toBeTruthy();
    expect(screen.getByLabelText('Solicitar análise')).toBeTruthy();
    expect(screen.queryByLabelText('Conversar')).toBeNull();
    expect(screen.queryByLabelText('Falar com o assistente ASA')).toBeNull();
  });

  it('erro ao carregar a última análise mostra estado de erro com tentar novamente', async () => {
    mockGetLatest.mockRejectedValueOnce(new ApiClientError({ kind: 'server', message: 'x' })).mockResolvedValueOnce(null);
    render(<AssistantScreen onViewSubject={jest.fn()} initialMode="analysis" />);
    await screen.findByText(MESSAGES.errorGeneric);
    fireEvent.press(screen.getByLabelText(MESSAGES.retry));
    await waitFor(() => expect(mockGetLatest).toHaveBeenCalledTimes(2));
    await screen.findByText(MESSAGES.emptyRecommendations);
  });
});
