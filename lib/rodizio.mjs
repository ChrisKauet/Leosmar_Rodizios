// Regras do rodízio da Micem. Funções puras: recebem o estado e devolvem o novo estado.
//
// A fila é uma lista de ids de técnicos. O próximo é o primeiro da fila que não está
// ausente. Quem está ausente é pulado mas continua na mesma posição, então quando volta
// já está na frente de quem atendeu enquanto ele estava fora.
//
// Saldo funciona como vidas: quem faz uma Micem fora da vez continua no mesmo lugar e ganha 1
// de saldo. Assim que a vez chega em alguém com saldo, ele gasta 1 e vai para o fim da fila na
// hora, como se tivesse feito a dele, e a vez passa para o seguinte.

export const TIPOS_AUSENCIA = ["dia", "momento"];

// Técnicos cadastrados na primeira vez que o site abre, nesta ordem de fila.
export const TECNICOS_INICIAIS = ["Zeducas", "Kauet", "Miglas", "Hugo", "Pai de Familia", "João Victor"];

export function estadoInicial(nomes = TECNICOS_INICIAIS) {
  // Ids fixos: enquanto nada foi gravado, cada leitura recria este estado, e o id que o
  // técnico escolheu na página precisa continuar valendo.
  const tecnicos = nomes.map((nome, i) => ({ id: `t${i + 1}`, nome, ausencia: null }));
  return { tecnicos, fila: tecnicos.map((t) => t.id), solicitacoes: [], historico: [] };
}

// Data de hoje no fuso de Brasília, no formato AAAA-MM-DD.
export function hoje(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

// Turnos da Micem, em horário de Brasília: manhã das 8h às 17h, noite das 17h às 22h.
export const TURNOS = [
  { id: "manha", nome: "Manhã", inicio: 8, fim: 17 },
  { id: "noite", nome: "Noite", inicio: 17, fim: 22 },
];

// Hora do dia em Brasília, com fração (14:30 → 14.5).
export function horaBrasilia(data) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(data).map((x) => [x.type, x.value]));
  return Number(p.hour) + Number(p.minute) / 60;
}

// Turno em que uma data cai, ou null se for fora dos turnos.
export function turnoDe(data) {
  const h = horaBrasilia(data);
  return TURNOS.find((t) => h >= t.inicio && h < t.fim)?.id ?? null;
}

// Quantas Micens cada técnico fez em cada turno de hoje, mais as feitas fora dos turnos.
export function contagemTurnos(estado, agora = new Date()) {
  const dia = hoje(agora);
  const porId = new Map(estado.tecnicos.map((t) => [t.id, t]));
  const grupos = Object.fromEntries([...TURNOS.map((t) => t.id), "fora"].map((k) => [k, new Map()]));
  for (const h of estado.historico) {
    if (h.usoSaldo) continue; // usar saldo não é uma Micem feita
    const quando = new Date(h.quando);
    if (hoje(quando) !== dia) continue;
    const g = grupos[turnoDe(quando) ?? "fora"];
    g.set(h.tecnicoId, (g.get(h.tecnicoId) ?? 0) + 1);
  }
  const lista = (g) => [...g].map(([id, qtd]) => ({ id, nome: porId.get(id)?.nome ?? "?", qtd }))
    .sort((a, b) => b.qtd - a.qtd || a.nome.localeCompare(b.nome, "pt-BR"));
  const total = (g) => [...g.values()].reduce((a, b) => a + b, 0);
  return {
    data: dia,
    atual: turnoDe(agora),
    turnos: TURNOS.map((t) => ({ ...t, total: total(grupos[t.id]), tecnicos: lista(grupos[t.id]) })),
    fora: { total: total(grupos.fora), tecnicos: lista(grupos.fora) },
  };
}

// "Ausente no dia" vale só para a data em que foi marcada; no dia seguinte some sozinha.
export function ausenciaAtual(tecnico, agora = new Date()) {
  const a = tecnico.ausencia;
  if (!a) return null;
  if (a.tipo === "dia" && a.data !== hoje(agora)) return null;
  return a.tipo;
}

export function limparAusenciasVencidas(estado, agora = new Date()) {
  for (const t of estado.tecnicos) {
    if (t.ausencia && !ausenciaAtual(t, agora)) t.ausencia = null;
  }
  return estado;
}

function presentes(estado, agora) {
  const porId = new Map(estado.tecnicos.map((t) => [t.id, t]));
  return estado.fila.filter((id) => porId.has(id) && !ausenciaAtual(porId.get(id), agora)).map((id) => porId.get(id));
}

// O próximo é o primeiro presente sem saldo. Se todos os presentes têm saldo, é o primeiro presente.
export function proximo(estado, agora = new Date()) {
  const p = presentes(estado, agora);
  return (p.find((t) => !(t.saldo > 0)) ?? p[0])?.id ?? null;
}

// Visão pública: fila em ordem, com a ausência já resolvida e o próximo marcado.
export function visao(estado, agora = new Date()) {
  const porId = new Map(estado.tecnicos.map((t) => [t.id, t]));
  const prox = proximo(estado, agora);
  return {
    proximo: prox,
    fila: estado.fila
      .filter((id) => porId.has(id))
      .map((id) => ({
        id,
        nome: porId.get(id).nome,
        ausencia: ausenciaAtual(porId.get(id), agora),
        saldo: porId.get(id).saldo || 0,
        proximo: id === prox,
      })),
    solicitacoes: estado.solicitacoes.map((s) => ({ ...s, nome: porId.get(s.tecnicoId)?.nome ?? "?" })),
    turnos: contagemTurnos(estado, agora),
    // Só o token: o estado anterior guardado para desfazer não sai do servidor.
    desfazer: estado.desfazer ? { token: estado.desfazer.token, quando: estado.desfazer.quando } : null,
    historico: estado.historico.slice(-30).reverse().map((h) => ({ ...h, origem: h.origem === "Central" ? "Mr. Micem" : h.origem, nome: porId.get(h.tecnicoId)?.nome ?? h.nome })),
  };
}

export class ErroRodizio extends Error {}

function exigirTecnico(estado, id) {
  const t = estado.tecnicos.find((x) => x.id === id);
  if (!t) throw new ErroRodizio("Técnico não encontrado.");
  return t;
}

function novoId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

// Registra a Micem. Se era a vez do técnico, ele vai para o fim da fila. Se não era, ele fica
// onde está e ganha 1 de saldo.
function concluirMicem(estado, tecnicoId, origem, agora) {
  const t = exigirTecnico(estado, tecnicoId);
  const quando = agora.toISOString();
  estado.solicitacoes = estado.solicitacoes.filter((s) => s.tecnicoId !== tecnicoId);
  if (tecnicoId === proximo(estado, agora)) {
    estado.fila = estado.fila.filter((id) => id !== tecnicoId).concat(tecnicoId);
    estado.historico.push({ tecnicoId, nome: t.nome, quando, origem });
  } else {
    t.saldo = (t.saldo || 0) + 1;
    estado.historico.push({ tecnicoId, nome: t.nome, quando, origem, foraDaVez: true });
  }
  if (estado.historico.length > 500) estado.historico = estado.historico.slice(-500);
}

// Enquanto o primeiro presente da fila tiver saldo, ele gasta 1 e vai para o fim. Se todos os
// presentes têm saldo, para: o primeiro é chamado normalmente, para a fila não travar.
export function gastarSaldos(estado, agora = new Date()) {
  const quando = agora.toISOString();
  for (let i = 0; i < estado.fila.length; i++) {
    const p = presentes(estado, agora);
    if (!p.length || !(p[0].saldo > 0) || p.every((x) => x.saldo > 0)) break;
    const t = p[0];
    t.saldo -= 1;
    estado.fila = estado.fila.filter((id) => id !== t.id).concat(t.id);
    estado.historico.push({ tecnicoId: t.id, nome: t.nome, quando, origem: "saldo", usoSaldo: true });
  }
  if (estado.historico.length > 500) estado.historico = estado.historico.slice(-500);
  return estado;
}

// Ações que qualquer técnico pode fazer.
export function acaoPublica(estado, acao, agora = new Date()) {
  delete estado.desfazer; // qualquer mudança depois da última ação impede desfazê-la
  limparAusenciasVencidas(estado, agora);
  switch (acao.tipo) {
    case "solicitar": {
      exigirTecnico(estado, acao.tecnicoId);
      if (estado.solicitacoes.some((s) => s.tecnicoId === acao.tecnicoId)) {
        throw new ErroRodizio("Já existe uma solicitação pendente para este técnico.");
      }
      estado.solicitacoes.push({ id: novoId(), tecnicoId: acao.tecnicoId, criadoEm: agora.toISOString() });
      return estado;
    }
    default:
      throw new ErroRodizio("Ação não permitida.");
  }
}

// Ações do Mr. Micem que podem ser desfeitas logo depois, e por quanto tempo.
export const DESFAZIVEIS = ["aprovar", "recusar", "marcarFeita", "remover", "saldo"];
export const PRAZO_DESFAZER_MS = 2 * 60 * 1000;

// Ações exclusivas do Mr. Micem, a Central (a senha é conferida antes de chegar aqui).
// Antes de uma ação desfazível, guarda uma cópia do estado. "desfazer" volta para essa cópia,
// desde que nada mais tenha mudado desde então e dentro do prazo.
export function acaoCentral(estado, acao, agora = new Date()) {
  const ultima = estado.desfazer;
  delete estado.desfazer;
  if (acao.tipo === "desfazer") {
    if (!ultima || ultima.token !== acao.token || agora - Date.parse(ultima.quando) > PRAZO_DESFAZER_MS) {
      throw new ErroRodizio("Não dá mais para desfazer essa ação.");
    }
    return ultima.antes;
  }
  const antes = DESFAZIVEIS.includes(acao.tipo) ? JSON.parse(JSON.stringify(estado)) : null;
  const novo = gastarSaldos(executarCentral(estado, acao, agora), agora);
  if (antes) novo.desfazer = { token: novoId(), quando: agora.toISOString(), antes };
  return novo;
}

function executarCentral(estado, acao, agora) {
  limparAusenciasVencidas(estado, agora);
  switch (acao.tipo) {
    case "aprovar": {
      const s = estado.solicitacoes.find((x) => x.id === acao.solicitacaoId);
      if (!s) throw new ErroRodizio("Solicitação não encontrada.");
      concluirMicem(estado, s.tecnicoId, "solicitação aprovada", agora);
      return estado;
    }
    case "recusar": {
      estado.solicitacoes = estado.solicitacoes.filter((x) => x.id !== acao.solicitacaoId);
      return estado;
    }
    case "marcarFeita": {
      concluirMicem(estado, acao.tecnicoId, "Mr. Micem", agora);
      return estado;
    }
    case "saldo": {
      const t = exigirTecnico(estado, acao.tecnicoId);
      const delta = Number(acao.delta);
      if (delta !== 1 && delta !== -1) throw new ErroRodizio("Ajuste de saldo inválido.");
      t.saldo = Math.max(0, (t.saldo || 0) + delta);
      return estado;
    }
    case "ausencia": {
      const t = exigirTecnico(estado, acao.tecnicoId);
      if (acao.ausencia == null) t.ausencia = null;
      else if (TIPOS_AUSENCIA.includes(acao.ausencia)) t.ausencia = { tipo: acao.ausencia, data: hoje(agora) };
      else throw new ErroRodizio("Tipo de ausência inválido.");
      return estado;
    }
    case "adicionar": {
      const nome = String(acao.nome ?? "").trim().slice(0, 60);
      if (!nome) throw new ErroRodizio("Informe o nome do técnico.");
      if (estado.tecnicos.some((t) => t.nome.toLowerCase() === nome.toLowerCase())) {
        throw new ErroRodizio("Já existe um técnico com esse nome.");
      }
      const id = novoId();
      estado.tecnicos.push({ id, nome, ausencia: null });
      estado.fila.push(id);
      return estado;
    }
    case "renomear": {
      const t = exigirTecnico(estado, acao.tecnicoId);
      const nome = String(acao.nome ?? "").trim().slice(0, 60);
      if (!nome) throw new ErroRodizio("Informe o nome do técnico.");
      t.nome = nome;
      return estado;
    }
    case "remover": {
      exigirTecnico(estado, acao.tecnicoId);
      estado.tecnicos = estado.tecnicos.filter((t) => t.id !== acao.tecnicoId);
      estado.fila = estado.fila.filter((id) => id !== acao.tecnicoId);
      estado.solicitacoes = estado.solicitacoes.filter((s) => s.tecnicoId !== acao.tecnicoId);
      return estado;
    }
    case "reordenar": {
      const nova = Array.isArray(acao.fila) ? acao.fila : [];
      const atuais = new Set(estado.fila);
      if (nova.length !== atuais.size || new Set(nova).size !== nova.length || !nova.every((id) => atuais.has(id))) {
        throw new ErroRodizio("A nova ordem precisa conter exatamente os técnicos atuais.");
      }
      estado.fila = nova;
      return estado;
    }
    default:
      return acaoPublica(estado, acao, agora);
  }
}
