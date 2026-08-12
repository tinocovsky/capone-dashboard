// Vercel serverless handler. Reuses the Express app built in ./app.ts
// without binding a port (serverless functions are invoked per-request).
import app from "./app.js";

export default app;
