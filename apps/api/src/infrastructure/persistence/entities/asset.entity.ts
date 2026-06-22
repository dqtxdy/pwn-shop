import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, Check } from 'typeorm';
import { AssetStatus } from '../../../domain/enums';
import { UserEntity } from './user.entity';
import { numericTransformer } from './numeric.transformer';

@Entity('assets')
@Check('CHK_asset_declaredValue_positive', '"declaredValue" >= 0')
export class AssetEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  ownerId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner?: UserEntity;

  @Column({ nullable: true })
  tokenId?: string;

  @Column()
  title!: string;

  @Column()
  category!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column()
  status!: AssetStatus;

  @Column({ type: 'numeric', precision: 20, scale: 2, transformer: numericTransformer })
  declaredValue!: number;

  @Column({ type: 'timestamp with time zone' })
  createdAt!: Date;
}

