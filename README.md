# Rodízio da Micem

Site que organiza o rodízio de qual técnico do DTI atende o próximo chamado (Micem).
Quem atende vai para o fim da fila.

## Como funciona

- **Técnicos** abrem o site e caem na tela "Quem é você?": tocam no próprio nome e veem a
  sequência das Micens (dá também para "Só ver a fila" ou entrar como Mr. Micem). Ao fazer uma Micem,
  clicam em "Fiz a Micem", o que cria uma solicitação para o Mr. Micem.
- **Mr. Micem** (a Central) entra com a senha e:
  - aprova ou recusa as solicitações (só depois de aprovada o técnico vai para o fim da fila);
  - marca uma Micem como feita diretamente;
  - marca técnicos como *ausente no momento* ou *ausente hoje*;
  - adiciona, remove e reordena os técnicos.
  - pode desfazer, logo em seguida (até 2 min), uma aprovação, recusa, "Micem feita" ou remoção.
- **Ausências:** quem está ausente é pulado, mas mantém sua posição. Quando volta, já está
  na frente de quem atendeu enquanto ele estava fora. "Ausente hoje" expira sozinho na
  virada do dia (horário de Brasília); "ausente no momento" fica até o Mr. Micem tirar.

Na primeira vez que o site abre, a fila já vem com os técnicos de `TECNICOS_INICIAIS`
(em `lib/rodizio.mjs`). Depois disso o Mr. Micem cadastra, remove e reordena pelo site.

A fila é salva no Netlify Blobs, então todos veem a mesma situação. A página atualiza a
cada 10 segundos.

## Publicar no Netlify

1. No Netlify: **Add new site → Import an existing project** e escolha este repositório.
   As configurações de build já estão no `netlify.toml`.
2. Em **Site configuration → Environment variables**, crie `CENTRAL_SENHA` com a senha do
   Mr. Micem. A senha fica só no servidor e não aparece no código do site.
3. Faça um novo deploy depois de criar a variável.

## Estrutura

- `public/index.html`: a página (HTML, CSS e JS, sem build).
- `netlify/functions/api.mjs`: a API em `/api`, que lê e grava a fila e confere a senha.
- `lib/rodizio.mjs`: as regras do rodízio.
- `tests/rodizio.test.mjs`: testes das regras (`npm test`).
