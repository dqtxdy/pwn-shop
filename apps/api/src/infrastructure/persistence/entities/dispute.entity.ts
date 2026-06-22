import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { DisputeStatus } from '../../../domain/enums';
import { AssetEntity } from './asset.entity';
import { UserEntity } from './user.entity';

@Entity('disputes')
@Index('UQ_open_dispute_per_asset', ['assetId'], { unique: true, where: `"status" = 'OPEN'` })
export class DisputeEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset?: AssetEntity;

  @Column()
  openedBy!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'openedBy' })
  opener?: UserEntity;

  @Column()
  status!: DisputeStatus;

  @Column({ nullable: true })
  evidenceExportUri?: string;

  @Column({ type: 'text', nullable: true })
  resolution?: string;

  @Column({ nullable: true })
  previousAssetStatus?: string;

  @Column({ type: 'timestamp with time zone' })
  createdAt!: Date;
}

