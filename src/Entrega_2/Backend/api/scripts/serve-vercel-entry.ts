/**
 * Emula a Vercel na máquina local: carrega a MESMA entrada da função (src/index.ts, export default app) e só a
 * coloca numa porta. Sem laço da fila nem timers: fila sob demanda e tarefas por /api/internal/jobs/*, como lá.
 *
 *   npm run start:vercel-entry           (PORT, padrão 3000)
 */
const { default: app } = await import('../src/index.js');

const port = Number(process.env.PORT ?? 3000);
app.listen(port, (error?: Error) => {
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log(`entrada serverless (src/index.ts) em http://localhost:${port}`);
});
