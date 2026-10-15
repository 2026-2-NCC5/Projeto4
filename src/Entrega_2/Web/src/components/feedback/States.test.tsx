import { useQuery } from '@tanstack/react-query';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/services/api/client';
import { renderPage } from '@/test/utils';
import { QueryView } from './States';

function Probe({ load }: { load: () => Promise<string[]> }) {
  const query = useQuery({ queryKey: ['probe'], queryFn: load });
  return (
    <QueryView query={query} isEmpty={(data) => data.length === 0} empty={<p>lista vazia</p>}>
      {(data) => (
        <ul aria-label="itens">
          {data.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </QueryView>
  );
}

const serverError = () => new ApiError('server', 'Falha no servidor', { status: 500 });

describe('QueryView', () => {
  it('sem dados, o erro ocupa o lugar do conteúdo (com nova tentativa)', async () => {
    renderPage(
      <Probe
        load={async () => {
          throw serverError();
        }}
      />,
    );
    expect(await screen.findByText('Não foi possível carregar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('falha numa atualização em segundo plano mantém os dados e mostra um aviso em linha', async () => {
    let calls = 0;
    const { queryClient } = renderPage(
      <Probe
        load={async () => {
          calls += 1;
          if (calls === 2) throw serverError();
          return calls === 1 ? ['primeiro'] : ['primeiro', 'segundo'];
        }}
      />,
    );
    expect(await screen.findByText('primeiro')).toBeInTheDocument();
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['probe'] }).catch(() => undefined);
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível atualizar agora. Mostrando os últimos dados carregados.');
    expect(screen.getByRole('list', { name: 'itens' })).toHaveTextContent('primeiro');
    expect(screen.queryByText('Não foi possível carregar')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('segundo')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('o estado vazio continua valendo', async () => {
    renderPage(<Probe load={async () => []} />);
    expect(await screen.findByText('lista vazia')).toBeInTheDocument();
  });
});
