import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  GHL_API_BASE: z.string().url().default("https://services.leadconnectorhq.com"),
  // Token GHL — em dev aceita placeholder para você conseguir subir o server
  // e logar mesmo sem ter o token do LeadConnector configurado. Os endpoints
  // /api/reports vão falhar em runtime se o token for o placeholder.
  GHL_API_TOKEN: z.string().min(1),
  // Defaults são os IDs REAIS da location C8d1LN8IL9XdN9kDkaF9 (jul/2026) —
  // confirmados via /opportunities/pipelines?locationId=… e listagem de contatos.
  // O .env.example mantém placeholders, mas o código cai no default certo
  // se o .env não tiver override (ex: dev novo copiando só o env.example).
  GHL_PIPELINE_VENDAS: z.string().default("pO2K0v6YDMGFF6SIRjfD"),
  GHL_PIPELINE_POS_VENDAS: z.string().default("BeT55Wi2a64zC0YcSKBG"),
  GHL_LOCATION_ID: z.string().default("C8d1LN8IL9XdN9kDkaF9"),
  GHL_ARTIST_FIELD_ID: z.string().default("9XPhm85vxOYEyZ6yRB9N"),
  // Dono do negócio (closer) — fieldKey "opportunity.dono_do_negcio"
  GHL_DONO_NEGOCIO_FIELD_ID: z.string().default("c345zUnE33gH96uyEJI6"),

  // ---- Tracking de Ads (custom fields do GHL) ----
  // Esses IDs são os defaults da location C8d1LN8IL9XdN9kDkaF9 (jul/2026).
  // Se a sua location for outra, sobrescreva via .env. Se o custom field
  // não existir, o classificador simplesmente ignora e cai em "Orgânico".
  GHL_FIELD_FBCLID: z.string().default("ahvyuExWKo4Ac10Z2fOD"),         // contact.fbclid
  GHL_FIELD_GCLID: z.string().default("TUqduknRcAkcQkHKUsc3"),         // contact.gclid_id
  GHL_FIELD_CTWCLID: z.string().default("eSbZ5ECMEwOOUN3dnxHJ"),        // contact.ctwclid (Chatwoot, não ads)
  GHL_FIELD_UTM_SOURCE: z.string().default("WvVVNoh5idpONGkpIkZz"),    // contact.utm_source
  GHL_FIELD_UTM_MEDIUM: z.string().default("TAwmj9Gy7ucdgZ4j8e3W"),    // contact.utm_medium
  GHL_FIELD_UTM_CAMPAIGN: z.string().default("sTVTXe83MyO0AxS0cX6W"),  // contact.utm_campaign
  GHL_FIELD_FONTE_NEGOCIO: z.string().default("Z9V5sduzueNFxPbqtqGh"),  // opportunity.fonte_do_negcio (macro)
  GHL_FIELD_CANAL_NEGOCIO: z.string().default("nLruNd6tbsG0lE16LDzI"),  // opportunity.canal_do_negcio
  // Calendários de agendamento (IDs separados por vírgula). O token atual não tem
  // o escopo "calendars.readonly" (listagem retorna 401), mas o de eventos funciona —
  // então os IDs precisam ser informados aqui. Defaults descobertos via
  // /contacts/:id/appointments da location C8d1LN8IL9XdN9kDkaF9 (jul/2026).
  GHL_CALENDAR_IDS: z.string().default("dBloB6VYTAyzdfPdZV5u,D3K8VJN0DGXtAlXH2O9H"),
  // Pipeline de prospecção (reativação) — opps vazias, ficam em bucket separado
  GHL_PIPELINE_PROSPECCAO: z.string().default(""),
  // Pipeline de Barbearia (caso queira incluir separado)
  GHL_PIPELINE_BARBEARIA: z.string().default(""),

  SUPABASE_URL: z.string().url(),
  // Service role aceita placeholder "unset" em dev — você configura depois.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Variáveis de ambiente inválidas:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
