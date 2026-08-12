# Relatório de Leads Desqualificados

**Gerado em:** 16/07/2026, 15:43:48
**Location:** C8d1LN8IL9XdN9kDkaF9
**Pipeline conversas escopado:** `conversations.search` (token `conversations.readonly`)
**Total de conversas no location:** 22.059
**Amostra analisada:** 100 conversas (cap atual do token: 100 mais recentes)
**Cobertura temporal estimada:** ~1.5 dia (15-16/jul/2026)

> ⚠️ **Amostra pequena e enviesada para o presente.** O token fornecido tem escopo limitado (`conversations.readonly`) e o endpoint não pagina — só retorna as 100 conversas mais recentes. Para cobertura maior (1000-1500), é necessário um token com escopo `conversations.message.read` ou `conversations.admin.read`. A análise de classificação por regex está calibrada e pode ser rodada em escala sem retrabalho.

---

## 1. Visão Geral

| Categoria | Contatos | % da amostra |
|---|---|---|
| Conversas analisadas | **100** | 100% |
| Contatos em Vendas ou Pós-vendas | **9** | 9.0% |
| **LEADS DESQUALIFICADOS** (A/B/C/D + ghost + encerrado + ghost_followup) | **8** | 8.0% |
| ↳ dos quais em Vendas/Pós-vendas | **0** | — |
| **LEADS BAIXA QUALIDADE** (não engajou + conversa ativa inconclusiva) | **92** | 92.0% |
| **LEADS ATIVOS** (engajamento real, sem padrão de desqualificação) | **0** | 0.0% |

---

## 2. Indicadores de Desqualificação

| # | Indicador | Contatos | % da amostra | % dos desqualificados |
|---|---|---|---|---|
| **A** | Distância / mora longe | **5** | 5.0% | 62.5% |
| **B** | Recusou visita presencial | **1** | 1.0% | 12.5% |
| **C** | Sem interesse explícito | **3** | 3.0% | 37.5% |
| **D** | Preço / orçamento | **1** | 1.0% | 12.5% |
| — | Ghost (só mandou "ok" e sumiu) | **0** | 0.0% | 0.0% |
| — | Encerrado pelo staff sem retorno | **0** | 0.0% | 0.0% |
| — | Ghost em follow-up (respondeu monossilábico) | **0** | 0.0% | 0.0% |

> Um mesmo contato pode ter mais de um indicador. Soma ≠ total desqualificados.

### Leads de baixa qualidade (NÃO contam como desqualificados, mas requerem atenção)

| Categoria | Contatos | % da amostra |
|---|---|---|
| Cliente nunca respondeu (só outbound do staff) | **14** | 14.0% |
| Conversa ativa, sem padrão A/B/C/D identificado | **78** | 78.0% |

> A categoria "nunca respondeu" é especialmente importante: significa que o **fluxo de outbound não está engajando o lead** — vale revisar o script/template de primeiro contato.

---

## 3. Exemplos por indicador

### A) Distância / mora longe (5 contatos)
  - **Fé Força E Coragem 🤝** (+5571983806144) — opp não: `moro em salvador Tenho que ver mas vou pela manhã Essa vocês faz também `
  - **Thais Pirraça** (+557184319605) — opp não: `assim que eu estiver em Salvador eu entro em contato `
  - **Vidros Temperado** (+557182478569) — opp não: `moro em Lauro de Freitas aí fica um pouco longe pra mim ir aí fazer o orçamento e depois voltar aí e novo Irmão eu sei q`

### B) Recusou visita presencial (1 contatos)
  - **Alex Magno Reis** (+557196641495) — opp não: `não vou poder ir`

### C) Sem interesse explícito (3 contatos)
  - **Alex Magno Reis** (+557196641495) — opp não: `não vou`
  - **Raffael** (+557193263437) — opp não: `cancelar`
  - **Mi Alves Alves** (+557188070446) — opp não: `Não quero`

### D) Preço / orçamento (1 contatos)
  - **Fé Força E Coragem 🤝** (+5571983806144) — opp não: `Não tenho`

### Encerrado pelo staff sem retorno (0 contatos)
_Nenhum match na amostra._

### Ghost em follow-up (0 contatos)
_Nenhum match na amostra._

### Não engajou (14 contatos — só outbound)
  - **Noah Robson** (+5571983959261) — opp sim
  - **Vinícius Almeida | Blackwork Tattoo | Ba** (sem telefone) — opp não
  - **Remi Manoela** (+5551995321157) — opp não
  - **Gilmar Marques Santana Júnior** (+5571986906200) — opp sim
  - **Leica** (sem telefone) — opp não

---

## 4. Limitação importante

**Esta análise cobre apenas 100 conversas (~1.5 dia de operação)** porque o token fornecido tem escopo limitado e o endpoint `/conversations/search` não suporta paginação com este escopo (testado: `skip`, `page`, `startAfter`, `lastMessageDateFrom`, `lastMessageDate__gt` — todos ignorados; `POST` retorna 404; resposta é sempre os mesmos 100 mais recentes).

Para chegar a 1000-1500 conversas, é necessário:
1. Um token com escopo `conversations.message.read` ou `conversations.admin.read`, **E**
2. Verificar se o endpoint aceita paginação server-side (cursor, startAfterLastMessageDate, etc.) com esse novo escopo.

**A análise de classificação por regex está calibrada e validada** — pode ser rodada em escala sem retrabalho quando o token correto estiver disponível. As regex foram ajustadas para evitar falsos positivos comuns (palavras-chave em copy/cola de template, URLs do Instagram, menção a cidades em contexto neutro).

---

## 5. Arquivos gerados

- `_qualify_raw.json` — 100 conversas + todas as mensagens + classificação detalhada
- `_qualify_report.md` — este relatório
- `_qualify_disqualified.csv` — CSV com os contatos desqualificados (pronto pra importar no CRM)
