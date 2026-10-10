import { createPublicClient, defineChain, http, isAddress, parseAbi, type Address } from 'viem';

export const monadTestnet = defineChain({
  id: 10143, name: 'Monad Testnet', nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'] } },
  blockExplorers: { default: { name: 'Monadscan', url: 'https://testnet.monadscan.com' } }, testnet: true,
});

function address(value?: string): Address | undefined { return value && isAddress(value) ? value : undefined; }
export const contracts = {
  router: address(process.env.NEXT_PUBLIC_ROUTER_ADDRESS),
  identity: address(process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS),
  reputation: address(process.env.NEXT_PUBLIC_REPUTATION_REGISTRY_ADDRESS),
};
export const routerAbi = parseAbi([
  'function setDelegate(uint256 agentId,address delegate,uint64 expiresAt)',
  'function delegates(uint256 agentId,address delegate) view returns (address owner,uint64 expiresAt,uint256 ownershipEpoch)',
  'function isAuthorized(uint256 agentId,address account) view returns (bool)',
  'function identityRegistry() view returns (address)',
  'function predictShardAddress(uint256 agentId,bytes32 taskId,uint256 sequenceNonce,address executor,bytes32 inputHash) view returns (address)',
  'function createShard(uint256 agentId,bytes32 taskId,uint256 sequenceNonce,address executor,bytes32 inputHash) returns (address)',
  'function executeTask(address shard,bytes32 outputHash,bytes32 proofHash)',
  'event ShardCreated(address indexed shard,uint256 indexed agentId,bytes32 indexed taskId,uint256 sequenceNonce,address executor,bytes32 inputHash)',
  'event TaskExecuted(address indexed shard,uint256 indexed agentId,bytes32 indexed taskId,bytes32 inputHash,bytes32 outputHash,bytes32 proofHash)',
  'event DelegateSet(uint256 indexed agentId,address indexed delegate,uint64 expiresAt,address owner)',
]);
export const identityAbi = parseAbi([
  'function register(string agentURI) returns (uint256 agentId)',
  'function totalSupply() view returns (uint256)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  'event Registered(uint256 indexed agentId,string agentURI,address indexed owner)',
  'event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)',
]);
export const reputationAbi = parseAbi([
  'function getIdentityRegistry() view returns (address)',
  'function getClients(uint256 agentId) view returns (address[])',
  'function getSummary(uint256 agentId,address[] clientAddresses,string tag1,string tag2) view returns (uint64 count,int128 summaryValue,uint8 summaryValueDecimals)',
]);
export const walletPublicClient = createPublicClient({ chain: monadTestnet, transport: http(undefined, { timeout: 12000, retryCount: 1 }) });
export function truncate(value: string, size = 6) { return value.length > size * 2 + 2 ? `${value.slice(0, size + 2)}…${value.slice(-size)}` : value; }
export function explorerTx(hash: string) { return `${monadTestnet.blockExplorers.default.url}/tx/${hash}`; }
export function explorerAddress(value: string) { return `${monadTestnet.blockExplorers.default.url}/address/${value}`; }
