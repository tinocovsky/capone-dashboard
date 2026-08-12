import app from "./app.js";
import { env } from "./env.js";
import pino from "pino";

const log = pino(
  env.NODE_ENV === "development"
    ? { transport: { target: "pino/file", options: { destination: 1 } } }
    : undefined,
);

app.listen(env.PORT, () => log.info(`🟢 api em http://localhost:${env.PORT}`));
