import { Test } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from '../src/application/services/auth.service';
import { InMemoryPawnRepository } from '../src/infrastructure/persistence/repositories/in-memory-pawn.repository';
import { PAWN_REPOSITORY } from '../src/common/tokens';
import { UserRole } from '../src/domain/enums';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
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

  describe('demoLogin', () => {
    it('returns customer session for CUSTOMER role', async () => {
      const session = await service.demoLogin(UserRole.Customer);
      expect(session.userId).toBe('customer-1');
      expect(session.displayName).toBe('Demo Customer');
      expect(session.role).toBe(UserRole.Customer);
      expect(session.token).toBeDefined();
      expect(typeof session.token).toBe('string');
      expect(session.walletAddress).toBe('0x1111111111111111111111111111111111111111');
    });

    it('returns staff session for STAFF role', async () => {
      const session = await service.demoLogin(UserRole.Staff);
      expect(session.userId).toBe('staff-1');
      expect(session.displayName).toBe('Demo Staff');
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
});
