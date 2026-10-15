import { actionForTarget, currentScreenKey, INITIAL_NAVIGATION_STATE, navigationReducer, supportRoutes } from '../navigation';

describe('rota da fila presencial', () => {
  it('do Início (push, card, assistente): abre sobre a aba atual e voltar retorna a ela', () => {
    const opened = navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'OPEN_QUEUE' });
    expect(opened.detail).toEqual({ screen: 'queue' });
    expect(opened.tab).toBe('home');
    expect(currentScreenKey(opened)).toBe('queue');
    const back = navigationReducer(opened, { type: 'GO_BACK' });
    expect(back.detail).toBeNull();
    expect(back.tab).toBe('home');
  });

  it('do Atendimento: voltar retorna ao hub', () => {
    const hub = navigationReducer({ ...INITIAL_NAVIGATION_STATE, tab: 'services' }, { type: 'OPEN_SUPPORT_ROUTE', route: supportRoutes.home() });
    const queue = navigationReducer(hub, { type: 'OPEN_QUEUE' });
    expect(queue.detail).toEqual({ screen: 'queue' });
    const back = navigationReducer(queue, { type: 'GO_BACK' });
    expect(back.detail).toEqual({ screen: 'support' });
  });

  it('abrir a fila já aberta não empilha nada (vários pushes seguidos)', () => {
    const once = navigationReducer(INITIAL_NAVIGATION_STATE, { type: 'OPEN_QUEUE' });
    expect(navigationReducer(once, { type: 'OPEN_QUEUE' })).toBe(once);
  });

  it('destino "queue" do assistente ("abre a fila do ASA")', () => {
    expect(actionForTarget('queue')).toEqual({ type: 'OPEN_QUEUE' });
  });
});
