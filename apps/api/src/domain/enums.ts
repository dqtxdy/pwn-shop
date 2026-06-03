export enum UserRole {
  Customer = 'CUSTOMER',
  Staff = 'STAFF',
  Admin = 'ADMIN'
}

export enum KycStatus {
  NotStarted = 'NOT_STARTED',
  Pending = 'PENDING',
  Verified = 'VERIFIED',
  Rejected = 'REJECTED'
}

export enum AssetStatus {
  Draft = 'DRAFT',
  AwaitingShipment = 'AWAITING_SHIPMENT',
  InTransit = 'IN_TRANSIT',
  Received = 'RECEIVED',
  UnderAppraisal = 'UNDER_APPRAISAL',
  OfferIssued = 'OFFER_ISSUED',
  LoanActive = 'LOAN_ACTIVE',
  Returning = 'RETURNING',
  Returned = 'RETURNED',
  Listed = 'LISTED',
  Fractionalized = 'FRACTIONALIZED',
  Disputed = 'DISPUTED'
}

export enum EvidenceKind {
  CustomerPreShipment = 'CUSTOMER_PRE_SHIPMENT',
  StaffUnboxing = 'STAFF_UNBOXING',
  Dispute = 'DISPUTE'
}

export enum ShipmentDirection {
  ToShop = 'TO_SHOP',
  ReturnToCustomer = 'RETURN_TO_CUSTOMER'
}

export enum ShipmentStatus {
  Pending = 'PENDING',
  InTransit = 'IN_TRANSIT',
  Delivered = 'DELIVERED',
  Returning = 'RETURNING'
}

export enum LoanStatus {
  Offered = 'OFFERED',
  Active = 'ACTIVE',
  Repaid = 'REPAID',
  Defaulted = 'DEFAULTED',
  Liquidated = 'LIQUIDATED'
}

export enum ListingStatus {
  Active = 'ACTIVE',
  Sold = 'SOLD',
  Cancelled = 'CANCELLED'
}

export enum DisputeStatus {
  Open = 'OPEN',
  Resolved = 'RESOLVED'
}
