import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';
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
  @IsString()
  ownerId!: string;

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

  @IsString()
  uploadedBy!: string;

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

  @IsString()
  appraiserId!: string;

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

  @IsString()
  sellerId!: string;

  @IsNumber()
  @IsPositive()
  price!: number;

  @IsBoolean()
  isProtocolOwned!: boolean;
}

export class CreateLayawayDto {
  @IsString()
  listingId!: string;

  @IsString()
  buyerId!: string;

  @IsNumber()
  @IsPositive()
  downPayment!: number;

  @IsInt()
  monthsDuration!: number;
}

export class PayLayawayDto {
  @IsNumber()
  @IsPositive()
  amount!: number;
}

export class CreateDisputeDto {
  @IsString()
  assetId!: string;

  @IsString()
  openedBy!: string;

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
}

