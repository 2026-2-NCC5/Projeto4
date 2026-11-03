/**
 * Aviso de que algo mudou no Atendimento. Carrega só identificadores: quem escuta busca os dados de novo pelos
 * caminhos normais (useSupportResource), com a autenticação de sempre.
 */
export type SupportChange = { kind: 'all' } | { kind: 'tickets'; ticketIds: readonly string[] };

/** O que uma tela acompanha: `true` = qualquer chamado; texto = só este chamado. */
export type SupportChangeScope = true | string;

type Listener = (change: SupportChange) => void;

const listeners = new Set<Listener>();

export function subscribeSupportChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitSupportChange(change: SupportChange): void {
  for (const listener of [...listeners]) listener(change);
}

export function changeAffects(change: SupportChange, scope: SupportChangeScope): boolean {
  if (change.kind === 'all' || scope === true) return true;
  return change.ticketIds.includes(scope);
}
