import type { HapticsService } from '../../types/voice';
import { createAppHaptics, type HapticsModule } from '../haptics';

/** Feedback háptico do assistente por voz — adaptador sobre services/haptics (best-effort, no-op no web). */
export function createHapticsService(module?: HapticsModule, platformOS?: string): HapticsService {
  const app = createAppHaptics(module, platformOS);
  return {
    listenStart: () => app.impactLight(),
    listenEnd: () => app.selection(),
    error: () => app.error(),
  };
}
