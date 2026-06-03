export const workflowSteps = [
  { title: 'Submit', description: 'Asset details and pre-shipment proof' },
  { title: 'Ship', description: 'Tracked courier to pawnshop vault' },
  { title: 'Appraise', description: 'Staff validation and valuation' },
  { title: 'Disburse', description: 'Wallet loan transaction' },
  { title: 'Return', description: 'Repayment and COD return shipment' }
];

export const customerAssets = [
  {
    key: 'A-1001',
    title: '18K gold necklace',
    status: 'Under appraisal',
    tracking: 'VNPOST-4481',
    declaredValue: '2,400 USDC'
  },
  {
    key: 'A-1002',
    title: 'MacBook Pro M3',
    status: 'Loan active',
    tracking: 'VIETTEL-9104',
    declaredValue: '1,800 USDC'
  }
];

export const staffQueue = [
  {
    key: 'Q-881',
    asset: 'Rolex Datejust',
    customerProof: '4 photos, 1 package video',
    unboxingProof: 'Pending',
    action: 'Record appraisal'
  },
  {
    key: 'Q-882',
    asset: 'Gold ring set',
    customerProof: '6 photos',
    unboxingProof: 'Uploaded',
    action: 'Issue offer'
  }
];

export const adminMetrics = [
  { label: 'Active loans', value: 18 },
  { label: 'Vault assets', value: 31 },
  { label: 'Open disputes', value: 2 },
  { label: 'Protocol fees', value: '8,420 USDC' }
];

export const auditEvents = [
  { key: 'E-1', event: 'AppraisalUpdated', asset: 'A-1001', source: 'Oracle', time: '09:12' },
  { key: 'E-2', event: 'LoanCreated', asset: 'A-1002', source: 'PawnProtocol', time: '10:03' },
  { key: 'E-3', event: 'ShipmentDelivered', asset: 'A-1003', source: 'Logistics Adapter', time: '10:44' }
];
