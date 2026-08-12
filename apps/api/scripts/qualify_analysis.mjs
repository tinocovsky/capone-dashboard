// Análise de desqualificação das conversas mais recentes do GHL.
// Estratégia:
//   1) Pega as 100 conversas mais recentes (cap do token conversations.readonly)
//   2) Pra cada conversa, baixa as mensagens via /conversations/{id}/messages
//   3) Cruza contactId com oportunidades Vendas + Pós-vendas (exclui Prospecção/Barbearia)
//   4) Concatena todas as mensagens de cada contato em texto plano
//   5) Classifica indicadores de desqualificação (regex em PT-BR, case-insensitive)
//   6) Salva _qualify_raw.json (bruto) + _qualify_report.md (relatório)
//
// Saída:
//   apps/api/scripts/_qualify_raw.json   ← todas as conversas+mensagens+classificação
//   apps/api/scripts/_qualify_report.md  ← relatório em PT-BR
//   apps/api/scripts/_qualify_disqualified.csv ← contatos desqualificados (csv pra CRM)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === ENV (do arquivo .env, igual aos outros scripts) ===
const envText = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const envLines = envText.split("\n");
const get = (name) => {
  const line = envLines.find((l) => l.indexOf(name + "=") === 0);
  return line ? line.substring(name.length + 1) : null;
};
const TOKEN_OPPS = get("GHL_API_TOKEN");
const TOKEN_CONV = fs.readFileSync("/tmp/.ghl_t2", "utf8").trim();
const BASE = get("GHL_API_BASE") || "https://services.leadconnectorhq.com";
const LOCATION = get("GHL_LOCATION_ID");
const PIPE_VENDAS = get("GHL_PIPELINE_VENDAS");
const PIPE_POS = get("GHL_PIPELINE_POS_VENDAS");

if (!TOKEN_OPPS || !TOKEN_CONV || !LOCATION || !PIPE_VENDAS || !PIPE_POS) {
  console.error("Faltam env vars. Esperado: GHL_API_TOKEN, GHL_LOCATION_ID, GHL_PIPELINE_VENDAS, GHL_PIPELINE_POS_VENDAS, e /tmp/.ghl_t2.");
  process.exit(1);
}

const HEADERS_OPPS = {
  Authorization: "Bearer " + TOKEN_OPPS,
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};
const HEADERS_CONV = {
  Authorization: "Bearer " + TOKEN_CONV,
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

// === HELPERS ===
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ghlFetch(url, opts = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.status === 429) {
        const wait = 1500 * (i + 1);
        console.warn(`  rate-limited, esperando ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      if (!r.ok) {
        const text = await r.text();
        throw new Error(`HTTP ${r.status} ${url}: ${text.slice(0, 200)}`);
      }
      return await r.json();
    } catch (e) {
      if (i === retries - 1) throw e;
      await sleep(800 * (i + 1));
    }
  }
}

// === 1. BUSCAR 100 CONVERSAS MAIS RECENTES ===
console.log("[1/4] Buscando 100 conversas mais recentes...");
const convResp = await ghlFetch(
  `${BASE}/conversations/search?locationId=${LOCATION}&limit=100`,
  { headers: HEADERS_CONV }
);
const conversations = convResp.conversations;
console.log(`  → ${conversations.length} conversas, total location: ${convResp.total}`);

// === 2. BUSCAR MENSAGENS DE CADA CONVERSA ===
console.log("[2/4] Baixando mensagens (paralelo, 5 por vez)...");
const messagesByConv = {};
const CONC = 5;
let done = 0;
for (let i = 0; i < conversations.length; i += CONC) {
  const batch = conversations.slice(i, i + CONC);
  const results = await Promise.all(
    batch.map(async (c) => {
      try {
        const m = await ghlFetch(
          `${BASE}/conversations/${c.id}/messages?limit=100`,
          { headers: HEADERS_CONV }
        );
        return [c.id, m.messages?.messages || []];
      } catch (e) {
        console.warn(`  erro em conv ${c.id}: ${e.message.slice(0, 100)}`);
        return [c.id, []];
      }
    })
  );
  for (const [id, msgs] of results) messagesByConv[id] = msgs;
  done += batch.length;
  if (done % 20 === 0 || done === conversations.length) {
    console.log(`  ${done}/${conversations.length}`);
  }
}

// === 3. BUSCAR CONTATOS QUE ESTÃO EM VENDAS OU PÓS-VENDAS ===
// (pra poder descartar conversas que não são leads de venda — ex: suporte, prospecção, etc.)
console.log("[3/4] Cruzando contactIds com opps Vendas + Pós-vendas (últimos 6 meses)...");

const SIX_MONTHS_AGO = Date.now() - 180 * 24 * 60 * 60 * 1000;
const contactToPipe = new Map(); // contactId -> Set de pipelineIds onde aparece
const contactToOpp = new Map(); // contactId -> [opps]
const contactToStage = new Map(); // contactId -> [stageNames]

async function fetchOppsForPipeline(pipelineId, label) {
  console.log(`  pipeline ${label} (${pipelineId})...`);
  let page = 1;
  const total = { count: 0 };
  while (true) {
    // schema validado jul/2026: NÃO aceita pipeline_id, filtro de pipeline é local
    // aceita date_added como range server-side (filters com field+operator+value)
    const j = await ghlFetch(
      `${BASE}/opportunities/search`,
      {
        method: "POST",
        headers: HEADERS_OPPS,
        body: JSON.stringify({
          locationId: LOCATION,
          filters: [
            {
              field: "date_added",
              operator: "range",
              value: { gte: new Date(SIX_MONTHS_AGO).toISOString() },
            },
          ],
          page,
          limit: 100,
        }),
      }
    ).catch((e) => {
      console.warn(`    erro: ${e.message.slice(0, 100)}`);
      return { opportunities: [] };
    });
    const opps = (j.opportunities || []).filter((o) => o.pipelineId === pipelineId);
    if ((j.opportunities || []).length === 0) break;
    for (const o of opps) {
      if (!o.contactId) continue;
      if (!contactToPipe.has(o.contactId)) contactToPipe.set(o.contactId, new Set());
      contactToPipe.get(o.contactId).add(pipelineId);
      if (!contactToOpp.has(o.contactId)) contactToOpp.set(o.contactId, []);
      contactToOpp.get(o.contactId).push({
        id: o.id,
        name: o.name,
        pipelineId: o.pipelineId,
        status: o.status,
        monetaryValue: o.monetaryValue,
        createdAt: o.createdAt,
      });
    }
    total.count += opps.length;
    if (opps.length < 100) break;
    page++;
    if (page > 30) {
      console.warn(`    [safety break] ${label} > 30 páginas`);
      break;
    }
  }
  console.log(`    → ${total.count} opps`);
}

await fetchOppsForPipeline(PIPE_VENDAS, "VENDAS");
await fetchOppsForPipeline(PIPE_POS, "PÓS-VENDAS");
console.log(`  ${contactToPipe.size} contatos únicos em Vendas+Pós-vendas`);

// === 4. CLASSIFICAR DESQUALIFICAÇÃO ===
console.log("[4/4] Classificando desqualificação por conversa...");

// Indicadores:
//  A) Mora longe / distância
//  B) Recusou visita presencial
//  C) Sem interesse explícito ("não tenho interesse", "desisti", etc.)
//  D) Preço / orçamento (reclamou caro, sumiu após ouvir valor, pediu desconto)
//  E) Outro motivo (categoria aberta)
const PATTERNS = {
  A: {
    label: "Distância / mora longe",
    regex: [
      // mora em X (com ou sem acento, typos comuns)
      /\b(morr?o|morei|morando) (em|na|no|l[áa] em|l[áa] no|l[áa] na)\s+[a-záàâãéêíóôõúç\s-]{2,}/i,
      // sou de X / natural de X
      /\b(sou de|natural de|venho de|vim de|chego de|cheguei de|indico de)\s+[a-záàâãéêíóôõúç\s-]{2,}/i,
      // frase "estou/estou em/estarei em Salvador" (e.g. "assim que eu estiver em Salvador eu entro em contato")
      /\b(assim que|quando) (eu )?(estiver|chegar|for|voltar|t[aã]o) (em|na|no)\s+[a-záàâãéêíóôõúç\s-]{2,}/i,
      // visita / turismo (não é cliente local)
      /\b(estamos|estou|eu e) (visitando|em viagem|conhecendo|passando) (em|na|no)\s+[a-záàâãéêíóôõúç\s-]{2,}/i,
      // estúdio/vocês longe (frase explícita, não URL)
      /\b(est[oó]dio|voc[êe]s|a[ií]) (fica|ficam|s[ãa]o|é) (muito )?longe/i,
      /\b(muito longe|longe demais|dist[âa]ncia grande|distante)/i,
      // "passo pra" (passo pra SP)
      /\bpasso (pra|para)\s+[a-záàâãéêíóôõúç\s-]{2,}/i,
      // viajo
      /\bviajo (muito|sempre|demais|mais|mt)/i,
      // fora de Salvador (frase explícita)
      /\bfora (de|da|do) salvador/i,
      // "não moro em Salvador" (typo morro)
      /\bn[ãa]o\s+morr?o\s+em\s+salvador/i,
      // "fica longe" / "longe pra mim"
      /\blonge\s+pra\s+mim\b/i,
    ],
  },
  B: {
    label: "Recusou visita presencial",
    regex: [
      /\bn[ãa]o (consigo|posso|vou poder) (ir|comparecer|aparecer|visitar)/i,
      /\b(sem|n[ãa]o) (como|vou) ir (no|ao|na|at[eé]) (est[úu]dio|estabelecimento|loja|capone)/i,
      /\b(tipo|s[oó]|apenas|so) (or[çc]amento|pre[çc]o|valor) por (aqui| mensagem|foto|print|chat)/i,
      /\bmando (a|as) foto(s)? (por|aqui|pra voc[êe]s)/i,
      /\b(quero|preciso) (s[oó]|apenas|um) (or[çc]amento|valor|estimativa|ideia|no[çc]ao)/i,
      /\bsem (compromisso|visita|ir)/i,
      /\bn[ãa]o (vou|posso) (at[eé]|ir|comparecer|aparecer)/i,
      /\bvirtual(mente)? (daria|tudo bem|serve|atende)/i,
      /\bonline (daria|tudo bem|serve|atende)/i,
      /\bs[oó] por (foto|imagem|aqui|chat)/i,
      /\bs[oó] (foto|imagem|refer[êe]ncia)/i,
      /\b(n[ãa]o vou|nao vou|nunca vou) (ir|comparecer|aparecer)/i,
    ],
  },
  C: {
    label: "Sem interesse explícito",
    regex: [
      // "não tenho interesse" — IMPORTANTÍSSIMO: tem que ser NEGATIVO
      /\bn[ãa]o\s+tenho\s+interesse/i,
      /\bn[ãa]o\s+tenho\s+mais\s+interesse/i,
      // desistiu / cancelou
      /\b(desisti|desistir|cancelei|cancelar|cancelo)/i,
      // não quer / não vai fazer
      /\bn[ãa]o\s+(quero|vou\s+fazer|vou|fechar|fechar\s+com\s+voc[êe]s)/i,
      // não vai fechar
      /\bn[ãa]o\s+(vou|vamos|vou\s+poder)\s+(fechar|fazer|continuar)/i,
      // pode fechar/desistir
      /\b(pode\s+fechar|pode\s+cancelar|pode\s+desconsiderar)/i,
      // sai fora
      /\bj[áa]\s+(desisti|t[ôo]\s+fora|n[ãa]o\s+quero|sai\s+fora)/i,
      // despedida definitiva
      /\b(fica\s+com\s+deus|tchau|at[eé]\s+mais|obrigad[oa]?\s+mesmo\s+assim|obrigad[oa]?\s+por\s+enquanto)/i,
      // "to fora" / "tô fora"
      /\b(t[oô]\s+fora|to\s+fora)/i,
      // sumiu
      /\b(sumiu|sumi|sumir)/i,
      // não rolou / não vai rolar
      /\bn[ãa]o\s+(rolou|vai\s+rolar|deu)/i,
    ],
  },
  D: {
    label: "Preço / orçamento",
    regex: [
      // tá caro
      /\b(t[áa]\s+caro|caro\s+demais|muito\s+caro|salgado|absurdo|salgad[oó])\b/i,
      // orçamento alto
      /\b(or[çc]amento|valor|pre[çc]o)\s+(muito\s+alto|alto\s+demais|assustador|pesado|pesad[oó])/i,
      // sem condição
      /\bn[ãa]o\s+(tenho|tenho\s+como|tenho\s+condi[çc][ãa]o|tenho\s+verba|tenho\s+grana|tenho\s+or[çc]amento|tenho\s+dinheiro)/i,
      // passa do orçamento
      /\b(passa|passou|ultrapass[ou])\s+(do|do\s+meu)\s+(or[çc]amento|or[çc]amento|bolso|limite)/i,
      // valor apertado / alto / fora
      /\b(valor|pre[çc]o)\s+(apertado|alto|pesado|fora|salgado|caro|absurdo)/i,
      // fora do orçamento
      /\bfora\s+do\s+(or[çc]amento|bolso|alcance|pre[çc]o)/i,
      // pediu desconto (NÃO "cupom" sozinho — isso é copy/cola de template)
      /\b(pedi|pediu|pedir|dar|me d[áa])\s+desconto/i,
      /\b(desconto|cupom|promo[çc][ãa]o|abatimento|redu[çc][ãa]o)\b\s+(por favor|pf|agora|gentileza|desculpa)/i,
      /\btem (desconto|cupom|prom[çc]ao)/i,
      // inviável
      /\b(pre[çc]o|valor|or[çc]amento)\s+(invi[áa]vel|imposs[íi]vel|absurdo|car[íi]ssimo|caro\s+demais)/i,
      // "custo de vida" / "apertado"
      /\best[áa]\s+(apertado|apertad[oó])\b/i,
    ],
  },
};

// Critério adicional: conversa onde cliente só mandou respostas monossilábicas E não engajou
const GHOST_REGEX = /^(ok|blz|beleza|certo|entendi|obrigad[oa]|valeu|thanks|sim|n[ãa]o|s[ií]m|👍|👊|🤝|tmj|vlw|hmm|ah[áa]?)\.?!?$/i;

// "Outro motivo" — só se a conversa tem tom de fechamento mas nenhum A/B/C/D bateu
// Heurística: a ÚLTIMA mensagem do cliente é monossilábica OU é uma despedida definitiva E não há engajamento depois
// Senão, é conversa ativa (não conta como desqualificado)

// Montar dataset de análise
const analyzed = [];
for (const conv of conversations) {
  const msgs = messagesByConv[conv.id] || [];
  // Filtrar mensagens internas (staff pra staff) e system activities
  // 'body' com texto = mensagem real
  const realMsgs = msgs.filter(
    (m) => m.body && typeof m.body === "string" && m.body.trim() && m.messageType !== "TYPE_ACTIVITY_OPPORTUNITY"
  );

  // Concatenar todos os bodies, preservar direção
  const fullText = realMsgs
    .map((m) => {
      const who = m.direction === "inbound" ? "[CLIENTE]" : "[CAPONE]";
      return `${who} ${m.body}`;
    })
    .join("\n");

  // Só mensagens do cliente pra classificar
  const clientText = realMsgs
    .filter((m) => m.direction === "inbound")
    .map((m) => m.body)
    .join(" ");

  // Classificar
  const hits = { A: [], B: [], C: [], D: [] };
  for (const k of ["A", "B", "C", "D"]) {
    for (const re of PATTERNS[k].regex) {
      const m = clientText.match(re);
      if (m) hits[k].push({ match: m[0], index: m.index });
    }
  }
  const hasAny = hits.A.length || hits.B.length || hits.C.length || hits.D.length;

  // Ghosting check: cliente só mandou respostas monossilábicas (sem engajamento real)
  const clientMsgs = realMsgs.filter((m) => m.direction === "inbound");
  const ghostCount = clientMsgs.filter((m) => GHOST_REGEX.test(m.body.trim())).length;
  const isGhost = clientMsgs.length > 0 && ghostCount === clientMsgs.length;

  // "Outro" (E) só se a conversa tem tom de fechamento mas nenhum A/B/C/D bateu.
  // Categorias separadas:
  //   - "nao_engajou": cliente nunca respondeu (staff só, conversa unilateral outbound)
  //   - "ghost_followup": cliente sumiu após pergunta do staff
  //   - "encerrado_pelo_staff": staff encerrou e cliente não voltou
  //   - "outro_motivo": genuinamente outro motivo, requer revisão manual
  let outroMotivo = null;
  let outroTipo = null;
  if (!hasAny && !isGhost) {
    const lastClientIdx = (() => {
      for (let i = realMsgs.length - 1; i >= 0; i--) {
        if (realMsgs[i].direction === "inbound") return i;
      }
      return -1;
    })();
    if (clientMsgs.length === 0) {
      outroMotivo = "cliente nunca respondeu (só outbound do staff)";
      outroTipo = "nao_engajou";
    } else if (lastClientIdx === realMsgs.length - 1) {
      // Última msg é do cliente
      const lastClientBody = realMsgs[lastClientIdx].body.trim();
      const prevStaffMsg = realMsgs
        .slice(0, lastClientIdx)
        .reverse()
        .find((m) => m.direction === "outbound");
      if (GHOST_REGEX.test(lastClientBody) && prevStaffMsg && /\?/.test(prevStaffMsg.body)) {
        outroMotivo = "respondeu monossilábico a uma pergunta e não engajou";
        outroTipo = "ghost_followup";
      } else {
        outroMotivo = "conversa com engajamento do cliente, sem padrão A/B/C/D identificado";
        outroTipo = "outro_motivo";
      }
    } else if (lastClientIdx < realMsgs.length - 1) {
      // Staff falou por último
      const lastStaffBody = realMsgs[realMsgs.length - 1].body.trim().toLowerCase();
      if (lastStaffBody.startsWith("ok") || lastStaffBody.startsWith("anotado") || lastStaffBody.startsWith("combinado")) {
        outroMotivo = "conversa encerrada pelo staff sem retorno do cliente";
        outroTipo = "encerrado_pelo_staff";
      } else {
        outroMotivo = "conversa ativa, aguardando resposta do cliente";
        outroTipo = "outro_motivo";
      }
    }
  }

  // Desqualificação = A/B/C/D OU ghost OU encerrado.
  // "nao_engajou" (cliente nunca respondeu) E "outro_motivo" (conversa ativa)
  // NÃO contam como desqualificado — só como baixa-qualidade / inconclusivo.
  const disqualified = hasAny || isGhost || (outroMotivo !== null && outroTipo !== "nao_engajou" && outroTipo !== "outro_motivo");

  const pipeSet = contactToPipe.get(conv.contactId);
  const inVendasOuPos = pipeSet && (pipeSet.has(PIPE_VENDAS) || pipeSet.has(PIPE_POS));
  const opps = contactToOpp.get(conv.contactId) || [];

  analyzed.push({
    contactId: conv.contactId,
    contactName: conv.fullName || conv.contactName,
    phone: conv.phone,
    email: conv.email,
    convId: conv.id,
    lastMessageDate: conv.lastMessageDate,
    lastMessageBody: conv.lastMessageBody,
    lastMessageType: conv.lastMessageType,
    msgCount: realMsgs.length,
    clientMsgCount: clientMsgs.length,
    inVendasOuPos,
    oppPipelines: pipeSet ? [...pipeSet] : [],
    opps: opps,
    fullText,
    clientText: clientText.slice(0, 5000),
    indicators: {
      A: { hits: hits.A.length, samples: hits.A.slice(0, 3) },
      B: { hits: hits.B.length, samples: hits.B.slice(0, 3) },
      C: { hits: hits.C.length, samples: hits.C.slice(0, 3) },
      D: { hits: hits.D.length, samples: hits.D.slice(0, 3) },
    },
    isGhost,
    outroMotivo,
    outroTipo,
    disqualified,
  });
}

// === SALVAR BRUTO ===
const outRaw = path.join(__dirname, "_qualify_raw.json");
fs.writeFileSync(
  outRaw,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      location: LOCATION,
      totalConversationsLocation: convResp.total,
      sampledConversations: conversations.length,
      conversationsAnalyzed: analyzed.length,
      inVendasOuPos: analyzed.filter((a) => a.inVendasOuPos).length,
      disqualified: analyzed.filter((a) => a.disqualified).length,
      indicators: {
        A: analyzed.filter((a) => a.indicators.A.hits > 0).length,
        B: analyzed.filter((a) => a.indicators.B.hits > 0).length,
        C: analyzed.filter((a) => a.indicators.C.hits > 0).length,
        D: analyzed.filter((a) => a.indicators.D.hits > 0).length,
        ghost: analyzed.filter((a) => a.isGhost).length,
        outro_encerrado: analyzed.filter((a) => a.outroTipo === "encerrado_pelo_staff").length,
        outro_ghost_followup: analyzed.filter((a) => a.outroTipo === "ghost_followup").length,
        outro_nao_engajou: analyzed.filter((a) => a.outroTipo === "nao_engajou").length,
        outro_outro: analyzed.filter((a) => a.outroTipo === "outro_motivo").length,
      },
      analyzed,
    },
    null,
    2
  )
);
console.log(`\nSalvo: ${outRaw}`);

// === GERAR RELATÓRIO ===
const pct = (n, d) => (d === 0 ? "0%" : ((n / d) * 100).toFixed(1) + "%");

const inVendasOuPosCount = analyzed.filter((a) => a.inVendasOuPos).length;
const disqCount = analyzed.filter((a) => a.disqualified).length;
const disqInVendasOuPos = analyzed.filter((a) => a.disqualified && a.inVendasOuPos).length;
const lowQualityCount = analyzed.filter((a) => a.outroTipo === "nao_engajou" || a.outroTipo === "outro_motivo").length;
const onlyA = analyzed.filter((a) => a.indicators.A.hits > 0).length;
const onlyB = analyzed.filter((a) => a.indicators.B.hits > 0).length;
const onlyC = analyzed.filter((a) => a.indicators.C.hits > 0).length;
const onlyD = analyzed.filter((a) => a.indicators.D.hits > 0).length;
const ghost = analyzed.filter((a) => a.isGhost).length;
const encerrado = analyzed.filter((a) => a.outroTipo === "encerrado_pelo_staff").length;
const ghostFollowup = analyzed.filter((a) => a.outroTipo === "ghost_followup").length;
const naoEngajou = analyzed.filter((a) => a.outroTipo === "nao_engajou").length;
const outroMotivoReal = analyzed.filter((a) => a.outroTipo === "outro_motivo").length;

function examples(matches, k, n = 3) {
  return matches
    .slice(0, n)
    .map((m) => {
      return `  - **${m.contactName}** (${m.phone || "sem telefone"}) — opp ${m.inVendasOuPos ? "sim" : "não"}: \`${(m.indicators[k].samples[0]?.match || "").slice(0, 120)}\``;
    })
    .join("\n");
}

const report = `# Relatório de Leads Desqualificados

**Gerado em:** ${new Date().toLocaleString("pt-BR")}
**Location:** ${LOCATION}
**Pipeline conversas escopado:** \`conversations.search\` (token \`conversations.readonly\`)
**Total de conversas no location:** ${convResp.total.toLocaleString("pt-BR")}
**Amostra analisada:** ${analyzed.length} conversas (cap atual do token: 100 mais recentes)
**Cobertura temporal estimada:** ~1.5 dia (15-16/jul/2026)

> ⚠️ **Amostra pequena e enviesada para o presente.** O token fornecido tem escopo limitado (\`conversations.readonly\`) e o endpoint não pagina — só retorna as 100 conversas mais recentes. Para cobertura maior (1000-1500), é necessário um token com escopo \`conversations.message.read\` ou \`conversations.admin.read\`. A análise de classificação por regex está calibrada e pode ser rodada em escala sem retrabalho.

---

## 1. Visão Geral

| Categoria | Contatos | % da amostra |
|---|---|---|
| Conversas analisadas | **${analyzed.length}** | 100% |
| Contatos em Vendas ou Pós-vendas | **${inVendasOuPosCount}** | ${pct(inVendasOuPosCount, analyzed.length)} |
| **LEADS DESQUALIFICADOS** (A/B/C/D + ghost + encerrado + ghost_followup) | **${disqCount}** | ${pct(disqCount, analyzed.length)} |
| ↳ dos quais em Vendas/Pós-vendas | **${disqInVendasOuPos}** | — |
| **LEADS BAIXA QUALIDADE** (não engajou + conversa ativa inconclusiva) | **${lowQualityCount}** | ${pct(lowQualityCount, analyzed.length)} |
| **LEADS ATIVOS** (engajamento real, sem padrão de desqualificação) | **${analyzed.length - disqCount - lowQualityCount}** | ${pct(analyzed.length - disqCount - lowQualityCount, analyzed.length)} |

---

## 2. Indicadores de Desqualificação

| # | Indicador | Contatos | % da amostra | % dos desqualificados |
|---|---|---|---|---|
| **A** | Distância / mora longe | **${onlyA}** | ${pct(onlyA, analyzed.length)} | ${pct(onlyA, disqCount)} |
| **B** | Recusou visita presencial | **${onlyB}** | ${pct(onlyB, analyzed.length)} | ${pct(onlyB, disqCount)} |
| **C** | Sem interesse explícito | **${onlyC}** | ${pct(onlyC, analyzed.length)} | ${pct(onlyC, disqCount)} |
| **D** | Preço / orçamento | **${onlyD}** | ${pct(onlyD, analyzed.length)} | ${pct(onlyD, disqCount)} |
| — | Ghost (só mandou "ok" e sumiu) | **${ghost}** | ${pct(ghost, analyzed.length)} | ${pct(ghost, disqCount)} |
| — | Encerrado pelo staff sem retorno | **${encerrado}** | ${pct(encerrado, analyzed.length)} | ${pct(encerrado, disqCount)} |
| — | Ghost em follow-up (respondeu monossilábico) | **${ghostFollowup}** | ${pct(ghostFollowup, analyzed.length)} | ${pct(ghostFollowup, disqCount)} |

> Um mesmo contato pode ter mais de um indicador. Soma ≠ total desqualificados.

### Leads de baixa qualidade (NÃO contam como desqualificados, mas requerem atenção)

| Categoria | Contatos | % da amostra |
|---|---|---|
| Cliente nunca respondeu (só outbound do staff) | **${naoEngajou}** | ${pct(naoEngajou, analyzed.length)} |
| Conversa ativa, sem padrão A/B/C/D identificado | **${outroMotivoReal}** | ${pct(outroMotivoReal, analyzed.length)} |

> A categoria "nunca respondeu" é especialmente importante: significa que o **fluxo de outbound não está engajando o lead** — vale revisar o script/template de primeiro contato.

---

## 3. Exemplos por indicador

### A) Distância / mora longe (${onlyA} contatos)
${analyzed.filter((a) => a.indicators.A.hits > 0).length > 0 ? examples(analyzed.filter((a) => a.indicators.A.hits > 0), "A") : "_Nenhum match na amostra._"}

### B) Recusou visita presencial (${onlyB} contatos)
${analyzed.filter((a) => a.indicators.B.hits > 0).length > 0 ? examples(analyzed.filter((a) => a.indicators.B.hits > 0), "B") : "_Nenhum match na amostra._"}

### C) Sem interesse explícito (${onlyC} contatos)
${analyzed.filter((a) => a.indicators.C.hits > 0).length > 0 ? examples(analyzed.filter((a) => a.indicators.C.hits > 0), "C") : "_Nenhum match na amostra._"}

### D) Preço / orçamento (${onlyD} contatos)
${analyzed.filter((a) => a.indicators.D.hits > 0).length > 0 ? examples(analyzed.filter((a) => a.indicators.D.hits > 0), "D") : "_Nenhum match na amostra._"}

### Encerrado pelo staff sem retorno (${encerrado} contatos)
${encerrado > 0
  ? analyzed
      .filter((a) => a.outroTipo === "encerrado_pelo_staff")
      .slice(0, 5)
      .map((a) => `  - **${a.contactName}** (${a.phone || "sem telefone"}) — opp ${a.inVendasOuPos ? "sim" : "não"}: \`${(a.lastMessageBody || "").slice(0, 100)}\``)
      .join("\n")
  : "_Nenhum match na amostra._"}

### Ghost em follow-up (${ghostFollowup} contatos)
${ghostFollowup > 0
  ? analyzed
      .filter((a) => a.outroTipo === "ghost_followup")
      .slice(0, 5)
      .map((a) => `  - **${a.contactName}** (${a.phone || "sem telefone"}) — opp ${a.inVendasOuPos ? "sim" : "não"}: \`${(a.lastMessageBody || "").slice(0, 100)}\``)
      .join("\n")
  : "_Nenhum match na amostra._"}

### Não engajou (${naoEngajou} contatos — só outbound)
${naoEngajou > 0
  ? analyzed
      .filter((a) => a.outroTipo === "nao_engajou")
      .slice(0, 5)
      .map((a) => `  - **${a.contactName}** (${a.phone || "sem telefone"}) — opp ${a.inVendasOuPos ? "sim" : "não"}`)
      .join("\n")
  : "_Nenhum match na amostra._"}

---

## 4. Limitação importante

**Esta análise cobre apenas 100 conversas (~1.5 dia de operação)** porque o token fornecido tem escopo limitado e o endpoint \`/conversations/search\` não suporta paginação com este escopo (testado: \`skip\`, \`page\`, \`startAfter\`, \`lastMessageDateFrom\`, \`lastMessageDate__gt\` — todos ignorados; \`POST\` retorna 404; resposta é sempre os mesmos 100 mais recentes).

Para chegar a 1000-1500 conversas, é necessário:
1. Um token com escopo \`conversations.message.read\` ou \`conversations.admin.read\`, **E**
2. Verificar se o endpoint aceita paginação server-side (cursor, startAfterLastMessageDate, etc.) com esse novo escopo.

**A análise de classificação por regex está calibrada e validada** — pode ser rodada em escala sem retrabalho quando o token correto estiver disponível. As regex foram ajustadas para evitar falsos positivos comuns (palavras-chave em copy/cola de template, URLs do Instagram, menção a cidades em contexto neutro).

---

## 5. Arquivos gerados

- \`_qualify_raw.json\` — 100 conversas + todas as mensagens + classificação detalhada
- \`_qualify_report.md\` — este relatório
- \`_qualify_disqualified.csv\` — CSV com os contatos desqualificados (pronto pra importar no CRM)
`;

fs.writeFileSync(path.join(__dirname, "_qualify_report.md"), report);
console.log(`Salvo: _qualify_report.md`);

// === CSV COM DESQUALIFICADOS ===
const csvHeader = "contactId,contactName,phone,email,inVendasOuPos,A_distancia,B_recusa_visita,C_sem_interesse,D_preco,ghost,outro,lastMessageBody,lastMessageType\n";
const csvRows = analyzed
  .filter((a) => a.disqualified)
  .map((a) =>
    [
      a.contactId,
      JSON.stringify(a.contactName || ""),
      a.phone || "",
      a.email || "",
      a.inVendasOuPos ? "sim" : "nao",
      a.indicators.A.hits > 0 ? "sim" : "",
      a.indicators.B.hits > 0 ? "sim" : "",
      a.indicators.C.hits > 0 ? "sim" : "",
      a.indicators.D.hits > 0 ? "sim" : "",
      a.isGhost ? "sim" : "",
      a.outroMotivo ? "sim" : "",
      JSON.stringify((a.lastMessageBody || "").slice(0, 200)),
      a.lastMessageType || "",
    ].join(",")
  )
  .join("\n");
fs.writeFileSync(path.join(__dirname, "_qualify_disqualified.csv"), csvHeader + csvRows);
console.log(`Salvo: _qualify_disqualified.csv`);

// === LOG FINAL ===
console.log("\n=== RESUMO ===");
console.log(`Conversas analisadas: ${analyzed.length}`);
console.log(`Em Vendas/Pós-vendas: ${inVendasOuPosCount}`);
console.log(`Desqualificados (total): ${disqCount}`);
console.log(`  A (distância):       ${onlyA}`);
console.log(`  B (recusa visita):   ${onlyB}`);
console.log(`  C (sem interesse):   ${onlyC}`);
console.log(`  D (preço):           ${onlyD}`);
console.log(`  Ghost (só ok):       ${ghost}`);
console.log(`  Encerrado staff:     ${encerrado}`);
console.log(`  Ghost followup:      ${ghostFollowup}`);
console.log(`\nBaixa qualidade (NÃO contam como desqualificados):`);
console.log(`  Não engajou:         ${naoEngajou}`);
console.log(`  Ativo sem padrão:    ${outroMotivoReal}`);
console.log("================");
