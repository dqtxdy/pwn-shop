import { Body, Controller, Get, Param, Post, ForbiddenException } from '@nestjs/common';
import { AuthService } from '../../application/services/auth.service';
import { PawnWorkflowService } from '../../application/services/pawn-workflow.service';
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
  DemoLoginDto
} from '../../application/dto/pawn.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
    // TODO: In a production environment, this mock adapter will be replaced by fully secure JWT verification guards.
    return this.authService.demoLogin(dto.role);
  }
}


@Controller('kyc')
export class KycController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Post(':userId/:walletAddress')
  request(@Param('userId') userId: string, @Param('walletAddress') walletAddress: string) {
    return this.workflow.requestKyc(userId, walletAddress);
  }
}

@Controller('assets')
export class AssetsController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Post()
  create(@Body() dto: CreateAssetDto) {
    return this.workflow.createAsset(dto);
  }

  @Get()
  list() {
    return this.workflow.listAssets();
  }
}

@Controller('evidence')
export class EvidenceController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Post()
  upload(@Body() dto: UploadEvidenceDto) {
    return this.workflow.uploadEvidence(dto);
  }
}

@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Post()
  create(@Body() dto: CreateShipmentDto) {
    return this.workflow.createShipment(dto);
  }

  @Get(':assetId')
  track(@Param('assetId') assetId: string) {
    return this.workflow.trackShipment(assetId);
  }
}

@Controller('appraisals')
export class AppraisalsController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Post()
  create(@Body() dto: CreateAppraisalDto) {
    return this.workflow.createAppraisal(dto);
  }
}

@Controller('loans')
export class LoansController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Post()
  createOffer(@Body() dto: CreateLoanOfferDto) {
    return this.workflow.createLoanOffer(dto);
  }

  @Post(':loanId/accept')
  accept(@Param('loanId') loanId: string, @Body() dto: AcceptLoanDto) {
    return this.workflow.acceptLoan(loanId, dto);
  }
}

@Controller('repayments')
export class RepaymentsController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Post()
  record(@Body() dto: RecordRepaymentDto) {
    return this.workflow.recordRepayment(dto);
  }
}

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Get()
  list() {
    return this.workflow.listListings();
  }

  @Post('listings')
  create(@Body() dto: CreateListingDto) {
    return this.workflow.createListing(dto);
  }
}

@Controller('layaways')
export class LayawaysController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Post()
  create(@Body() dto: CreateLayawayDto) {
    return this.workflow.createLayaway(dto);
  }

  @Post(':layawayId/pay')
  pay(@Param('layawayId') layawayId: string, @Body() dto: PayLayawayDto) {
    return this.workflow.payLayaway(layawayId, dto);
  }
}

@Controller('fractions')
export class FractionsController {
  @Post()
  createPool() {
    return {
      status: 'PENDING_CHAIN_TRANSACTION',
      message: 'Fractionalization is executed through PawnProtocol and indexed by /webhooks/blockchain.'
    };
  }
}

@Controller('disputes')
export class DisputesController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Post()
  create(@Body() dto: CreateDisputeDto) {
    return this.workflow.createDispute(dto);
  }

  @Post(':id/resolve')
  resolve(@Param('id') id: string, @Body() dto: ResolveDisputeDto) {
    return this.workflow.resolveDispute(id, dto);
  }
}

@Controller('admin')
export class AdminController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Get('dashboard')
  dashboard() {
    return this.workflow.dashboard();
  }
}

@Controller('webhooks/blockchain')
export class BlockchainWebhooksController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Post()
  record(@Body() dto: BlockchainWebhookDto) {
    return this.workflow.recordBlockchainWebhook(dto);
  }
}

@Controller('demo')
export class DemoController {
  constructor(private readonly workflow: PawnWorkflowService) {}

  @Post('reset')
  async reset() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Demo reset is not allowed in production mode');
    }
    await this.workflow.reset();
    return { success: true, message: 'InMemory database reset successfully' };
  }
}
