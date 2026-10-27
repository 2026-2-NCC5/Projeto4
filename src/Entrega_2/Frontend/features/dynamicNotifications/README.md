# Avisos dinâmicos

O overlay adapta a experiência de `rit3zh/expo-dynamic-notifications` ao ASA Conecta. Avisos push recebidos com o app aberto aparecem como um cartão animado no topo; ao tocar, o app abre o chamado, agendamento, recomendação ou central relacionado. Os avisos da fila continuam usando o alerta próprio da fila.

O código visual foi integrado a partir do commit `5de059a5cbefbe28c14efbe785166665a7c70bc5` do [repositório de origem](https://github.com/rit3zh/expo-dynamic-notifications), sob a licença MIT incluída em `UPSTREAM_LICENSE.txt`.

## Android

Expo Go continua adequado para visualizar as telas, mas não carrega `expo-notifications` no Android. Push remoto e o overlay disparado por push precisam de um build próprio com os módulos nativos do projeto:

```bash
cd src/Entrega_2/Frontend
npm install
npm run android:dev
```

Depois da primeira compilação, inicie o Metro com `npm start` e abra o app ASA Conecta instalado no emulador ou aparelho.
