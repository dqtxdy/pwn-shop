#!/usr/bin/env node
/**
 * scripts/deploy-local-anvil.mjs
 *
 * Bounded, deterministic local Anvil deploy runner.
 * Replaces `forge script --broadcast` for `npm run test:smoke`.
 *
 * Strategy:
 *   - Every transaction uses raw eth_sendRawTransaction
 *   - Every receipt is polled via eth_getTransactionReceipt with a hard 10s timeout
 *   - If any step hangs or fails the script exits with code 1 immediately
 *   - Writes deployments/local-anvil.json on success
 *
 * Requires: ethers (already a workspace dep)
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTRACT_OUT = path.join(ROOT, 'PawnShop-SmartContract', 'out');
const DEPLOYMENTS_DIR = path.join(ROOT, 'PawnShop-SmartContract', 'deployments');
const ANVIL_RPC = process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545';
const RECEIPT_TIMEOUT_MS = 10_000;
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// ---------------------------------------------------------------------------
// Raw RPC helpers (no ethers provider polling)
// ---------------------------------------------------------------------------
let _rpcId = 1;
async function rpc(method, params = []) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(ANVIL_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: _rpcId++, method, params }),
      signal: controller.signal,
    });
    const json = await res.json();
    if (json.error) throw new Error(`RPC ${method} error: ${json.error.message}`);
    return json.result;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`RPC ${method} fetch timed out after 8000ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getPendingNonce(address) {
  const hex = await rpc('eth_getTransactionCount', [address, 'pending']);
  return parseInt(hex, 16);
}

async function getChainId() {
  const hex = await rpc('eth_chainId', []);
  return parseInt(hex, 16);
}

async function waitReceipt(txHash, label) {
  const deadline = Date.now() + RECEIPT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
    if (receipt && receipt.blockNumber) {
      if (receipt.status !== '0x1') {
        throw new Error(`[${label}] tx reverted on-chain (status ${receipt.status}, hash ${txHash})`);
      }
      return receipt;
    }
    await new Promise(r => setTimeout(r, 200));
  }
  // Diagnostics on timeout
  const block = await rpc('eth_blockNumber', []);
  const txInfo = await rpc('eth_getTransactionByHash', [txHash]);
  console.error(`[DEPLOY][${label}] RECEIPT TIMEOUT after ${RECEIPT_TIMEOUT_MS}ms`);
  console.error(`  txHash:  ${txHash}`);
  console.error(`  block:   ${parseInt(block, 16)}`);
  console.error(`  txInfo:  ${JSON.stringify(txInfo)}`);
  throw new Error(`[${label}] receipt timeout — see diagnostics above`);
}

// Deploy gas limits — PawnProtocol needs ~4.6 M on Anvil
const DEPLOY_GAS_LIMIT = 6_000_000n;
const CALL_GAS_LIMIT   = 500_000n;

async function sendAndWait(signer, txRequest, label) {
  const nonce = await getPendingNonce(signer.address);
  const populated = {
    to: txRequest.to ?? null,
    data: txRequest.data ?? '0x',
    value: txRequest.value ?? 0n,
    nonce,
    gasLimit: txRequest.gasLimit ?? CALL_GAS_LIMIT,
    gasPrice: 1_000_000_000n, // 1 gwei — Anvil default
    chainId: txRequest.chainId,
  };

  const signed = await signer.signTransaction(populated);
  const txHash = await rpc('eth_sendRawTransaction', [signed]);
  console.log(`[DEPLOY][${label}] sent ${txHash} (nonce ${nonce})`);

  const receipt = await waitReceipt(txHash, label);
  console.log(`[DEPLOY][${label}] confirmed (gasUsed: ${parseInt(receipt.gasUsed, 16)})`);
  return receipt;
}

// ---------------------------------------------------------------------------
// Deploy a contract and return its address
// ---------------------------------------------------------------------------
async function deploy(signer, chainId, solFile, contractName, constructorArgs, abiTypes, label) {
  const artifactPath = path.join(CONTRACT_OUT, solFile, `${contractName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Compiled artifact not found: ${artifactPath}\nRun 'forge build' first.`);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
  const bytecode = artifact.bytecode.object;
  if (!bytecode || bytecode === '0x') {
    throw new Error(`Empty bytecode for ${contractName}. Run 'forge build' first.`);
  }

  let deployData = bytecode;
  if (constructorArgs.length > 0) {
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(abiTypes, constructorArgs);
    deployData = bytecode + encoded.slice(2); // strip 0x prefix
  }

  const receipt = await sendAndWait(signer, { data: deployData, gasLimit: DEPLOY_GAS_LIMIT, chainId }, label);
  const address = receipt.contractAddress;
  if (!address) throw new Error(`[${label}] No contractAddress in receipt`);
  console.log(`[DEPLOY][${label}] deployed at ${address}`);
  return address;
}

// ---------------------------------------------------------------------------
// Call a contract function (fire-and-wait)
// ---------------------------------------------------------------------------
function encodeCall(sig, types, values) {
  const iface = new ethers.Interface([`function ${sig}`]);
  const name = sig.split('(')[0];
  return iface.encodeFunctionData(name, values);
}

async function call(signer, chainId, to, sig, types, values, label) {
  const data = encodeCall(sig, types, values);
  await sendAndWait(signer, { to, data, gasLimit: 500_000n, chainId }, label);
}

// ---------------------------------------------------------------------------
// Main deploy sequence
// ---------------------------------------------------------------------------
async function main() {
  console.log('[DEPLOY] Starting bounded local Anvil deploy...');
  console.log(`[DEPLOY] RPC: ${ANVIL_RPC}`);

  // Verify Anvil is reachable
  let chainId;
  try {
    chainId = await getChainId();
    console.log(`[DEPLOY] Anvil chainId: ${chainId} (0x${chainId.toString(16)})`);
  } catch (e) {
    console.error(`[DEPLOY] Cannot reach Anvil at ${ANVIL_RPC}: ${e.message}`);
    process.exit(1);
  }

  if (chainId !== 31337) {
    console.error(`[DEPLOY] Expected chainId 31337 (Anvil), got ${chainId}`);
    process.exit(1);
  }

  const signer = new ethers.Wallet(DEPLOYER_KEY);
  console.log(`[DEPLOY] Deployer: ${signer.address}`);

  const startNonce = await getPendingNonce(signer.address);
  console.log(`[DEPLOY] Deployer pending nonce: ${startNonce}`);

  // -------------------------------------------------------------------------
  // 1. Deploy MockERC20 (payment token / stablecoin)
  // -------------------------------------------------------------------------
  const paymentToken = await deploy(
    signer, chainId,
    'MockERC20.sol', 'MockERC20', [], [], 'Deploy MockERC20'
  );

  // -------------------------------------------------------------------------
  // 2. Deploy AssetToken (RWA NFT, constructor: address initialOwner)
  // -------------------------------------------------------------------------
  const assetToken = await deploy(
    signer, chainId,
    'AssetToken.sol', 'AssetToken',
    [signer.address], ['address'],
    'Deploy AssetToken'
  );

  // -------------------------------------------------------------------------
  // 3. Deploy FractionToken (ERC1155, constructor: address initialOwner, string uri)
  // -------------------------------------------------------------------------
  const fractionToken = await deploy(
    signer, chainId,
    'FractionToken.sol', 'FractionToken',
    [signer.address, 'https://api.pwnshop.local/metadata/{id}'], ['address', 'string'],
    'Deploy FractionToken'
  );

  // -------------------------------------------------------------------------
  // 4. Deploy PawnProtocol (no constructor args)
  // -------------------------------------------------------------------------
  const pawnProtocol = await deploy(
    signer, chainId,
    'PawnProtocol.sol', 'PawnProtocol', [], [], 'Deploy PawnProtocol'
  );

  // -------------------------------------------------------------------------
  // 5. initialize(paymentToken, assetToken, fractionToken)
  // -------------------------------------------------------------------------
  await call(signer, chainId, pawnProtocol,
    'initialize(address,address,address)', ['address','address','address'],
    [paymentToken, assetToken, fractionToken],
    'PawnProtocol.initialize'
  );

  // -------------------------------------------------------------------------
  // 6. setStablecoinStatus(paymentToken, true)
  // -------------------------------------------------------------------------
  await call(signer, chainId, pawnProtocol,
    'setStablecoinStatus(address,bool)', ['address','bool'],
    [paymentToken, true],
    'PawnProtocol.setStablecoinStatus'
  );

  // -------------------------------------------------------------------------
  // 7. FractionToken.setMinter(protocol, true)
  // -------------------------------------------------------------------------
  await call(signer, chainId, fractionToken,
    'setMinter(address,bool)', ['address','bool'],
    [pawnProtocol, true],
    'FractionToken.setMinter'
  );

  // -------------------------------------------------------------------------
  // 8. Mint 1_000_000 payment tokens to PawnProtocol
  // -------------------------------------------------------------------------
  const liquidityAmount = ethers.parseEther('1000000');
  await call(signer, chainId, paymentToken,
    'mint(address,uint256)', ['address','uint256'],
    [pawnProtocol, liquidityAmount],
    'MockERC20.mint(protocol liquidity)'
  );

  // -------------------------------------------------------------------------
  // 9. Demo users: KYC + payment token mint
  // Anvil default accounts:
  //   #0 deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  //   #1 alice:    0x70997970C51812dc3A010C7d01b50e0d17dc79C8
  //   #2 bob:      0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
  //   #3 charlie:  0x90F79bf6EB2c4f870365E785982E1f101E93b906
  // -------------------------------------------------------------------------
  const alice   = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
  const bob     = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
  const charlie = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';

  for (const [user, label] of [
    [signer.address, 'deployer'],
    [alice, 'alice'],
    [bob, 'bob'],
    [charlie, 'charlie'],
  ]) {
    await call(signer, chainId, pawnProtocol,
      'setKYCStatus(address,bool)', ['address','bool'],
      [user, true],
      `setKYCStatus(${label})`
    );
  }

  const userMintAmount = ethers.parseEther('100000');
  for (const [user, label] of [
    [signer.address, 'deployer'],
    [alice, 'alice'],
    [bob, 'bob'],
    [charlie, 'charlie'],
  ]) {
    await call(signer, chainId, paymentToken,
      'mint(address,uint256)', ['address','uint256'],
      [user, userMintAmount],
      `MockERC20.mint(${label})`
    );
  }

  // -------------------------------------------------------------------------
  // 10. Mint demo AssetToken NFTs to Alice (A-1001 → tokenId 1, …, A-1005 → tokenId 5)
  // -------------------------------------------------------------------------
  const nftUris = [
    'https://api.pwnshop.local/metadata/A-1001',
    'https://api.pwnshop.local/metadata/A-1002',
    'https://api.pwnshop.local/metadata/A-1003',
    'https://api.pwnshop.local/metadata/A-1004',
    'https://api.pwnshop.local/metadata/A-1005',
  ];
  for (let i = 0; i < nftUris.length; i++) {
    await call(signer, chainId, assetToken,
      'mint(address,string)', ['address','string'],
      [alice, nftUris[i]],
      `AssetToken.mint(A-100${i + 1})`
    );
  }

  // -------------------------------------------------------------------------
  // 11. Write deployments/local-anvil.json
  // -------------------------------------------------------------------------
  fs.mkdirSync(DEPLOYMENTS_DIR, { recursive: true });

  const artifact = {
    chainId,
    pawnProtocol,
    paymentToken,
    assetToken,
    fractionToken,
    abiPath: 'out/PawnProtocol.sol/PawnProtocol.json',
    tokenIdMap: { 'A-1001': 1, 'A-1002': 2, 'A-1003': 3, 'A-1004': 4, 'A-1005': 5 },
  };

  const outPath = path.join(DEPLOYMENTS_DIR, 'local-anvil.json');
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(`[DEPLOY] Wrote ${outPath}`);
  console.log('[DEPLOY] ✓ Deploy complete.');
  console.log(`  paymentToken:  ${paymentToken}`);
  console.log(`  assetToken:    ${assetToken}`);
  console.log(`  fractionToken: ${fractionToken}`);
  console.log(`  pawnProtocol:  ${pawnProtocol}`);
}

main().catch(err => {
  console.error('[DEPLOY] FATAL:', err.message || err);
  process.exit(1);
});
