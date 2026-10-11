import { app } from "./app.js";
import { closeDatabase } from "./database.js";

const port = Number(process.env.PORT ?? 3001);

const server = app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async (error) => {
    if (error) {
      console.error("HTTP server shutdown failed", { name: error.name });
      process.exitCode = 1;
    }
    try {
      await closeDatabase();
    } catch {
      console.error("PostgreSQL pool shutdown failed.");
      process.exitCode = 1;
    }
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
