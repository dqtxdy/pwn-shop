import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, Check } from 'typeorm';
import { LoanEntity } from './loan.entity';
import { numericTransformer } from './numeric.transformer';

@Entity('repayments')
@Check('CHK_repayment_amount_positive', '"amount" >= 0')
export class RepaymentEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  loanId!: string;

  @ManyToOne(() => LoanEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loanId' })
  loan?: LoanEntity;

  @Column({ type: 'numeric', precision: 20, scale: 2, transformer: numericTransformer })
  amount!: number;

  @Column()
  txHash!: string;

  @Column({ type: 'timestamp with time zone' })
  paidAt!: Date;
}

