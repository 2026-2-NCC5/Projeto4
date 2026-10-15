/**
 * Contadores do monitor da fila (expostos em GET /health/queue; sem Prometheus na infraestrutura atual).
 * Os nomes seguem a convenção queue_*_total para facilitar a exportação futura.
 */
export class QueueMetrics {
  queue_fetch_success_total = 0;
  queue_fetch_failure_total = 0;
  queue_parser_failure_total = 0;
  queue_notifications_sent_total = 0;
  queue_notifications_failed_total = 0;
  queue_calls_observed_total = 0;

  toJSON(snapshotAgeSeconds: number | null) {
    return {
      queue_fetch_success_total: this.queue_fetch_success_total,
      queue_fetch_failure_total: this.queue_fetch_failure_total,
      queue_parser_failure_total: this.queue_parser_failure_total,
      queue_snapshot_age_seconds: snapshotAgeSeconds,
      queue_notifications_sent_total: this.queue_notifications_sent_total,
      queue_notifications_failed_total: this.queue_notifications_failed_total,
      queue_calls_observed_total: this.queue_calls_observed_total,
    };
  }
}
