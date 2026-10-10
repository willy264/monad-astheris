import { isAddress, type Address } from 'viem';

export const INLINE_AGENT_CARD_PREFIX = 'data:application/json;base64,';
export const MAX_INLINE_AGENT_CARD_BYTES = 8 * 1024;

/** Self-service identities describe the workload this browser actually performs. */
export function buildAgentURI(owner: Address): string {
  if (!isAddress(owner) || /^0x0{40}$/i.test(owner)) throw new Error('Invalid agent owner.');
  const card = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: 'Aetheris Checksum Agent',
    image: 'https://monad-astheris.vercel.app/brand/aetheris-logo.png',
    description: 'Runs deterministic browser checksum tasks through Aetheris on Monad Testnet. No AI model or external MCP service is provided.',
    capabilities: ['browser-checksum'],
    services: [{ name: 'wallet', endpoint: `eip155:10143:${owner}` }],
    active: true,
    x402Support: true,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(card));
  return INLINE_AGENT_CARD_PREFIX + btoa(String.fromCharCode(...bytes));
}

/** Decode only bounded, canonical base64 JSON. Never fetch owner-controlled URLs. */
export function decodeInlineAgentCard(uri: string): Record<string, unknown> {
  if (!uri.startsWith(INLINE_AGENT_CARD_PREFIX)) throw new Error('Inline Agent Card requires base64 application/json.');
  const encoded = uri.slice(INLINE_AGENT_CARD_PREFIX.length);
  if (!encoded || encoded.length > 4 * Math.ceil(MAX_INLINE_AGENT_CARD_BYTES / 3)) throw new Error('Inline Agent Card exceeds 8 KiB or is empty.');
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error('Invalid inline Agent Card base64.');
  const binary = atob(encoded);
  if (btoa(binary) !== encoded || binary.length > MAX_INLINE_AGENT_CARD_BYTES) throw new Error('Invalid or oversized inline Agent Card.');
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, character => character.charCodeAt(0)))); }
  catch { throw new Error('Inline Agent Card must contain valid UTF-8 JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Agent Card is not an object.');
  return value as Record<string, unknown>;
}
