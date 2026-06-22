import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, Check, Index } from 'typeorm';
import { ListingStatus } from '../../../domain/enums';
import { AssetEntity } from './asset.entity';
import { UserEntity } from './user.entity';
import { numericTransformer } from './numeric.transformer';

@Entity('listings')
@Check('CHK_listing_price_positive', '"price" >= 0')
@Index('UQ_active_reserved_listing_per_asset', ['assetId'], { unique: true, where: `"status" IN ('ACTIVE', 'RESERVED')` })
export class ListingEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset?: AssetEntity;

  @Column()
  sellerId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sellerId' })
  seller?: UserEntity;

  @Column({ type: 'numeric', precision: 20, scale: 2, transformer: numericTransformer })
  price!: number;

  @Column()
  status!: ListingStatus;

  @Column()
  isProtocolOwned!: boolean;

  @Column({ type: 'timestamp with time zone' })
  createdAt!: Date;
}

