import { loadEnvFile } from "node:process";
import { readFileSync } from "node:fs";
try { loadEnvFile(); } catch (error) { if (error.code !== "ENOENT") throw error; }
const config = readFileSync(new URL("../config.yaml", import.meta.url), "utf8");
for (const key of ["ENVIO_AGENT_REGISTRY_ADDRESS", "ENVIO_ROUTER_ADDRESS"]) {
  // Read the fallback from the same interpolation Envio uses, keeping one source of truth.
  const defaults = [...config.matchAll(new RegExp(`\\$\\{${key}:-([^}]+)\\}`, "g"))];
  if (defaults.length !== 1) {
    throw new Error(`config.yaml must declare exactly one default for ${key}.`);
  }
  const value = process.env[key] ?? defaults[0][1];
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) {
    throw new Error(`${key} must be a nonzero deployed contract address. Remove the override to use the verified Monad Testnet default.`);
  }
}
