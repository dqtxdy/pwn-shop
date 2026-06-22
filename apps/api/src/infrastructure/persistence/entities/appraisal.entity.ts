import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, Check } from 'typeorm';
import { AssetEntity } from './asset.entity';
import { UserEntity } from './user.entity';
import { numericTransformer } from './numeric.transformer';

@Entity('appraisals')
@Check('CHK_appraisal_estimatedValue_positive', '"estimatedValue" >= 0')
@Check('CHK_appraisal_ltvBps_valid', '"ltvBps" >= 0 AND "ltvBps" <= 10000')
@Check('CHK_appraisal_interestAprBps_valid', '"interestAprBps" >= 0 AND "interestAprBps" <= 10000')
export class AppraisalEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset?: AssetEntity;

  @Column()
  appraiserId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appraiserId' })
  appraiser?: UserEntity;

  @Column({ type: 'numeric', precision: 20, scale: 2, transformer: numericTransformer })
  estimatedValue!: number;

  @Column()
  ltvBps!: number;

  @Column()
  interestAprBps!: number;

  @Column()
  acceptedByCustomer!: boolean;

  @Column({ nullable: true })
  evidenceUri?: string;

  @Column({ type: 'timestamp with time zone' })
  createdAt!: Date;
}

