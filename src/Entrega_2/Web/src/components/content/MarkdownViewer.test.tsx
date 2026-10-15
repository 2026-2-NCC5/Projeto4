import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MarkdownViewer, parseBlocks } from './MarkdownViewer';

describe('MarkdownViewer (conteúdo da base de conhecimento)', () => {
  it('monta títulos, listas e ênfase sem HTML bruto', () => {
    render(<MarkdownViewer source={'## Como pedir\n\nAbra um **chamado** em *Documentos*.\n\n1. Entre\n2. Escolha'} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Como pedir' })).toBeInTheDocument();
    expect(screen.getByText('chamado').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('não executa nem renderiza HTML/JavaScript e só aceita links https', () => {
    const { container } = render(
      <MarkdownViewer source={'<img src=x onerror="alert(1)"> [clique](javascript:alert(1)) [ok](https://www.fecap.br/) [inseguro](http://exemplo.com)'} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://www.fecap.br/');
    expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('agrupa linhas em parágrafos e separa listas', () => {
    expect(parseBlocks('linha 1\nlinha 2\n\n- a\n- b')).toEqual([
      { type: 'p', text: 'linha 1 linha 2' },
      { type: 'ul', items: ['a', 'b'] },
    ]);
  });
});
