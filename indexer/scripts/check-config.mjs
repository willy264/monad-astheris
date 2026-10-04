import { loadEnvFile } from "node:process";
try { loadEnvFile(); } catch (error) { if (error.code !== "ENOENT") throw error; }
for (const key of ["ENVIO_AGENT_REGISTRY_ADDRESS", "ENVIO_ROUTER_ADDRESS"]) {
  const value = process.env[key];
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value) || /^0x0{40}$/.test(value)) {
    throw new Error(`${key} must be a deployed contract address. Copy .env.example to .env and configure it.`);
  }
}
