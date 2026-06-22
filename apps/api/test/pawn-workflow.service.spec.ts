import { Test } from '@nestjs/testing';
import { ethers } from 'ethers';
import {
  BLOCKCHAIN_GATEWAY,
  KYC_PROVIDER,
  LOGISTICS_PROVIDER,
  PAWN_REPOSITORY,
  PRICE_ORACLE,
  STORAGE_PROVIDER
} from '../src/common/tokens';
import { PawnWorkflowService } from '../src/application/services/pawn-workflow.service';
import { InMemoryPawnRepository } from '../src/infrastructure/persistence/repositories/in-memory-pawn.repository';
import {
  MockBlockchainGateway,
  MockKycProvider,
  MockLogisticsProvider,
  MockPriceOracle,
  MockStorageProvider
} from '../src/infrastructure/adapters/mock-external.adapters';
import { AssetStatus } from '../src/domain/enums';

describe('PawnWorkflowService', () => {
  let service: PawnWorkflowService;
  let repository: InMemoryPawnRepository;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PawnWorkflowService,
        { provide: PAWN_REPOSITORY, useClass: InMemoryPawnRepository },
        { provide: KYC_PROVIDER, useClass: MockKycProvider },
        { provide: LOGISTICS_PROVIDER, useClass: MockLogisticsProvider },
        { provide: PRICE_ORACLE, useClass: MockPriceOracle },
        { provide: STORAGE_PROVIDER, useClass: MockStorageProvider },
        { provide: BLOCKCHAIN_GATEWAY, useClass: MockBlockchainGateway }
      ]
    }).compile();

    service = moduleRef.get(PawnWorkflowService);
    repository = moduleRef.get<InMemoryPawnRepository>(PAWN_REPOSITORY);
  });

  it('creates an asset and records it in the dashboard', async () => {
    const asset = await service.createAsset({
      ownerId: 'user-1',
      title: 'Gold ring',
      category: 'gold',
      description: '18K ring with receipt',
      declaredValue: 500
    });

    const dashboard = await service.dashboard();
    expect(dashboard.assets).toContainEqual(asset);
    expect(dashboard.auditEvents[0].action).toBe('ASSET_SUBMITTED');
  });

  describe('createListing', () => {
    it('succeeds for a valid RECEIVED asset and updates status to LISTED', async () => {
      // A-1004 has status RECEIVED by default
      const listing = await service.createListing({
        assetId: 'A-1004',
        sellerId: 'customer-1',
        price: 1500,
        isProtocolOwned: false
      });

      expect(listing).toBeDefined();
      expect(listing.status).toBe('ACTIVE');

      const dashboard = await service.dashboard();
      const updatedAsset = dashboard.assets.find(a => a.id === 'A-1004');
      expect(updatedAsset?.status).toBe('LISTED');
    });

    it('succeeds for a valid RETURNED asset and updates status to LISTED', async () => {
      const asset = await repository.findAsset('A-1004');
      expect(asset).toBeDefined();
      asset!.status = AssetStatus.Returned;
      await repository.saveAsset(asset!);

      const listing = await service.createListing({
        assetId: 'A-1004',
        sellerId: 'customer-1',
        price: 1500,
        isProtocolOwned: false
      });

      expect(listing).toBeDefined();
      expect(listing.status).toBe('ACTIVE');

      const dashboard = await service.dashboard();
      const updatedAsset = dashboard.assets.find(a => a.id === 'A-1004');
      expect(updatedAsset?.status).toBe('LISTED');
    });

    it('rejects nonexistent asset', async () => {
      await expect(
        service.createListing({
          assetId: 'NONEXISTENT',
          sellerId: 'customer-1',
          price: 1000,
          isProtocolOwned: false
        })
      ).rejects.toThrow('Asset not found');
    });

    it('rejects duplicate active listing', async () => {
      // A-1004 has status RECEIVED by default. First creation succeeds and updates status to LISTED.
      await service.createListing({
        assetId: 'A-1004',
        sellerId: 'customer-1',
        price: 1500,
        isProtocolOwned: false
      });

      // Second creation fails due to duplicate active listing
      await expect(
        service.createListing({
          assetId: 'A-1004',
          sellerId: 'customer-1',
          price: 1600,
          isProtocolOwned: false
        })
      ).rejects.toThrow('Active listing already exists for this asset');
    });

    it('rejects invalid asset state such as UNDER_APPRAISAL or LOAN_ACTIVE', async () => {
      // Explicitly set asset status to guarantee test conditions in both mock and Anvil modes
      const asset1 = await repository.findAsset('A-1001');
      if (asset1) {
        asset1.status = AssetStatus.UnderAppraisal;
        await repository.saveAsset(asset1);
      }
      const asset2 = await repository.findAsset('A-1002');
      if (asset2) {
        asset2.status = AssetStatus.LoanActive;
        await repository.saveAsset(asset2);
      }

      // A-1001 is UNDER_APPRAISAL
      await expect(
        service.createListing({
          assetId: 'A-1001',
          sellerId: 'customer-1',
          price: 1000,
          isProtocolOwned: false
        })
      ).rejects.toThrow('Customer listing requires asset status to be RECEIVED or RETURNED');

      // A-1002 is LOAN_ACTIVE
      await expect(
        service.createListing({
          assetId: 'A-1002',
          sellerId: 'customer-1',
          price: 1000,
          isProtocolOwned: false
        })
      ).rejects.toThrow('Customer listing requires asset status to be RECEIVED or RETURNED');
    });

    it('rejects listing creation if seller does not own the asset', async () => {
      // A-1004 is owned by customer-1, customer-2 cannot list it
      await expect(
        service.createListing({
          assetId: 'A-1004',
          sellerId: 'customer-2',
          price: 1500,
          isProtocolOwned: false
        })
      ).rejects.toThrow('Seller must own the asset');
    });

    it('rejects protocol-owned listing creation from customer account sellerId', async () => {
      const asset = await repository.findAsset('A-1004');
      expect(asset).toBeDefined();
      asset!.status = AssetStatus.Listed;
      await repository.saveAsset(asset!);

      await expect(
        service.createListing({
          assetId: 'A-1004',
          sellerId: 'customer-1',
          price: 2000,
          isProtocolOwned: true
        })
      ).rejects.toThrow('Only admin or system can create protocol-owned listings');
    });
  });

  describe('createLayaway', () => {
    let activeListingId: string;

    beforeEach(async () => {
      // Create a valid active listing for testing
      const listing = await service.createListing({
        assetId: 'A-1004',
        sellerId: 'customer-1',
        price: 1000,
        isProtocolOwned: false
      });
      activeListingId = (listing as any).id;
    });

    it('rejects layaway if listing is not active', async () => {
      const listing = await repository.findListing(activeListingId);
      listing!.status = 'CANCELLED' as any;
      await repository.saveListing(listing!);

      await expect(
        service.createLayaway({
          listingId: activeListingId,
          buyerId: 'customer-2',
          downPayment: 200,
          monthsDuration: 6
        })
      ).rejects.toThrow('Listing is not active');
    });

    it('rejects layaway if buyer is the seller', async () => {
      await expect(
        service.createLayaway({
          listingId: activeListingId,
          buyerId: 'customer-1', // owner of asset A-1004 is customer-1
          downPayment: 200,
          monthsDuration: 6
        })
      ).rejects.toThrow('Seller cannot buy their own listing');
    });

    it('rejects layaway if duration is not 3, 6, 9, or 12', async () => {
      await expect(
        service.createLayaway({
          listingId: activeListingId,
          buyerId: 'customer-2',
          downPayment: 200,
          monthsDuration: 5 // invalid duration
        })
      ).rejects.toThrow('Invalid duration');
    });

    it('rejects layaway if down payment is less than 20%', async () => {
      await expect(
        service.createLayaway({
          listingId: activeListingId,
          buyerId: 'customer-2',
          downPayment: 199, // < 200 (20%)
          monthsDuration: 6
        })
      ).rejects.toThrow('Down payment must be at least 20%');
    });

    it('rejects layaway if down payment is equal to or greater than listing price', async () => {
      await expect(
        service.createLayaway({
          listingId: activeListingId,
          buyerId: 'customer-2',
          downPayment: 1000, // >= 1000
          monthsDuration: 6
        })
      ).rejects.toThrow('Down payment must be less than the listing price');
    });

    it('rejects layaway if an active layaway already exists for the listing', async () => {
      // First one succeeds
      await service.createLayaway({
        listingId: activeListingId,
        buyerId: 'customer-2',
        downPayment: 200,
        monthsDuration: 6
      });

      // Reset listing to Active so we can try starting another layaway (simulating concurrency or bypasses)
      const listing = await repository.findListing(activeListingId);
      listing!.status = 'ACTIVE' as any;
      await repository.saveListing(listing!);

      // Second one fails
      await expect(
        service.createLayaway({
          listingId: activeListingId,
          buyerId: 'customer-2',
          downPayment: 250,
          monthsDuration: 6
        })
      ).rejects.toThrow('Active layaway already exists for this listing');
    });

    it('successfully creates layaway and sets listing status to RESERVED', async () => {
      const layaway = await service.createLayaway({
        listingId: activeListingId,
        buyerId: 'customer-2',
        downPayment: 200,
        monthsDuration: 6
      });

      expect(layaway).toBeDefined();
      expect((layaway as any).status).toBe('ACTIVE');

      const listing = await repository.findListing(activeListingId);
      expect(listing?.status).toBe('RESERVED');
    });

    it('saves monthsDuration and installmentAmount on createLayaway', async () => {
      const layaway = await service.createLayaway({
        listingId: activeListingId,
        buyerId: 'customer-2',
        downPayment: 200,
        monthsDuration: 6
      });

      const l = layaway as any;
      expect(l.monthsDuration).toBe(6);
      // installmentAmount = Math.floor((1000 - 200) / 6) = Math.floor(133.33) = 133
      expect(l.installmentAmount).toBe(133);
    });

    describe('DTO and Service validations', () => {
      it('rejects layaway if duration is not 3, 6, 9, or 12', async () => {
        for (const duration of [0, 1, 2, 5, 13]) {
          await expect(
            service.createLayaway({
              listingId: activeListingId,
              buyerId: 'customer-2',
              downPayment: 200,
              monthsDuration: duration
            })
          ).rejects.toThrow('Invalid duration: only 3, 6, 9, or 12 months allowed');
        }
      });

      it('rejects layaway if down payment is zero or negative', async () => {
        for (const payment of [0, -10, -0.5]) {
          await expect(
            service.createLayaway({
              listingId: activeListingId,
              buyerId: 'customer-2',
              downPayment: payment,
              monthsDuration: 6
            })
          ).rejects.toThrow('Down payment must be positive');
        }
      });

      it('rejects layaway if down payment is equal to or greater than listing price', async () => {
        await expect(
          service.createLayaway({
            listingId: activeListingId,
            buyerId: 'customer-2',
            downPayment: 1000,
            monthsDuration: 6
          })
        ).rejects.toThrow('Down payment must be less than the listing price');

        await expect(
          service.createLayaway({
            listingId: activeListingId,
            buyerId: 'customer-2',
            downPayment: 1500,
            monthsDuration: 6
          })
        ).rejects.toThrow('Down payment must be less than the listing price');
      });

      // Class validator tests
      const { validate } = require('class-validator');
      const { CreateLayawayDto } = require('../src/application/dto/pawn.dto');

      it('class-validator CreateLayawayDto rejects invalid monthsDuration', async () => {
        const dto = new CreateLayawayDto();
        dto.listingId = 'listing-1';
        dto.buyerId = 'buyer-1';
        dto.downPayment = 200;

        for (const duration of [0, 1, 2, 5, 13]) {
          dto.monthsDuration = duration;
          const errors = await validate(dto);
          expect(errors.length).toBeGreaterThan(0);
          const err = errors.find((e: any) => e.property === 'monthsDuration');
          expect(err).toBeDefined();
        }
      });

      it('class-validator CreateLayawayDto accepts valid monthsDuration', async () => {
        const dto = new CreateLayawayDto();
        dto.listingId = 'listing-1';
        dto.buyerId = 'buyer-1';
        dto.downPayment = 200;

        for (const duration of [3, 6, 9, 12]) {
          dto.monthsDuration = duration;
          const errors = await validate(dto);
          const err = errors.find((e: any) => e.property === 'monthsDuration');
          expect(err).toBeUndefined();
        }
      });

      it('class-validator CreateLayawayDto rejects negative or zero downPayment', async () => {
        const dto = new CreateLayawayDto();
        dto.listingId = 'listing-1';
        dto.buyerId = 'buyer-1';
        dto.monthsDuration = 6;

        for (const payment of [0, -10]) {
          dto.downPayment = payment;
          const errors = await validate(dto);
          expect(errors.length).toBeGreaterThan(0);
          const err = errors.find((e: any) => e.property === 'downPayment');
          expect(err).toBeDefined();
        }
      });
    });
  });

  describe('payLayaway', () => {
    let layawayId: string;

    beforeEach(async () => {
      const listing = await service.createListing({
        assetId: 'A-1004',
        sellerId: 'customer-1',
        price: 1000,
        isProtocolOwned: false
      });
      const listingId = (listing as any).id;

      const layaway = await service.createLayaway({
        listingId,
        buyerId: 'customer-2',
        downPayment: 200,
        monthsDuration: 6
      });
      layawayId = (layaway as any).id;
    });

    it('mock mode: pays installment and updates amountPaid', async () => {
      const result = await service.payLayaway(layawayId, { amount: 133 });
      const l = result as any;
      // amountPaid = 200 (down) + 133 (installment) = 333
      expect(l.amountPaid).toBe(333);
      expect(l.status).toBe('ACTIVE');
    });

    it('mock mode: final payment sets COMPLETED and listing SOLD and asset RETURNING', async () => {
      // Pay enough to bring amountPaid to totalPrice (1000)
      // Current: 200 paid. Remaining: 800. Pay 800 directly.
      const result = await service.payLayaway(layawayId, { amount: 800 });
      const l = result as any;
      expect(l.status).toBe('COMPLETED');

      const layaway = await repository.findLayaway(layawayId);
      expect(layaway?.status).toBe('COMPLETED' as any);

      // Listing should be SOLD
      const listing = await repository.findListing(layaway!.listingId);
      expect(listing?.status).toBe('SOLD' as any);
    });

    it('anvil mode without txHash returns AWAITING_WALLET_EXECUTION with 2 actions', async () => {
      // Override gateway to report anvil mode
      const anvilGateway = {
        getBlockchainConfig: () => ({ mode: 'anvil', isDeploymentArtifactLoaded: true }),
        preparePayLayawayInstallment: jest.fn().mockResolvedValue({
          status: 'AWAITING_WALLET_EXECUTION',
          actions: [
            { to: '0xToken', calldata: '0xApprove', description: 'Approve' },
            { to: '0xProtocol', calldata: '0xPay', description: 'PayInstallment' }
          ]
        }),
        verifyLayawayInstallmentPaid: jest.fn().mockResolvedValue(undefined)
      } as any;

      // Set wallet for customer-2
      await repository.saveWallet({
        id: 'wallet-c2-test',
        userId: 'customer-2',
        address: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
        chainId: 31337,
        verifiedAt: new Date()
      });

      (service as any).blockchainGateway = anvilGateway;

      const result = await service.payLayaway(layawayId, { amount: 133 });
      expect((result as any).status).toBe('AWAITING_WALLET_EXECUTION');
      expect((result as any).actions).toHaveLength(2);
      expect(anvilGateway.preparePayLayawayInstallment).toHaveBeenCalled();
    });

    it('anvil mode with txHash verifies event and updates amountPaid', async () => {
      const mockVerify = jest.fn().mockResolvedValue(undefined);
      const anvilGateway = {
        getBlockchainConfig: () => ({ mode: 'anvil', isDeploymentArtifactLoaded: true }),
        preparePayLayawayInstallment: jest.fn(),
        verifyLayawayInstallmentPaid: mockVerify
      } as any;

      await repository.saveWallet({
        id: 'wallet-c2-test2',
        userId: 'customer-2',
        address: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
        chainId: 31337,
        verifiedAt: new Date()
      });

      (service as any).blockchainGateway = anvilGateway;

      const result = await service.payLayaway(layawayId, {
        amount: 133,
        txHash: '0xinstallmenthash'
      });

      const l = result as any;
      expect(mockVerify).toHaveBeenCalled();
      // amountPaid should have increased
      expect(l.amountPaid).toBeGreaterThan(200);
      expect(l.lastPaymentTxHash).toBe('0xinstallmenthash');
    });

    it('anvil mode final installment sets COMPLETED, listing SOLD, asset RETURNING', async () => {
      const mockVerify = jest.fn().mockResolvedValue(undefined);
      const anvilGateway = {
        getBlockchainConfig: () => ({ mode: 'anvil', isDeploymentArtifactLoaded: true }),
        preparePayLayawayInstallment: jest.fn(),
        verifyLayawayInstallmentPaid: mockVerify
      } as any;

      await repository.saveWallet({
        id: 'wallet-c2-test3',
        userId: 'customer-2',
        address: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
        chainId: 31337,
        verifiedAt: new Date()
      });

      (service as any).blockchainGateway = anvilGateway;

      // Manually set amountPaid close to total so one installment completes it
      const layaway = await repository.findLayaway(layawayId);
      layaway!.amountPaid = 870; // 1000 - 130 remaining (< 133 installment, so isFinal)
      layaway!.amountPaidWei = ethers.parseEther('870').toString();
      await repository.saveLayaway(layaway!);

      const result = await service.payLayaway(layawayId, {
        amount: 130,
        txHash: '0xfinalhash'
      });

      const l = result as any;
      expect(l.status).toBe('COMPLETED');
      expect(l.completedTxHash).toBe('0xfinalhash');

      // Listing should be SOLD
      const listing = await repository.findListing(layaway!.listingId);
      expect(listing?.status).toBe('SOLD' as any);

      // Asset should be RETURNING and owned by buyer
      const listing2 = await repository.findListing(layaway!.listingId);
      const asset = await repository.findAsset(listing2!.assetId);
      expect(asset?.ownerId).toBe('customer-2');
      expect(asset?.status).toBe('RETURNING' as any);
    });

    it('calculates installments exactly for a 1000 USDC listing, 200 down payment, 6 installments', async () => {
      // Setup gateway in anvil mode to capture prepare metadata
      const mockGateway = {
        getBlockchainConfig: () => ({ mode: 'anvil', isDeploymentArtifactLoaded: true }),
        preparePayLayawayInstallment: jest.fn().mockImplementation(async (input) => {
          return {
            status: 'AWAITING_WALLET_EXECUTION',
            actions: []
          };
        }),
        verifyLayawayInstallmentPaid: jest.fn().mockResolvedValue(undefined)
      } as any;
      const oldGateway = (service as any).blockchainGateway;
      (service as any).blockchainGateway = mockGateway;

      await repository.saveWallet({
        id: 'wallet-c2-precision',
        userId: 'customer-2',
        address: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
        chainId: 31337,
        verifiedAt: new Date()
      });

      // We will perform 6 payments:
      // Installments 1-5: expected 133.333333333333333333 Wei (133333333333333333333 Wei)
      // Installment 6: expected 133.333333333333333335 Wei (133333333333333333335 Wei)

      const expectedAmounts = [
        '133333333333333333333',
        '133333333333333333333',
        '133333333333333333333',
        '133333333333333333333',
        '133333333333333333333',
        '133333333333333333335'
      ];

      for (let i = 0; i < 6; i++) {
        // Step 1: Prepare (without txHash) to verify the returned metadata
        const prepResult = await service.payLayaway(layawayId, {});
        expect(prepResult).toHaveProperty('nextInstallmentAmountWei');
        const prep = prepResult as { nextInstallmentAmountWei: string; nextInstallmentAmountDisplay: string };
        expect(prep.nextInstallmentAmountWei).toBe(expectedAmounts[i]);
        expect(prep.nextInstallmentAmountDisplay).toBe(ethers.formatEther(BigInt(expectedAmounts[i])));

        // Step 2: Verify and commit (with txHash)
        const commitResult = await service.payLayaway(layawayId, { txHash: `0xtx-${i}` });
        const updatedLayaway = commitResult as any;

        // Check internal fields
        expect(updatedLayaway.paidInstallments).toBe(i + 1);
        if (i < 5) {
          expect(updatedLayaway.status).toBe('ACTIVE');
        } else {
          expect(updatedLayaway.status).toBe('COMPLETED');
        }
      }

      // Restore original gateway
      (service as any).blockchainGateway = oldGateway;
    });
  });

  describe('fractionalization', () => {
    beforeEach(async () => {
      // Ensure KYC verified for users
      await repository.saveUser({
        id: 'customer-1',
        displayName: 'Demo Seller',
        role: 0 as any, // CUSTOMER
        kycStatus: 'VERIFIED' as any,
        createdAt: new Date()
      });
      await repository.saveWallet({
        id: 'wallet-customer-1',
        userId: 'customer-1',
        address: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
        chainId: 31337,
        verifiedAt: new Date()
      });
      await repository.saveUser({
        id: 'customer-2',
        displayName: 'Demo Buyer',
        role: 0 as any,
        kycStatus: 'VERIFIED' as any,
        createdAt: new Date()
      });
      await repository.saveWallet({
        id: 'wallet-customer-2',
        userId: 'customer-2',
        address: '0x90f79bf6eb2c4f870365e785982e1f101e93b906',
        chainId: 31337,
        verifiedAt: new Date()
      });
    });

    it('fractionalizes, buys, and redeems assets successfully in Mock mode', async () => {
      // 1. Fractionalize asset A-1004 (which is RECEIVED by default)
      const fracAsset = await service.fractionalizeAsset({
        assetId: 'A-1004',
        totalShares: 100,
        targetPrice: 1000
      }, 'customer-1');

      expect(fracAsset).toBeDefined();
      expect('assetId' in fracAsset).toBe(true);
      const fa = fracAsset as any;
      expect(fa.assetId).toBe('A-1004');
      expect(fa.totalShares).toBe(100);
      expect(fa.pricePerShare).toBe(10);
      expect(fa.status).toBe('SOLD_OUT'); // Customer fractionalization completes sold out immediately

      // Check customer position is 100 shares
      const positions = await service.findFractionalPositions('customer-1');
      expect(positions).toHaveLength(1);
      expect(positions[0].shares).toBe(100);

      // Check asset status is FRACTIONALIZED
      const asset = await repository.findAsset('A-1004');
      expect(asset!.status).toBe('FRACTIONALIZED');

      // 2. Try to redeem asset by customer-1 (who owns 100% of fractions)
      const redeemRes = await service.redeemAsset({
        assetId: fa.assetId
      }, 'customer-1');

      expect(redeemRes).toBeDefined();
      const r = redeemRes as any;
      expect(r.status).toBe('REDEEMED');

      // Check asset owner and status
      const updatedAsset = await repository.findAsset('A-1004');
      expect(updatedAsset!.status).toBe('RETURNING');
      expect(updatedAsset!.ownerId).toBe('customer-1');

      // Check position is cleaned up (shares = 0)
      const updatedPositions = await service.findFractionalPositions('customer-1');
      expect(updatedPositions[0].shares).toBe(0);
    });

    it('handles primary market fractionalization, fraction purchase, and redemption in Mock mode', async () => {
      // Admin fractionalization of a protocol-owned asset (e.g. A-1005 which has status LISTED by default)
      const assetA1005 = await repository.findAsset('A-1005');
      expect(assetA1005).toBeDefined();

      const fracAsset = await service.fractionalizeAsset({
        assetId: 'A-1005',
        totalShares: 100,
        targetPrice: 2000
      }, 'admin-1');

      expect(fracAsset).toBeDefined();
      const fa = fracAsset as any;
      expect(fa.status).toBe('ACTIVE');
      expect(fa.availableShares).toBe(100);

      // Customer-2 buys 40 shares
      const buyRes1 = await service.buyFractions({
        assetId: 'A-1005',
        sharesToBuy: 40
      }, 'customer-2');

      const fa1 = buyRes1 as any;
      expect(fa1.availableShares).toBe(60);
      expect(fa1.status).toBe('ACTIVE');

      let posC2 = await repository.findFractionalPositionByHolderAndAsset('customer-2', 'A-1005');
      expect(posC2!.shares).toBe(40);

      // Customer-2 buys the remaining 60 shares
      const buyRes2 = await service.buyFractions({
        assetId: 'A-1005',
        sharesToBuy: 60
      }, 'customer-2');

      const fa2 = buyRes2 as any;
      expect(fa2.availableShares).toBe(0);
      expect(fa2.status).toBe('SOLD_OUT');

      posC2 = await repository.findFractionalPositionByHolderAndAsset('customer-2', 'A-1005');
      expect(posC2!.shares).toBe(100);

      // Customer-2 redeems the asset
      const redeemRes = await service.redeemAsset({
        assetId: 'A-1005'
      }, 'customer-2');

      const r = redeemRes as any;
      expect(r.status).toBe('REDEEMED');

      const updatedAsset = await repository.findAsset('A-1005');
      expect(updatedAsset!.status).toBe('RETURNING');
      expect(updatedAsset!.ownerId).toBe('customer-2');
    });

    it('rejects fractionalization when target price is not divisible by total shares', async () => {
      await expect(
        service.fractionalizeAsset({
          assetId: 'A-1004',
          totalShares: 3,
          targetPrice: 1000
        }, 'customer-1')
      ).rejects.toThrow('Target price must be divisible by total shares');
    });

    it('rejects buying fractions when user is not KYC verified', async () => {
      // Set customer-2 KYC to rejected or not started
      const user = await repository.findUserByWallet('0x90f79bf6eb2c4f870365e785982e1f101e93b906');
      user!.kycStatus = 'REJECTED' as any;
      await repository.saveUser(user!);

      // Admin fractionalizes first
      await service.fractionalizeAsset({
        assetId: 'A-1005',
        totalShares: 100,
        targetPrice: 2000
      }, 'admin-1');

      await expect(
        service.buyFractions({
          assetId: 'A-1005',
          sharesToBuy: 10
        }, 'customer-2')
      ).rejects.toThrow('KYC verification required to buy fractions');
    });
  });
});
