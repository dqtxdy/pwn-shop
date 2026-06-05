import { Entity, Column, PrimaryColumn } from 'typeorm';
import { EvidenceKind } from '../../../domain/enums';

@Entity('evidence_files')
export class EvidenceFileEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @Column()
  uploadedBy!: string;

  @Column()
  kind!: EvidenceKind;

  @Column()
  uri!: string;

  @Column()
  contentHash!: string;

  @Column({ type: 'timestamp with time zone' })
  capturedAt!: Date;
}
