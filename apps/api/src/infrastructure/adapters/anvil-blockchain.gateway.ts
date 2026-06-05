import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { BlockchainConfig, BlockchainGateway } from '../../application/ports/external-services';

interface DeploymentArtifact {
  chainId: number;
  pawnProtocol: string;
  paymentToken: string;
  assetToken: string;
  fractionToken: string;
  abiPath: string;
  tokenIdMap?: string | Record<string, number>;
}

@Injectable()
export class AnvilBlockchainGateway implements BlockchainGateway, OnModuleDestroy {
  private artifact: DeploymentArtifact | null = null;
  private readonly anvilUrl: string;
  private providerInstance: any = null;

  constructor() {
    this.anvilUrl = process.env.ANVIL_RPC_URL || 'http://127.0.0.1:8545';
    this.loadArtifact();
  }

  private getProvider() {
    if (!this.providerInstance) {
      const { ethers } = require('ethers');
      this.providerInstance = new ethers.JsonRpcProvider(this.anvilUrl);
    }
    return this.providerInstance;
  }

  async onModuleDestroy() {
    if (this.providerInstance) {
      try {
        await this.providerInstance.destroy();
      } catch (err) {
        // ignore
      }
      this.providerInstance = null;
    }
  }

  /** Raw JSON-RPC call — bypasses ethers provider polling entirely. */
  private async rawRpc(method: string, params: unknown[] = []): Promise<unknown> {
    const res = await fetch(this.anvilUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json() as any;
    if (json.error) throw new Error(`rawRpc ${method} error: ${json.error.message}`);
    return json.result;
  }

  private loadArtifact() {
    const pathsToTry = [
      path.resolve(process.cwd(), '../../PawnShop-SmartContract/deployments/local-anvil.json'),
      path.resolve(process.cwd(), 'PawnShop-SmartContract/deployments/local-anvil.json'),
      path.resolve(__dirname, '../../../../../PawnShop-SmartContract/deployments/local-anvil.json'),
      path.resolve(__dirname, '../../../../PawnShop-SmartContract/deployments/local-anvil.json'),
    ];

    for (const p of pathsToTry) {
      try {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf8');
          this.artifact = JSON.parse(content);
          break;
        }
      } catch (err) {
        // continue
      }
    }
  }

  getBlockchainConfig(): BlockchainConfig {
    if (!this.artifact) {
      return {
        mode: 'anvil',
        isDeploymentArtifactLoaded: false,
      };
    }
    return {
      mode: 'anvil',
      chainId: this.artifact.chainId,
      pawnProtocolAddress: this.artifact.pawnProtocol,
      paymentTokenAddress: this.artifact.paymentToken,
      assetTokenAddress: this.artifact.assetToken,
      fractionTokenAddress: this.artifact.fractionToken,
      isDeploymentArtifactLoaded: true,
    };
  }

  private resolveAssetIdToTokenId(assetId: string): number {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    let tokenIdMap: Record<string, number> = {};
    if (this.artifact.tokenIdMap) {
      tokenIdMap = typeof this.artifact.tokenIdMap === 'string'
        ? JSON.parse(this.artifact.tokenIdMap)
        : this.artifact.tokenIdMap;
    }
    if (tokenIdMap[assetId] !== undefined) {
      return tokenIdMap[assetId];
    }
    const match = assetId.match(/\d+/);
    if (match) {
      const parsed = parseInt(match[0], 10);
      if (parsed >= 1001 && parsed <= 1005) {
        return parsed - 1000;
      }
      return parsed;
    }
    throw new Error(`Could not resolve asset ID ${assetId} to a numeric token ID`);
  }

  async prepareLoanDisbursement(input: {
    assetId: string;
    borrowerWallet: string;
    principal: number;
    durationDays: number;
  }): Promise<{ txHash?: string; status?: string; actions?: any[] }> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const tokenId = this.resolveAssetIdToTokenId(input.assetId);
    const scaledPrincipal = ethers.parseEther(input.principal.toString());

    const protocolAddress = this.artifact.pawnProtocol;
    const assetTokenAddress = this.artifact.assetToken;

    const assetContract = new ethers.Interface([
      'function approve(address to, uint256 tokenId) external'
    ]);
    const approveCalldata = assetContract.encodeFunctionData('approve', [
      protocolAddress,
      tokenId
    ]);

    const protocolContract = new ethers.Interface([
      'function createPawnLoan(uint256 assetId, uint256 durationDays, uint256 requestedAmount) external'
    ]);
    const createLoanCalldata = protocolContract.encodeFunctionData('createPawnLoan', [
      tokenId,
      input.durationDays,
      scaledPrincipal
    ]);

    return {
      status: 'AWAITING_WALLET_EXECUTION',
      actions: [
        {
          to: assetTokenAddress,
          calldata: approveCalldata,
          description: `Approve PawnProtocol to manage NFT asset ${input.assetId}`
        },
        {
          to: protocolAddress,
          calldata: createLoanCalldata,
          description: `Create pawn loan for asset ${input.assetId} with principal ${input.principal} USDC`
        }
      ]
    };
  }

  async recordRepayment(input: {
    loanId: string;
    amount: number;
    txHash: string;
    assetId: string;
    borrowerWallet: string;
  }): Promise<void> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const provider = this.getProvider();

    try {
      const receipt = await provider.getTransactionReceipt(input.txHash);
      if (!receipt) {
        throw new Error(`Transaction receipt for hash ${input.txHash} not found on-chain`);
      }

      if (receipt.status !== 1) {
        throw new Error(`Transaction reverted on-chain`);
      }

      const protocolAddress = this.artifact.pawnProtocol;
      const tokenId = this.resolveAssetIdToTokenId(input.assetId);

      const logs = receipt.logs || [];
      const iface = new ethers.Interface([
        'event LoanRepaid(uint256 indexed assetId, address borrower, uint256 totalRepaid)'
      ]);

      let logVerified = false;
      for (const log of logs) {
        if (log.address.toLowerCase() === protocolAddress.toLowerCase()) {
          try {
            const parsed = iface.parseLog(log);
            if (parsed && parsed.name === 'LoanRepaid') {
              const logTokenId = parsed.args[0].toString();
              const logBorrower = parsed.args[1].toLowerCase();
              const logAmount = parsed.args[2].toString();

              const expectedAmountWei = ethers.parseEther(input.amount.toString());

              if (
                logTokenId === tokenId.toString() &&
                logBorrower === input.borrowerWallet.toLowerCase() &&
                BigInt(logAmount) >= expectedAmountWei - ethers.parseEther('0.01')
              ) {
                logVerified = true;
                break;
              }
            }
          } catch (e) {
            // ignore non-matching logs
          }
        }
      }

      if (!logVerified) {
        throw new Error(
          `No matching LoanRepaid event found for asset ${input.assetId} (token ID ${tokenId}), borrower ${input.borrowerWallet}, and amount ${input.amount}`
        );
      }
    } catch (error: any) {
      throw new Error(`Failed to verify repayment transaction on Anvil: ${error.message}`);
    }
  }

  async updateAppraisal(input: {
    assetId: string;
    estimatedValue: number;
    ltvBps: number;
    interestAprBps: number;
  }): Promise<{ txHash: string }> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');

    const privateKey = process.env.ORACLE_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
    const signer = new ethers.Wallet(privateKey);

    const protocolAddress = this.artifact.pawnProtocol;
    const tokenId = this.resolveAssetIdToTokenId(input.assetId);
    const scaledValue = ethers.parseEther(input.estimatedValue.toString());

    // Encode calldata directly — no provider needed for encoding
    const iface = new ethers.Interface([
      'function updateAppraisal(uint256 assetId, uint256 estimatedValue, uint256 ltvBps, uint256 interestBps, bool isValid) external',
    ]);
    const data = iface.encodeFunctionData('updateAppraisal', [
      tokenId, scaledValue, input.ltvBps, input.interestAprBps, true,
    ]);

    // Fetch nonce directly from node (no provider caching)
    const nonceHex = await this.rawRpc('eth_getTransactionCount', [signer.address, 'pending']);
    const nonce = parseInt(nonceHex as string, 16);

    // Sign and send via raw RPC — no ethers provider polling involved
    const chainIdHex = await this.rawRpc('eth_chainId', []);
    const chainId = parseInt(chainIdHex as string, 16);

    const signed = await signer.signTransaction({
      to: protocolAddress,
      data,
      nonce,
      gasLimit: 500_000n,
      gasPrice: 1_000_000_000n,
      chainId,
    });

    const txHash = await this.rawRpc('eth_sendRawTransaction', [signed]) as string;

    // Poll for receipt with a hard 10s timeout (same pattern as smoke spec)
    const RECEIPT_TIMEOUT_MS = 10_000;
    const POLL_INTERVAL_MS = 200;
    const deadline = Date.now() + RECEIPT_TIMEOUT_MS;
    let receipt: any = null;

    while (Date.now() < deadline) {
      receipt = await this.rawRpc('eth_getTransactionReceipt', [txHash]);
      if (receipt && (receipt as any).blockNumber) break;
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    }

    if (!receipt || !(receipt as any).blockNumber) {
      const blockHex = await this.rawRpc('eth_blockNumber', []);
      const txInfo = await this.rawRpc('eth_getTransactionByHash', [txHash]);
      const latestHex = await this.rawRpc('eth_getTransactionCount', [signer.address, 'latest']);
      const pendingHex = await this.rawRpc('eth_getTransactionCount', [signer.address, 'pending']);
      console.error(`[AnvilGateway][updateAppraisal] RECEIPT TIMEOUT after ${RECEIPT_TIMEOUT_MS}ms`);
      console.error(`  txHash:        ${txHash}`);
      console.error(`  signer:        ${signer.address}`);
      console.error(`  nonce used:    ${nonce}`);
      console.error(`  latest nonce:  ${parseInt(latestHex as string, 16)}`);
      console.error(`  pending nonce: ${parseInt(pendingHex as string, 16)}`);
      console.error(`  block number:  ${parseInt(blockHex as string, 16)}`);
      console.error(`  txInfo:        ${JSON.stringify(txInfo)}`);
      throw new Error(`updateAppraisal: receipt wait timed out after ${RECEIPT_TIMEOUT_MS}ms (hash: ${txHash})`);
    }

    if ((receipt as any).status !== '0x1') {
      throw new Error(`updateAppraisal transaction reverted on-chain (status: ${(receipt as any).status})`);
    }

    // Verify AppraisalUpdated log from receipt
    const eventIface = new ethers.Interface([
      'event AppraisalUpdated(uint256 indexed assetId, uint256 newValue, uint256 timestamp, uint256 adminLTV, uint256 interestRateBps)',
    ]);
    let eventVerified = false;
    for (const log of (receipt as any).logs ?? []) {
      if (log.address?.toLowerCase() === protocolAddress.toLowerCase()) {
        try {
          const parsed = eventIface.parseLog(log);
          if (parsed && parsed.name === 'AppraisalUpdated') {
            if (parsed.args[0].toString() === tokenId.toString()) {
              eventVerified = true;
              break;
            }
          }
        } catch {
          // ignore non-matching logs
        }
      }
    }

    if (!eventVerified) {
      throw new Error(`AppraisalUpdated log not found in receipt for token ID ${tokenId}`);
    }

    return { txHash };
  }


  async verifyLoanCreated(
    txHash: string,
    assetId: string,
    borrowerWallet: string,
    principal: number
  ): Promise<void> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      throw new Error(`Transaction receipt for hash ${txHash} not found on-chain`);
    }

    if (receipt.status !== 1) {
      throw new Error(`Loan creation transaction reverted on-chain`);
    }

    const protocolAddress = this.artifact.pawnProtocol;
    const tokenId = this.resolveAssetIdToTokenId(assetId);
    const expectedPrincipalWei = ethers.parseEther(principal.toString());

    const logs = receipt.logs || [];
    const iface = new ethers.Interface([
      'event LoanCreated(uint256 indexed assetId, address borrower, uint256 amount, uint256 duration)'
    ]);

    let logVerified = false;
    for (const log of logs) {
      if (log.address.toLowerCase() === protocolAddress.toLowerCase()) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === 'LoanCreated') {
            const logTokenId = parsed.args[0].toString();
            const logBorrower = parsed.args[1].toLowerCase();
            const logAmount = parsed.args[2].toString();

            if (
              logTokenId === tokenId.toString() &&
              logBorrower === borrowerWallet.toLowerCase() &&
              logAmount === expectedPrincipalWei.toString()
            ) {
              logVerified = true;
              break;
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (!logVerified) {
      throw new Error(
        `No matching LoanCreated event found for asset ${assetId} (token ID ${tokenId}), borrower ${borrowerWallet}, and principal ${principal}`
      );
    }
  }

  async checkHealth(): Promise<{ healthy: boolean; reason?: string }> {
    if (!this.artifact) {
      return {
        healthy: false,
        reason: 'Anvil deployment artifact is missing',
      };
    }

    try {
      // 1. Call eth_chainId to check RPC availability and chain config
      const chainIdResponse = await fetch(this.anvilUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_chainId',
          params: [],
        }),
      });

      if (!chainIdResponse.ok) {
        return {
          healthy: false,
          reason: `RPC server returned chainId status ${chainIdResponse.status}`,
        };
      }

      const chainIdJson = (await chainIdResponse.json()) as any;
      if (chainIdJson.error) {
        return {
          healthy: false,
          reason: chainIdJson.error.message || 'RPC chainId error',
        };
      }

      const currentChainIdHex = chainIdJson.result;
      const currentChainId = parseInt(currentChainIdHex, 16);
      if (currentChainId !== this.artifact.chainId) {
        return {
          healthy: false,
          reason: `Chain ID mismatch. Artifact: ${this.artifact.chainId}, RPC: ${currentChainId}`,
        };
      }

      // 2. Call eth_getCode to verify contract deployment
      const getCodeResponse = await fetch(this.anvilUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 2,
          method: 'eth_getCode',
          params: [this.artifact.pawnProtocol, 'latest'],
        }),
      });

      if (!getCodeResponse.ok) {
        return {
          healthy: false,
          reason: `RPC server returned getCode status ${getCodeResponse.status}`,
        };
      }

      const getCodeJson = (await getCodeResponse.json()) as any;
      if (getCodeJson.error) {
        return {
          healthy: false,
          reason: getCodeJson.error.message || 'RPC getCode error',
        };
      }

      const code = getCodeJson.result;
      if (!code || code === '0x' || code === '0x0') {
        return {
          healthy: false,
          reason: `PawnProtocol contract code is missing at address ${this.artifact.pawnProtocol}`,
        };
      }

      return { healthy: true };
    } catch (error: any) {
      return {
        healthy: false,
        reason: `RPC server at ${this.anvilUrl} is unreachable: ${error.message}`,
      };
    }
  }

  async prepareCreateListing(input: {
    assetId: string;
    sellerWallet: string;
    price: number;
    isConsigned: boolean;
  }): Promise<{ txHash?: string; status?: string; actions?: any[] }> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const tokenId = this.resolveAssetIdToTokenId(input.assetId);
    const scaledPrice = ethers.parseEther(input.price.toString());

    const protocolAddress = this.artifact.pawnProtocol;
    const assetTokenAddress = this.artifact.assetToken;

    const assetContract = new ethers.Interface([
      'function approve(address to, uint256 tokenId) external'
    ]);
    const approveCalldata = assetContract.encodeFunctionData('approve', [
      protocolAddress,
      tokenId
    ]);

    const protocolContract = new ethers.Interface([
      'function createListing(uint256 assetId, uint256 price, bool isConsigned) external'
    ]);
    const createListingCalldata = protocolContract.encodeFunctionData('createListing', [
      tokenId,
      scaledPrice,
      input.isConsigned
    ]);

    return {
      status: 'AWAITING_WALLET_EXECUTION',
      actions: [
        {
          to: assetTokenAddress,
          calldata: approveCalldata,
          description: `Approve PawnProtocol to manage NFT asset ${input.assetId} for listing`
        },
        {
          to: protocolAddress,
          calldata: createListingCalldata,
          description: `List asset ${input.assetId} for sale on marketplace at ${input.price} USDC`
        }
      ]
    };
  }

  async verifyListingCreated(
    txHash: string,
    assetId: string,
    sellerWallet: string,
    price: number
  ): Promise<void> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      throw new Error(`Transaction receipt for hash ${txHash} not found on-chain`);
    }

    if (receipt.status !== 1) {
      throw new Error(`Marketplace listing transaction reverted on-chain`);
    }

    const protocolAddress = this.artifact.pawnProtocol;
    const tokenId = this.resolveAssetIdToTokenId(assetId);
    const expectedPriceWei = ethers.parseEther(price.toString());

    const logs = receipt.logs || [];
    const iface = new ethers.Interface([
      'event ItemConsigned(uint256 indexed assetId, address seller, uint256 price)'
    ]);

    let logVerified = false;
    for (const log of logs) {
      if (log.address.toLowerCase() === protocolAddress.toLowerCase()) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === 'ItemConsigned') {
            const logTokenId = parsed.args[0].toString();
            const logSeller = parsed.args[1].toLowerCase();
            const logPrice = parsed.args[2].toString();

            if (
              logTokenId === tokenId.toString() &&
              logSeller === sellerWallet.toLowerCase() &&
              logPrice === expectedPriceWei.toString()
            ) {
              logVerified = true;
              break;
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (!logVerified) {
      throw new Error(
        `No matching ItemConsigned event found for asset ${assetId} (token ID ${tokenId}), seller ${sellerWallet}, and price ${price}`
      );
    }
  }

  async prepareStartLayaway(input: {
    assetId: string;
    buyerWallet: string;
    downPayment: number;
    monthsDuration: number;
  }): Promise<{ txHash?: string; status?: string; actions?: any[] }> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const tokenId = this.resolveAssetIdToTokenId(input.assetId);
    const scaledDownPayment = ethers.parseEther(input.downPayment.toString());

    const protocolAddress = this.artifact.pawnProtocol;
    const paymentTokenAddress = this.artifact.paymentToken;

    const erc20Interface = new ethers.Interface([
      'function approve(address spender, uint256 amount) external returns (bool)'
    ]);
    const approveCalldata = erc20Interface.encodeFunctionData('approve', [
      protocolAddress,
      scaledDownPayment
    ]);

    const protocolContract = new ethers.Interface([
      'function startLayaway(uint256 assetId, uint256 monthsDuration, uint256 initialPayment) external'
    ]);
    const startLayawayCalldata = protocolContract.encodeFunctionData('startLayaway', [
      tokenId,
      input.monthsDuration,
      scaledDownPayment
    ]);

    return {
      status: 'AWAITING_WALLET_EXECUTION',
      actions: [
        {
          to: paymentTokenAddress,
          calldata: approveCalldata,
          description: `Approve PawnProtocol to spend ${input.downPayment} USDC down payment`
        },
        {
          to: protocolAddress,
          calldata: startLayawayCalldata,
          description: `Start layaway on asset ${input.assetId} for ${input.monthsDuration} months`
        }
      ]
    };
  }

  async verifyLayawayStarted(
    txHash: string,
    assetId: string,
    buyerWallet: string,
    downPayment: number
  ): Promise<void> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(txHash);

    if (!receipt) {
      throw new Error(`Transaction receipt for hash ${txHash} not found on-chain`);
    }

    if (receipt.status !== 1) {
      throw new Error(`Layaway transaction reverted on-chain`);
    }

    const protocolAddress = this.artifact.pawnProtocol;
    const tokenId = this.resolveAssetIdToTokenId(assetId);
    const expectedPaymentWei = ethers.parseEther(downPayment.toString());

    const logs = receipt.logs || [];
    const iface = new ethers.Interface([
      'event LayawayStarted(uint256 indexed assetId, address buyer, uint256 initialPayment)'
    ]);

    let logVerified = false;
    for (const log of logs) {
      if (log.address.toLowerCase() === protocolAddress.toLowerCase()) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === 'LayawayStarted') {
            const logTokenId = parsed.args[0].toString();
            const logBuyer = parsed.args[1].toLowerCase();
            const logPayment = parsed.args[2].toString();

            if (
              logTokenId === tokenId.toString() &&
              logBuyer === buyerWallet.toLowerCase() &&
              logPayment === expectedPaymentWei.toString()
            ) {
              logVerified = true;
              break;
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (!logVerified) {
      throw new Error(
        `No matching LayawayStarted event found for asset ${assetId} (token ID ${tokenId}), buyer ${buyerWallet}, and down payment ${downPayment}`
      );
    }
  }

  async preparePayLayawayInstallment(input: {
    assetId: string;
    buyerWallet: string;
    installmentAmount: bigint;
  }): Promise<{ status?: string; actions?: any[] }> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const tokenId = this.resolveAssetIdToTokenId(input.assetId);

    const protocolAddress = this.artifact.pawnProtocol;
    const paymentTokenAddress = this.artifact.paymentToken;

    const erc20Interface = new ethers.Interface([
      'function approve(address spender, uint256 amount) external returns (bool)'
    ]);
    const approveCalldata = erc20Interface.encodeFunctionData('approve', [
      protocolAddress,
      input.installmentAmount
    ]);

    const protocolContract = new ethers.Interface([
      'function payInstallment(uint256 assetId, uint256 amount) external'
    ]);
    const payInstallmentCalldata = protocolContract.encodeFunctionData('payInstallment', [
      tokenId,
      input.installmentAmount
    ]);

    return {
      status: 'AWAITING_WALLET_EXECUTION',
      actions: [
        {
          to: paymentTokenAddress,
          calldata: approveCalldata,
          description: `Approve PawnProtocol to spend installment for asset ${input.assetId}`
        },
        {
          to: protocolAddress,
          calldata: payInstallmentCalldata,
          description: `Pay layaway installment for asset ${input.assetId}`
        }
      ]
    };
  }

  async verifyLayawayInstallmentPaid(input: {
    txHash: string;
    assetId: string;
    buyerWallet: string;
    installmentAmount: bigint;
    isFinal: boolean;
  }): Promise<void> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(input.txHash);

    if (!receipt) {
      throw new Error(`Transaction receipt for hash ${input.txHash} not found on-chain`);
    }

    if (receipt.status !== 1) {
      throw new Error(`Layaway installment transaction reverted on-chain`);
    }

    const protocolAddress = this.artifact.pawnProtocol;
    const tokenId = this.resolveAssetIdToTokenId(input.assetId);

    const logs = receipt.logs || [];

    // Verify LayawayInstallmentPaid event
    const installmentIface = new ethers.Interface([
      'event LayawayInstallmentPaid(uint256 indexed assetId, uint256 amount)'
    ]);

    let installmentVerified = false;
    for (const log of logs) {
      if (log.address.toLowerCase() === protocolAddress.toLowerCase()) {
        try {
          const parsed = installmentIface.parseLog(log);
          if (parsed && parsed.name === 'LayawayInstallmentPaid') {
            const logTokenId = parsed.args[0].toString();
            const logAmount = BigInt(parsed.args[1].toString());

            if (logTokenId === tokenId.toString() && logAmount === input.installmentAmount) {
              installmentVerified = true;
              break;
            }
          }
        } catch (e) {
          // ignore non-matching logs
        }
      }
    }

    if (!installmentVerified) {
      throw new Error(
        `No matching LayawayInstallmentPaid event found for asset ${input.assetId} (token ID ${tokenId}) with amount ${input.installmentAmount}`
      );
    }

    // For final payment, also verify LayawayCompleted event
    if (input.isFinal) {
      const completedIface = new ethers.Interface([
        'event LayawayCompleted(uint256 indexed assetId, address buyer)'
      ]);

      let completedVerified = false;
      for (const log of logs) {
        if (log.address.toLowerCase() === protocolAddress.toLowerCase()) {
          try {
            const parsed = completedIface.parseLog(log);
            if (parsed && parsed.name === 'LayawayCompleted') {
              const logTokenId = parsed.args[0].toString();
              const logBuyer = parsed.args[1].toLowerCase();

              if (
                logTokenId === tokenId.toString() &&
                logBuyer === input.buyerWallet.toLowerCase()
              ) {
                completedVerified = true;
                break;
              }
            }
          } catch (e) {
            // ignore non-matching logs
          }
        }
      }

      if (!completedVerified) {
        throw new Error(
          `No matching LayawayCompleted event found for asset ${input.assetId} (token ID ${tokenId}), buyer ${input.buyerWallet}`
        );
      }
    }
  }

  async prepareFractionalizeAsset(input: {
    assetId: string;
    ownerWallet: string;
    totalShares: number;
    targetPrice: number;
  }): Promise<{ status?: string; actions?: any[] }> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const tokenId = this.resolveAssetIdToTokenId(input.assetId);
    const scaledTargetPrice = ethers.parseEther(input.targetPrice.toString());

    const protocolAddress = this.artifact.pawnProtocol;
    const assetTokenAddress = this.artifact.assetToken;

    // Check if the owner is the admin
    const isAdmin = input.ownerWallet.toLowerCase() === '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

    if (isAdmin) {
      const protocolContract = new ethers.Interface([
        'function fractionalizeItem(uint256 assetId, uint256 totalShares, uint256 targetPrice) external'
      ]);
      const fractionalizeItemCalldata = protocolContract.encodeFunctionData('fractionalizeItem', [
        tokenId,
        input.totalShares,
        scaledTargetPrice
      ]);

      return {
        status: 'AWAITING_WALLET_EXECUTION',
        actions: [
          {
            to: protocolAddress,
            calldata: fractionalizeItemCalldata,
            description: `Fractionalize protocol-owned asset ${input.assetId} with ${input.totalShares} shares`
          }
        ]
      };
    } else {
      const assetContract = new ethers.Interface([
        'function approve(address to, uint256 tokenId) external'
      ]);
      const approveCalldata = assetContract.encodeFunctionData('approve', [
        protocolAddress,
        tokenId
      ]);

      const protocolContract = new ethers.Interface([
        'function fractionalizeOwnedAsset(uint256 assetId, uint256 totalShares, uint256 targetPrice) external'
      ]);
      const fractionalizeOwnedAssetCalldata = protocolContract.encodeFunctionData('fractionalizeOwnedAsset', [
        tokenId,
        input.totalShares,
        scaledTargetPrice
      ]);

      return {
        status: 'AWAITING_WALLET_EXECUTION',
        actions: [
          {
            to: assetTokenAddress,
            calldata: approveCalldata,
            description: `Approve PawnProtocol to transfer NFT asset ${input.assetId}`
          },
          {
            to: protocolAddress,
            calldata: fractionalizeOwnedAssetCalldata,
            description: `Fractionalize owned asset ${input.assetId} with ${input.totalShares} shares`
          }
        ]
      };
    }
  }

  async verifyAssetFractionalized(input: {
    txHash: string;
    assetId: string;
    ownerWallet: string;
    totalShares: number;
    targetPrice: number;
  }): Promise<void> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(input.txHash);

    if (!receipt) {
      throw new Error(`Transaction receipt for hash ${input.txHash} not found on-chain`);
    }

    if (receipt.status !== 1) {
      throw new Error(`Fractionalization transaction reverted on-chain`);
    }

    const protocolAddress = this.artifact.pawnProtocol;
    const tokenId = this.resolveAssetIdToTokenId(input.assetId);

    const logs = receipt.logs || [];
    const iface = new ethers.Interface([
      'event AssetFractionalized(uint256 indexed assetId, address owner, uint256 totalShares, uint256 pricePerShare)'
    ]);

    const isAdmin = input.ownerWallet.toLowerCase() === '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
    const expectedOwner = isAdmin ? protocolAddress.toLowerCase() : input.ownerWallet.toLowerCase();
    const scaledTargetPrice = ethers.parseEther(input.targetPrice.toString());
    const expectedPricePerShare = scaledTargetPrice / BigInt(input.totalShares);

    let verified = false;
    for (const log of logs) {
      if (log.address.toLowerCase() === protocolAddress.toLowerCase()) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === 'AssetFractionalized') {
            const logTokenId = parsed.args[0].toString();
            const logOwner = parsed.args[1].toLowerCase();
            const logTotalShares = parsed.args[2].toString();
            const logPricePerShare = parsed.args[3].toString();

            if (
              logTokenId === tokenId.toString() &&
              logOwner === expectedOwner &&
              logTotalShares === input.totalShares.toString() &&
              logPricePerShare === expectedPricePerShare.toString()
            ) {
              verified = verified || true;
              break;
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (!verified) {
      throw new Error(
        `No matching AssetFractionalized event found for asset ${input.assetId} (token ID ${tokenId})`
      );
    }
  }

  async prepareBuyFractions(input: {
    assetId: string;
    buyerWallet: string;
    sharesToBuy: number;
    pricePerShare: number;
  }): Promise<{ status?: string; actions?: any[] }> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const tokenId = this.resolveAssetIdToTokenId(input.assetId);
    const scaledPricePerShare = ethers.parseEther(input.pricePerShare.toString());
    const totalCost = BigInt(input.sharesToBuy) * scaledPricePerShare;

    const protocolAddress = this.artifact.pawnProtocol;
    const paymentTokenAddress = this.artifact.paymentToken;

    const erc20Interface = new ethers.Interface([
      'function approve(address spender, uint256 amount) external returns (bool)'
    ]);
    const approveCalldata = erc20Interface.encodeFunctionData('approve', [
      protocolAddress,
      totalCost
    ]);

    const protocolContract = new ethers.Interface([
      'function buyFractions(uint256 assetId, uint256 sharesToBuy) external'
    ]);
    const buyFractionsCalldata = protocolContract.encodeFunctionData('buyFractions', [
      tokenId,
      input.sharesToBuy
    ]);

    return {
      status: 'AWAITING_WALLET_EXECUTION',
      actions: [
        {
          to: paymentTokenAddress,
          calldata: approveCalldata,
          description: `Approve PawnProtocol to spend ${input.sharesToBuy * input.pricePerShare} USDC for fractions`
        },
        {
          to: protocolAddress,
          calldata: buyFractionsCalldata,
          description: `Buy ${input.sharesToBuy} fractions of asset ${input.assetId}`
        }
      ]
    };
  }

  async verifyFractionsPurchased(input: {
    txHash: string;
    assetId: string;
    buyerWallet: string;
    sharesToBuy: number;
    pricePerShare: number;
  }): Promise<void> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(input.txHash);

    if (!receipt) {
      throw new Error(`Transaction receipt for hash ${input.txHash} not found on-chain`);
    }

    if (receipt.status !== 1) {
      throw new Error(`Buy fractions transaction reverted on-chain`);
    }

    const protocolAddress = this.artifact.pawnProtocol;
    const tokenId = this.resolveAssetIdToTokenId(input.assetId);
    const scaledPricePerShare = ethers.parseEther(input.pricePerShare.toString());
    const expectedTotalCost = BigInt(input.sharesToBuy) * scaledPricePerShare;

    const logs = receipt.logs || [];
    const iface = new ethers.Interface([
      'event FractionsBought(uint256 indexed assetId, address buyer, uint256 shares, uint256 totalCost)'
    ]);

    let verified = false;
    for (const log of logs) {
      if (log.address.toLowerCase() === protocolAddress.toLowerCase()) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === 'FractionsBought') {
            const logTokenId = parsed.args[0].toString();
            const logBuyer = parsed.args[1].toLowerCase();
            const logShares = parsed.args[2].toString();
            const logTotalCost = parsed.args[3].toString();

            if (
              logTokenId === tokenId.toString() &&
              logBuyer === input.buyerWallet.toLowerCase() &&
              logShares === input.sharesToBuy.toString() &&
              logTotalCost === expectedTotalCost.toString()
            ) {
              verified = verified || true;
              break;
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (!verified) {
      throw new Error(
        `No matching FractionsBought event found for asset ${input.assetId} (token ID ${tokenId})`
      );
    }
  }

  async prepareRedeemAsset(input: {
    assetId: string;
    redeemerWallet: string;
  }): Promise<{ status?: string; actions?: any[] }> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const tokenId = this.resolveAssetIdToTokenId(input.assetId);

    const protocolAddress = this.artifact.pawnProtocol;

    const protocolContract = new ethers.Interface([
      'function redeemAsset(uint256 assetId) external'
    ]);
    const redeemAssetCalldata = protocolContract.encodeFunctionData('redeemAsset', [
      tokenId
    ]);

    return {
      status: 'AWAITING_WALLET_EXECUTION',
      actions: [
        {
          to: protocolAddress,
          calldata: redeemAssetCalldata,
          description: `Redeem asset ${input.assetId} by burning 100% fractions`
        }
      ]
    };
  }

  async verifyAssetRedeemed(input: {
    txHash: string;
    assetId: string;
    redeemerWallet: string;
  }): Promise<void> {
    if (!this.artifact) {
      throw new Error('Anvil deployment artifact is missing');
    }
    const { ethers } = require('ethers');
    const provider = this.getProvider();
    const receipt = await provider.getTransactionReceipt(input.txHash);

    if (!receipt) {
      throw new Error(`Transaction receipt for hash ${input.txHash} not found on-chain`);
    }

    if (receipt.status !== 1) {
      throw new Error(`Asset redemption transaction reverted on-chain`);
    }

    const protocolAddress = this.artifact.pawnProtocol;
    const tokenId = this.resolveAssetIdToTokenId(input.assetId);

    const logs = receipt.logs || [];
    const iface = new ethers.Interface([
      'event PhysicalCustodyHandoverPending(uint256 indexed assetId, address indexed target)'
    ]);

    let verified = false;
    for (const log of logs) {
      if (log.address.toLowerCase() === protocolAddress.toLowerCase()) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === 'PhysicalCustodyHandoverPending') {
            const logTokenId = parsed.args[0].toString();
            const logTarget = parsed.args[1].toLowerCase();

            if (
              logTokenId === tokenId.toString() &&
              logTarget === input.redeemerWallet.toLowerCase()
            ) {
              verified = verified || true;
              break;
            }
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (!verified) {
      throw new Error(
        `No matching PhysicalCustodyHandoverPending event found for asset ${input.assetId} (token ID ${tokenId})`
      );
    }
  }
}
