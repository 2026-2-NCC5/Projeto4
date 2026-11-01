import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ToastProvider, useToast } from './Toast';

function ToastTrigger() {
  const toast = useToast();
  return <button onClick={() => toast.show('A operação não foi concluída.', 'error')}>Mostrar erro</button>;
}

describe('notificações Radix', () => {
  it('mantém erros até que a pessoa os feche', async () => {
    render(<ToastProvider><ToastTrigger /></ToastProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar erro' }));
    expect(await screen.findByText('A operação não foi concluída.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }));
    expect(screen.queryByText('A operação não foi concluída.')).not.toBeInTheDocument();
  });
});
