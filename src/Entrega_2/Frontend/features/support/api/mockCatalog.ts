import type { SupportCatalog } from '../../../types/api';

/**
 * Catálogo de demonstração (modo EXPO_PUBLIC_USE_MOCK_TICKETS). Espelha os ids e nomes do catálogo da API
 * (src/Entrega_2/Backend/api/src/support/catalog.ts); com a API ligada, o app usa sempre o catálogo do servidor.
 */
const sub = (id: string, label: string) => ({ id, label });

export const MOCK_CATALOG: SupportCatalog = {
  categories: [
    { id: 'academic', label: 'Acadêmico', description: 'Notas, frequência, revisão de prova e aproveitamento de disciplinas.', subcategories: [sub('grades', 'Notas e avaliações'), sub('attendance', 'Frequência'), sub('exam_review', 'Revisão de prova'), sub('credit_transfer', 'Aproveitamento de disciplinas'), sub('complementary_activities', 'Atividades complementares'), sub('other', 'Outro')], slaBusinessDays: 3, defaultTeam: 'Coordenação de Curso' },
    { id: 'enrollment', label: 'Matrícula', description: 'Rematrícula, inclusão ou exclusão de disciplinas, trancamento e transferência.', subcategories: [sub('reenrollment', 'Rematrícula'), sub('add_drop', 'Inclusão ou exclusão de disciplina'), sub('leave', 'Trancamento'), sub('transfer', 'Transferência'), sub('other', 'Outro')], slaBusinessDays: 2, defaultTeam: 'Secretaria Acadêmica' },
    { id: 'financial', label: 'Financeiro', description: 'Boletos, mensalidades, negociação e pagamentos.', subcategories: [sub('bill', 'Boleto'), sub('tuition', 'Mensalidade'), sub('negotiation', 'Negociação'), sub('scholarship', 'Bolsa'), sub('unidentified_payment', 'Pagamento não identificado'), sub('other', 'Outro')], slaBusinessDays: 2, defaultTeam: 'Financeiro' },
    { id: 'documents', label: 'Documentos', description: 'Declarações, histórico escolar, certificados e diploma.', subcategories: [sub('enrollment_certificate', 'Declaração de matrícula'), sub('transcript', 'Histórico escolar'), sub('diploma', 'Diploma ou certificado'), sub('syllabus', 'Plano de ensino'), sub('other', 'Outro')], slaBusinessDays: 3, defaultTeam: 'Secretaria Acadêmica' },
    { id: 'scholarships', label: 'Bolsas e benefícios', description: 'Bolsas institucionais, programas de financiamento e auxílios.', subcategories: [sub('institutional', 'Bolsa institucional'), sub('government', 'Programa de financiamento'), sub('aid', 'Auxílio ao estudante'), sub('other', 'Outro')], slaBusinessDays: 5, defaultTeam: 'Bolsas e Benefícios' },
    { id: 'internship', label: 'Estágio', description: 'Termo de compromisso, relatórios, validação de horas e vagas.', subcategories: [sub('agreement', 'Termo de compromisso'), sub('report', 'Relatório de estágio'), sub('hours', 'Validação de horas'), sub('opportunities', 'Vagas e orientação'), sub('other', 'Outro')], slaBusinessDays: 3, defaultTeam: 'Carreiras e Estágios' },
    { id: 'infrastructure', label: 'Infraestrutura', description: 'Salas, laboratórios, biblioteca, acessibilidade e equipamentos.', subcategories: [sub('rooms', 'Salas e laboratórios'), sub('library', 'Biblioteca'), sub('accessibility', 'Acessibilidade'), sub('equipment', 'Equipamentos'), sub('other', 'Outro')], slaBusinessDays: 5, defaultTeam: 'Infraestrutura' },
    { id: 'systems_access', label: 'Acesso aos sistemas', description: 'Portal do aluno, e-mail institucional, ambiente virtual e Wi-Fi.', subcategories: [sub('portal', 'Portal do aluno'), sub('email', 'E-mail institucional'), sub('lms', 'Ambiente virtual de aprendizagem'), sub('wifi', 'Wi-Fi'), sub('password', 'Senha e acesso'), sub('other', 'Outro')], slaBusinessDays: 1, defaultTeam: 'Tecnologia da Informação' },
    { id: 'asa_service', label: 'Atendimento ASA', description: 'Orientação acadêmica, apoio ao estudante e agendamentos com o ASA.', subcategories: [sub('guidance', 'Orientação acadêmica'), sub('support', 'Apoio ao estudante'), sub('appointment', 'Agendamento com o ASA'), sub('feedback', 'Sugestão ou elogio'), sub('other', 'Outro')], slaBusinessDays: 2, defaultTeam: 'Atendimento ASA' },
    { id: 'other', label: 'Outro', description: 'Não encontrou a categoria? Conte para o ASA.', subcategories: [], slaBusinessDays: 3, defaultTeam: 'Atendimento ASA' },
  ],
  articles: [
    { id: 'financial-bill-copy', categoryId: 'financial', title: 'Como emitir a segunda via do boleto?', summary: 'A segunda via fica disponível na área financeira do portal do aluno.', steps: ['Entre no portal do aluno.', 'Abra a área Financeiro.', 'Escolha a parcela e toque em "Segunda via".'] },
    { id: 'financial-payment-time', categoryId: 'financial', title: 'Quanto tempo leva para um pagamento aparecer?', summary: 'Pagamentos por boleto podem levar até 3 dias úteis para serem compensados.', steps: ['Aguarde a compensação bancária.', 'Se o prazo passou, abra um chamado e anexe o comprovante.'] },
    { id: 'documents-enrollment-certificate', categoryId: 'documents', title: 'Como solicitar uma declaração de matrícula?', summary: 'A declaração simples pode ser emitida no portal; versões específicas são feitas pela Secretaria.', steps: ['Entre no portal do aluno.', 'Abra Documentos → Declarações.', 'Para um modelo específico, abra um chamado informando a finalidade.'] },
    { id: 'documents-transcript', categoryId: 'documents', title: 'Como obter o histórico escolar?', summary: 'O histórico parcial é emitido pela Secretaria Acadêmica em até 3 dias úteis.', steps: ['Abra um chamado em Documentos → Histórico escolar.', 'Informe se precisa de versão assinada.'] },
    { id: 'academic-grade-review', categoryId: 'academic', title: 'Como pedir revisão de prova?', summary: 'A revisão deve ser solicitada após a divulgação da nota, dentro do prazo do calendário acadêmico.', steps: ['Confira o prazo no calendário acadêmico.', 'Abra um chamado em Acadêmico → Revisão de prova com a disciplina e a avaliação.'] },
    { id: 'academic-attendance', categoryId: 'academic', title: 'Faltei por motivo de saúde. O que fazer?', summary: 'Faltas justificadas exigem atestado entregue dentro do prazo.', steps: ['Digitalize o atestado.', 'Abra um chamado em Acadêmico → Frequência e anexe o documento.'] },
    { id: 'enrollment-add-drop', categoryId: 'enrollment', title: 'Posso incluir ou excluir uma disciplina?', summary: 'Alterações são aceitas no período de ajuste de matrícula.', steps: ['Confira o período de ajuste no calendário.', 'Abra um chamado informando a disciplina e a turma.'] },
    { id: 'systems-password', categoryId: 'systems_access', title: 'Esqueci a senha do portal do aluno', summary: 'A redefinição pode ser feita pelo link "Esqueci minha senha" na tela de acesso do portal.', steps: ['Abra a tela de acesso do portal.', 'Toque em "Esqueci minha senha" e siga as instruções enviadas ao e-mail.'] },
    { id: 'systems-wifi', categoryId: 'systems_access', title: 'Como conectar ao Wi-Fi do campus?', summary: 'Use o usuário e a senha do portal do aluno na rede institucional.', steps: ['Escolha a rede institucional.', 'Entre com o usuário e a senha do portal.'] },
    { id: 'internship-agreement', categoryId: 'internship', title: 'Como formalizar o termo de compromisso?', summary: 'O termo precisa das assinaturas da empresa, do estudante e da instituição.', steps: ['Preencha o termo com a empresa.', 'Abra um chamado em Estágio → Termo de compromisso e anexe o documento.'] },
    { id: 'asa-appointment', categoryId: 'asa_service', title: 'Como agendar um atendimento com o ASA?', summary: 'Você pode pedir um horário com o ASA por aqui mesmo.', steps: ['Abra um chamado em Atendimento ASA → Agendamento com o ASA.', 'Informe os dias e horários em que pode comparecer.'] },
  ],
  limits: {
    subjectMinLength: 5,
    subjectMaxLength: 120,
    descriptionMinLength: 20,
    descriptionMaxLength: 1500,
    messageMaxLength: 2000,
    maxAttachmentsPerTicket: 10,
    maxAttachmentBytes: 5 * 1024 * 1024,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
    reopenWindowDays: 7,
  },
};
