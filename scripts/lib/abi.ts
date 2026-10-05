import { parseAbi } from 'viem';
export const routerAbi = parseAbi([
  'function identityRegistry() view returns (address)',
  'function isAuthorized(uint256 agentId,address account) view returns (bool)',
  'function predictShardAddress(uint256 agentId,bytes32 taskId,uint256 sequenceNonce,address executor,bytes32 inputHash) view returns (address)',
  'event ShardCreated(address indexed shard,uint256 indexed agentId,bytes32 indexed taskId,uint256 sequenceNonce,address executor,bytes32 inputHash)',
  'event TaskExecuted(address indexed shard,uint256 indexed agentId,bytes32 indexed taskId,bytes32 inputHash,bytes32 outputHash,bytes32 proofHash)',
]);
export const identityAbi = parseAbi([
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner,address operator) view returns (bool)',
]);
export const reputationAbi = parseAbi([
  'function getIdentityRegistry() view returns (address)',
  'function taskRouter() view returns (address)',
  'function recordedTasks(address shard) view returns (bool)',
  'function recordTaskExecution(address shard)',
  'function giveFeedback(uint256 agentId,int128 value,uint8 valueDecimals,string tag1,string tag2,string endpoint,string feedbackURI,bytes32 feedbackHash)',
  'event TaskExecutionRecorded(uint256 indexed agentId,address indexed shard,bytes32 indexed taskId,bytes32 outputHash,bytes32 proofHash)',
  'event NewFeedback(uint256 indexed agentId,address indexed clientAddress,uint64 feedbackIndex,int128 value,uint8 valueDecimals,string indexed indexedTag1,string tag1,string tag2,string endpoint,string feedbackURI,bytes32 feedbackHash)',
]);
