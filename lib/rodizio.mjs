// Regras do rodízio da Micem. Funções puras: recebem o estado e devolvem o novo estado.
//
// A fila é uma lista de ids de técnicos. O próximo é o primeiro da fila que não está
// ausente. Quem está ausente é pulado mas continua na mesma posição, então quando volta
// já está na frente de quem atendeu enquanto ele estava fora.

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
export const DESFAZIVEIS = ["aprovar", "recusar", "marcarFeita", "remover"];
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
  const novo = executarCentral(estado, acao, agora);
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
