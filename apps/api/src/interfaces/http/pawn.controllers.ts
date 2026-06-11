import { Body, Controller, Get, Param, Post, ForbiddenException, Inject, UseGuards } from '@nestjs/common';
import { AuthService } from '../../application/services/auth.service';
import { PawnWorkflowService } from '../../application/services/pawn-workflow.service';
import { BLOCKCHAIN_GATEWAY } from '../../common/tokens';
import { BlockchainGateway } from '../../application/ports/external-services';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './authenticated-user';
import { UserRole } from '../../domain/enums';
import {
  AcceptLoanDto,
  BlockchainWebhookDto,
  CreateAppraisalDto,
  CreateAssetDto,
  CreateDisputeDto,
  CreateLayawayDto,
  CreateListingDto,
  CreateLoanOfferDto,
  CreateShipmentDto,
  RecordRepaymentDto,
  ResolveDisputeDto,
  UploadEvidenceDto,
  WalletLoginDto,
  PayLayawayDto,
  DemoLoginDto,
  FractionalizeAssetDto,
  BuyFractionsDto,
  RedeemAssetDto
} from '../../application/dto/pawn.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Get('wallet/nonce/:walletAddress')
  nonce(@Param('walletAddress') walletAddress: string) {
    return this.authService.createNonce(walletAddress);
  }

  @Post('wallet/login')
  login(@Body() dto: WalletLoginDto) {
    return this.authService.login(dto.walletAddress, dto.chainId, dto.signature);
  }

  @Post('demo-login')
  demoLogin(@Body() dto: DemoLoginDto) {
    return this.authService.demoLogin(dto.role, dto.userId);
  }
}

@Controller('kyc')
@UseGuards(JwtAuthGuard, RolesGuard)
export class KycController {
  constructor(private readonly workflow: PawnWorkflowService) { }

  @Post(':userId/:walletAddress')
  @Roles(UserRole.Customer)
  request(@Param('userId') userId: string, @Param('walletAddress') walletAddress: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.id !== userId) {
      throw new ForbiddenException('Cannot request KYC for another user');
    }
    return this.workflow.requestKyc(userId, walletAddress);
  }
}

@Controller('assets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AssetsController {
  constructor(private readonly workflow: PawnWorkflowService) { }

  @Post()
  @Roles(UserRole.Customer)
  create(@Body() dto: CreateAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.workflow.createAsset(dto, user);
  }

  @Get()
  @Roles(UserRole.Customer, UserRole.Staff, UserRole.Admin)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.workflow.listAssets(user);
  }
}

@Controller('evidence')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EvidenceController {
  constructor(private readonly workflow: PawnWorkflowService) { }

  @Post()
  @Roles(UserRole.Customer, UserRole.Staff, UserRole.Admin)
  upload(@Body() dto: UploadEvidenceDto, @CurrentUser() user: AuthenticatedUser) {
    dto.uploadedBy = user.id;
    return this.workflow.uploadEvidence(dto, user);
  }
}

@Controller('shipments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShipmentsController {
  constructor(private readonly workflow: PawnWorkflowService) { }

  @Post()
  @Roles(UserRole.Customer, UserRole.Staff)
  create(@Body() dto: CreateShipmentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.workflow.createShipment(dto, user);
  }

  @Get(':assetId')
  @Roles(UserRole.Customer, UserRole.Staff, UserRole.Admin)
  track(@Param('assetId') assetId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.workflow.trackShipment(assetId, user);
  }
}

@Controller('appraisals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppraisalsController {
  constructor(private readonly workflow: PawnWorkflowService) { }

  @Post()
  @Roles(UserRole.Staff)
  create(@Body() dto: CreateAppraisalDto, @CurrentUser() user: AuthenticatedUser) {
    dto.appraiserId = user.id;
    return this.workflow.createAppraisal(dto);
  }
}

@Controller('loans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoansController {
  constructor(private readonly workflow: PawnWorkflowService) { }

  @Post()
  @Roles(UserRole.Staff)
  createOffer(@Body() dto: CreateLoanOfferDto) {
    return this.workflow.createLoanOffer(dto);
  }

  @Post(':loanId/accept')
  @Roles(UserRole.Customer)
  accept(@Param('loanId') loanId: string, @Body() dto: AcceptLoanDto, @CurrentUser() user: AuthenticatedUser) {
    return this.workflow.acceptLoan(loanId, dto, user);
  }
}

@Controller('repayments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RepaymentsController {
  constructor(private readonly workflow: PawnWorkflowService) { }

  @Post()
  @Roles(UserRole.Customer)
  record(@Body() dto: RecordRepaymentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.workflow.recordRepayment(dto, user);
  }
}

@Controller('marketplace')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MarketplaceController {
  constructor(private readonly workflow: PawnWorkflowService) { }

  @Get()
  @Roles(UserRole.Customer, UserRole.Staff, UserRole.Admin)
  list() {
    return this.workflow.listListings();
  }

  @Post('listings')
  @Roles(UserRole.Customer, UserRole.Admin)
  create(@Body() dto: CreateListingDto, @CurrentUser() user: AuthenticatedUser) {
    if (user.role === UserRole.Customer) {
      if (dto.isProtocolOwned) {
        throw new ForbiddenException('Customer cannot create protocol-owned listings');
      }
      dto.sellerId = user.id;
    } else if (user.role === UserRole.Admin) {
      if (!dto.isProtocolOwned) {
        throw new ForbiddenException('Admin can only create protocol-owned listings');
      }
      dto.sellerId = 'admin-1';
    } else {
      throw new ForbiddenException('Insufficient role permissions');
    }
    return this.workflow.createListing(dto, user);
  }
}

@Controller('layaways')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LayawaysController {
  constructor(private readonly workflow: PawnWorkflowService) { }

  @Post()
  @Roles(UserRole.Customer)
  create(@Body() dto: CreateLayawayDto, @CurrentUser() user: AuthenticatedUser) {
    return this.workflow.createLayaway(dto, user);
  }

  @Post(':layawayId/pay')
  @Roles(UserRole.Customer)
  pay(@Param('layawayId') layawayId: string, @Body() dto: PayLayawayDto, @CurrentUser() user: AuthenticatedUser) {
    return this.workflow.payLayaway(layawayId, dto, user);
  }
}

@Controller('fractions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FractionsController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Post('fractionalize')
  @Roles(UserRole.Customer, UserRole.Admin)
  fractionalize(@Body() dto: FractionalizeAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.workflow.fractionalizeAsset(dto, user.id);
  }

  @Post('buy')
  @Roles(UserRole.Customer)
  buy(@Body() dto: BuyFractionsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.workflow.buyFractions(dto, user.id);
  }

  @Post('redeem')
  @Roles(UserRole.Customer)
  redeem(@Body() dto: RedeemAssetDto, @CurrentUser() user: AuthenticatedUser) {
    return this.workflow.redeemAsset(dto, user.id);
  }

  @Get('assets')
  @Roles(UserRole.Customer, UserRole.Staff, UserRole.Admin)
  listAssets() {
    return this.workflow.listFractionalAssets();
  }

  @Get('positions/:userId')
  @Roles(UserRole.Customer, UserRole.Staff, UserRole.Admin)
  getPositions(@Param('userId') userId: string, @CurrentUser() user: AuthenticatedUser) {
    if (user.role === UserRole.Customer && user.id !== userId) {
      throw new ForbiddenException('Cannot view positions of another customer');
    }
    return this.workflow.findFractionalPositions(userId);
  }
}

@Controller('disputes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DisputesController {
  constructor(private readonly workflow: PawnWorkflowService) { }

  @Post()
  @Roles(UserRole.Customer)
  create(@Body() dto: CreateDisputeDto, @CurrentUser() user: AuthenticatedUser) {
    return this.workflow.createDispute(dto, user);
  }

  @Post(':id/resolve')
  @Roles(UserRole.Admin)
  resolve(@Param('id') id: string, @Body() dto: ResolveDisputeDto) {
    return this.workflow.resolveDispute(id, dto);
  }
}

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly workflow: PawnWorkflowService) { }

  @Get('dashboard')
  @Roles(UserRole.Admin, UserRole.Staff, UserRole.Customer)
  dashboard(@CurrentUser() user: AuthenticatedUser) {
    return this.workflow.dashboard(user);
  }
}

@Controller('webhooks/blockchain')
export class BlockchainWebhooksController {
  constructor(private readonly workflow: PawnWorkflowService) { }

  @Post()
  record(@Body() dto: BlockchainWebhookDto) {
    return this.workflow.recordBlockchainWebhook(dto);
  }
}

@Controller('demo')
export class DemoController {
  constructor(private readonly workflow: PawnWorkflowService) { }

  @Post('reset')
  async reset() {
    const demoEnabled = process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'test';
    if (process.env.NODE_ENV === 'production' || !demoEnabled) {
      throw new ForbiddenException('Demo reset is disabled. Set DEMO_MODE=true for local demonstrations.');
    }
    await this.workflow.reset();
    return { success: true, message: 'Demo data reset successfully' };
  }
}

@Controller('blockchain')
export class BlockchainConfigController {
  constructor(
    @Inject(BLOCKCHAIN_GATEWAY) private readonly blockchainGateway: BlockchainGateway
  ) {}

  @Get('config')
  getConfig() {
    return this.blockchainGateway.getBlockchainConfig();
  }

  @Get('health')
  async getHealth() {
    const health = await this.blockchainGateway.checkHealth();
    return {
      mode: this.blockchainGateway.getBlockchainConfig().mode,
      ...health
    };
  }
}
