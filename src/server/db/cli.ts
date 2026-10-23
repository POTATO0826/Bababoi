// Explicit database commands. The server never seeds on startup.
//   bun run db:migrate   apply pending schema migrations
//   bun run db:seed      migrate, then initialize the labelled synthetic demo dataset (no-op if already seeded)
//   bun run db:status    print schema/seed state
import { readConfig } from "@/server/config";
import { migrate, openDatabase, schemaVersion, seedState } from "./database";
import { seedDemo } from "./seed";

const command = process.argv[2] ?? "status";
const { databasePath } = readConfig();
const db = openDatabase(databasePath);

try {
  switch (command) {
    case "migrate": {
      const applied = migrate(db);
      console.log(applied.length ? `Applied migrations ${applied.join(", ")} to ${databasePath}` : `Schema up to date (${databasePath})`);
      break;
    }
    case "seed": {
      const result = seedDemo(db);
      if (result.status === "already_seeded") console.log(`Already seeded (${result.seedVersion}); nothing changed in ${databasePath}`);
      else
        console.log(
          `Seeded synthetic demo data into ${databasePath}: ${result.products} SKUs, ${result.onHand} on hand, ${result.reserved} reserved, ` +
            `${result.incoming} incoming, ${result.occupiedBays}/${result.locations} bays occupied, anchor date ${result.anchorDate}.`,
        );
      break;
    }
    case "status": {
      const s = seedState(db);
      console.log(`${databasePath}: schema v${schemaVersion(db)}, ${s.seeded ? `seeded (${s.seedVersion})` : "not seeded"}`);
      break;
    }
    default:
      console.error(`Unknown command "${command}". Use migrate, seed or status.`);
      process.exitCode = 1;
  }
} finally {
  db.close();
}
