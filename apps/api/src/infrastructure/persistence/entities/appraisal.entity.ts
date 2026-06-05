import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('appraisals')
export class AppraisalEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @Column()
  appraiserId!: string;

  @Column({ type: 'double precision' })
  estimatedValue!: number;

  @Column()
  ltvBps!: number;

  @Column()
  interestAprBps!: number;

  @Column()
  acceptedByCustomer!: boolean;

  @Column({ nullable: true })
  evidenceUri?: string;

  @Column({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
