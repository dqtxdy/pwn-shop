import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, Check } from 'typeorm';
import { AssetEntity } from './asset.entity';
import { UserEntity } from './user.entity';

@Entity('fractional_positions')
@Check('CHK_fractional_position_shares_range', '"shares" >= 0 AND "shares" <= "totalShares"')
@Check('CHK_fractional_position_totalShares_positive', '"totalShares" > 0')
export class FractionalPositionEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset?: AssetEntity;

  @Column()
  holderId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'holderId' })
  holder?: UserEntity;

  @Column()
  shares!: number;

  @Column()
  totalShares!: number;
}

