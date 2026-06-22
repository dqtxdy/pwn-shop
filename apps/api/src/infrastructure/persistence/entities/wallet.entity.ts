import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('wallets')
export class WalletEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;

  @Column()
  address!: string;

  @Column()
  chainId!: number;

  @Column({ type: 'timestamp with time zone', nullable: true })
  verifiedAt?: Date;
}

