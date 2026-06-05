import { Entity, Column, PrimaryColumn } from 'typeorm';
import { UserRole, KycStatus } from '../../../domain/enums';

@Entity('users')
export class UserEntity {
  @PrimaryColumn()
  id!: string;

  @Column({ nullable: true })
  email?: string;

  @Column()
  displayName!: string;

  @Column()
  role!: UserRole;

  @Column()
  kycStatus!: KycStatus;

  @Column({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
