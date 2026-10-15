import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { AppText } from '../components/ui/AppText';
import { PreferencesProvider } from '../hooks/usePreferences';
import { DARK_THEME, LIGHT_THEME, ThemeProvider, useTheme } from '../theme';
import { greetingForHour, formatLongDate, daysUntil, relativeDayLabel } from '../utils/greeting';

function contrastRatio(hexA: string, hexB: string): number {
  const luminance = (hex: string) => {
    const value = hex.replace('#', '');
    const channels = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
  };
  const [l1, l2] = [luminance(hexA), luminance(hexB)].sort((a, b) => b - a);
  return ((l1 ?? 0) + 0.05) / ((l2 ?? 0) + 0.05);
}

describe('tema (design system)', () => {
  it('o assistente e os cards usam superfícies claras no tema claro', () => {
    expect(LIGHT_THEME.colors.assistant.surface).toBe('#FFFFFF');
    expect(LIGHT_THEME.colors.assistant.onSurface).toBe(LIGHT_THEME.colors.text.primary);
  });

  it('claro e escuro são temas distintos (não invertidos) com o mesmo vocabulário', () => {
    expect(Object.keys(LIGHT_THEME.colors)).toEqual(Object.keys(DARK_THEME.colors));
    expect(LIGHT_THEME.colors.background.primary).not.toBe(DARK_THEME.colors.background.primary);
    expect(LIGHT_THEME.colors.brand.primary).toBe('#00AB7E'); // verde ASA do logo oficial
    expect(LIGHT_THEME.colors.brand.secondary).toBe('#023327'); // verde FECAP do logo oficial
  });

  it.each([
    ['texto primário sobre fundo (claro)', LIGHT_THEME.colors.text.primary, LIGHT_THEME.colors.background.primary],
    ['texto secundário sobre superfície (claro)', LIGHT_THEME.colors.text.secondary, LIGHT_THEME.colors.surface.primary],
    ['texto primário sobre fundo (escuro)', DARK_THEME.colors.text.primary, DARK_THEME.colors.background.primary],
    ['texto secundário sobre superfície (escuro)', DARK_THEME.colors.text.secondary, DARK_THEME.colors.surface.primary],
    ['link sobre superfície (claro)', LIGHT_THEME.colors.text.link, LIGHT_THEME.colors.surface.primary],
    ['texto de botão primário (claro)', LIGHT_THEME.colors.text.onPrimary, LIGHT_THEME.colors.brand.primaryStrong],
    ['texto de botão primário (escuro)', DARK_THEME.colors.text.onPrimary, DARK_THEME.colors.brand.primaryStrong],
  ])('%s atende contraste mínimo WCAG AA (4.5:1) ou grande (3:1) para botões', (_label, fg, bg) => {
    const ratio = contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(_label.includes('botão') ? 3 : 4.5);
  });

  it('ThemeProvider mantém o tema claro mesmo com a preferência "dark" guardada (o app é sempre claro)', () => {
    function Probe() {
      const theme = useTheme();
      return <AppText testID="probe">{theme.scheme}</AppText>;
    }
    render(
      <PreferencesProvider initialPreferences={{ appearance: 'dark' }}>
        <ThemeProvider>
          <Probe />
        </ThemeProvider>
      </PreferencesProvider>,
    );
    expect(screen.getByTestId('probe').props.children).toBe('light');
  });
});

describe('saudação e datas', () => {
  it('saudação por período do dia', () => {
    expect(greetingForHour(6)).toBe('Bom dia');
    expect(greetingForHour(13)).toBe('Boa tarde');
    expect(greetingForHour(20)).toBe('Boa noite');
    expect(greetingForHour(2)).toBe('Boa noite');
  });

  it('data longa em pt-BR e dias relativos', () => {
    const today = new Date(2026, 8, 17);
    expect(formatLongDate(today)).toBe('Quinta-feira, 17 de setembro');
    expect(daysUntil('2026-09-20', today)).toBe(3);
    expect(relativeDayLabel(3)).toBe('em 3 dias');
    expect(relativeDayLabel(0)).toBe('hoje');
    expect(relativeDayLabel(-2)).toBe('há 2 dias');
    expect(daysUntil(null, today)).toBeNull();
  });
});
