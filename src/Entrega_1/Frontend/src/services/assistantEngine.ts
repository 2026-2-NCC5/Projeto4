import { AssistantMessage } from '../types';
import { academicSummary, pendingItems, subjects } from '../data/mockData';

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function makeMessage(
  text: string,
  evidence?: string[],
  nextAction?: string,
  requiresHumanValidation = false,
): AssistantMessage {
  return {
    id: `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role: 'assistant',
    text,
    evidence,
    nextAction,
    requiresHumanValidation,
    createdAt: new Date(),
  };
}

export function createInitialAssistantMessage(name: string): AssistantMessage {
  return makeMessage(
    `Olá, ${name.split(' ')[0] || 'estudante'}! Eu sou o assistente do ASA Conecta. Posso explicar sua situação acadêmica, priorizar pendências e sugerir próximos passos com base nos dados demonstrativos do app.`,
  );
}

export function answerAcademicQuestion(input: string): AssistantMessage {
  const q = normalize(input);

  if (/alterar|mudar|trocar/.test(q) && /(nota|frequencia|matricula)/.test(q)) {
    return makeMessage(
      'Eu não posso alterar notas, frequência, matrícula ou qualquer registro acadêmico oficial. Posso ajudar a interpretar os dados e orientar o próximo passo.',
      ['O ASA Conecta atua como ferramenta de apoio à decisão, sem executar decisões administrativas.'],
      'Se houver divergência em um registro oficial, procure o professor ou a coordenação para validação.',
      true,
    );
  }

  if (/pendenc|atividade|prazo|entrega|prioridade|primeiro/.test(q)) {
    const top = pendingItems[0]!;
    return makeMessage(
      `Sua prioridade mais imediata é ${top.title.toLowerCase()} de ${top.subject}. Ela ${top.dueLabel}.`,
      [
        `${pendingItems.length} pendências ativas no cenário atual.`,
        `${top.subject}: ${top.title}, prazo ${top.dueDate}.`,
      ],
      'Abra a seção Acadêmico, revise a pendência de Banco de Dados e organize um bloco de estudo ainda hoje.',
    );
  }

  if (/frequencia|falta|presenca/.test(q)) {
    const attention = [...subjects].sort((a, b) => a.attendance - b.attendance)[0]!;
    return makeMessage(
      `${attention.name} é a disciplina que mais merece acompanhamento de frequência neste momento, com ${attention.attendance}% no cenário demonstrativo.`,
      [
        `Menor frequência entre as disciplinas atuais: ${attention.attendance}%.`,
        `Média de frequência geral: ${academicSummary.averageAttendance}%.`,
      ],
      'Evite novas faltas e confirme com o professor se os registros estão atualizados.',
    );
  }

  if (/nota|media|desempenho|prova/.test(q)) {
    const scored = subjects.filter((subject) => subject.grade !== null);
    const lowest = [...scored].sort((a, b) => (a.grade ?? 10) - (b.grade ?? 10))[0]!;
    return makeMessage(
      `Sua média geral demonstrativa é ${academicSummary.averageGrade.toFixed(1)}. A disciplina com menor nota atual é ${lowest.name}, com ${lowest.grade?.toFixed(1)}.`,
      [
        `Média geral calculada no mock: ${academicSummary.averageGrade.toFixed(1)}.`,
        `${lowest.name}: nota ${lowest.grade?.toFixed(1)} e frequência ${lowest.attendance}%.`,
      ],
      'Priorize a revisão de Banco de Dados junto com a entrega pendente para atuar sobre dois fatores ao mesmo tempo.',
    );
  }

  if (/coordenacao|professor|humana|validacao|divergencia|erro no registro/.test(q)) {
    return makeMessage(
      'Quando existe divergência em nota, frequência ou outro registro oficial, a decisão final deve permanecer com uma pessoa autorizada da instituição.',
      ['O assistente não altera registros acadêmicos e não confirma decisões institucionais sozinho.'],
      'Leve a evidência disponível ao professor responsável ou à coordenação e solicite a conferência do registro.',
      true,
    );
  }

  if (/como estou|situacao|resumo|geral|hoje/.test(q)) {
    return makeMessage(
      `Seu cenário está estável, mas há ${academicSummary.pending} pendências e ${academicSummary.attention} disciplinas que merecem atenção. A ação mais urgente é a entrega de Banco de Dados.`,
      [
        `${academicSummary.subjects} disciplinas ativas.`,
        `${academicSummary.pending} pendências abertas.`,
        `Média geral demonstrativa: ${academicSummary.averageGrade.toFixed(1)}.`,
        `Frequência média: ${academicSummary.averageAttendance}%.`,
      ],
      'Comece pela pendência com prazo mais próximo e depois revise a frequência de Computação em Nuvem.',
    );
  }

  if (/sem dados|dados insuficientes|nao tenho dados/.test(q)) {
    return makeMessage(
      'Com dados insuficientes eu devo me abster de concluir. Nesse caso, apresentaria uma resposta segura em vez de inventar uma recomendação.',
      ['A abstensão é um comportamento funcional previsto no ASA.'],
      'Atualize ou confirme os dados acadêmicos e tente a análise novamente.',
    );
  }

  return makeMessage(
    'Posso ajudar principalmente com pendências, frequência, notas, prioridades e explicação das recomendações. Tente perguntar “o que devo priorizar?” ou “como está minha frequência?”.',
  );
}
