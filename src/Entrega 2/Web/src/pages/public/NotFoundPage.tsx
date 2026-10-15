import { ButtonLink } from '@/components/ui/Button';
import { PublicLayout } from '@/layouts/PublicLayout';

export default function NotFoundPage() {
  return (
    <PublicLayout>
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-20 text-center">
        <p className="text-small font-semibold text-action">Erro 404</p>
        <h1 className="text-h1 font-bold">Página não encontrada</h1>
        <p className="text-body text-slate">O endereço pode ter mudado ou não existir. Volte ao início para continuar.</p>
        <ButtonLink to="/" variant="primary" className="mt-2">
          Ir para o início
        </ButtonLink>
      </div>
    </PublicLayout>
  );
}
