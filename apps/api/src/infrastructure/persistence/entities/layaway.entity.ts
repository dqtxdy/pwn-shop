import { Entity, Column, PrimaryColumn, ManyToOne, JoinColumn, Check, Index } from 'typeorm';
import { LayawayStatus } from '../../../domain/enums';
import { ListingEntity } from './listing.entity';
import { UserEntity } from './user.entity';
import { numericTransformer } from './numeric.transformer';

@Entity('layaways')
@Check('CHK_layaway_totalPrice_positive', '"totalPrice" >= 0')
@Check('CHK_layaway_amountPaid_positive', '"amountPaid" >= 0')
@Check('CHK_layaway_amountPaid_lte_totalPrice', '"amountPaid" <= "totalPrice"')
@Check('CHK_layaway_installmentAmount_positive', '"installmentAmount" IS NULL OR "installmentAmount" >= 0')
@Check('CHK_layaway_downPayment_positive', '"downPayment" IS NULL OR "downPayment" >= 0')
@Index('UQ_active_layaway_per_listing', ['listingId'], { unique: true, where: `"status" = 'ACTIVE'` })
export class LayawayEntity {
  @PrimaryColumn()
  id!: string;

  @Column()
  listingId!: string;

  @ManyToOne(() => ListingEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listingId' })
  listing?: ListingEntity;

  @Column()
  buyerId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'buyerId' })
  buyer?: UserEntity;

  @Column({ type: 'numeric', precision: 20, scale: 2, transformer: numericTransformer })
  totalPrice!: number;

  @Column({ type: 'numeric', precision: 20, scale: 2, transformer: numericTransformer })
  amountPaid!: number;

  @Column({ type: 'timestamp with time zone' })
  deadline!: Date;

  @Column()
  status!: LayawayStatus;

  @Column({ nullable: true })
  monthsDuration?: number;

  @Column({ type: 'numeric', precision: 20, scale: 2, transformer: numericTransformer, nullable: true })
  installmentAmount?: number;

  @Column({ type: 'numeric', precision: 20, scale: 2, transformer: numericTransformer, nullable: true })
  downPayment?: number;

  @Column({ nullable: true })
  paidInstallments?: number;

  @Column({ type: 'varchar', nullable: true })
  amountPaidWei?: string;

  @Column({ type: 'varchar', nullable: true })
  downPaymentWei?: string;

  @Column({ nullable: true })
  lastPaymentTxHash?: string;

  @Column({ nullable: true })
  completedTxHash?: string;
}
