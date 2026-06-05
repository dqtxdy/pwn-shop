import { Entity, Column, PrimaryColumn } from 'typeorm';
import { ListingStatus } from '../../../domain/enums';

@Entity('listings')
export class ListingEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @Column()
  sellerId!: string;

  @Column({ type: 'double precision' })
  price!: number;

  @Column()
  status!: ListingStatus;

  @Column()
  isProtocolOwned!: boolean;

  @Column({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
