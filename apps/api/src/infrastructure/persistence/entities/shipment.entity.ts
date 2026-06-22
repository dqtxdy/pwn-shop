import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ShipmentDirection, ShipmentStatus } from '../../../domain/enums';
import { AssetEntity } from './asset.entity';

@Entity('shipments')
export class ShipmentEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset?: AssetEntity;

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

