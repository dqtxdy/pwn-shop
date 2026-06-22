import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { EvidenceKind } from '../../../domain/enums';
import { AssetEntity } from './asset.entity';
import { UserEntity } from './user.entity';

@Entity('evidence_files')
export class EvidenceFileEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  assetId!: string;

  @ManyToOne(() => AssetEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assetId' })
  asset?: AssetEntity;

  @Column()
  uploadedBy!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uploadedBy' })
  uploader?: UserEntity;

  @Column()
  kind!: EvidenceKind;

  @Column()
  uri!: string;

  @Column()
  contentHash!: string;

  @Column({ type: 'timestamp with time zone' })
  capturedAt!: Date;
}

