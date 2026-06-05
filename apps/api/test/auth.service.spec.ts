import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from '../src/application/services/auth.service';
import { InMemoryPawnRepository } from '../src/infrastructure/persistence/repositories/in-memory-pawn.repository';
import { PAWN_REPOSITORY } from '../src/common/tokens';
import { UserRole } from '../src/domain/enums';

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

    it('returns customer session for CUSTOMER role', async () => {
      const session = await service.demoLogin(UserRole.Customer);
      expect(session.userId).toBe('customer-1');
      expect(session.displayName).toBe('Demo Customer Seller');
      expect(session.role).toBe(UserRole.Customer);
      expect(session.token).toBeDefined();
      expect(typeof session.token).toBe('string');
      expect(session.walletAddress).toBe('0x1111111111111111111111111111111111111111');
    });

    it('returns customer-2 session for CUSTOMER role with customer-2 option', async () => {
      const session = await service.demoLogin(UserRole.Customer, 'customer-2');
      expect(session.userId).toBe('customer-2');
      expect(session.displayName).toBe('Demo Customer Buyer');
      expect(session.role).toBe(UserRole.Customer);
      expect(session.walletAddress).toBe('0x4444444444444444444444444444444444444444');
    });

    it('returns staff session for STAFF role', async () => {
      const session = await service.demoLogin(UserRole.Staff);
      expect(session.userId).toBe('staff-1');
      expect(session.displayName).toBe('Demo Staff / Validator');
      expect(session.role).toBe(UserRole.Staff);
      expect(session.token).toBeDefined();
      expect(typeof session.token).toBe('string');
      expect(session.walletAddress).toBe('0x2222222222222222222222222222222222222222');
    });

    it('returns admin session for ADMIN role', async () => {
      const session = await service.demoLogin(UserRole.Admin);
      expect(session.userId).toBe('admin-1');
      expect(session.displayName).toBe('Demo Admin');
      expect(session.role).toBe(UserRole.Admin);
      expect(session.token).toBeDefined();
      expect(typeof session.token).toBe('string');
      expect(session.walletAddress).toBe('0x3333333333333333333333333333333333333333');
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

    it('returns customer session with Anvil wallet address', async () => {
      const session = await anvilService.demoLogin(UserRole.Customer);
      expect(session.userId).toBe('customer-1');
      expect(session.displayName).toBe('Demo Customer Seller');
      expect(session.role).toBe(UserRole.Customer);
      expect(session.walletAddress).toBe('0x70997970c51812dc3a010c7d01b50e0d17dc79c8');
    });

    it('returns customer-2 session with Anvil wallet address', async () => {
      const session = await anvilService.demoLogin(UserRole.Customer, 'customer-2');
      expect(session.userId).toBe('customer-2');
      expect(session.displayName).toBe('Demo Customer Buyer');
      expect(session.role).toBe(UserRole.Customer);
      expect(session.walletAddress).toBe('0x90f79bf6eb2c4f870365e785982e1f101e93b906');
    });

    it('returns staff session with Anvil wallet address', async () => {
      const session = await anvilService.demoLogin(UserRole.Staff);
      expect(session.userId).toBe('staff-1');
      expect(session.displayName).toBe('Demo Staff / Validator');
      expect(session.role).toBe(UserRole.Staff);
      expect(session.walletAddress).toBe('0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc');
    });

    it('returns admin session with Anvil wallet address', async () => {
      const session = await anvilService.demoLogin(UserRole.Admin);
      expect(session.userId).toBe('admin-1');
      expect(session.displayName).toBe('Demo Admin');
      expect(session.role).toBe(UserRole.Admin);
      expect(session.walletAddress).toBe('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266');
    });
  });
});
