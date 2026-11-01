import { ArrowRight, ArrowUpRight, BriefcaseBusiness, GraduationCap, Mail, Search, Sparkles, UsersRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PublicLayout } from '@/layouts/PublicLayout';
import { fecapUrls, normalizeSearch, officialServices } from '@/features/institutional/content';
import { AsaPartnersCarousel } from './AsaPartnersCarousel';

function Action({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) {
  return <Link to={href} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 py-3 text-small font-semibold transition-colors ${secondary ? 'border border-line-strong bg-white text-action hover:bg-action-soft' : 'bg-action text-white hover:bg-action-hover'}`}>{children}<ArrowRight size={16} aria-hidden /></Link>;
}

export default function LandingPage() {
  const [query, setQuery] = useState('');
  useEffect(() => {
    document.title = 'ASA — Área do Sucesso Alvarista | FECAP';
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (description) description.content = 'Acolhimento, serviços institucionais e oportunidades para a comunidade Alvarista da FECAP.';
  }, []);
  const results = useMemo(() => {
    const term = normalizeSearch(query);
    return term ? officialServices.filter((item) => normalizeSearch(`${item.title} ${item.category}`).includes(term)).slice(0, 5) : [];
  }, [query]);
  return <PublicLayout wide>
    <section className="overflow-hidden border-b border-line bg-white">
      <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[1.05fr_.95fr] lg:gap-14 lg:py-20">
        <div className="relative z-10">
          <p className="inline-flex items-center gap-2 text-small font-bold uppercase tracking-[.12em] text-action"><span className="h-2 w-2 rounded-full bg-assistant" /> Área do Sucesso Alvarista · FECAP</p>
          <h1 className="mt-5 max-w-2xl text-4xl font-bold leading-[1.08] tracking-tight text-fecap sm:text-5xl lg:text-[3.6rem]">Seu futuro começa com acolhimento e oportunidades.</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate">Da sua chegada à FECAP aos próximos passos da sua carreira, o ASA está ao seu lado para acolher, orientar e conectar você a novas possibilidades.</p>
          <div className="mt-7 flex flex-wrap gap-3"><Action href="/cesta-de-servicos">Conheça nossos serviços</Action><Action href="/conheca-o-asa" secondary>Saiba mais sobre o ASA</Action></div>
          <p className="mt-7 text-small text-mist">Na FECAP, uma vez Alvarista, eterno(a) Alvarista será.</p>
        </div>
        <div className="relative min-h-[310px] overflow-hidden rounded-xl bg-[#eef7f2] p-5 sm:min-h-[390px] sm:p-8">
          <div className="absolute -right-10 -top-12 h-64 w-64 rounded-full border-[38px] border-white/80" aria-hidden />
          <div className="absolute -bottom-16 -left-6 h-56 w-56 rounded-full bg-[#e7defe]" aria-hidden />
          <img src="/brand/asa/asa-community.jpg" alt="Comunidade FECAP em imagem institucional do ASA" loading="eager" className="relative z-10 h-[270px] w-full rounded-lg object-cover sm:h-[330px]" />
          <div className="absolute bottom-2 left-2 z-20 rounded-md bg-white px-4 py-3 shadow-md sm:bottom-7 sm:left-7"><p className="text-caption font-bold uppercase tracking-wide text-assistant-text">Acolhimento · permanência · sucesso</p><p className="mt-1 text-small font-semibold text-fecap">Uma jornada Alvarista por inteiro</p></div>
        </div>
      </div>
    </section>

    <section aria-labelledby="search-title" className="relative z-20 mx-auto -mt-1 max-w-5xl px-4 py-8 sm:px-6">
      <div className="rounded-xl border border-line bg-white p-5 shadow-md sm:p-7">
        <h2 id="search-title" className="text-xl font-bold text-fecap">Como podemos ajudar você hoje?</h2>
        <label htmlFor="service-search" className="sr-only">Pesquise na Cesta de Serviços</label>
        <div className="mt-4 flex items-center gap-3 rounded-md border border-line-strong bg-white px-4 focus-within:border-action focus-within:ring-2 focus-within:ring-action/20"><Search size={20} className="shrink-0 text-action" aria-hidden /><input id="service-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquise Portal do Aluno, estágio, Moodle..." className="h-12 min-w-0 flex-1 bg-transparent text-body text-ink outline-none" /></div>
        {query && <div aria-live="polite" className="mt-3">{results.length ? <ul className="divide-y divide-line">{results.map((item) => <li key={item.title}><a href={item.href} className="flex items-center justify-between gap-3 py-3 text-small font-semibold text-action hover:underline">{item.title}<ArrowUpRight size={16} aria-hidden /></a></li>)}</ul> : <p className="py-3 text-small text-slate">Nenhum serviço correspondente na seleção consultada. <a className="font-semibold text-action underline" href={fecapUrls.basket}>Consultar a Cesta oficial completa</a>.</p>}</div>}
        <p className="mt-3 text-caption text-mist">Busca nos serviços oficiais destacados; consulte a Cesta completa para todo o catálogo.</p>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-small font-bold uppercase tracking-[.12em] text-assistant-text">Acesso direto</p><h2 className="mt-2 text-3xl font-bold tracking-tight text-fecap">Acesse o que você precisa.</h2></div><Link to="/cesta-de-servicos" className="inline-flex items-center gap-2 text-small font-bold text-action hover:underline">Ver todos os serviços <ArrowRight size={16} aria-hidden /></Link></div>
      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{officialServices.slice(0, 4).map((item, index) => <a key={item.title} href={item.href} className="group flex min-h-40 flex-col justify-between rounded-lg border border-line bg-white p-5 transition-colors hover:border-action/40 hover:bg-[#f8fbf9]"><span className={`flex h-10 w-10 items-center justify-center rounded-md ${index === 1 ? 'bg-assistant-soft text-assistant-text' : 'bg-action-soft text-action'}`}><ArrowUpRight size={19} aria-hidden /></span><span><span className="block text-base font-semibold text-ink group-hover:text-action">{item.title}</span><span className="mt-1 block text-caption text-mist">{item.category}</span></span></a>)}</div>
    </section>

    <section className="border-y border-line bg-white"><div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[.8fr_1.2fr] md:py-16"><div><p className="text-small font-bold uppercase tracking-[.12em] text-action">Quem somos</p><h2 className="mt-3 text-3xl font-bold leading-tight text-fecap">Mais do que atendimento, estamos com você em cada etapa.</h2></div><div className="max-w-2xl"><p className="text-base leading-7 text-slate">Por meio da Área do Sucesso Alvarista, estudantes são acolhidos e acompanhados ao longo de toda a jornada na FECAP. O ASA é um espaço de relacionamento com a comunidade acadêmica, focado no acolhimento, permanência e sucesso do estudante.</p><p className="mt-4 text-base leading-7 text-slate">A equipe multidisciplinar se dedica às necessidades, ao bem-estar e ao desenvolvimento dos estudantes. A Cesta de Serviços contribui para a adaptação ao mundo universitário, ao trabalho e ao relacionamento com a sociedade.</p><Link to="/conheca-o-asa" className="mt-5 inline-flex items-center gap-2 font-bold text-action hover:underline">Conheça o ASA <ArrowRight size={16} aria-hidden /></Link></div></div></section>

    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16"><p className="text-small font-bold uppercase tracking-[.12em] text-assistant-text">Como o ASA acompanha sua jornada</p><h2 className="mt-2 text-3xl font-bold text-fecap">Um espaço para seguir em frente.</h2><div className="mt-7 grid gap-6 md:grid-cols-4">{[
      ['Acolher', 'Apoio e integração à comunidade acadêmica.'], ['Orientar', 'Informações e caminhos para acessar serviços.'], ['Desenvolver', 'Recursos para a jornada acadêmica e profissional.'], ['Conectar', 'Relação com oportunidades e com a comunidade Alvarista.'],
    ].map(([title, text], index) => <div key={title} className="border-t-2 border-action pt-4"><span className="text-caption font-bold text-assistant-text">0{index + 1}</span><h3 className="mt-3 text-xl font-bold text-fecap">{title}</h3><p className="mt-2 leading-6 text-slate">{text}</p></div>)}</div><p className="mt-5 text-caption text-mist">Eixos editoriais desta apresentação, organizados a partir da atuação institucional descrita pela FECAP.</p></section>

    <section className="bg-[#f4f8f5]"><div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16"><h2 className="text-3xl font-bold text-fecap">O ASA é para você.</h2><div className="mt-6 grid gap-4 md:grid-cols-3"><a href={fecapUrls.basket} className="rounded-lg border border-line bg-white p-5 hover:border-action"><GraduationCap className="text-action" aria-hidden /><h3 className="mt-4 text-lg font-bold text-fecap">Estudantes</h3><p className="mt-2 text-small leading-6 text-slate">Acesse orientações e serviços da Cesta oficial.</p></a><a href={fecapUrls.alumni} className="rounded-lg border border-line bg-white p-5 hover:border-action"><UsersRound className="text-assistant-text" aria-hidden /><h3 className="mt-4 text-lg font-bold text-fecap">Ex-alunos</h3><p className="mt-2 text-small leading-6 text-slate">Consulte os caminhos institucionais para a comunidade Alumni.</p></a><Link to="/empresas" className="rounded-lg border border-line bg-white p-5 hover:border-action"><BriefcaseBusiness className="text-action" aria-hidden /><h3 className="mt-4 text-lg font-bold text-fecap">Empresas</h3><p className="mt-2 text-small leading-6 text-slate">Conheça a divulgação de oportunidades e ações com a FECAP.</p></Link></div></div></section>

    <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-2 md:py-16"><div><p className="text-small font-bold uppercase tracking-[.12em] text-action">Carreira e oportunidades</p><h2 className="mt-3 text-3xl font-bold text-fecap">Seu próximo passo profissional pode começar aqui.</h2><p className="mt-4 leading-7 text-slate">O FECAP+ Oportunidades divulga vagas de estágio, efetivas e de trainee para alunos e ex-alunos elegíveis da FECAP, conforme as informações institucionais.</p><a href={`${fecapUrls.basket}acesso-a-vagas-fecap-oportunidades/`} className="mt-5 inline-flex items-center gap-2 font-bold text-action hover:underline">Acessar instruções oficiais <ArrowRight size={16} aria-hidden /></a></div><div className="rounded-lg bg-assistant-soft p-6 sm:p-8"><Sparkles className="text-assistant-text" aria-hidden /><h3 className="mt-4 text-xl font-bold text-fecap">Para empresas</h3><p className="mt-2 leading-6 text-slate">Empresas parceiras podem divulgar vagas e participar de ações e feiras de recrutamento realizadas na FECAP.</p><div className="mt-5 flex flex-wrap gap-3"><Action href="/empresas">Saiba como participar</Action><a href={fecapUrls.workability} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-assistant-text/30 bg-white px-4 py-2 text-small font-semibold text-assistant-text">Quero contratar <ArrowUpRight size={16} aria-hidden /></a></div></div></section>

    <AsaPartnersCarousel />

    <section className="border-y border-line bg-white"><div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1fr_1fr] md:py-14"><div><p className="text-small font-bold uppercase tracking-[.12em] text-action">Atendimento</p><h2 className="mt-3 text-3xl font-bold text-fecap">Precisa de ajuda? Estamos aqui para você.</h2><p className="mt-3 max-w-lg leading-7 text-slate">Para estudantes em andamento, fale com o ASA pelo canal institucional. Empresas conveniadas para estágio têm um contato dedicado.</p><Link to="/atendimento" className="mt-5 inline-flex items-center gap-2 font-bold text-action hover:underline">Ver canais oficiais <ArrowRight size={16} aria-hidden /></Link></div><div className="grid gap-3 sm:grid-cols-2"><a href="mailto:sucessoalvarista@fecap.br" className="rounded-lg border border-line p-5"><Mail className="text-action" aria-hidden /><p className="mt-3 text-caption text-mist">Estudantes em andamento</p><p className="mt-1 font-semibold text-fecap">sucessoalvarista@fecap.br</p></a><a href="https://www.fecap.br/fale-conosco/" className="rounded-lg border border-line p-5"><ArrowUpRight className="text-assistant-text" aria-hidden /><p className="mt-3 text-caption text-mist">Canais institucionais</p><p className="mt-1 font-semibold text-fecap">Telefone e WhatsApp FECAP</p></a></div></div></section>

    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 md:py-16"><h2 className="text-3xl font-bold text-fecap">Dúvidas frequentes</h2><div className="mt-5 divide-y divide-line border-y border-line">{[
      ['Como acessar o Portal do Aluno?', 'Acesse o portal institucional. Para orientações de acesso, consulte o serviço correspondente na Cesta de Serviços.'], ['Como acessar o Moodle?', 'Consulte a instrução oficial “Acesso ao Moodle” na Cesta de Serviços.'], ['Onde encontro serviços acadêmicos e documentos?', 'A Cesta de Serviços reúne instruções oficiais por categoria, incluindo serviços acadêmicos e documentos.'], ['Como consultar oportunidades de estágio?', 'Consulte o serviço “Acesso a vagas – FECAP+ Oportunidades”. A página oficial informa a elegibilidade e as orientações de acesso.'], ['Como uma empresa divulga vagas?', 'A FECAP direciona empresas à plataforma Workability e disponibiliza um tutorial institucional.'],
    ].map(([question, answer]) => <details key={question} className="group py-4"><summary className="cursor-pointer list-none pr-8 font-semibold text-fecap marker:hidden focus-visible:outline-action">{question}<span className="float-right text-action group-open:rotate-45">＋</span></summary><p className="mt-3 max-w-3xl leading-6 text-slate">{answer}</p><a href={fecapUrls.basket} className="mt-2 inline-block text-small font-semibold text-action hover:underline">Consultar fonte oficial</a></details>)}</div></section>
  </PublicLayout>;
}
