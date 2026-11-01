import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mockApi, renderRoutes } from '@/test/utils';
import type { FecapPortalCapabilities } from '@/services/api/endpoints';
import FecapPortalPage from './FecapPortalPage';

const capabilities: FecapPortalCapabilities = {
  provider: 'fecap-portal',
  officialPortalUrl: 'https://portal.fecap.br/',
  officialAuthentication: 'not_configured',
  officialApi: 'not_confirmed',
  institutionalSession: 'not_connected',
  academicModules: {
    profile: 'not_integrated', subjects: 'not_integrated', grades: 'not_integrated', attendance: 'not_integrated',
    schedule: 'not_integrated', documents: 'not_integrated', requests: 'not_integrated', internships: 'not_integrated', financial: 'not_integrated',
  },
  localReadOnlyCollector: 'experimental',
  authorizationRequired: true,
};

describe('Portal Educacional FECAP', () => {
  it('não declara conexão nem módulos acadêmicos sem fonte oficial configurada', async () => {
    const { calls } = mockApi({ 'GET /api/v1/portal/capabilities': () => ({ data: capabilities }) });
    renderRoutes([{ path: '/aluno/portal-fecap', element: <FecapPortalPage /> }], { initialPath: '/aluno/portal-fecap' });

    expect(await screen.findByText('Sua conta FECAP não está conectada ao ASA Conecta')).toBeInTheDocument();
    expect(screen.getAllByText('Não integrado').length).toBeGreaterThan(3);
    expect(screen.getByRole('link', { name: /Abrir portal oficial/ })).toHaveAttribute('href', 'https://portal.fecap.br/');
    expect(calls.some((call) => call.path === '/api/v1/portal/capabilities')).toBe(true);
  });
});
