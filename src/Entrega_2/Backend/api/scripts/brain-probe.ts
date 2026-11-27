import { BrainIndex } from '../src/brain/index.js';
import { composeBrainAnswer } from '../src/brain/answer.js';
import { BRAIN_SNAPSHOT } from '../src/brain/vault.generated.js';
const idx = new BrainIndex(BRAIN_SNAPSHOT);
const full = process.env.FULL === '1';
const qs = process.argv.slice(2).length ? process.argv.slice(2) : [
 'onde fica a fecap','qual o endereço do campus liberdade','quanto custa a mensalidade de administração','quais cursos de graduação a fecap tem',
 'como funciona o vestibular','tem bolsa de estudo','qual o horário da biblioteca','como trancar a matrícula','o que é o asa','quando começam as aulas',
 'tem curso de ciência da computação','como faço intercâmbio','quem é o reitor','a fecap tem mestrado','como pedir segunda chamada de prova',
 'o que é a liga de mercado financeiro','tem estacionamento','qual o telefone da fecap','como acesso o moodle','tem atlética','quanto tempo dura o curso de direito',
 'como funciona o fies','tem estágio obrigatório','qual a nota do mec da fecap','história da fecap','como transfiro de outra faculdade','tem restaurante no campus',
 'a fecap tem prouni','quais são as empresas juniores','como funciona a dp','o que é o nivelamento','tem curso de economia','quantos semestres tem administração',
 'tem curso de mba','como funciona a monitoria','quando é o vestibular','tem bolsa para atleta','como falar com a ouvidoria','o que é a fecap','quem fundou a fecap',
 'tem pós em controladoria','como funciona o enade','qual o email do asa','qual o whatsapp do asa','tem wifi no campus','como reservar sala de estudo na biblioteca',
];
let n=0;
for (const q of qs) { const hits = idx.search(q, 3); const a = composeBrainAnswer(q, hits); if (a) n++;
  console.log(`${a ? 'OK ' : '-- '}${(hits[0]?.score ?? 0).toFixed(1).padStart(5)} | ${q} -> ${a ? a.noteId : '(sem resposta) ' + (hits[0]?.note.id ?? '')}`);
  if (a && full) console.log('   SPEECH:', a.speech, '\n   MSG:', a.message.slice(0, 400).replace(/\n/g,' ⏎ '));
}
console.log(`${n}/${qs.length}`);
