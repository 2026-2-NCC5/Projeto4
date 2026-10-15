import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderPage } from '@/test/utils';
import { DataTable, type Column } from './DataTable';

interface Person {
  id: string;
  name: string;
}

const columns: Column<Person>[] = [
  { key: 'name', header: 'Nome', render: (row) => row.name },
  { key: 'id', header: 'Código', render: (row) => row.id },
];
const rows: Person[] = [{ id: 'p-1', name: 'Maria' }];

describe('DataTable', () => {
  it('a área com rolagem horizontal é uma região nomeada e focável pelo teclado', async () => {
    renderPage(<DataTable caption="Pessoas" columns={columns} rows={rows} rowKey={(row) => row.id} />);
    const region = screen.getByRole('region', { name: 'Pessoas' });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(within(region).getByRole('table', { name: 'Pessoas' })).toBeInTheDocument();
    await userEvent.tab();
    expect(region).toHaveFocus();
  });

  it('aceita um nome próprio para a região', () => {
    renderPage(<DataTable caption="Pessoas" regionLabel="Tabela de pessoas (role para ver mais colunas)" columns={columns} rows={rows} rowKey={(row) => row.id} />);
    expect(screen.getByRole('region', { name: 'Tabela de pessoas (role para ver mais colunas)' })).toBeInTheDocument();
  });
});
