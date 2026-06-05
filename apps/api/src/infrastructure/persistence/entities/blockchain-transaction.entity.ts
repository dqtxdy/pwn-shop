import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('blockchain_transactions')
export class BlockchainTransactionEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  aggregateType!: string;

  @Column()
  aggregateId!: string;

  @Column()
  txHash!: string;

  @Column()
  eventName!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'timestamp with time zone' })
  confirmedAt!: Date;
}
