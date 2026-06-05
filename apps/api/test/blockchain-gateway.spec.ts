const mockGetTransactionReceipt = jest.fn();
const mockUpdateAppraisal = jest.fn();

jest.mock('ethers', () => {
  const actual = jest.requireActual('ethers');
  const mockExports: any = {
    Interface: actual.Interface,
    parseEther: actual.parseEther,
    AbiCoder: actual.AbiCoder,
    JsonRpcProvider: jest.fn().mockImplementation(() => ({
      getTransactionReceipt: mockGetTransactionReceipt
    })),
    Wallet: jest.fn().mockImplementation(() => ({
      address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      signTransaction: jest.fn().mockResolvedValue('0xsignedtx')
    })),
    Contract: jest.fn().mockImplementation(() => ({
      updateAppraisal: mockUpdateAppraisal
    })),
    ethers: null
  };
  mockExports.ethers = mockExports;
  return mockExports;
});

import { Test } from '@nestjs/testing';
import { AnvilBlockchainGateway } from '../src/infrastructure/adapters/anvil-blockchain.gateway';
import { MockBlockchainGateway } from '../src/infrastructure/adapters/mock-external.adapters';
import { BlockchainConfigController } from '../src/interfaces/http/pawn.controllers';
import { BLOCKCHAIN_GATEWAY } from '../src/common/tokens';
import * as fs from 'fs';
import { ethers } from 'ethers';

describe('BlockchainGateway Integration and Mock tests', () => {
  describe('MockBlockchainGateway', () => {
    it('should return mock mode configuration and not loaded status', () => {
      const gateway = new MockBlockchainGateway();
      const config = gateway.getBlockchainConfig();
      expect(config.mode).toBe('mock');
      expect(config.isDeploymentArtifactLoaded).toBe(false);
      expect(config.pawnProtocolAddress).toBeUndefined();
    });

    it('should return healthy: true for health check', async () => {
      const gateway = new MockBlockchainGateway();
      const health = await gateway.checkHealth();
      expect(health).toEqual({ healthy: true });
    });
  });

  describe('AnvilBlockchainGateway - Missing Artifact', () => {
    let existsSpy: jest.SpyInstance;

    beforeEach(() => {
      existsSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    });

    afterEach(() => {
      existsSpy.mockRestore();
    });

    it('should report artifact as not loaded in config', () => {
      const gateway = new AnvilBlockchainGateway();
      const config = gateway.getBlockchainConfig();
      expect(config.mode).toBe('anvil');
      expect(config.isDeploymentArtifactLoaded).toBe(false);
      expect(config.pawnProtocolAddress).toBeUndefined();
    });

    it('should return healthy: false for health check if artifact is missing', async () => {
      const gateway = new AnvilBlockchainGateway();
      const health = await gateway.checkHealth();
      expect(health.healthy).toBe(false);
      expect(health.reason).toBe('Anvil deployment artifact is missing');
    });

    it('should throw error on prepareLoanDisbursement if artifact is missing', async () => {
      const gateway = new AnvilBlockchainGateway();
      await expect(
        gateway.prepareLoanDisbursement({
          assetId: '1',
          borrowerWallet: '0x123',
          principal: 100,
          durationDays: 30,
        })
      ).rejects.toThrow('Anvil deployment artifact is missing');
    });

    it('should throw error on recordRepayment if artifact is missing', async () => {
      const gateway = new AnvilBlockchainGateway();
      await expect(
        gateway.recordRepayment({
          loanId: '1',
          amount: 100,
          txHash: '0xabc',
          assetId: '1',
          borrowerWallet: '0x123'
        })
      ).rejects.toThrow('Anvil deployment artifact is missing');
    });
  });

  describe('AnvilBlockchainGateway - Loading if Fixture Exists', () => {
    let existsSpy: jest.SpyInstance;
    let readSpy: jest.SpyInstance;

    const mockArtifact = {
      chainId: 31337,
      pawnProtocol: '0x1111111111111111111111111111111111111111',
      paymentToken: '0x2222222222222222222222222222222222222222',
      assetToken: '0x3333333333333333333333333333333333333333',
      fractionToken: '0x4444444444444444444444444444444444444444',
      abiPath: 'out/PawnProtocol.json',
    };

    beforeEach(() => {
      existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation((path: fs.PathLike) => {
        if (typeof path === 'string' && path.endsWith('local-anvil.json')) {
          return true;
        }
        return false;
      });
      readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        if (typeof path === 'string' && path.endsWith('local-anvil.json')) {
          return JSON.stringify(mockArtifact);
        }
        throw new Error('File not found');
      });
    });

    afterEach(() => {
      existsSpy.mockRestore();
      readSpy.mockRestore();
    });

    it('should successfully load the mock artifact and expose metadata', () => {
      const gateway = new AnvilBlockchainGateway();
      const config = gateway.getBlockchainConfig();
      expect(config.mode).toBe('anvil');
      expect(config.isDeploymentArtifactLoaded).toBe(true);
      expect(config.chainId).toBe(31337);
      expect(config.pawnProtocolAddress).toBe(mockArtifact.pawnProtocol);
      expect(config.paymentTokenAddress).toBe(mockArtifact.paymentToken);
      expect(config.assetTokenAddress).toBe(mockArtifact.assetToken);
      expect(config.fractionTokenAddress).toBe(mockArtifact.fractionToken);
    });
  });

  describe('AnvilBlockchainGateway - On-Chain Operations', () => {
    let existsSpy: jest.SpyInstance;
    let readSpy: jest.SpyInstance;

    const mockArtifact = {
      chainId: 31337,
      pawnProtocol: '0x1111111111111111111111111111111111111111',
      paymentToken: '0x2222222222222222222222222222222222222222',
      assetToken: '0x3333333333333333333333333333333333333333',
      fractionToken: '0x4444444444444444444444444444444444444444',
      abiPath: 'out/PawnProtocol.json',
      tokenIdMap: {
        'A-1001': 1
      }
    };

    beforeEach(() => {
      existsSpy = jest.spyOn(fs, 'existsSync').mockImplementation((path: fs.PathLike) => {
        if (typeof path === 'string' && path.endsWith('local-anvil.json')) {
          return true;
        }
        return false;
      });
      readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        if (typeof path === 'string' && path.endsWith('local-anvil.json')) {
          return JSON.stringify(mockArtifact);
        }
        throw new Error('File not found');
      });
      mockGetTransactionReceipt.mockReset();
      mockUpdateAppraisal.mockReset();
    });

    afterEach(() => {
      existsSpy.mockRestore();
      readSpy.mockRestore();
    });

    it('should successfully prepare loan disbursement actions', async () => {
      const gateway = new AnvilBlockchainGateway();
      const res = await gateway.prepareLoanDisbursement({
        assetId: 'A-1001',
        borrowerWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        principal: 500,
        durationDays: 30
      });
      expect(res.status).toBe('AWAITING_WALLET_EXECUTION');
      expect(res.actions).toBeDefined();
      expect(res.actions!.length).toBe(2);
      expect(res.actions![0].to).toBe(mockArtifact.assetToken);
      expect(res.actions![1].to).toBe(mockArtifact.pawnProtocol);
    });

    it('should reject a repayment transaction receipt that has no matching logs', async () => {
      mockGetTransactionReceipt.mockResolvedValue({
        status: 1,
        logs: [
          {
            address: '0x5555555555555555555555555555555555555555',
            topics: [],
            data: '0x',
          },
        ],
      });

      const gateway = new AnvilBlockchainGateway();
      await expect(
        gateway.recordRepayment({
          loanId: 'loan-1',
          amount: 500,
          txHash: '0xsomehash',
          assetId: 'A-1001',
          borrowerWallet: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'
        })
      ).rejects.toThrow('No matching LoanRepaid event found');
    });

    it('should verify recordRepayment successfully with matching logs', async () => {
      const iface = new ethers.Interface([
        'event LoanRepaid(uint256 indexed assetId, address borrower, uint256 totalRepaid)'
      ]);
      const logData = iface.encodeEventLog('LoanRepaid', [
        1,
        '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
        ethers.parseEther('500')
      ]);

      mockGetTransactionReceipt.mockResolvedValue({
        status: 1,
        logs: [
          {
            address: mockArtifact.pawnProtocol,
            topics: logData.topics,
            data: logData.data,
          },
        ],
      });

      const gateway = new AnvilBlockchainGateway();
      await expect(
        gateway.recordRepayment({
          loanId: 'loan-1',
          amount: 500,
          txHash: '0xsomehash',
          assetId: 'A-1001',
          borrowerWallet: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'
        })
      ).resolves.toBeUndefined();
    });

    it('should updateAppraisal successfully on-chain', async () => {
      const iface = new ethers.Interface([
        'event AppraisalUpdated(uint256 indexed assetId, uint256 newValue, uint256 timestamp, uint256 adminLTV, uint256 interestRateBps)'
      ]);
      const logData = iface.encodeEventLog('AppraisalUpdated', [
        1,
        ethers.parseEther('1000'),
        Math.floor(Date.now() / 1000),
        6000,
        500
      ]);

      // Mock fetch for rawRpc calls: nonce, chainId, sendRawTransaction, getTransactionReceipt
      const mockFetch = jest.fn().mockImplementation((_url: string, opts: any) => {
        const body = JSON.parse(opts.body);
        let result: any;
        if (body.method === 'eth_getTransactionCount') result = '0x5';
        else if (body.method === 'eth_chainId') result = '0x7a69';
        else if (body.method === 'eth_sendRawTransaction') result = '0xappraisalHash';
        else if (body.method === 'eth_getTransactionReceipt') {
          result = {
            blockNumber: '0x1',
            status: '0x1',
            logs: [
              {
                address: mockArtifact.pawnProtocol,
                topics: logData.topics,
                data: logData.data,
              },
            ],
          };
        } else result = null;
        return Promise.resolve({
          json: () => Promise.resolve({ jsonrpc: '2.0', id: 1, result }),
        });
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as any;

      try {
        const gateway = new AnvilBlockchainGateway();
        const res = await gateway.updateAppraisal({
          assetId: 'A-1001',
          estimatedValue: 1000,
          ltvBps: 6000,
          interestAprBps: 500
        });
        expect(res.txHash).toBe('0xappraisalHash');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should verify loan creation successfully', async () => {
      const iface = new ethers.Interface([
        'event LoanCreated(uint256 indexed assetId, address borrower, uint256 amount, uint256 duration)'
      ]);
      const logData = iface.encodeEventLog('LoanCreated', [
        1,
        '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
        ethers.parseEther('500'),
        30
      ]);

      mockGetTransactionReceipt.mockResolvedValue({
        status: 1,
        logs: [
          {
            address: mockArtifact.pawnProtocol,
            topics: logData.topics,
            data: logData.data,
          },
        ],
      });

      const gateway = new AnvilBlockchainGateway();
      await expect(
        gateway.verifyLoanCreated(
          '0xloanCreatedHash',
          'A-1001',
          '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          500
        )
      ).resolves.toBeUndefined();
    });

    it('should successfully prepare create listing actions', async () => {
      const gateway = new AnvilBlockchainGateway();
      const res = await gateway.prepareCreateListing({
        assetId: 'A-1001',
        sellerWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        price: 1000,
        isConsigned: true
      });
      expect(res.status).toBe('AWAITING_WALLET_EXECUTION');
      expect(res.actions).toBeDefined();
      expect(res.actions!.length).toBe(2);
      expect(res.actions![0].to).toBe(mockArtifact.assetToken);
      expect(res.actions![1].to).toBe(mockArtifact.pawnProtocol);
    });

    it('should verify listing creation successfully', async () => {
      const iface = new ethers.Interface([
        'event ItemConsigned(uint256 indexed assetId, address seller, uint256 price)'
      ]);
      const logData = iface.encodeEventLog('ItemConsigned', [
        1,
        '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
        ethers.parseEther('1000')
      ]);

      mockGetTransactionReceipt.mockResolvedValue({
        status: 1,
        logs: [
          {
            address: mockArtifact.pawnProtocol,
            topics: logData.topics,
            data: logData.data,
          },
        ],
      });

      const gateway = new AnvilBlockchainGateway();
      await expect(
        gateway.verifyListingCreated(
          '0xlistingCreatedHash',
          'A-1001',
          '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          1000
        )
      ).resolves.toBeUndefined();
    });

    it('should successfully prepare start layaway actions', async () => {
      const gateway = new AnvilBlockchainGateway();
      const res = await gateway.prepareStartLayaway({
        assetId: 'A-1001',
        buyerWallet: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
        downPayment: 200,
        monthsDuration: 6
      });
      expect(res.status).toBe('AWAITING_WALLET_EXECUTION');
      expect(res.actions).toBeDefined();
      expect(res.actions!.length).toBe(2);
      expect(res.actions![0].to).toBe(mockArtifact.paymentToken);
      expect(res.actions![1].to).toBe(mockArtifact.pawnProtocol);
    });

    it('should verify layaway creation successfully', async () => {
      const iface = new ethers.Interface([
        'event LayawayStarted(uint256 indexed assetId, address buyer, uint256 initialPayment)'
      ]);
      const logData = iface.encodeEventLog('LayawayStarted', [
        1,
        '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
        ethers.parseEther('200')
      ]);

      mockGetTransactionReceipt.mockResolvedValue({
        status: 1,
        logs: [
          {
            address: mockArtifact.pawnProtocol,
            topics: logData.topics,
            data: logData.data,
          },
        ],
      });

      const gateway = new AnvilBlockchainGateway();
      await expect(
        gateway.verifyLayawayStarted(
          '0xlayawayStartedHash',
          'A-1001',
          '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
          200
        )
      ).resolves.toBeUndefined();
    });
  });

  describe('AnvilBlockchainGateway - payLayaway installment', () => {
    let existsSpy: jest.SpyInstance;

    beforeEach(() => {
      const mockArtifactData = {
        pawnProtocol: '0x1111111111111111111111111111111111111111',
        paymentToken: '0x2222222222222222222222222222222222222222',
        assetToken: '0x3333333333333333333333333333333333333333',
        fractionToken: '0x4444444444444444444444444444444444444444',
        tokenIdMap: JSON.stringify({ 'A-1001': 1, 'A-1002': 2, 'A-1003': 3, 'A-1004': 4, 'A-1005': 5 }),
        chainId: 31337
      };
      existsSpy = jest.spyOn(require('fs'), 'existsSync').mockReturnValue(true);
      jest.spyOn(require('fs'), 'readFileSync').mockReturnValue(JSON.stringify(mockArtifactData));
    });

    afterEach(() => {
      existsSpy.mockRestore();
    });

    it('should return 2 actions for preparePayLayawayInstallment', async () => {
      const gateway = new AnvilBlockchainGateway();
      const installmentWei = ethers.parseEther('133');
      const res = await gateway.preparePayLayawayInstallment({
        assetId: 'A-1001',
        buyerWallet: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
        installmentAmount: installmentWei
      });
      expect(res.status).toBe('AWAITING_WALLET_EXECUTION');
      expect(res.actions).toHaveLength(2);
      // action[0]: ERC20 approve → paymentToken
      expect(res.actions![0].to).toBe('0x2222222222222222222222222222222222222222');
      // action[1]: payInstallment → pawnProtocol
      expect(res.actions![1].to).toBe('0x1111111111111111111111111111111111111111');
    });

    it('should reject installment tx with no matching LayawayInstallmentPaid event', async () => {
      mockGetTransactionReceipt.mockResolvedValue({
        status: 1,
        logs: [
          {
            address: '0x5555555555555555555555555555555555555555',
            topics: [],
            data: '0x'
          }
        ]
      });

      const gateway = new AnvilBlockchainGateway();
      await expect(
        gateway.verifyLayawayInstallmentPaid({
          txHash: '0xunrelatedHash',
          assetId: 'A-1001',
          buyerWallet: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
          installmentAmount: ethers.parseEther('133'),
          isFinal: false
        })
      ).rejects.toThrow('No matching LayawayInstallmentPaid event found');
    });

    it('should accept matching LayawayInstallmentPaid event for non-final payment', async () => {
      const iface = new ethers.Interface([
        'event LayawayInstallmentPaid(uint256 indexed assetId, uint256 amount)'
      ]);
      const installmentWei = ethers.parseEther('133');
      const logData = iface.encodeEventLog('LayawayInstallmentPaid', [1, installmentWei]);

      mockGetTransactionReceipt.mockResolvedValue({
        status: 1,
        logs: [
          {
            address: '0x1111111111111111111111111111111111111111',
            topics: logData.topics,
            data: logData.data
          }
        ]
      });

      const gateway = new AnvilBlockchainGateway();
      await expect(
        gateway.verifyLayawayInstallmentPaid({
          txHash: '0xinstallmentHash',
          assetId: 'A-1001',
          buyerWallet: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
          installmentAmount: installmentWei,
          isFinal: false
        })
      ).resolves.toBeUndefined();
    });

    it('should accept matching LayawayInstallmentPaid + LayawayCompleted for final payment', async () => {
      const installmentIface = new ethers.Interface([
        'event LayawayInstallmentPaid(uint256 indexed assetId, uint256 amount)'
      ]);
      const completedIface = new ethers.Interface([
        'event LayawayCompleted(uint256 indexed assetId, address buyer)'
      ]);
      const installmentWei = ethers.parseEther('130');
      const buyerAddr = '0x90f79bf6eb2c4f870365e785982e1f101e93b906';

      const installmentLog = installmentIface.encodeEventLog('LayawayInstallmentPaid', [1, installmentWei]);
      const completedLog = completedIface.encodeEventLog('LayawayCompleted', [1, buyerAddr]);

      mockGetTransactionReceipt.mockResolvedValue({
        status: 1,
        logs: [
          {
            address: '0x1111111111111111111111111111111111111111',
            topics: installmentLog.topics,
            data: installmentLog.data
          },
          {
            address: '0x1111111111111111111111111111111111111111',
            topics: completedLog.topics,
            data: completedLog.data
          }
        ]
      });

      const gateway = new AnvilBlockchainGateway();
      await expect(
        gateway.verifyLayawayInstallmentPaid({
          txHash: '0xfinalHash',
          assetId: 'A-1001',
          buyerWallet: buyerAddr,
          installmentAmount: installmentWei,
          isFinal: true
        })
      ).resolves.toBeUndefined();
    });
  });

  describe('BlockchainConfigController', () => {
    let controller: BlockchainConfigController;

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [BlockchainConfigController],
        providers: [
          {
            provide: BLOCKCHAIN_GATEWAY,
            useValue: {
              getBlockchainConfig: () => ({
                mode: 'mock',
                isDeploymentArtifactLoaded: false,
              }),
              checkHealth: async () => ({
                healthy: true,
              }),
            },
          },
        ],
      }).compile();

      controller = moduleRef.get<BlockchainConfigController>(BlockchainConfigController);
    });

    it('getConfig should return config', () => {
      const config = controller.getConfig();
      expect(config.mode).toBe('mock');
      expect(config.isDeploymentArtifactLoaded).toBe(false);
    });

    it('getHealth should return health status', async () => {
      const health = await controller.getHealth();
      expect(health).toEqual({
        mode: 'mock',
        healthy: true,
      });
    });
  });
});
