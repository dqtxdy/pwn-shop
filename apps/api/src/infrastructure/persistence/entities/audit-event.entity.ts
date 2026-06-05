import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('audit_events')
export class AuditEventEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  actorId!: string;

  @Column()
  action!: string;

  @Column()
  aggregateType!: string;

  @Column()
  aggregateId!: string;

  @Column({ type: 'jsonb' })
  metadata!: Record<string, unknown>;

  @Column({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
