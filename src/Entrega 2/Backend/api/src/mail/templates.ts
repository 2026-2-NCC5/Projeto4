import type { MailMessage } from './mailer.js';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

/** E-mail com código de recuperação. Sem links: o código é digitado no app. */
export function passwordResetCodeEmail(input: { to: string; fullName: string; code: string; ttlMinutes: number }): MailMessage {
  const firstName = input.fullName.trim().split(/\s+/)[0] || 'estudante';
  const text = [
    `Olá, ${firstName}.`,
    '',
    `Seu código para redefinir a senha do ASA Conecta é: ${input.code}`,
    '',
    `O código expira em ${input.ttlMinutes} minutos e só pode ser usado uma vez.`,
    'Se você não solicitou a redefinição, ignore este e-mail: sua senha continua a mesma.',
    '',
    'ASA Conecta · Área do Sucesso Alvarista · FECAP',
  ].join('\n');
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F6F8F7;font-family:Arial,Helvetica,sans-serif;color:#17201D">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#FFFFFF;border-radius:20px;border:1px solid #DDE5E2" cellpadding="0" cellspacing="0">
<tr><td style="background:#023327;border-radius:20px 20px 0 0;padding:20px 28px;color:#FFFFFF;font-size:18px;font-weight:bold">ASA Conecta</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 12px">Olá, ${escapeHtml(firstName)}.</p>
<p style="margin:0 0 16px">Use este código para redefinir sua senha:</p>
<p style="margin:0 0 16px;font-size:32px;letter-spacing:8px;font-weight:bold;color:#023327">${escapeHtml(input.code)}</p>
<p style="margin:0 0 12px;color:#66736F">O código expira em ${input.ttlMinutes} minutos e só pode ser usado uma vez.</p>
<p style="margin:0;color:#66736F">Se você não solicitou a redefinição, ignore este e-mail: sua senha continua a mesma.</p>
</td></tr></table>
<p style="color:#66736F;font-size:12px;margin-top:16px">Área do Sucesso Alvarista · FECAP</p>
</td></tr></table></body></html>`;
  return { to: input.to, subject: `${input.code} é seu código do ASA Conecta`, text, html };
}
