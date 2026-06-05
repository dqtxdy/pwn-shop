import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('fractional_assets')
export class FractionalAssetEntity {
  @PrimaryColumn()
  assetId!: string;

  @Column()
  originalOwner!: string;

  @Column()
  totalShares!: number;

  @Column()
  availableShares!: number;

  @Column({ type: 'double precision' })
  pricePerShare!: number;

  @Column()
  status!: 'ACTIVE' | 'SOLD_OUT' | 'REDEEMED';
}
