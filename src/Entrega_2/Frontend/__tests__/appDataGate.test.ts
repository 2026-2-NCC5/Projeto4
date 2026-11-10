import { appDataGate } from '../features/platform';

import { makePlatformInfo } from './support/platformFixtures';

const institutional = makePlatformInfo({
  environment: 'production',
  dataMode: 'institutional',
  dataModeLabel: 'Dados institucionais',
  academicSource: { provider: 'institutional', status: 'unavailable', message: 'Aguardando integração institucional.' },
});

describe('appDataGate (quando o app abre o login e as áreas autenticadas)', () => {
  it('bloqueia dados de demonstração em qualquer build', () => {
    expect(appDataGate({ info: makePlatformInfo(), status: 'ready' }, true)).toBe('demo');
    expect(appDataGate({ info: makePlatformInfo(), status: 'ready' }, false)).toBe('demo');
  });

  it('em build publicado abre com API institucional, mesmo com a fonte acadêmica ainda indisponível', () => {
    expect(appDataGate({ info: institutional, status: 'ready' }, false)).toBe('open');
  });

  it('em build publicado espera a confirmação e falha fechado sem ela', () => {
    expect(appDataGate({ info: null, status: 'loading' }, false)).toBe('checking');
    expect(appDataGate({ info: null, status: 'error' }, false)).toBe('unconfirmed');
    const mixed = makePlatformInfo({ dataMode: 'institutional', academicSource: { provider: 'demo', status: 'unavailable', message: 'x' } });
    expect(appDataGate({ info: mixed, status: 'ready' }, false)).toBe('unconfirmed');
  });

  it('em desenvolvimento não bloqueia por falta de resposta (API local fora do ar)', () => {
    expect(appDataGate({ info: null, status: 'error' }, true)).toBe('open');
  });
});
