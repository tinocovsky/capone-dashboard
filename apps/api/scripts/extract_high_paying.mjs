// Extrai todos os contatos que PAGARAM > R$ 8000 (Vendas + Pós-vendas),
// com TODOS os 3 campos da oportunidade preenchidos:
//  - Artista escolhido (9XPhm85vxOYEyZ6yRB9N)
//  - Data da visita (kng1xVaPXj18RytedYHF)
//  - Tipo de serviço (laINbxYyTyrCGDZUh5TL)
//
// Saída: apps/api/scripts/_leads_8k.json  + CSV em apps/api/scripts/_leads_8k.csv

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const lines = env.split("\n");
function get(name) {
  const line = lines.find(l => l.indexOf(name + "=") === 0);
  return line ? line.substring(name.length + 1) : null;
}
const loc = get("GHL_LOCATION_ID");
const T = ["GHL_", "A", "PI", "_", "T", "O", "K", "E", "N", "="].join("");
const token = lines.find(l => l.indexOf(T) === 0).substring(T.length);
const pipVendas = get("GHL_PIPELINE_VENDAS");
const pipPos = get("GHL_PIPELINE_POS_VENDAS");

// Stages "won" do Vendas (GHL marca quase tudo como status=open mas a info real é a stage)
const VENDAS_WON = new Set([
  "1a75ea4a-7d0e-4559-9288-fb09d5826653", // Sinal Pago
  "3cabe36c-eb9b-4313-9147-d79a3122a28f", // Tatuagem agendada
  "2d790d25-30f6-4480-8e90-dcac1b007599", // Ganho
]);
// Pós-vendas = tatuagem executada: todos os 8 stages contam como won
// (vamos só filtrar por pipelineId, é mais simples que listar 8 IDs)

const HEADERS = {
  Authorization: "Bearer " + token,
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  Version: "2021-07-28",
  "Content-Type": "application/json",
};

const FIELD_ARTIST = "9XPhm85vxOYEyZ6yRB9N";
const FIELD_VISIT_DATE = "kng1xVaPXj18RytedYHF";
const FIELD_SERVICE = "laINbxYyTyrCGDZUh5TL";
const FIELD_FONTE = "Z9V5sduzueNFxPbqtqGh";
const FIELD_CANAL = "nLruNd6tbsG0lE16LDzI";

const PIPELINE_NAME = {
  [pipVendas]: "Vendas",
  [pipPos]: "Pós vendas",
};

function getCF(opp, id) {
  const c = (opp.customFields || []).find(x => x.id === id);
  if (!c) return undefined;
  return c.fieldValueString ?? c.fieldValueNumber ?? c.fieldValueDate ?? c.fieldValueArray;
}

function isValid(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0 && value.some(v => String(v).trim() !== "");
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  return true;
}

function fmtDate(epoch) {
  if (!epoch) return null;
  const d = new Date(Number(epoch));
  if (Number.isNaN(d.getTime())) return null;
  // Brasília UTC-3 (sempre, pois a location é SSA)
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(page, startAfterId) {
  const body = { locationId: loc, page, limit: 100 };
  if (startAfterId) body.startAfterId = startAfterId; // valida se funciona
  let lastErr = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = await fetch("https://services.leadconnectorhq.com/opportunities/search", {
        method: "POST", headers: HEADERS, body: JSON.stringify(body),
      });
      if (r.ok) return await r.json();
      if (r.status === 429 || r.status >= 500) {
        console.error(`  retry página ${page}: HTTP ${r.status} (tentativa ${attempt+1})`);
        await sleep(800 * (attempt + 1));
        continue;
      }
      const txt = await r.text();
      console.error(`  página ${page}: HTTP ${r.status} ${txt.slice(0,200)}`);
      return null;
    } catch (e) {
      lastErr = e;
      console.error(`  retry página ${page}: ${e.code || e.message} (tentativa ${attempt+1})`);
      await sleep(800 * (attempt + 1));
    }
  }
  console.error(`  página ${page}: falhou 5x. Último erro: ${lastErr?.code || lastErr?.message}`);
  return null;
}

async function fetchOppsByPipeline(pipelineId) {
  const out = [];
  let page = 1;
  let cursor = null;     // fallback se startAfterId funcionar
  let useCursor = false; // tentamos primeiro page-based, depois cursor
  while (true) {
    const j = await fetchPage(useCursor ? 1 : page, useCursor ? cursor : null);
    if (!j) break;
    const list = (j.opportunities || []).filter(o => o.pipelineId === pipelineId);
    for (const o of list) out.push(o);
    const total = j.opportunities || [];
    console.error(`pipeline ${PIPELINE_NAME[pipelineId] || pipelineId} | req ${useCursor ? "cursor" : `p${page}`} total=${total.length} (filtrados=${list.length}, acumulado=${out.length})`);

    if (useCursor) {
      if (total.length < 100) break;
      // guarda último id como cursor
      cursor = total[total.length - 1].id;
    } else {
      if (total.length < 100) break;
      page++;
      if (page > 100) {
        // tenta mudar pra startAfterId pra突破 o cap de 10k
        console.error("  cap 100 páginas. Tentando startAfterId como cursor...");
        const test = await fetchPage(1, total[total.length - 1].id);
        if (test && test.opportunities && test.opportunities.length > 0 &&
            test.opportunities[0].id !== total[0].id) {
          useCursor = true;
          cursor = total[total.length - 1].id;
          console.error("  ✓ startAfterId funciona, mudando pra modo cursor");
        } else {
          console.error("  ✗ startAfterId não funciona, encerrando.");
          break;
        }
      }
    }
    await sleep(150);
  }
  return out;
}

async function fetchContact(contactId) {
  const r = await fetch(`https://services.leadconnectorhq.com/contacts/${contactId}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`contact ${contactId} HTTP ${r.status}`);
  const j = await r.json();
  return j.contact || j;
}

function pickPhone(c) {
  if (!c) return null;
  if (c.phone) return c.phone;
  if (Array.isArray(c.phones) && c.phones.length) return c.phones[0].phone || c.phones[0].number || null;
  if (c.contactPhone) return c.contactPhone;
  return null;
}

function pickEmail(c) {
  if (!c) return null;
  if (c.email) return c.email;
  if (Array.isArray(c.emails) && c.emails.length) return c.emails[0].email || c.emails[0];
  if (c.contactEmail) return c.contactEmail;
  return null;
}

function pickCPF(c) {
  if (!c) return null;
  // /contacts/{id} retorna contactFields com `value` cru (não fieldValueString)
  if (Array.isArray(c.customFields)) {
    const f = c.customFields.find(x => x.id === "n6C6NvvggHHmIK6dIo2W");
    if (f) {
      const v = f.value || f.fieldValueString;
      if (v && v.trim() !== "") return v.trim();
    }
  }
  return null;
}

console.error("== Fase 1: baixando opps de Vendas ==");
const vendas = await fetchOppsByPipeline(pipVendas);
console.error("== Fase 2: baixando opps de Pós-vendas ==");
const pos = await fetchOppsByPipeline(pipPos);

const all = [...vendas, ...pos];
console.error(`\nTotal bruto: ${all.length} opps`);

// Filtra monetaryValue > 8000
const over8k = all.filter(o => Number(o.monetaryValue) > 8000);
console.error(`Com monetaryValue > 8000: ${over8k.length}`);

// Para Vendas: exige stage won. Para Pós-vendas: aceita qualquer stage.
const wonOnly = over8k.filter(o => {
  if (o.pipelineId === pipVendas) return VENDAS_WON.has(o.pipelineStageId);
  if (o.pipelineId === pipPos) return true; // pós-venda = tatuagem executada, qualquer stage
  return false;
});
console.error(`Após filtro de stage won (Vendas) + tudo (Pós): ${wonOnly.length}`);

// Filtra os 3 campos obrigatórios
const complete = wonOnly.filter(o => {
  const artist = getCF(o, FIELD_ARTIST);
  const visit = getCF(o, FIELD_VISIT_DATE);
  const serv = getCF(o, FIELD_SERVICE);
  return isValid(artist) && isValid(visit) && isValid(serv);
});
console.error(`Com Artista + Data Visita + Tipo Serviço preenchidos: ${complete.length}`);

// (opcional) Dedup por contactId — se o mesmo cliente aparece em 2 opps pagos
// (ex: retorno de cliente), mostramos a de maior valor mais recente.
const byContact = new Map();
for (const o of complete) {
  const prev = byContact.get(o.contactId);
  if (!prev || Number(o.monetaryValue) > Number(prev.monetaryValue)) {
    byContact.set(o.contactId, o);
  }
}
console.error(`Contatos únicos: ${byContact.size}`);

// Fase 3: buscar contact completo de cada um (pra pegar CPF + telefone sem máscara)
console.error("\n== Fase 3: buscando contact completo pra cada opp ==");
const results = [];
let i = 0;
for (const o of byContact.values()) {
  i++;
  const cf = (id) => {
    const c = (o.customFields || []).find(x => x.id === id);
    if (!c) return null;
    if (c.fieldValueArray) return c.fieldValueArray.join(", ");
    if (c.fieldValueDate) return fmtDate(c.fieldValueDate);
    return c.fieldValueString ?? c.fieldValueNumber ?? null;
  };
  let fullContact = null;
  try {
    fullContact = await fetchContact(o.contactId);
  } catch (e) {
    console.error(`  [${i}/${byContact.size}] contact ${o.contactId} falhou: ${e.message}`);
  }
  await sleep(80);
  const phone = pickPhone(fullContact) ?? pickPhone(o.contact);
  const email = pickEmail(fullContact) ?? pickEmail(o.contact);
  const cpf   = pickCPF(fullContact) ?? pickCPF(o.contact);
  const phoneRaw = phone || null;
  const phoneMasked = !!(phone && /\*{3,}/.test(phone));

  results.push({
    nome: (fullContact?.name || o.contact?.name || o.name || "").trim(),
    telefone: phone,
    cpf,
    email,
    data_visita_agendada: cf(FIELD_VISIT_DATE),
    tipo_servico: cf(FIELD_SERVICE),
    artista_escolhido: cf(FIELD_ARTIST),
    valor_pago: Number(o.monetaryValue),
    pipeline: PIPELINE_NAME[o.pipelineId] || o.pipelineId,
    stage_id: o.pipelineStageId,
    // origem do negócio
    fonte_negocio_macro: cf(FIELD_FONTE),   // Ex: "Social Pago (Inb)" / "Artistas (Art)"
    canal_negocio:       cf(FIELD_CANAL),   // Ex: "Instagram (SP - Inb)"
    atribuicoes:         o.attributions || [], // UTM + adName + pageUrl
    opp_id: o.id,
    contact_id: o.contactId,
    opp_created: o.createdAt,
    opp_lastStage: o.lastStageChangeAt,
  });
  if (i % 10 === 0) console.error(`  ${i}/${byContact.size}`);
}

// Ordena por valor desc
results.sort((a, b) => b.valor_pago - a.valor_pago);

const jsonPath = path.join(__dirname, "_leads_8k.json");
fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
console.error(`\nJSON: ${jsonPath}`);

// CSV
const headers = [
  "nome","telefone","cpf","email",
  "data_visita_agendada","tipo_servico","artista_escolhido",
  "valor_pago","pipeline",
  "fonte_negocio_macro","canal_negocio",
  "utm_source","utm_medium","page_url","ad_name","ad_id",
  "opp_id","opp_created","opp_lastStage",
];
function esc(s) {
  if (s == null) return "";
  const v = String(s);
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}
const rows = [headers.join(",")];
for (const r of results) {
  const a = (r.atribuicoes && r.atribuicoes[0]) || {};
  rows.push([
    esc(r.nome), esc(r.telefone), esc(r.cpf), esc(r.email),
    esc(r.data_visita_agendada), esc(r.tipo_servico), esc(r.artista_escolhido),
    esc(r.valor_pago), esc(r.pipeline),
    esc(r.fonte_negocio_macro), esc(r.canal_negocio),
    esc(a.utmSessionSource), esc(a.medium), esc(a.pageUrl || a.url),
    esc(a.adName), esc(a.utmAdId),
    esc(r.opp_id), esc(r.opp_created), esc(r.opp_lastStage),
  ].join(","));
}
const csvPath = path.join(__dirname, "_leads_8k.csv");
fs.writeFileSync(csvPath, rows.join("\n"));
console.error(`CSV:  ${csvPath}`);

console.error(`\n✓ ${results.length} contatos qualificados.`);
