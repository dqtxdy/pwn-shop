import { Entity, Column, PrimaryColumn } from 'typeorm';
import { AssetStatus } from '../../../domain/enums';

@Entity('assets')
export class AssetEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  ownerId!: string;

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

  @Column({ type: 'double precision' })
  declaredValue!: number;

  @Column({ type: 'timestamp with time zone' })
  createdAt!: Date;
}
