import { Entity, Column, PrimaryColumn } from 'typeorm';
import { LayawayStatus } from '../../../domain/enums';

@Entity('layaways')
export class LayawayEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  listingId!: string;

  @Column()
  buyerId!: string;

  @Column({ type: 'double precision' })
  totalPrice!: number;

  @Column({ type: 'double precision' })
  amountPaid!: number;

  @Column({ type: 'timestamp with time zone' })
  deadline!: Date;

  @Column()
  status!: LayawayStatus;

  @Column({ nullable: true })
  monthsDuration?: number;

  @Column({ type: 'double precision', nullable: true })
  installmentAmount?: number;

  @Column({ type: 'double precision', nullable: true })
  downPayment?: number;

  @Column({ nullable: true })
  paidInstallments?: number;

  @Column({ nullable: true })
  amountPaidWei?: string;

  @Column({ nullable: true })
  downPaymentWei?: string;

  @Column({ nullable: true })
  lastPaymentTxHash?: string;

  @Column({ nullable: true })
  completedTxHash?: string;
}
