import StatusIndicator from '@cloudscape-design/components/status-indicator';
import type { AssetStatus, DemoSession } from './api';

export const roleLabels: Record<DemoSession['role'], string> = {
  CUSTOMER: 'Customer Workspace',
  STAFF: 'Validator Workspace',
  ADMIN: 'Admin Workspace'
};

export const roleSelectOptions = [
  { label: 'Customer', value: 'CUSTOMER' },
  { label: 'Staff / Validator', value: 'STAFF' },
  { label: 'Administrator', value: 'ADMIN' }
];

export const workspaceHomeHref: Record<DemoSession['role'], string> = {
  CUSTOMER: '#overview',
  STAFF: '#work-queue',
  ADMIN: '#admin-overview'
};

export const pageLabelMap: Record<string, string> = {
  '#overview': 'Overview',
  '#new-pawn': 'New Pawn Request',
  '#my-assets': 'My Assets and Loans',
  '#marketplace': 'Marketplace',
  '#fractions': 'Fractions',
  '#evidence': 'Evidence and Shipments',
  '#work-queue': 'Work Queue',
  '#intake-evidence': 'Intake Evidence',
  '#appraisals': 'Appraisals',
  '#offer-drafting': 'Offer Drafting',
  '#admin-overview': 'Overview',
  '#audit-events': 'Audit Events',
  '#risk-parameters': 'Risk Parameters',
  '#protocol-treasury': 'Protocol Treasury',
  '#system-adapters': 'System Adapters'
};

export const getStatusIndicator = (status: AssetStatus) => {
  switch (status) {
    case 'DRAFT':
      return <StatusIndicator type="info">Draft</StatusIndicator>;
    case 'AWAITING_SHIPMENT':
      return <StatusIndicator type="warning">Awaiting Shipment</StatusIndicator>;
    case 'IN_TRANSIT':
      return <StatusIndicator type="in-progress">In Transit</StatusIndicator>;
    case 'RECEIVED':
      return <StatusIndicator type="info">Received</StatusIndicator>;
    case 'UNDER_APPRAISAL':
      return <StatusIndicator type="in-progress">Under Appraisal</StatusIndicator>;
    case 'OFFER_ISSUED':
      return <StatusIndicator type="success">Offer Issued</StatusIndicator>;
    case 'LOAN_ACTIVE':
      return <StatusIndicator type="success">Loan Active</StatusIndicator>;
    case 'RETURNED':
      return <StatusIndicator type="stopped">Returned</StatusIndicator>;
    case 'LISTED':
      return <StatusIndicator type="success">Listed</StatusIndicator>;
    case 'FRACTIONALIZED':
      return <StatusIndicator type="success">Fractionalized</StatusIndicator>;
    case 'DISPUTED':
      return <StatusIndicator type="error">Disputed</StatusIndicator>;
    default:
      return <StatusIndicator type="info">{status}</StatusIndicator>;
  }
};

export const formatId = (id: string) => (id.length > 8 ? `${id.slice(0, 8)}...` : id);
