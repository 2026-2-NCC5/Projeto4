import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { HistoryScreen } from '../screens/HistoryScreen';
import { MESSAGES } from '../utils/messages';

import { historyFixture } from './support/fixtures';

const mockGetHistory = jest.fn();

jest.mock('../services/agentService', () => ({
  agentService: { getHistory: () => mockGetHistory() },
}));

describe('HistoryScreen', () => {
  beforeEach(() => mockGetHistory.mockReset());

  it('lista as análises com status, resumo, contagem e runId; toque abre o detalhe', async () => {
    mockGetHistory.mockResolvedValue(historyFixture);
    const onOpenRun = jest.fn();
    render(<HistoryScreen onOpenRun={onOpenRun} />);
    await screen.findByText('⚠ Com recomendações');
    expect(screen.getByText('✓ Sem ações necessárias')).toBeTruthy();
    expect(screen.getByText(historyFixture[0]!.summary)).toBeTruthy();
    expect(screen.getByText('1 recomendação')).toBeTruthy();
    expect(screen.getByText('0 recomendações')).toBeTruthy();
    expect(screen.getByText('runId: run-002')).toBeTruthy();
    fireEvent.press(screen.getByTestId('history-run-002'));
    expect(onOpenRun).toHaveBeenCalledWith('run-002');
  });

  it('estado vazio mostra a mensagem oficial', async () => {
    mockGetHistory.mockResolvedValue([]);
    render(<HistoryScreen onOpenRun={jest.fn()} />);
    await screen.findByText(MESSAGES.emptyHistory);
  });
});
