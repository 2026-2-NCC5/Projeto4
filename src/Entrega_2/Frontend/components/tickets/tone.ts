import type { SupportTone } from '../../features/support/labels';
import type { Theme } from '../../theme';

export interface ToneColors {
  background: string;
  foreground: string;
  /** cor sólida (pontos da linha do tempo, ícones) */
  accent: string;
}

/** Tons semânticos → tokens do tema (fundo suave + texto com contraste). */
export function toneColors(theme: Theme, tone: SupportTone): ToneColors {
  const { colors } = theme;
  switch (tone) {
    case 'info':
      return { background: colors.status.infoSoft, foreground: colors.status.infoText, accent: colors.status.info };
    case 'warning':
      return { background: colors.status.warningSoft, foreground: colors.status.warningText, accent: colors.status.warning };
    case 'success':
      return { background: colors.status.successSoft, foreground: colors.status.successText, accent: colors.status.success };
    case 'danger':
      return { background: colors.status.errorSoft, foreground: colors.status.errorText, accent: colors.status.error };
    default:
      return { background: colors.surface.muted, foreground: colors.text.secondary, accent: colors.text.muted };
  }
}
