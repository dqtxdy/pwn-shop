import { Entity, Column, PrimaryColumn, OneToOne, ManyToOne, JoinColumn, Check } from 'typeorm';
import { AssetEntity } from './asset.entity';
import { UserEntity } from './user.entity';
import { numericTransformer } from './numeric.transformer';

@Entity('fractional_assets')
@Check('CHK_fractional_asset_totalShares_positive', '"totalShares" > 0')
@Check('CHK_fractional_asset_availableShares_range', '"availableShares" >= 0 AND "availableShares" <= "totalShares"')
@Check('CHK_fractional_asset_pricePerShare_positive', '"pricePerShare" >= 0')
export class FractionalAssetEntity {
  @PrimaryColumn()
  assetId!: string;

  @OneToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset?: AssetEntity;

  @Column()
  originalOwner!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'originalOwner' })
  owner?: UserEntity;

  @Column()
  totalShares!: number;

  @Column()
  availableShares!: number;

  @Column({ type: 'numeric', precision: 20, scale: 2, transformer: numericTransformer })
  pricePerShare!: number;

  @Column()
  status!: 'ACTIVE' | 'SOLD_OUT' | 'REDEEMED';
}

