import { Entity, Column, PrimaryColumn } from 'typeorm';
import { LoanStatus } from '../../../domain/enums';

@Entity('loans')
export class LoanEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @Column()
  borrowerId!: string;

  @Column({ type: 'double precision' })
  principal!: number;

  @Column()
  aprBps!: number;

  @Column()
  durationDays!: number;

  @Column()
  status!: LoanStatus;

  @Column({ nullable: true })
  contractTxHash?: string;

  @Column({ type: 'timestamp with time zone', nullable: true })
  dueAt?: Date;

  @Column({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
