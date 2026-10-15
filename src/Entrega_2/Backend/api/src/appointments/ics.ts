/**
 * Arquivo iCalendar (RFC 5545) de um agendamento, gerado sob demanda para o aluno adicionar à própria
 * agenda. Nenhuma confirmação externa é simulada: o arquivo só descreve o atendimento já registrado.
 */
const stamp = (date: Date): string => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** Escapa texto conforme RFC 5545 (\, ; , e quebras de linha). */
export function icsText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Dobra linhas longas em 75 octetos (simplificado para caracteres). */
function fold(line: string): string {
  if (line.length <= 74) return line;
  const chunks: string[] = [];
  for (let index = 0; index < line.length; index += 74) chunks.push(index === 0 ? line.slice(index, index + 74) : ` ${line.slice(index, index + 73)}`);
  return chunks.join('\r\n');
}

export function appointmentIcs(input: { id: string; protocol: string; title: string; description: string; location: string | null; startsAt: Date; endsAt: Date; now: Date; cancelled: boolean }): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ASA Conecta//Agendamentos//PT-BR',
    'CALSCALE:GREGORIAN',
    `METHOD:${input.cancelled ? 'CANCEL' : 'PUBLISH'}`,
    'BEGIN:VEVENT',
    `UID:${input.id}@asa-conecta`,
    `DTSTAMP:${stamp(input.now)}`,
    `DTSTART:${stamp(input.startsAt)}`,
    `DTEND:${stamp(input.endsAt)}`,
    `SUMMARY:${icsText(input.title)}`,
    `DESCRIPTION:${icsText(input.description)}`,
    ...(input.location ? [`LOCATION:${icsText(input.location)}`] : []),
    `STATUS:${input.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
