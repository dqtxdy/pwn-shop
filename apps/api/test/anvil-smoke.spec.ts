import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/application/services/auth.service';
import { PawnWorkflowService } from '../src/application/services/pawn-workflow.service';
import { BLOCKCHAIN_GATEWAY, PAWN_REPOSITORY } from '../src/common/tokens';
import { AnvilBlockchainGateway } from '../src/infrastructure/adapters/anvil-blockchain.gateway';
import { UserRole, AssetStatus } from '../src/domain/enums';
import { PawnRepository } from '../src/application/ports/pawn-repository';
import { ethers } from 'ethers';

const ANVIL_RPC = 'http://127.0.0.1:8545';
const RECEIPT_TIMEOUT_MS = 10000;

const runAnvilSmoke = process.env.BLOCKCHAIN_MODE === 'anvil';

// ---------------------------------------------------------------------------
// Raw JSON-RPC helper (bypasses ethers provider polling entirely)
// ---------------------------------------------------------------------------
async function rpc(method: string, params: unknown[] = []): Promise<any> {
  const res = await fetch(ANVIL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = (await res.json()) as any;
  if (json.error) throw new Error(`RPC ${method} error: ${json.error.message}`);
  return json.result;
}

/** Fetch pending nonce directly from the node (no ethers caching). */
async function getPendingNonce(address: string): Promise<number> {
  const hex = await rpc('eth_getTransactionCount', [address, 'pending']);
  return parseInt(hex as string, 16);
}

/** Poll for a receipt via raw JSON-RPC with a hard timeout; never hangs. */
async function waitReceiptBounded(
  txHash: string,
  signerAddress: string,
  txNonce: number,
  label: string,
  timeoutMs = RECEIPT_TIMEOUT_MS
): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
    if (receipt && receipt.blockNumber) {
      return receipt;
    }
    await new Promise(r => setTimeout(r, 200));
  }

  // Timed out — dump diagnostics then throw
  const latestNonce = parseInt(await rpc('eth_getTransactionCount', [signerAddress, 'latest']) as string, 16);
  const pendingNonce = await getPendingNonce(signerAddress);
  const blockNumber = parseInt(await rpc('eth_blockNumber', []) as string, 16);
  const txInfo = await rpc('eth_getTransactionByHash', [txHash]);
  console.error(`[DIAGNOSTIC] [${label}] RECEIPT TIMEOUT after ${timeoutMs}ms`);
  console.error(`[DIAGNOSTIC] [${label}]   txHash:       ${txHash}`);
  console.error(`[DIAGNOSTIC] [${label}]   signer:       ${signerAddress}`);
  console.error(`[DIAGNOSTIC] [${label}]   tx nonce:     ${txNonce}`);
  console.error(`[DIAGNOSTIC] [${label}]   latest nonce: ${latestNonce}`);
  console.error(`[DIAGNOSTIC] [${label}]   pending nonce:${pendingNonce}`);
  console.error(`[DIAGNOSTIC] [${label}]   block number: ${blockNumber}`);
  console.error(`[DIAGNOSTIC] [${label}]   eth_getTransactionByHash: ${JSON.stringify(txInfo)}`);
  throw new Error(`[${label}] receipt polling timed out after ${timeoutMs}ms — see DIAGNOSTIC lines above`);
}

(runAnvilSmoke ? describe : describe.skip)('Anvil Mode Integration Smoke Test', () => {
  let appModule: TestingModule;
  let authService: AuthService;
  let workflowService: PawnWorkflowService;
  let gateway: AnvilBlockchainGateway;
  let repository: PawnRepository;

  beforeAll(async () => {
    jest.setTimeout(60000);

    appModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    authService = appModule.get<AuthService>(AuthService);
    workflowService = appModule.get<PawnWorkflowService>(PawnWorkflowService);
    gateway = appModule.get<AnvilBlockchainGateway>(BLOCKCHAIN_GATEWAY);
    repository = appModule.get<PawnRepository>(PAWN_REPOSITORY);
  });

  afterAll(async () => {
    if (appModule) {
      await appModule.close();
    }
  });

  // -------------------------------------------------------------------------
  // Core send + bounded wait helper
  // -------------------------------------------------------------------------
  async function executeActionWithDiagnostics(
    signerPrivateKey: string,
    action: { to: string; calldata: string },
    label: string
  ): Promise<any /* raw receipt from eth_getTransactionReceipt */> {
    // Create a fresh provider + signer for every transaction to avoid stale
    // polling state accumulating in a long-lived ethers Provider instance.
    const freshProvider = new ethers.JsonRpcProvider(ANVIL_RPC);
    const signer = new ethers.Wallet(signerPrivateKey, freshProvider);

    // Fetch nonce from the node immediately before sending.
    const nonce = await getPendingNonce(signer.address);
    const startTime = Date.now();
    console.log(`[DIAGNOSTIC] [${label}] Sending tx to ${action.to} (nonce: ${nonce}, gasLimit: 500000)...`);

    let txHash: string;
    try {
      const tx = await signer.sendTransaction({
        to: action.to,
        data: action.calldata,
        nonce,
        gasLimit: 500000,
      });
      txHash = tx.hash;
      console.log(`[DIAGNOSTIC] [${label}] Dispatched in ${Date.now() - startTime}ms (hash: ${txHash})`);
    } catch (err: any) {
      console.error(`[DIAGNOSTIC] [${label}] Send failed:`, err.message || err);
      throw err;
    } finally {
      // Destroy the ephemeral provider immediately — we no longer need its polling.
      try { await freshProvider.destroy(); } catch { /* ignore */ }
    }

    const waitStart = Date.now();
    console.log(`[DIAGNOSTIC] [${label}] Polling for receipt (timeout: ${RECEIPT_TIMEOUT_MS}ms)...`);
    const receipt = await waitReceiptBounded(txHash, signer.address, nonce, label);

    if (receipt.status !== '0x1' && receipt.status !== 1) {
      throw new Error(`[${label}] Transaction reverted on-chain (status: ${receipt.status})`);
    }
    console.log(`[DIAGNOSTIC] [${label}] Confirmed in ${Date.now() - waitStart}ms (gasUsed: ${receipt.gasUsed})`);
    return receipt;
  }

  // -------------------------------------------------------------------------
  // Setup helpers
  // -------------------------------------------------------------------------

  async function resetRepositoryState() {
    const start = Date.now();
    console.log('[DIAGNOSTIC] [resetRepositoryState] Resetting database state...');
    await workflowService.reset();
    console.log(`[DIAGNOSTIC] [resetRepositoryState] Completed in ${Date.now() - start}ms`);
  }

  async function createVerifiedCustomerListing(
    assetId: string,
    sellerId: string,
    price: number,
    sellerPrivateKey: string
  ) {
    const label = `Listing ${assetId}`;
    console.log(`[DIAGNOSTIC] [${label}] [prepare] Requesting prepareCreateListing...`);
    const res = await workflowService.createListing({ assetId, sellerId, price, isProtocolOwned: false });

    expect(res).toBeDefined();
    expect('status' in res && res.status === 'AWAITING_WALLET_EXECUTION').toBe(true);
    const actions = (res as any).actions;
    expect(actions).toHaveLength(2);

    await executeActionWithDiagnostics(sellerPrivateKey, actions[0], `${label} Approve NFT`);
    const receipt = await executeActionWithDiagnostics(sellerPrivateKey, actions[1], `${label} Create Listing`);

    console.log(`[DIAGNOSTIC] [${label}] [verify backend] Verifying on backend...`);
    const completed = await workflowService.createListing({
      assetId, sellerId, price, isProtocolOwned: false, txHash: receipt.transactionHash,
    });

    expect(completed).toBeDefined();
    expect(completed).not.toHaveProperty('actions');
    expect((completed as any).status).toBe('ACTIVE');
    return completed;
  }

  async function startLayaway(
    listingId: string,
    assetId: string,
    buyerId: string,
    downPayment: number,
    monthsDuration: number,
    buyerPrivateKey: string
  ) {
    const label = `Layaway ${assetId}`;
    console.log(`[DIAGNOSTIC] [${label}] [prepare] Requesting prepareStartLayaway...`);
    const res = await workflowService.createLayaway({ listingId, buyerId, downPayment, monthsDuration });

    expect(res).toBeDefined();
    expect('status' in res && res.status === 'AWAITING_WALLET_EXECUTION').toBe(true);
    const actions = (res as any).actions;
    expect(actions).toHaveLength(2);

    await executeActionWithDiagnostics(buyerPrivateKey, actions[0], `${label} Approve USDC`);
    const receipt = await executeActionWithDiagnostics(buyerPrivateKey, actions[1], `${label} Start Layaway`);

    console.log(`[DIAGNOSTIC] [${label}] [verify backend] Verifying on backend...`);
    const completed = await workflowService.createLayaway({
      listingId, buyerId, downPayment, monthsDuration, txHash: receipt.transactionHash,
    });

    expect(completed).toBeDefined();
    expect(completed).not.toHaveProperty('actions');
    const final = completed as any;
    expect(final.buyerId).toBe(buyerId);
    expect(final.amountPaid).toBe(downPayment);
    expect(final.status).toBe('ACTIVE');
    return final;
  }

  async function payLayawayInstallments(layawayId: string, buyerPrivateKey: string) {
    const label = `LayawayPayment ${layawayId}`;
    console.log(`[DIAGNOSTIC] [${label}] Starting installment payment loop...`);
    let layaway: any = await repository.findLayaway(layawayId);
    expect(layaway).toBeDefined();

    let installmentIndex = 1;
    while (layaway.status === 'ACTIVE') {
      const stepLabel = `${label} Installment ${installmentIndex}`;
      console.log(`[DIAGNOSTIC] [${stepLabel}] [prepare] Requesting preparePayLayawayInstallment...`);
      const payRes = await workflowService.payLayaway(layaway.id, { amount: 0 });

      expect(payRes).toBeDefined();
      expect('status' in payRes && payRes.status === 'AWAITING_WALLET_EXECUTION').toBe(true);
      const payActions = (payRes as any).actions;
      expect(payActions).toHaveLength(2);

      await executeActionWithDiagnostics(buyerPrivateKey, payActions[0], `${stepLabel} Approve`);
      const receipt = await executeActionWithDiagnostics(buyerPrivateKey, payActions[1], `${stepLabel} Execute`);

      console.log(`[DIAGNOSTIC] [${stepLabel}] [verify backend] Verifying payment...`);
      const updated = await workflowService.payLayaway(layaway.id, { amount: 0, txHash: receipt.transactionHash });

      expect(updated).toBeDefined();
      expect(updated).not.toHaveProperty('actions');
      layaway = updated as any;
      installmentIndex++;
    }

    console.log(`[DIAGNOSTIC] [${label}] Loop completed (status: ${layaway.status})`);
    return layaway;
  }

  async function fractionalizeAssetHelper(
    assetId: string,
    ownerId: string,
    totalShares: number,
    targetPrice: number,
    ownerPrivateKey: string
  ) {
    const label = `Fractionalize ${assetId}`;
    console.log(`[DIAGNOSTIC] [${label}] [prepare] Requesting prepareFractionalizeAsset...`);
    const res = await workflowService.fractionalizeAsset({ assetId, totalShares, targetPrice }, ownerId);

    expect(res).toBeDefined();
    expect('status' in res && res.status === 'AWAITING_WALLET_EXECUTION').toBe(true);
    const actions = (res as any).actions;

    let receipt: any;
    if (actions.length === 2) {
      await executeActionWithDiagnostics(ownerPrivateKey, actions[0], `${label} Approve NFT`);
      receipt = await executeActionWithDiagnostics(ownerPrivateKey, actions[1], `${label} Execute Customer Frac`);
    } else {
      receipt = await executeActionWithDiagnostics(ownerPrivateKey, actions[0], `${label} Execute Admin Frac`);
    }

    console.log(`[DIAGNOSTIC] [${label}] [verify backend] Verifying on backend...`);
    const completed = await workflowService.fractionalizeAsset(
      { assetId, totalShares, targetPrice, txHash: receipt.transactionHash }, ownerId
    );
    return completed;
  }

  async function buyFractionsHelper(
    assetId: string,
    buyerId: string,
    sharesToBuy: number,
    buyerPrivateKey: string
  ) {
    const label = `BuyFractions ${assetId}`;
    console.log(`[DIAGNOSTIC] [${label}] [prepare] Requesting prepareBuyFractions...`);
    const res = await workflowService.buyFractions({ assetId, sharesToBuy }, buyerId);

    expect(res).toBeDefined();
    expect('status' in res && res.status === 'AWAITING_WALLET_EXECUTION').toBe(true);
    const actions = (res as any).actions;
    expect(actions).toHaveLength(2);

    await executeActionWithDiagnostics(buyerPrivateKey, actions[0], `${label} Approve`);
    const receipt = await executeActionWithDiagnostics(buyerPrivateKey, actions[1], `${label} Execute`);

    console.log(`[DIAGNOSTIC] [${label}] [verify backend] Verifying on backend...`);
    const completed = await workflowService.buyFractions(
      { assetId, sharesToBuy, txHash: receipt.transactionHash }, buyerId
    );
    return completed;
  }

  async function redeemAssetHelper(assetId: string, redeemerId: string, redeemerPrivateKey: string) {
    const label = `Redeem ${assetId}`;
    console.log(`[DIAGNOSTIC] [${label}] [prepare] Requesting prepareRedeemAsset...`);
    const res = await workflowService.redeemAsset({ assetId }, redeemerId);

    expect(res).toBeDefined();
    expect('status' in res && res.status === 'AWAITING_WALLET_EXECUTION').toBe(true);
    const actions = (res as any).actions;
    expect(actions).toHaveLength(1);

    const receipt = await executeActionWithDiagnostics(redeemerPrivateKey, actions[0], `${label} Execute`);

    console.log(`[DIAGNOSTIC] [${label}] [verify backend] Verifying on backend...`);
    const completed = await workflowService.redeemAsset(
      { assetId, txHash: receipt.transactionHash }, redeemerId
    );
    return completed;
  }

  // -------------------------------------------------------------------------
  // Tests
  // -------------------------------------------------------------------------

  it('should verify config returns anvil mode and deployment artifact', () => {
    const config = gateway.getBlockchainConfig();
    expect(config.mode).toBe('anvil');
    expect(config.isDeploymentArtifactLoaded).toBe(true);
    expect(config.chainId).toBe(31337);
    expect(config.pawnProtocolAddress).toBeDefined();
  });

  it('should verify health check is healthy', async () => {
    const health = await gateway.checkHealth();
    expect(health.healthy).toBe(true);
  });

  it('should verify dynamic demoLogin returns correct Anvil wallets', async () => {
    const customerSession = await authService.demoLogin(UserRole.Customer);
    expect(customerSession.walletAddress!.toLowerCase()).toBe('0x70997970c51812dc3a010c7d01b50e0d17dc79c8');

    const staffSession = await authService.demoLogin(UserRole.Staff);
    expect(staffSession.walletAddress!.toLowerCase()).toBe('0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc');

    const adminSession = await authService.demoLogin(UserRole.Admin);
    expect(adminSession.walletAddress!.toLowerCase()).toBe('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
  });

  it('should execute full on-chain appraisal and loan acceptance flow', async () => {
    await resetRepositoryState();

    const aliceKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

    const appraisal = await workflowService.createAppraisal({
      assetId: 'A-1001', appraiserId: 'staff-1', estimatedValue: 1500,
      ltvBps: 6000, interestAprBps: 500, evidenceUri: 'ipfs://smoke-test-evidence',
    });
    expect(appraisal).toBeDefined();
    expect(appraisal.assetId).toBe('A-1001');

    const loan = await workflowService.createLoanOffer({
      assetId: 'A-1001', borrowerId: 'customer-1', principal: 900, durationDays: 30,
    });
    expect(loan).toBeDefined();
    expect(loan.principal).toBe(900);

    const acceptRes = await workflowService.acceptLoan(loan.id, {
      borrowerWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    });
    expect(acceptRes).toBeDefined();
    expect('status' in acceptRes && acceptRes.status === 'AWAITING_WALLET_EXECUTION').toBe(true);
    const { actions } = acceptRes as { status: string; actions: any[] };
    expect(actions).toHaveLength(2);

    await executeActionWithDiagnostics(aliceKey, actions[0], 'Alice Approve NFT Loan');
    const loanReceipt = await executeActionWithDiagnostics(aliceKey, actions[1], 'Alice Create Pawn Loan');

    const acceptedLoan = await workflowService.acceptLoan(loan.id, {
      borrowerWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      txHash: loanReceipt.transactionHash,
    });
    expect(acceptedLoan).toBeDefined();
    expect(acceptedLoan).not.toHaveProperty('actions');
    const finalLoan = acceptedLoan as any;
    expect(finalLoan.status).toBe('ACTIVE');
    expect(finalLoan.contractTxHash).toBe(loanReceipt.transactionHash);

    const paymentTokenAddress = gateway.getBlockchainConfig().paymentTokenAddress!;
    const pawnProtocolAddress = gateway.getBlockchainConfig().pawnProtocolAddress!;

    const erc20Iface = new ethers.Interface(['function approve(address spender, uint256 amount) external returns (bool)']);
    const approveData = erc20Iface.encodeFunctionData('approve', [pawnProtocolAddress, ethers.parseEther('1000')]);
    await executeActionWithDiagnostics(aliceKey, { to: paymentTokenAddress, calldata: approveData }, 'Alice Approve USDC for Repay');

    const protocolIface = new ethers.Interface(['function repayPawn(uint256 assetId) external']);
    const repayData = protocolIface.encodeFunctionData('repayPawn', [1]);
    const repayReceipt = await executeActionWithDiagnostics(aliceKey, { to: pawnProtocolAddress, calldata: repayData }, 'Alice Repay Pawn');

    const repayment = await workflowService.recordRepayment({
      loanId: finalLoan.id, amount: 900, txHash: repayReceipt.transactionHash,
    });
    expect(repayment).toBeDefined();
    expect(repayment.loanId).toBe(finalLoan.id);
  }, 60000);

  it('should execute full on-chain customer consignment listing, layaway purchase, and installment completion flow', async () => {
    await resetRepositoryState();

    const aliceKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    const charlieKey = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';

    const finalListing: any = await createVerifiedCustomerListing('A-1004', 'customer-1', 1000, aliceKey);
    expect(finalListing.status).toBe('ACTIVE');

    const finalLayaway: any = await startLayaway(finalListing.id, 'A-1004', 'customer-2', 200, 6, charlieKey);
    expect(finalLayaway.status).toBe('ACTIVE');

    const updatedListing = await repository.findListing(finalListing.id);
    expect(updatedListing!.status).toBe('RESERVED');

    const completedLayaway: any = await payLayawayInstallments(finalLayaway.id, charlieKey);
    expect(completedLayaway.status).toBe('COMPLETED');

    const completedListing = await repository.findListing(finalListing.id);
    expect(completedListing!.status).toBe('SOLD');

    const completedAsset = await repository.findAsset('A-1004');
    expect(completedAsset!.ownerId).toBe('customer-2');
    expect(completedAsset!.status).toBe('RETURNING');

    const assetTokenAddress = gateway.getBlockchainConfig().assetTokenAddress!;
    const viewProvider = new ethers.JsonRpcProvider(ANVIL_RPC);
    try {
      const assetToken = new ethers.Contract(
        assetTokenAddress,
        ['function ownerOf(uint256 tokenId) external view returns (address)'],
        viewProvider
      );
      const onChainOwner = await assetToken.ownerOf(4);
      // charlie is Anvil account #3: 0x90F79bf6EB2c4f870365E785982E1f101E93b906
      expect(onChainOwner.toLowerCase()).toBe('0x90f79bf6eb2c4f870365e785982e1f101e93b906');
    } finally {
      try { await viewProvider.destroy(); } catch { /* ignore */ }
    }
  }, 60000);

  it('should execute full on-chain fractionalization, purchase, and redemption loop', async () => {
    await resetRepositoryState();

    const aliceKey = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    const charlieKey = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';
    const adminKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

    const assetA1002 = await repository.findAsset('A-1002');
    expect(assetA1002).toBeDefined();
    expect(assetA1002!.ownerId).toBe('customer-1');
    expect(assetA1002!.status).toBe('RECEIVED');

    // Alice fractionalizes A-1002 (customer-owned fractionalization)
    const finalFrac: any = await fractionalizeAssetHelper('A-1002', 'customer-1', 100, 1000, aliceKey);
    expect(finalFrac.status).toBe('SOLD_OUT');

    const alicePos = await repository.findFractionalPositionByHolderAndAsset('customer-1', 'A-1002');
    expect(alicePos!.shares).toBe(100);

    // Update DB status for A-1003 to RECEIVED so admin can fractionalize
    const assetA1003 = await repository.findAsset('A-1003');
    expect(assetA1003).toBeDefined();
    assetA1003!.status = AssetStatus.Received;
    await repository.saveAsset(assetA1003!);

    const assetTokenAddress = gateway.getBlockchainConfig().assetTokenAddress!;
    const pawnProtocolAddress = gateway.getBlockchainConfig().pawnProtocolAddress!;

    // Alice transfers tokenId 3 to the protocol contract for admin fractionalization
    const transferIface = new ethers.Interface([
      'function transferFrom(address from, address to, uint256 tokenId) external',
    ]);
    const aliceAddress = new ethers.Wallet(aliceKey).address;
    const transferData = transferIface.encodeFunctionData('transferFrom', [aliceAddress, pawnProtocolAddress, 3]);
    await executeActionWithDiagnostics(
      aliceKey,
      { to: assetTokenAddress, calldata: transferData },
      'Alice Transfer NFT 3 to Protocol'
    );

    // Admin fractionalizes A-1003
    const finalAdminFrac: any = await fractionalizeAssetHelper('A-1003', 'admin-1', 100, 2000, adminKey);
    expect(finalAdminFrac.status).toBe('ACTIVE');
    expect(finalAdminFrac.availableShares).toBe(100);

    // Charlie buys all fractions of A-1003
    const finalBuy: any = await buyFractionsHelper('A-1003', 'customer-2', 100, charlieKey);
    expect(finalBuy.status).toBe('SOLD_OUT');
    expect(finalBuy.availableShares).toBe(0);

    const charliePos = await repository.findFractionalPositionByHolderAndAsset('customer-2', 'A-1003');
    expect(charliePos!.shares).toBe(100);

    // Charlie redeems A-1003
    const finalRedeem: any = await redeemAssetHelper('A-1003', 'customer-2', charlieKey);
    expect(finalRedeem.status).toBe('REDEEMED');

    const viewProvider = new ethers.JsonRpcProvider(ANVIL_RPC);
    try {
      const assetToken = new ethers.Contract(
        assetTokenAddress,
        ['function ownerOf(uint256 tokenId) external view returns (address)'],
        viewProvider
      );
      const onChainOwner = await assetToken.ownerOf(3);
      // charlie is Anvil account #3: 0x90F79bf6EB2c4f870365E785982E1f101E93b906
      expect(onChainOwner.toLowerCase()).toBe('0x90f79bf6eb2c4f870365e785982e1f101e93b906');
    } finally {
      try { await viewProvider.destroy(); } catch { /* ignore */ }
    }

    const updatedAsset = await repository.findAsset('A-1003');
    expect(updatedAsset!.ownerId).toBe('customer-2');
    expect(updatedAsset!.status).toBe('RETURNING');
  }, 60000);
});
