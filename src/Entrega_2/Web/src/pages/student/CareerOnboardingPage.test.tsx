import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, renderPage } from '@/test/utils';
import CareerOnboardingPage from './CareerOnboardingPage';

describe('Minha Jornada Profissional — competências', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('asa-career-splash-seen', '1');
    mockApi({
      'GET /api/v1/career/profile': () => ({ data: {
        id: null, course: null, academicDataVerified: false, semester: null, careerObjective: '', firstInternship: false,
        skills: [], interests: [], city: null, state: null, region: null, preferredRadiusKm: null, modalities: [],
        availability: {}, personalizationEnabled: true,
      } }),
      'GET /api/academic/catalog': () => ({ data: {
        source: 'GameFY', institution: 'FECAP', updatedAt: '2026-01-01T00:00:00.000Z', courses: [], subjects: [], terms: [], classes: [],
      } }),
    });
  });

  it('mantém vírgulas durante a digitação e preserva os valores ao navegar entre etapas', async () => {
    const user = userEvent.setup();
    renderPage(<CareerOnboardingPage />);

    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    const technicalSkills = await screen.findByRole('textbox', { name: 'Competências técnicas' });
    const softSkills = screen.getByRole('textbox', { name: 'Competências comportamentais' });
    await user.type(technicalSkills, 'C++, Node.js, C#');
    await user.type(softSkills, 'Comunicação, organização');

    expect(technicalSkills).toHaveValue('C++, Node.js, C#');
    expect(softSkills).toHaveValue('Comunicação, organização');

    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('textbox', { name: 'Competências técnicas' })).toHaveValue('C++, Node.js, C#');
    expect(screen.getByRole('textbox', { name: 'Competências comportamentais' })).toHaveValue('Comunicação, organização');
  });
});
