import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AssetStatus, DisputeStatus, KycStatus, ListingStatus, LoanStatus, ShipmentStatus, UserRole } from '../../../domain/enums';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  displayName!: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ type: 'enum', enum: UserRole })
  role!: UserRole;

  @Column({ type: 'enum', enum: KycStatus, default: KycStatus.NotStarted })
  kycStatus!: KycStatus;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('assets')
export class AssetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  ownerId!: string;

  @Column({ nullable: true })
  tokenId?: string;

  @Column()
  title!: string;

  @Column()
  category!: string;

  @Column()
  description!: string;

  @Column({ type: 'enum', enum: AssetStatus })
  status!: AssetStatus;

  @Column('decimal', { precision: 18, scale: 2 })
  declaredValue!: string;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('shipments')
export class ShipmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  assetId!: string;

  @Column()
  carrier!: string;

  @Column()
  trackingCode!: string;

  @Column({ type: 'enum', enum: ShipmentStatus })
  status!: ShipmentStatus;

  @Column({ default: false })
  codRequired!: boolean;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('loans')
export class LoanEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  assetId!: string;

  @Column()
  borrowerId!: string;

  @Column('decimal', { precision: 18, scale: 2 })
  principal!: string;

  @Column()
  aprBps!: number;

  @Column()
  durationDays!: number;

  @Column({ type: 'enum', enum: LoanStatus })
  status!: LoanStatus;

  @Column({ nullable: true })
  contractTxHash?: string;

  @Column({ nullable: true })
  dueAt?: Date;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('listings')
export class ListingEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  assetId!: string;

  @Column()
  sellerId!: string;

  @Column('decimal', { precision: 18, scale: 2 })
  price!: string;

  @Column({ type: 'enum', enum: ListingStatus })
  status!: ListingStatus;

  @Column({ default: false })
  isProtocolOwned!: boolean;
}

@Entity('disputes')
export class DisputeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  assetId!: string;

  @Column()
  openedBy!: string;

  @Column({ type: 'enum', enum: DisputeStatus })
  status!: DisputeStatus;

  @Column({ nullable: true })
  evidenceExportUri?: string;

  @Column({ nullable: true })
  resolution?: string;

  @Column({ nullable: true })
  previousAssetStatus?: string;
}

@Entity('audit_events')
export class AuditEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  actorId!: string;

  @Column()
  action!: string;

  @Column()
  aggregateType!: string;

  @Column()
  aggregateId!: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}
