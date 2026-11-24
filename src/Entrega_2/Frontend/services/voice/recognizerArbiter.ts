/**
 * O reconhecedor de fala do sistema é UM só: expo-speech-recognition mantém uma única sessão nativa e
 * entrega os eventos a todos os listeners. A conversa (botão do microfone) e o "Hey Asa" disputam esse
 * recurso, e no Android `abort()` derruba a sessão que estiver ativa, seja de quem for.
 *
 * Quem toma o reconhecedor avisa o dono anterior (`onPreempted`). O dono anterior deve soltar listeners e
 * timers SEM chamar `abort()`: quem tomou já está abrindo a própria sessão, e um abort atrasado a mataria.
 * Só quem ainda é o dono atual (`isCurrent()`) pode chamar `abort()`.
 */
export type RecognizerClient = 'conversation' | 'wake_word';

export interface RecognizerClaim {
  readonly client: RecognizerClient;
  /** true enquanto ninguém tomou o reconhecedor depois deste claim e ele não foi liberado. */
  isCurrent(): boolean;
  release(): void;
}

export interface RecognizerArbiter {
  /** Toma o reconhecedor; `preempted` é o cliente que o tinha (já avisado) ou null. */
  claim(client: RecognizerClient, onPreempted: () => void): { claim: RecognizerClaim; preempted: RecognizerClient | null };
  /** Cliente que tem o reconhecedor agora (null = livre). */
  current(): RecognizerClient | null;
}

export function createRecognizerArbiter(): RecognizerArbiter {
  let holder: { claim: RecognizerClaim; onPreempted: () => void } | null = null;

  return {
    claim(client, onPreempted) {
      const previous = holder;
      const claim: RecognizerClaim = {
        client,
        isCurrent: () => holder?.claim === claim,
        release: () => {
          if (holder?.claim === claim) holder = null;
        },
      };
      holder = { claim, onPreempted };
      // O dono anterior é avisado depois da troca: dentro do aviso, isCurrent() dele já é false.
      if (previous) {
        try {
          previous.onPreempted();
        } catch {
          // falha do dono anterior não impede a nova sessão
        }
      }
      return { claim, preempted: previous?.claim.client ?? null };
    },
    current: () => holder?.claim.client ?? null,
  };
}

/** Árbitro único do app, compartilhado pela conversa e pelo "Hey Asa" (testes criam o próprio). */
export const sharedRecognizerArbiter: RecognizerArbiter = createRecognizerArbiter();
