import { CalendarClock, ExternalLink, GraduationCap, Lock, MessagesSquare, Sparkles } from 'lucide-react';
import { ButtonLink } from '@/components/ui/Button';
import { Surface } from '@/components/ui/Display';
import { usePlatformInfo } from '@/features/platform/platform';
import { PublicLayout } from '@/layouts/PublicLayout';

/** Canais institucionais reais e públicos (os demais são configurados pela administração). */
const OFFICIAL_LINKS = [
  { label: 'Site da FECAP', url: 'https://www.fecap.br/' },
  { label: 'Portal do Aluno (FECAP)', url: 'https://portal.fecap.br/' },
];

const BENEFITS = [
  { icon: MessagesSquare, title: 'Atendimento com protocolo', text: 'Abra chamados, acompanhe a situação, o prazo e as respostas da equipe ASA no portal ou no app.' },
  { icon: CalendarClock, title: 'Agendamento com o ASA', text: 'Escolha um horário disponível, receba a confirmação e remarque ou cancele dentro da política.' },
  { icon: GraduationCap, title: 'Vida acadêmica e pendências', text: 'Disciplinas, avaliações, frequência e pendências reunidas, com análise explicável do Agente para o Estudante.' },
  { icon: Sparkles, title: 'Assistente ASA', text: 'Perguntas em português, respostas com fonte e encaminhamento para uma pessoa quando necessário.' },
];

export default function LandingPage() {
  const platform = usePlatformInfo();
  const links = [...OFFICIAL_LINKS, ...(platform.data?.links ?? [])];
  return (
    <PublicLayout wide>
      <section className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.2fr_1fr] lg:py-20">
          <div>
            <p className="text-small font-semibold text-action">Área do Sucesso Alvarista · FECAP</p>
            <h1 className="mt-2 text-display font-bold text-ink sm:text-[2.25rem] sm:leading-[2.75rem]">O ASA perto de você, no portal e no app.</h1>
            <p className="mt-4 max-w-xl text-body text-slate">
              O ASA Conecta reúne atendimento, agendamentos e acompanhamento acadêmico em um só lugar. O mesmo login vale para o portal web e o aplicativo,
              e tudo o que você faz em um aparece no outro.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink to="/login" variant="primary" size="lg">
                Entrar
              </ButtonLink>
              <ButtonLink to="/cadastro" size="lg">
                Criar conta de aluno
              </ButtonLink>
            </div>
          </div>
          <Surface className="self-start" aria-labelledby="horario">
            <h2 id="horario" className="text-h4 font-semibold">
              Horário de atendimento do ASA
            </h2>
            {platform.data ? (
              <>
                <ul className="mt-3 flex flex-col gap-1.5 text-body">
                  {platform.data.businessHours.days.map((day) => (
                    <li key={day.weekday} className="flex justify-between gap-4">
                      <span className="text-slate">{day.label}</span>
                      <span className="tabular-nums">{day.intervals.map((interval) => `${interval.start}–${interval.end}`).join(', ') || 'Fechado'}</span>
                    </li>
                  ))}
                </ul>
                {platform.data.businessHours.note ? <p className="mt-3 text-caption text-mist">{platform.data.businessHours.note}</p> : null}
              </>
            ) : (
              <p className="mt-3 text-small text-mist">Carregando…</p>
            )}
          </Surface>
        </div>
      </section>

      <section aria-labelledby="beneficios" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="beneficios" className="text-h2 font-semibold">
          O que você encontra
        </h2>
        <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {BENEFITS.map((benefit) => (
            <li key={benefit.title} className="flex gap-4 rounded-lg border border-line bg-white p-5">
              <benefit.icon size={20} className="mt-0.5 shrink-0 text-action" aria-hidden />
              <div>
                <h3 className="text-h4 font-semibold">{benefit.title}</h3>
                <p className="mt-1 text-small text-slate">{benefit.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="privacidade" className="border-y border-line bg-white">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 py-12 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 id="privacidade" className="flex items-center gap-2 text-h2 font-semibold">
              <Lock size={20} aria-hidden className="text-action" /> Privacidade e decisões humanas
            </h2>
            <ul className="mt-4 flex flex-col gap-2 text-body text-slate">
              <li>Você vê apenas os seus dados; a equipe do ASA vê o necessário para atender.</li>
              <li>O Agente para o Estudante recomenda e explica, com evidências e nível de confiança. Ele nunca altera notas, matrícula ou frequência.</li>
              <li>O assistente não grava áudio. No app, o reconhecimento de voz acontece no aparelho e só o texto é enviado.</li>
              <li>Mensagens internas da equipe nunca aparecem para o aluno, e cada ação da equipe fica registrada na auditoria.</li>
            </ul>
          </div>
          <div>
            <h2 className="text-h2 font-semibold">Canais institucionais</h2>
            <ul className="mt-4 flex flex-col gap-2">
              {links.map((link) => (
                <li key={link.url}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-body font-semibold text-action hover:underline">
                    {link.label}
                    <ExternalLink size={16} aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
