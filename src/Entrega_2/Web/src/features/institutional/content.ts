export const fecapUrls = {
  asa: 'https://www.fecap.br/asa/',
  basket: 'https://www.fecap.br/asa/cesta-de-servicos/',
  contact: 'https://www.fecap.br/fale-conosco/',
  portal: 'https://portal.fecap.br/',
  alumni: 'https://www.fecap.br/alumni/',
  diplomaValidation: 'https://diplomas.fecap.br/',
  documentValidation: 'https://www.fecap.br/validacao-de-documentos/',
  accessibility: 'https://www.fecap.br/acessibilidade/',
  privacy: 'https://www.fecap.br/lgpd/',
  cebas: 'https://www.fecap.br/colegio/bolsas-e-descontos/',
  emec: 'https://emec.mec.gov.br/emec/consulta-cadastro/detalhamento/d96957f455f6405d14c6542552b0f6eb/MjEz',
  workability: 'https://workability.worka.love/#/login/empresa',
  companyGuide: 'https://www.fecap.br/wp-content/uploads/2021/01/MATERIAL_EMPRESAS_-_FECAP.pdf',
  fecap: 'https://www.fecap.br/',
} as const;

export const serviceCategories = [
  'Alumni (Ex-Alunos)', 'Aprendizagem', 'Biblioteca', 'Boas Práticas', 'Bolsas e Financiamentos',
  'Dados Cadastrais', 'Documentos Acadêmicos', 'Documentos Financeiros', 'Empregabilidade & Carreira',
  'Eventos', 'Infraestrutura Física e Tecnológica', 'Internacionalização', 'Plataformas Digitais',
  'Reservas e Recursos', 'Segurança', 'Serviços Acadêmicos', 'Serviços Financeiros',
  'Serviços Para Candidatos', 'Transporte e Estacionamento',
] as const;

// Registros e destinos conferidos na Cesta oficial em 31/10/2026. A descrição permanece no site oficial.
export const officialServices = [
  { title: 'Acesso ao Portal do Aluno', category: 'Plataformas Digitais', href: `${fecapUrls.basket}acesso-ao-portal-do-aluno/` },
  { title: 'Acesso ao Moodle', category: 'Plataformas Digitais', href: `${fecapUrls.basket}acesso-ao-moodle/` },
  { title: 'ProUni: Reconsideração da bolsa', category: 'Bolsas e Financiamentos', href: `${fecapUrls.basket}prouni-reconsideracao-da-bolsa/` },
  { title: 'Acesso a vagas – FECAP+ Oportunidades', category: 'Empregabilidade & Carreira', href: `${fecapUrls.basket}acesso-a-vagas-fecap-oportunidades/` },
  { title: 'Acesso ao e-mail FECAP', category: 'Plataformas Digitais', href: `${fecapUrls.basket}acesso-ao-e-mail-fecap/` },
  { title: 'Estágio: Entrega de Documentação', category: 'Empregabilidade & Carreira', href: `${fecapUrls.basket}entrega-de-documentos-de-estagio/` },
  { title: 'Pagamentos de Mensalidade', category: 'Serviços Financeiros', href: `${fecapUrls.basket}pagamentos-de-mensalidade/` },
  { title: 'Atestado de matrícula', category: 'Documentos Acadêmicos', href: `${fecapUrls.basket}atestado-de-matricula/` },
  { title: 'Modelos de Documentos de Estágio', category: 'Empregabilidade & Carreira', href: `${fecapUrls.basket}modelos-de-documentos-de-estagio/` },
] as const;

export const staff = [
  { name: 'Flávia Kao', title: 'Assessora da Reitoria e Gerente da Área do Sucesso Alvarista', photo: 'https://www.fecap.br/wp-content/uploads/2022/07/a31677e7-e1c0-494c-9f1e-2da7bcec4f45.jpg', linkedin: 'https://www.linkedin.com/in/flavia-kao-a347a310a' },
  { name: 'Danielle Vitorino', title: 'Coordenadora de Sucesso', photo: 'https://www.fecap.br/wp-content/uploads/2022/07/danny.jpg', linkedin: 'https://www.linkedin.com/in/danielle-vitorino-38975a1b5' },
] as const;

export function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
}
