import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('wallets')
export class WalletEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  userId!: string;

  @Column()
  address!: string;

  @Column()
  chainId!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  verifiedAt?: Date;
}
