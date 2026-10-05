import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const names = ["AetherisRouter", "AgentRegistry", "ReputationRegistry", "ValidationRegistry", "EphemeralShard"];
const compiled = names.flatMap((name) => {
  const artifact = JSON.parse(read(`contracts/out/${name}.sol/${name}.json`));
  return artifact.abi.filter((item) => ["function", "event"].includes(item.type)).map((item) => ({ ...item, contract: name }));
});

function parseParams(value) {
  if (!value?.trim()) return [];
  return value.split(",").map((parameter) => {
    const words = parameter.trim().split(/\s+/);
    return { type: words[0], indexed: words.includes("indexed") };
  });
}

let checked = 0;
function checkDeclaration(declaration, source) {
  const match = declaration.match(/^(function|event)\s+(\w+)\s*\(([^)]*)\)(.*)$/s);
  if (!match) throw new Error(`Cannot parse ${source}: ${declaration}`);
  const [, type, name, parameters, suffix] = match;
  const inputs = parseParams(parameters);
  const candidates = compiled.filter((item) => item.type === type && item.name === name &&
    item.inputs.length === inputs.length && item.inputs.every((input, index) => input.type === inputs[index].type));
  if (!candidates.length) throw new Error(`${source}: no compiled ABI matches ${name}(${inputs.map((i) => i.type)})`);
  if (type === "event" && !candidates.some((item) => item.inputs.every((input, index) => input.indexed === inputs[index].indexed))) {
    throw new Error(`${source}: indexed event fields differ for ${name}`);
  }
  if (type === "function") {
    const returns = suffix.match(/returns\s*\(([^)]*)\)/)?.[1];
    const outputs = parseParams(returns);
    if (!candidates.some((item) => item.outputs.length === outputs.length && item.outputs.every((output, index) => output.type === outputs[index].type))) {
      throw new Error(`${source}: return types differ for ${name}`);
    }
  }
  checked++;
}

const typedDeclarations = [
  "frontend/lib/contracts.ts", "scripts/lib/abi.ts", "scripts/agent-card.ts",
  "scripts/finalize-deployment.ts", "scripts/submission-proof.ts",
];
for (const source of typedDeclarations) {
  for (const match of read(source).matchAll(/['"]((?:function|event)\s+[^'"\r\n]+)['"]/g)) checkDeclaration(match[1], source);
}
const daemon = "daemon/src/router.rs";
for (const match of read(daemon).matchAll(/\b((?:function|event)\s+\w+\s*\([^;]*?);/g)) checkDeclaration(match[1], daemon);
const indexer = "indexer/config.yaml";
for (const match of read(indexer).matchAll(/event:\s*"([^"]+)"/g)) checkDeclaration(`event ${match[1]}`, indexer);
console.log(`Verified ${checked} frontend, Rust, indexer and operation-script ABI declarations against compiled Solidity artifacts.`);
