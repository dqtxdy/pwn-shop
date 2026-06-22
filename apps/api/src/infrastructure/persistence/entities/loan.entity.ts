import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, Check, Index } from 'typeorm';
import { LoanStatus } from '../../../domain/enums';
import { AssetEntity } from './asset.entity';
import { UserEntity } from './user.entity';
import { numericTransformer } from './numeric.transformer';

@Entity('loans')
@Check('CHK_loan_principal_positive', '"principal" >= 0')
@Check('CHK_loan_aprBps_positive', '"aprBps" >= 0')
@Check('CHK_loan_durationDays_positive', '"durationDays" > 0')
@Index('UQ_active_offered_loan_per_asset', ['assetId'], { unique: true, where: `"status" IN ('ACTIVE', 'OFFERED')` })
export class LoanEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset?: AssetEntity;

  @Column()
  borrowerId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'borrowerId' })
  borrower?: UserEntity;

  @Column({ type: 'numeric', precision: 20, scale: 2, transformer: numericTransformer })
  principal!: number;

  @Column()
  aprBps!: number;

  @Column()
  durationDays!: number;

  @Column()
  status!: LoanStatus;

  @Column({ nullable: true })
  contractTxHash?: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  dueAt?: Date;

  @Column({ type: 'timestamp with time zone' })
  createdAt!: Date;
}

