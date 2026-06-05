import { Entity, Column, PrimaryColumn } from 'typeorm';
import { KycStatus } from '../../../domain/enums';

@Entity('kyc_verifications')
export class KycVerificationEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  userId!: string;

  @Column()
  provider!: string;

  @Column()
  status!: KycStatus;

  @Column()
  reference!: string;

  @Column({ type: 'timestamp with time zone' })
  checkedAt!: Date;
}
