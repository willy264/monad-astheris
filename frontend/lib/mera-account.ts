import { createSecp256k1SigningSession } from '@category-labs/mera';
import { toViemAccount } from '@category-labs/mera/viem';
import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

// Matches Mera's documented first EVM account mapping. Never persist the PRF,
// mnemonic, seed or derived key. JavaScript strings cannot be reliably zeroized.
export function openMeraSession(prfOutput: Uint8Array) {
  let seed: Uint8Array | undefined, master: HDKey | undefined, child: HDKey | undefined, privateKey: Uint8Array | undefined;
  try {
    if (prfOutput.length !== 32) throw new Error('Mera requires a 32-byte passkey PRF output.');
    seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
    master = HDKey.fromMasterSeed(seed);
    child = master.derive("m/44'/60'/0'/0/0");
    privateKey = child.privateKey ?? undefined;
    if (!privateKey) throw new Error('Passkey account derivation failed.');
    const session = createSecp256k1SigningSession({ privateKey });
    try { return { session, account: toViemAccount(session) }; }
    catch (error) { session.end(); throw error; }
  } finally {
    prfOutput.fill(0); seed?.fill(0); privateKey?.fill(0); child?.wipePrivateData(); master?.wipePrivateData();
  }
}
