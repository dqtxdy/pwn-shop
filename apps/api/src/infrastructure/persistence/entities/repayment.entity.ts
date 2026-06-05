import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('repayments')
export class RepaymentEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  loanId!: string;

  @Column({ type: 'double precision' })
  amount!: number;

  @Column()
  txHash!: string;

  @Column({ type: 'timestamp with time zone' })
  paidAt!: Date;
}
