// Regras do rodízio da Micem. Funções puras: recebem o estado e devolvem o novo estado.
//
// A fila é uma lista de ids de técnicos. O próximo é o primeiro da fila que não está
// ausente. Quem está ausente é pulado mas continua na mesma posição, então quando volta
// já está na frente de quem atendeu enquanto ele estava fora.

export const TIPOS_AUSENCIA = ["dia", "momento"];

export function estadoInicial() {
  return { tecnicos: [], fila: [], solicitacoes: [], historico: [] };
}

// Data de hoje no fuso de Brasília, no formato AAAA-MM-DD.
export function hoje(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
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

export function proximo(estado, agora = new Date()) {
  const porId = new Map(estado.tecnicos.map((t) => [t.id, t]));
  return estado.fila.find((id) => porId.has(id) && !ausenciaAtual(porId.get(id), agora)) ?? null;
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
        proximo: id === prox,
      })),
    solicitacoes: estado.solicitacoes.map((s) => ({ ...s, nome: porId.get(s.tecnicoId)?.nome ?? "?" })),
    historico: estado.historico.slice(-30).reverse().map((h) => ({ ...h, nome: porId.get(h.tecnicoId)?.nome ?? h.nome })),
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

// Move o técnico para o fim da fila e registra no histórico.
function concluirMicem(estado, tecnicoId, origem, agora) {
  const t = exigirTecnico(estado, tecnicoId);
  estado.fila = estado.fila.filter((id) => id !== tecnicoId).concat(tecnicoId);
  estado.solicitacoes = estado.solicitacoes.filter((s) => s.tecnicoId !== tecnicoId);
  estado.historico.push({ tecnicoId, nome: t.nome, quando: agora.toISOString(), origem });
  if (estado.historico.length > 500) estado.historico = estado.historico.slice(-500);
}

// Ações que qualquer técnico pode fazer.
export function acaoPublica(estado, acao, agora = new Date()) {
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

// Ações exclusivas da Central (a senha é conferida antes de chegar aqui).
export function acaoCentral(estado, acao, agora = new Date()) {
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
      concluirMicem(estado, acao.tecnicoId, "Central", agora);
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
