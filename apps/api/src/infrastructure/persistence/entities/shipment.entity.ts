import { Entity, Column, PrimaryColumn } from 'typeorm';
import { ShipmentDirection, ShipmentStatus } from '../../../domain/enums';

@Entity('shipments')
export class ShipmentEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @Column()
  direction!: ShipmentDirection;

  @Column()
  carrier!: string;

  @Column()
  trackingCode!: string;

  @Column()
  status!: ShipmentStatus;

  @Column()
  codRequired!: boolean;

  @Column({ type: 'timestamp with time zone' })
  updatedAt!: Date;
}
