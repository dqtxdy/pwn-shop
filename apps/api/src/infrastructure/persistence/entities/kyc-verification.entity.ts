import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { KycStatus } from '../../../domain/enums';
import { UserEntity } from './user.entity';

@Entity('kyc_verifications')
export class KycVerificationEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;

  @Column()
  provider!: string;

  @Column()
  status!: KycStatus;

  @Column()
  reference!: string;

  @Column({ type: 'timestamp with time zone' })
  checkedAt!: Date;
}

