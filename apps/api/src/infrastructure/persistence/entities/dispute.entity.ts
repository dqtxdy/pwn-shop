import { Entity, Column, PrimaryColumn } from 'typeorm';
import { DisputeStatus } from '../../../domain/enums';

@Entity('disputes')
export class DisputeEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @Column()
  openedBy!: string;

  @Column()
  status!: DisputeStatus;

  @Column({ nullable: true })
  evidenceExportUri?: string;

  @Column({ type: 'text', nullable: true })
  resolution?: string;

  @Column({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
