import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('fractional_positions')
export class FractionalPositionEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @Column()
  holderId!: string;

  @Column()
  shares!: number;

  @Column()
  totalShares!: number;
}
