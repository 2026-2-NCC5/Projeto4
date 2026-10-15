import { buildSnapshot } from '../snapshot.js';
import { QueueSourceError, type QueueCall, type QueueProvider, type QueueSnapshot, type QueueWaiting } from '../types.js';

/** Cenários de desenvolvimento, sempre relativos à senha de referência 0029. */
export const MOCK_SCENARIOS = ['empty', 'waiting', '5_ahead', '3_ahead', 'next', 'called', 'completed', 'offline', 'progression'] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export const MOCK_REFERENCE_TICKET = '0029';
const FIRST = 15;
const LAST = 36;

/** Última senha chamada em cada cenário (0029 fica com N senhas à frente). */
const LAST_CALLED: Record<Exclude<MockScenario, 'offline' | 'progression'>, number | null> = {
  empty: null,
  waiting: 21, // 7 à frente
  '5_ahead': 23,
  '3_ahead': 25,
  next: 27, // só a 0028 à frente
  called: 29,
  completed: 31,
};

const pad = (value: number) => String(value).padStart(4, '0');

export interface MockQueueProviderOptions {
  scenario: MockScenario;
  timeZone: string;
  /** progression: segundos entre chamadas simuladas */
  stepSeconds?: number;
  now?: () => Date;
}

/**
 * MockQueueProvider: ativado somente com ASA_QUEUE_PROVIDER=mock (nunca é o padrão).
 * Simula duas mesas em paralelo; `progression` chama uma senha a cada `stepSeconds`
 * (0026 → 0027 → 0028 → 0029) para validar UI, push, voz, vibração e animações.
 */
export class MockQueueProvider implements QueueProvider {
  readonly name = 'mock';
  private scenario: MockScenario;
  private progressionStart: number;
  private manualSteps = 0;
  private readonly now: () => Date;

  constructor(private readonly options: MockQueueProviderOptions) {
    this.scenario = options.scenario;
    this.now = options.now ?? (() => new Date());
    this.progressionStart = this.now().getTime();
  }

  get currentScenario(): MockScenario {
    return this.scenario;
  }

  setScenario(scenario: MockScenario): void {
    this.scenario = scenario;
    this.progressionStart = this.now().getTime();
    this.manualSteps = 0;
  }

  /** Chama a próxima senha imediatamente (progression) ou avança o cenário fixo em uma chamada. */
  advance(): void {
    if (this.scenario !== 'progression') {
      const lastCalled = this.lastCalled();
      this.scenario = 'progression';
      this.progressionStart = this.now().getTime();
      this.manualSteps = (lastCalled ?? LAST_CALLED.waiting!) - LAST_CALLED.waiting!;
    }
    this.manualSteps += 1;
  }

  private lastCalled(): number | null {
    if (this.scenario === 'offline') return null;
    if (this.scenario !== 'progression') return LAST_CALLED[this.scenario];
    const step = (this.options.stepSeconds ?? 20) * 1000;
    const elapsed = Math.floor((this.now().getTime() - this.progressionStart) / step);
    return Math.min(LAST_CALLED.waiting! + elapsed + this.manualSteps, LAST);
  }

  async getCurrentQueue(): Promise<QueueSnapshot> {
    if (this.scenario === 'offline') throw new QueueSourceError('network', 'mock: fonte offline');
    const now = this.now();
    const lastCalled = this.lastCalled();
    const calls: QueueCall[] = [];
    const upcoming: QueueWaiting[] = [];
    if (lastCalled !== null) {
      for (let number = lastCalled; number >= FIRST; number -= 1) {
        const minutesAgo = (lastCalled - number) * 3 + 1;
        calls.push({
          ticket: pad(number),
          desk: number % 2 === 0 ? 'Mesa 01' : 'Mesa 03',
          calledAt: new Date(now.getTime() - minutesAgo * 60_000).toISOString(),
          // as duas últimas (uma por mesa) seguem em atendimento
          serviceStatus: number >= lastCalled - 1 ? 'in_service' : 'completed',
          sourceId: `mock-${pad(number)}`,
        });
      }
      for (let number = lastCalled + 1, position = 1; number <= LAST; number += 1, position += 1) {
        upcoming.push({ ticket: pad(number), position, sourceId: `mock-${pad(number)}` });
      }
    }
    return buildSnapshot({ provider: this.name, calls, upcoming, upcomingComplete: true, callsTotal: calls.length, now, timeZone: this.options.timeZone });
  }
}
