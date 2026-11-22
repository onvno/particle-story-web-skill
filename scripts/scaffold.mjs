import { cp, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const destinations = args.filter((arg) => !arg.startsWith("--"));
if (destinations.length !== 1 || args.some((arg) => arg.startsWith("--") && arg !== "--example")) {
  console.error("Usage: node scaffold.mjs <new-project-directory> [--example]");
  process.exit(2);
}

const destination = resolve(destinations[0]);
try {
  await mkdir(destination);
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.error(`Project directory already exists: ${destination}`);
  process.exit(1);
}

const options = { recursive:true, force:false, errorOnExist:true };
const template = new URL("../assets/frontend-template/", import.meta.url);
await cp(new URL("dist/", template), join(destination, "dist"), options);
await cp(new URL("scripts/", template), join(destination, "scripts"), options);
if (args.includes("--example")) {
  const example = new URL("../assets/example/", import.meta.url);
  await cp(new URL("stories/", example), join(destination, "stories"), options);
  await cp(new URL("dist/art/", example), join(destination, "dist", "art"), options);
} else {
  await mkdir(join(destination, "stories"));
  await mkdir(join(destination, "dist", "art"));
}
console.log(destination);
