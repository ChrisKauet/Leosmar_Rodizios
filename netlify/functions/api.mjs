import { getStore } from "@netlify/blobs";
import { timingSafeEqual, createHash } from "node:crypto";
import { estadoInicial, visao, acaoPublica, acaoCentral, ErroRodizio } from "../../lib/rodizio.mjs";

const CHAVE = "estado";

function json(corpo, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// Senha configurada no Netlify, sem espaços sobrando nas pontas (comuns ao colar o valor).
function senhaConfigurada() {
  const v = globalThis.Netlify?.env?.get("CENTRAL_SENHA") ?? process.env.CENTRAL_SENHA;
  return typeof v === "string" ? v.trim() : "";
}

// Compara a senha enviada com a variável de ambiente CENTRAL_SENHA sem vazar tempo.
function senhaCorreta(enviada) {
  const certa = senhaConfigurada();
  if (!certa || typeof enviada !== "string") return false;
  enviada = enviada.trim();
  const a = createHash("sha256").update(enviada).digest();
  const b = createHash("sha256").update(certa).digest();
  return timingSafeEqual(a, b);
}

async function lerEstado(store) {
  const r = await store.getWithMetadata(CHAVE, { type: "json", consistency: "strong" });
  return r ? { estado: r.data, etag: r.etag } : { estado: estadoInicial(), etag: null };
}

// Lê, aplica a ação e grava só se ninguém gravou no meio. Tenta de novo em caso de conflito.
async function aplicar(store, fn) {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const { estado, etag } = await lerEstado(store);
    const novo = fn(estado);
    const r = etag
      ? await store.setJSON(CHAVE, novo, { onlyIfMatch: etag })
      : await store.setJSON(CHAVE, novo, { onlyIfNew: true });
    if (r.modified) return novo;
  }
  throw new Error("Muitas alterações ao mesmo tempo, tente de novo.");
}

export default async (req) => {
  // Criado só quando precisa: o login não depende do armazenamento.
  const loja = () => getStore({ name: "micem", consistency: "strong" });

  try {
    if (req.method === "GET") {
      const { estado } = await lerEstado(loja());
      return json(visao(estado));
    }

    if (req.method !== "POST") return json({ erro: "Método não permitido." }, 405);

    const acao = await req.json().catch(() => null);
    if (!acao || typeof acao.tipo !== "string") return json({ erro: "Requisição inválida." }, 400);

    // A página envia a senha com encodeURIComponent, para acentos chegarem intactos no cabeçalho.
    const bruta = req.headers.get("x-central-senha");
    let senha = bruta;
    if (bruta != null) { try { senha = decodeURIComponent(bruta); } catch {} }

    if (senha != null && !senhaConfigurada()) {
      return json({ erro: "A senha do Mr. Micem não está configurada no Netlify (variável CENTRAL_SENHA). Crie a variável e faça um novo deploy." }, 503);
    }

    if (acao.tipo === "login") {
      return senhaCorreta(senha) ? json({ ok: true }) : json({ erro: "Senha incorreta." }, 401);
    }

    let novo;
    if (senha != null) {
      if (!senhaCorreta(senha)) return json({ erro: "Senha incorreta." }, 401);
      novo = await aplicar(loja(), (estado) => acaoCentral(estado, acao));
    } else {
      novo = await aplicar(loja(), (estado) => acaoPublica(estado, acao));
    }
    return json(visao(novo));
  } catch (e) {
    if (e instanceof ErroRodizio) return json({ erro: e.message }, 400);
    console.error(e);
    return json({ erro: e.message || "Erro inesperado." }, 500);
  }
};

export const config = { path: "/api" };
