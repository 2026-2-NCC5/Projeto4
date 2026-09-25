import { hostFromHostUri, resolveApiBaseUrl } from '../config/env';

describe('config/env', () => {
  it('prioriza EXPO_PUBLIC_API_URL e remove barra final', () => {
    expect(resolveApiBaseUrl({ envUrl: 'https://api.exemplo.com/', hostUri: '192.168.0.10:8081' })).toBe('https://api.exemplo.com');
  });

  it('deriva do hostUri do Metro na porta 3000', () => {
    expect(resolveApiBaseUrl({ envUrl: '', hostUri: '192.168.0.10:8081' })).toBe('http://192.168.0.10:3000');
    expect(resolveApiBaseUrl({ hostUri: 'exp://192.168.0.10:8081/--/' })).toBe('http://192.168.0.10:3000');
  });

  it('cai em localhost sem env e sem hostUri', () => {
    expect(resolveApiBaseUrl({})).toBe('http://localhost:3000');
    expect(resolveApiBaseUrl({ hostUri: null, port: 4000 })).toBe('http://localhost:3000');
  });

  it('extrai host de hostUri', () => {
    expect(hostFromHostUri('10.0.0.5:8081')).toBe('10.0.0.5');
    expect(hostFromHostUri('[::1]:8081')).toBe('[::1]');
    expect(hostFromHostUri('')).toBeNull();
  });
});
