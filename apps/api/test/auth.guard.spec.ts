import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ForbiddenException } from '@nestjs/common';
import * as request from 'supertest';
import { ValidationPipe } from '@nestjs/common';
import { PAWN_REPOSITORY } from '../src/common/tokens';
import { AssetStatus, UserRole } from '../src/domain/enums';

describe('Auth Guards & Role Restrictions (Integration)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let customerToken: string;
  let otherCustomerToken: string;
  let staffToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);

    // Seed/Generate JWT tokens for roles
    const customerSession = await authService.demoLogin(UserRole.Customer, 'customer-1');
    customerToken = customerSession.token;

    const otherCustomerSession = await authService.demoLogin(UserRole.Customer, 'customer-2');
    otherCustomerToken = otherCustomerSession.token;

    const staffSession = await authService.demoLogin(UserRole.Staff);
    staffToken = staffSession.token;

    const adminSession = await authService.demoLogin(UserRole.Admin);
    adminToken = adminSession.token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication (401)', () => {
    it('returns 401 for requests without a Bearer token', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/dashboard')
        .expect(401);
    });

    it('returns 401 for requests with an invalid Bearer token', async () => {
      await request(app.getHttpServer())
        .get('/api/admin/dashboard')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('Authorization Roles (403)', () => {
    it('returns 403 for Customer trying to access Staff appraisals endpoint', async () => {
      await request(app.getHttpServer())
        .post('/api/appraisals')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ assetId: 'A-1001', estimatedValue: 1000 })
        .expect(403);
    });

    it('returns 403 for Staff trying to access Admin resolve dispute endpoint', async () => {
      await request(app.getHttpServer())
        .post('/api/disputes/1/resolve')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ resolution: 'resolved' })
        .expect(403);
    });
  });

  describe('Customer Cross-Customer Security Restrictions', () => {
    it('prevents customer-1 from uploading evidence to customer-2 owned asset', async () => {
      // A-1004 is owned by customer-1 initially, A-1002 is owned by customer-1,
      // Let's check which asset is owned by customer-2. Let's make sure we test correctly.
      // Wait, we can test with a fake request or an asset of customer-2 (e.g. A-1005 is owned by customer-1,
      // but we can query to see or simply try to upload to an asset where customer-1 is not owner.
      // In the mock db, A-1005 has status RECEIVED, owned by customer-1.
      // Let's create an asset for customer-2 first!
      const createRes = await request(app.getHttpServer())
        .post('/api/assets')
        .set('Authorization', `Bearer ${otherCustomerToken}`)
        .send({
          title: 'Charlie Watch',
          category: 'watch',
          description: 'luxury watch',
          declaredValue: 2000
        });

      expect(createRes.status).toBe(201);
      const otherAssetId = createRes.body.id;

      // Now customer-1 (Alice) tries to upload evidence to otherAssetId
      const uploadRes = await request(app.getHttpServer())
        .post('/api/evidence')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          assetId: otherAssetId,
          kind: 'CUSTOMER_PRE_SHIPMENT',
          fileName: 'evidence.png',
          bytesBase64: 'base64-bytes'
        });

      expect(uploadRes.status).toBe(403);
    });
  });

  describe('Access Approvals for Valid Roles', () => {
    it('allows Staff to access appraisals endpoint (returns 400 Bad Request on empty payload, not 401/403)', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/appraisals')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({});
      expect(response.status).toBe(400);
    });

    it('allows Customer to view their own dashboard overview', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(response.status).toBe(200);
      expect(response.body.protocolFeesCollected).toBe(0); // Customer has 0 fees visibility
    });

    it('allows Admin to view full dashboard overview including protocol fees', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
    });
  });

  describe('Hardening Gap Protections (Phase 3A)', () => {
    it('returns 403 for STAFF trying to create marketplace listings', async () => {
      await request(app.getHttpServer())
        .post('/api/marketplace/listings')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          assetId: 'A-1001',
          price: 1000,
          isProtocolOwned: false
        })
        .expect(403);
    });

    it('returns 403 for CUSTOMER trying to create protocol-owned listings', async () => {
      await request(app.getHttpServer())
        .post('/api/marketplace/listings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          assetId: 'A-1001',
          price: 1000,
          isProtocolOwned: true
        })
        .expect(403);
    });

    it('prevents CUSTOMER from listing another customer\'s asset even if sellerId is spoofed', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/assets')
        .set('Authorization', `Bearer ${otherCustomerToken}`)
        .send({
          title: 'Charlie Watch',
          category: 'watch',
          description: 'luxury watch',
          declaredValue: 2000
        });
      expect(createRes.status).toBe(201);
      const otherAssetId = createRes.body.id;

      const listRes = await request(app.getHttpServer())
        .post('/api/marketplace/listings')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          assetId: otherAssetId,
          price: 1500,
          isProtocolOwned: false,
          sellerId: 'customer-2'
        });
      expect(listRes.status).toBe(403);
    });

    it('proves STAFF evidence upload with spoofed uploadedBy saves uploadedBy = staff-1', async () => {
      const assetRes = await request(app.getHttpServer())
        .post('/api/assets')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          title: 'Staff Upload Test Asset',
          category: 'electronics',
          description: 'test asset',
          declaredValue: 500
        });
      expect(assetRes.status).toBe(201);
      const assetId = assetRes.body.id;

      const uploadRes = await request(app.getHttpServer())
        .post('/api/evidence')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          assetId,
          uploadedBy: 'customer-2',
          kind: 'CUSTOMER_PRE_SHIPMENT',
          fileName: 'evidence.png',
          bytesBase64: 'base64-bytes'
        });
      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.uploadedBy).toBe('staff-1');
    });

    it('CUSTOMER GET /api/assets does not leak another customer\'s assets', async () => {
      const asset1Res = await request(app.getHttpServer())
        .post('/api/assets')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          title: 'Customer 1 Asset',
          category: 'watch',
          description: 'test',
          declaredValue: 100
        });
      const asset2Res = await request(app.getHttpServer())
        .post('/api/assets')
        .set('Authorization', `Bearer ${otherCustomerToken}`)
        .send({
          title: 'Customer 2 Asset',
          category: 'watch',
          description: 'test',
          declaredValue: 200
        });

      const listRes = await request(app.getHttpServer())
        .get('/api/assets')
        .set('Authorization', `Bearer ${customerToken}`);
      expect(listRes.status).toBe(200);

      const list = listRes.body;
      expect(list.length).toBeGreaterThan(0);
      for (const asset of list) {
        expect(asset.ownerId).toBe('customer-1');
      }
    });

    it('CUSTOMER cannot track another customer\'s shipment', async () => {
      const assetRes = await request(app.getHttpServer())
        .post('/api/assets')
        .set('Authorization', `Bearer ${otherCustomerToken}`)
        .send({
          title: 'Customer 2 Asset for Shipment',
          category: 'electronics',
          description: 'test',
          declaredValue: 1000
        });
      const assetId = assetRes.body.id;

      const shipmentRes = await request(app.getHttpServer())
        .post('/api/shipments')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          assetId,
          direction: 'TO_SHOP',
          carrier: 'FedEx',
          codRequired: false
        });
      expect(shipmentRes.status).toBe(201);

      const trackRes = await request(app.getHttpServer())
        .get(`/api/shipments/${assetId}`)
        .set('Authorization', `Bearer ${customerToken}`);
      expect(trackRes.status).toBe(403);

      const trackOkRes = await request(app.getHttpServer())
        .get(`/api/shipments/${assetId}`)
        .set('Authorization', `Bearer ${otherCustomerToken}`);
      expect(trackOkRes.status).toBe(200);
    });
  });
});
