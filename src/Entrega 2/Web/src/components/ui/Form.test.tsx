import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox, Select, TextArea, TextInput } from './Form';

describe('campos obrigatórios', () => {
  it('marcam visualmente e com aria-required, sem a validação nativa que bloqueia o envio', async () => {
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <TextInput label="Nome" required />
        <TextArea label="Descrição" required />
        <Select label="Categoria" required placeholder="Selecione" options={[{ value: 'a', label: 'A' }]} />
        <Checkbox label="Aceito os termos" required />
        <button type="submit">Enviar</button>
      </form>,
    );
    for (const control of [screen.getByLabelText(/^Nome/), screen.getByLabelText(/^Descrição/), screen.getByLabelText(/^Categoria/), screen.getByLabelText(/^Aceito os termos/)]) {
      expect(control).toHaveAttribute('aria-required', 'true');
      expect(control).not.toHaveAttribute('required');
    }
    expect(screen.getByText('Nome').closest('label')).toHaveTextContent('Nome *');
    // campos vazios não impedem o envio: a página valida e mostra as próprias mensagens
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('campo opcional não ganha marcação de obrigatório', () => {
    render(<TextInput label="Apelido" />);
    expect(screen.getByLabelText('Apelido')).not.toHaveAttribute('aria-required');
  });
});
