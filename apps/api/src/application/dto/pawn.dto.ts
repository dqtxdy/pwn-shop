import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min, IsIn } from 'class-validator';
import { EvidenceKind, ShipmentDirection, UserRole } from '../../domain/enums';

export class WalletLoginDto {
  @IsString()
  walletAddress!: string;

  @IsInt()
  chainId!: number;

  @IsString()
  signature!: string;
}

export class CreateAssetDto {
  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsString()
  title!: string;

  @IsString()
  category!: string;

  @IsString()
  description!: string;

  @IsNumber()
  @Min(0)
  declaredValue!: number;
}

export class UploadEvidenceDto {
  @IsString()
  assetId!: string;

  @IsOptional()
  @IsString()
  uploadedBy?: string;

  @IsEnum(EvidenceKind)
  kind!: EvidenceKind;

  @IsString()
  fileName!: string;

  @IsString()
  bytesBase64!: string;
}

export class CreateShipmentDto {
  @IsString()
  assetId!: string;

  @IsEnum(ShipmentDirection)
  direction!: ShipmentDirection;

  @IsString()
  carrier!: string;

  @IsBoolean()
  codRequired!: boolean;
}

export class CreateAppraisalDto {
  @IsString()
  assetId!: string;

  @IsOptional()
  @IsString()
  appraiserId?: string;

  @IsNumber()
  @IsPositive()
  estimatedValue!: number;

  @IsInt()
  ltvBps!: number;

  @IsInt()
  interestAprBps!: number;

  @IsOptional()
  @IsString()
  evidenceUri?: string;
}

export class CreateLoanOfferDto {
  @IsString()
  assetId!: string;

  @IsString()
  borrowerId!: string;

  @IsNumber()
  @IsPositive()
  principal!: number;

  @IsInt()
  durationDays!: number;
}

export class AcceptLoanDto {
  @IsString()
  borrowerWallet!: string;

  @IsOptional()
  @IsString()
  txHash?: string;
}

export class RecordRepaymentDto {
  @IsString()
  loanId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  txHash!: string;
}

export class CreateListingDto {
  @IsString()
  assetId!: string;

  @IsOptional()
  @IsString()
  sellerId?: string;

  @IsNumber()
  @IsPositive()
  price!: number;

  @IsBoolean()
  isProtocolOwned!: boolean;

  @IsOptional()
  @IsString()
  txHash?: string;
}

export class CreateLayawayDto {
  @IsString()
  listingId!: string;

  @IsOptional()
  @IsString()
  buyerId?: string;

  @IsNumber()
  @IsPositive()
  downPayment!: number;

  @IsInt()
  @IsIn([3, 6, 9, 12], { message: 'Only 3, 6, 9, or 12 months allowed' })
  monthsDuration!: number;

  @IsOptional()
  @IsString()
  txHash?: string;
}

export class PayLayawayDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsString()
  txHash?: string;
}

export class CreateDisputeDto {
  @IsString()
  assetId!: string;

  @IsOptional()
  @IsString()
  openedBy?: string;

  @IsString()
  evidenceExportUri!: string;
}

export class ResolveDisputeDto {
  @IsString()
  resolution!: string;
}

export class BlockchainWebhookDto {
  @IsString()
  aggregateType!: string;

  @IsString()
  aggregateId!: string;

  @IsString()
  txHash!: string;

  @IsString()
  eventName!: string;

  payload!: Record<string, unknown>;
}

export class CreateUserDto {
  @IsString()
  displayName!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}

export class DemoLoginDto {
  @IsEnum(UserRole)
  role!: UserRole;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  walletAddress?: string;
}

export class FractionalizeAssetDto {
  @IsString()
  assetId!: string;

  @IsInt()
  @IsPositive()
  totalShares!: number;

  @IsNumber()
  @IsPositive()
  targetPrice!: number;

  @IsOptional()
  @IsString()
  txHash?: string;
}

export class BuyFractionsDto {
  @IsString()
  assetId!: string;

  @IsInt()
  @IsPositive()
  sharesToBuy!: number;

  @IsOptional()
  @IsString()
  txHash?: string;
}

export class RedeemAssetDto {
  @IsString()
  assetId!: string;

  @IsOptional()
  @IsString()
  txHash?: string;
}

