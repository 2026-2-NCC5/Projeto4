# Validação documental

`validateInternship` verifica nome/e-mail, endereço completo, CEP, empresa, datas e atividades. O número pode ser dispensado somente com `noNumber=true`. O complemento é independente do logradouro e do número. A geração persiste snapshot e campos efetivamente mapeados e compara os obrigatórios; qualquer campo ausente invalida a versão e bloqueia `submit`. `omitFields` permite reproduzir falha de template em teste. A prévia disponível é texto; extração de texto de PDF, renderizador PDF e template institucional aprovado não foram implementados.
