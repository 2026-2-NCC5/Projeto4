import { useQuery } from '@tanstack/react-query';
import { MetricCard, SectionHeader, Surface } from '@/components/ui/Display';
import { useSession } from '@/features/auth/session';
import { centralApi, centralKeys } from './api';

const minutes = (value: number | null) => {
  if (value === null) return 'Sem dados';
  if (value < 60) return `${Math.round(value)} min`;
  return `${(value / 60).toFixed(1).replace('.', ',')} h`;
};

/**
 * Indicadores do canal, calculados pela API a partir de eventos reais dos últimos 30 dias. Sem dados, aparece
 * "Sem dados", nunca um valor estimado. Em ambiente sem o canal, a seção simplesmente não existe.
 */
export function WhatsAppMetricsSection() {
  const { can } = useSession();
  const metrics = useQuery({ queryKey: centralKeys.metrics, queryFn: centralApi.metrics, enabled: can('metrics:read'), retry: false });
  if (!metrics.data) return null;
  const data = metrics.data;
  return (
    <Surface aria-labelledby="metricas-whatsapp">
      <SectionHeader id="metricas-whatsapp" title="WhatsApp nos últimos 30 dias" description="Calculado a partir de eventos reais do atendimento." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Chamados abertos" value={data.ticketsOpened} />
        <MetricCard label="Resolvidos" value={data.ticketsResolved} />
        <MetricCard label="Sem vínculo, em aberto" value={data.unidentifiedOpen} tone={data.unidentifiedOpen > 0 ? 'warning' : 'neutral'} />
        <MetricCard label="Primeira resposta (mediana)" value={minutes(data.medianFirstResponseMinutes)} />
        <MetricCard label="Mensagens recebidas" value={data.inboundMessages} />
        <MetricCard label="Respostas enviadas" value={data.outboundMessages} />
        <MetricCard label="Falhas de envio" value={data.deliveryFailures} tone={data.deliveryFailures > 0 ? 'danger' : 'neutral'} />
        <MetricCard label="Sem confirmação" value={data.deliveryUnknown} tone={data.deliveryUnknown > 0 ? 'warning' : 'neutral'} />
      </div>
    </Surface>
  );
}
