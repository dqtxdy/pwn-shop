import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { Wallet as EthersWallet } from 'ethers';
import { AuthService } from '../src/application/services/auth.service';
import { InMemoryPawnRepository } from '../src/infrastructure/persistence/repositories/in-memory-pawn.repository';
import { PAWN_REPOSITORY } from '../src/common/tokens';
import { UserRole } from '../src/domain/enums';

// The new demoLogin contract: walletAddress is passed IN from the frontend
// (it is the MetaMask address currently connected in the browser).
// The backend echoes back whatever address was provided (or undefined if none).
// Two accounts can share the same wallet; no wallet is locked to any account.

describe('AuthService', () => {
  describe('demoLogin - Mock Mode', () => {
    let service: AuthService;
    let originalBlockchainMode: string | undefined;

    beforeEach(async () => {
      originalBlockchainMode = process.env.BLOCKCHAIN_MODE;
      process.env.BLOCKCHAIN_MODE = 'mock';

      const moduleRef = await Test.createTestingModule({
        imports: [
          JwtModule.register({
            secret: 'test-secret',
            signOptions: { expiresIn: '2h' }
          })
        ],
        providers: [
          AuthService,
          { provide: PAWN_REPOSITORY, useClass: InMemoryPawnRepository }
        ]
      }).compile();

      service = moduleRef.get(AuthService);
    });

    afterEach(() => {
      process.env.BLOCKCHAIN_MODE = originalBlockchainMode;
    });

    it('returns customer session for CUSTOMER role without wallet (no MetaMask connected)', async () => {
      const session = await service.demoLogin(UserRole.Customer);
      expect(session.userId).toBe('customer-1');
      expect(session.displayName).toBe('Demo Customer 1');
      expect(session.role).toBe(UserRole.Customer);
      expect(session.token).toBeDefined();
      expect(typeof session.token).toBe('string');
      // walletAddress is undefined because no wallet was passed from the frontend
      expect(session.walletAddress).toBeUndefined();
    });

    it('returns customer session with the wallet address provided by the frontend', async () => {
      const providedWallet = '0xAbCdEf0000000000000000000000000000000001';
      const session = await service.demoLogin(UserRole.Customer, 'customer-1', undefined, providedWallet);
      expect(session.userId).toBe('customer-1');
      expect(session.role).toBe(UserRole.Customer);
      // The backend normalises and echoes the wallet address sent by the frontend
      expect(session.walletAddress).toBe(providedWallet.toLowerCase());
    });

    it('returns customer-2 session for CUSTOMER role with customer-2 option', async () => {
      const session = await service.demoLogin(UserRole.Customer, 'customer-2');
      expect(session.userId).toBe('customer-2');
      expect(session.displayName).toBe('Demo Customer 2');
      expect(session.role).toBe(UserRole.Customer);
      // No wallet passed → undefined
      expect(session.walletAddress).toBeUndefined();
    });

    it('allows customer-1 and customer-2 to share the same wallet address', async () => {
      const sharedWallet = '0x1234567890abcdef1234567890abcdef12345678';
      const s1 = await service.demoLogin(UserRole.Customer, 'customer-1', undefined, sharedWallet);
      const s2 = await service.demoLogin(UserRole.Customer, 'customer-2', undefined, sharedWallet);
      expect(s1.walletAddress).toBe(sharedWallet.toLowerCase());
      expect(s2.walletAddress).toBe(sharedWallet.toLowerCase());
      expect(s1.userId).not.toBe(s2.userId);
    });

    it('returns staff session for STAFF role without wallet', async () => {
      const session = await service.demoLogin(UserRole.Staff);
      expect(session.userId).toBe('staff-1');
      expect(session.displayName).toBe('Demo Staff / Validator');
      expect(session.role).toBe(UserRole.Staff);
      expect(session.token).toBeDefined();
      expect(typeof session.token).toBe('string');
      expect(session.walletAddress).toBeUndefined();
    });

    it('returns admin session for ADMIN role without wallet', async () => {
      const session = await service.demoLogin(UserRole.Admin);
      expect(session.userId).toBe('admin-1');
      expect(session.displayName).toBe('Demo Admin');
      expect(session.role).toBe(UserRole.Admin);
      expect(session.token).toBeDefined();
      expect(typeof session.token).toBe('string');
      expect(session.walletAddress).toBeUndefined();
    });

    it('accepts a real wallet signature challenge', async () => {
      const wallet = EthersWallet.createRandom();
      const { nonce } = service.createNonce(wallet.address);
      const signature = await wallet.signMessage(nonce);

      const result = await service.login(wallet.address, 31337, signature);

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.user.role).toBe(UserRole.Customer);
      expect(result.user.displayName).toBe(`Customer ${wallet.address.toLowerCase().slice(0, 6)}`);
    });

    it('rejects signatures from a different wallet', async () => {
      const requestedWallet = EthersWallet.createRandom();
      const attackerWallet = EthersWallet.createRandom();
      const { nonce } = service.createNonce(requestedWallet.address);
      const attackerSignature = await attackerWallet.signMessage(nonce);

      await expect(service.login(requestedWallet.address, 31337, attackerSignature)).rejects.toThrow(
        'Wallet signature does not match requested address'
      );
    });

    it('rejects login attempts without an issued nonce', async () => {
      const wallet = EthersWallet.createRandom();
      const signature = await wallet.signMessage('not the issued challenge');

      await expect(service.login(wallet.address, 31337, signature)).rejects.toThrow(
        'Invalid wallet signature challenge'
      );
    });
  });

  describe('demoLogin - Anvil Mode', () => {
    let anvilService: AuthService;
    let originalBlockchainMode: string | undefined;

    beforeEach(async () => {
      originalBlockchainMode = process.env.BLOCKCHAIN_MODE;
      process.env.BLOCKCHAIN_MODE = 'anvil';

      const moduleRef = await Test.createTestingModule({
        imports: [
          JwtModule.register({
            secret: 'test-secret',
            signOptions: { expiresIn: '2h' }
          })
        ],
        providers: [
          AuthService,
          { provide: PAWN_REPOSITORY, useClass: InMemoryPawnRepository }
        ]
      }).compile();

      anvilService = moduleRef.get(AuthService);
    });

    afterEach(() => {
      process.env.BLOCKCHAIN_MODE = originalBlockchainMode;
    });

    it('returns customer session without wallet when no address passed', async () => {
      const session = await anvilService.demoLogin(UserRole.Customer);
      expect(session.userId).toBe('customer-1');
      expect(session.displayName).toBe('Demo Customer 1');
      expect(session.role).toBe(UserRole.Customer);
      expect(session.walletAddress).toBeUndefined();
    });

    it('returns customer session with the Anvil wallet address provided by the frontend', async () => {
      const anvilWallet = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
      const session = await anvilService.demoLogin(UserRole.Customer, 'customer-1', undefined, anvilWallet);
      expect(session.userId).toBe('customer-1');
      expect(session.role).toBe(UserRole.Customer);
      expect(session.walletAddress).toBe(anvilWallet);
    });

    it('returns customer-2 session with Anvil wallet address', async () => {
      const anvilWallet2 = '0x90f79bf6eb2c4f870365e785982e1f101e93b906';
      const session = await anvilService.demoLogin(UserRole.Customer, 'customer-2', undefined, anvilWallet2);
      expect(session.userId).toBe('customer-2');
      expect(session.displayName).toBe('Demo Customer 2');
      expect(session.role).toBe(UserRole.Customer);
      expect(session.walletAddress).toBe(anvilWallet2);
    });

    it('returns staff session with Anvil wallet address', async () => {
      const staffWallet = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';
      const session = await anvilService.demoLogin(UserRole.Staff, undefined, undefined, staffWallet);
      expect(session.userId).toBe('staff-1');
      expect(session.displayName).toBe('Demo Staff / Validator');
      expect(session.role).toBe(UserRole.Staff);
      expect(session.walletAddress).toBe(staffWallet);
    });

    it('returns admin session with Anvil wallet address', async () => {
      const adminWallet = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';
      const session = await anvilService.demoLogin(UserRole.Admin, undefined, undefined, adminWallet);
      expect(session.userId).toBe('admin-1');
      expect(session.displayName).toBe('Demo Admin');
      expect(session.role).toBe(UserRole.Admin);
      expect(session.walletAddress).toBe(adminWallet);
    });
  });
});
