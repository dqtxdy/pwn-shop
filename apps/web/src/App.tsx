import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';

// Cloudscape Design System Components
import AppLayout from '@cloudscape-design/components/app-layout';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import SideNavigation from '@cloudscape-design/components/side-navigation';
import ContentLayout from '@cloudscape-design/components/content-layout';
import Header from '@cloudscape-design/components/header';
import Container from '@cloudscape-design/components/container';
import SpaceBetween from '@cloudscape-design/components/space-between';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Table from '@cloudscape-design/components/table';
import Cards from '@cloudscape-design/components/cards';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Input from '@cloudscape-design/components/input';
import Textarea from '@cloudscape-design/components/textarea';
import Button from '@cloudscape-design/components/button';
import Alert from '@cloudscape-design/components/alert';
import Badge from '@cloudscape-design/components/badge';
import Select from '@cloudscape-design/components/select';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Box from '@cloudscape-design/components/box';
import Modal from '@cloudscape-design/components/modal';
import Flashbar from '@cloudscape-design/components/flashbar';
import FileUpload from '@cloudscape-design/components/file-upload';

import { api } from './api';
import type { Asset, Listing, PawnDashboard, AssetStatus, DemoSession } from './api';
import { workflowSteps } from './mockData';

type AppProps = {
  walletButton: ReactNode;
};

type NotificationItem = {
  type: 'success' | 'error' | 'info' | 'warning';
  content: string;
  id: string;
  dismissible: boolean;
  onDismiss: () => void;
};

const roleLabels: Record<DemoSession['role'], string> = {
  CUSTOMER: 'Customer Workspace',
  STAFF: 'Validator Workspace',
  ADMIN: 'Admin Workspace'
};

const roleSelectOptions = [
  { label: 'Customer', value: 'CUSTOMER' },
  { label: 'Validator', value: 'STAFF' },
  { label: 'Admin', value: 'ADMIN' }
];

const workspaceHomeHref: Record<DemoSession['role'], string> = {
  CUSTOMER: '#overview',
  STAFF: '#work-queue',
  ADMIN: '#admin-overview'
};

const pageLabelMap: Record<string, string> = {
  '#overview': 'Overview',
  '#new-pawn': 'New Pawn Request',
  '#my-assets': 'My Assets and Loans',
  '#marketplace': 'Marketplace',
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

// Map asset status to human-readable labels and status indicator types
const getStatusIndicator = (status: AssetStatus) => {
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
    case 'DISPUTED':
      return <StatusIndicator type="error">Disputed</StatusIndicator>;
    default:
      return <StatusIndicator type="info">{status}</StatusIndicator>;
  }
};

const formatId = (id: string) => {
  return id.length > 8 ? `${id.slice(0, 8)}...` : id;
};

export default function App({ walletButton }: AppProps) {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [dashboard, setDashboard] = useState<PawnDashboard | null>(null);
  const [marketplace, setMarketplace] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  // Layout navigation states
  const [navigationOpen, setNavigationOpen] = useState(true);
  const [activeHref, setActiveHref] = useState('#overview');

  // Flash notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Search state & handler
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = (query: string) => {
    const q = query.toLowerCase().trim();
    if (!q) return;
    if (q.length < 2) {
      addNotification('warning', 'Please enter a search term with at least 2 characters');
      return;
    }
    if (!dashboard) return;

    const matchedAsset = dashboard.assets.find(
      (a) => a.id.toLowerCase().includes(q) || a.title.toLowerCase().includes(q)
    );
    if (matchedAsset) {
      setSelectedAsset(matchedAsset);
      setActiveHref('#my-assets');
      addNotification('info', `Found and selected matching asset "${matchedAsset.title}"`);
      return;
    }

    const matchedLoan = dashboard.loans.find(
      (l) => l.id.toLowerCase().includes(q) || l.assetId.toLowerCase().includes(q)
    );
    if (matchedLoan) {
      const asset = dashboard.assets.find((a) => a.id === matchedLoan.assetId);
      if (asset) {
        setSelectedAsset(asset);
        setActiveHref('#my-assets');
        addNotification('info', `Found active loan ${matchedLoan.id} for "${asset.title}"`);
        return;
      }
    }

    const matchedListing = marketplace.find(
      (l) => l.id.toLowerCase().includes(q) || l.assetId.toLowerCase().includes(q)
    );
    if (matchedListing) {
      setActiveHref('#marketplace');
      addNotification('info', `Found listing ${matchedListing.id} in Marketplace`);
      return;
    }

    addNotification('warning', `No results found for "${query}"`);
  };

  // Selection states
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [submittingAsset, setSubmittingAsset] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [selectedStaffAsset, setSelectedStaffAsset] = useState<Asset | null>(null);

  // Forms state
  // New Pawn Request Form
  const [pawnTitle, setPawnTitle] = useState('');
  const [pawnCategory, setPawnCategory] = useState('');
  const [pawnDeclaredValue, setPawnDeclaredValue] = useState('');
  const [pawnRequestedAmount, setPawnRequestedAmount] = useState('');
  const [pawnDescription, setPawnDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Appraisals Form
  const [appraisalAssetId, setAppraisalAssetId] = useState('');
  const [appraisalValue, setAppraisalValue] = useState('');
  const [appraisalLtv, setAppraisalLtv] = useState('60');

  // Listing Form / Modal
  const [isListModalVisible, setIsListModalVisible] = useState(false);
  const [listingAssetId, setListingAssetId] = useState<string | null>(null);
  const [listPrice, setListPrice] = useState('');

  const addNotification = (type: 'success' | 'error' | 'info' | 'warning', content: string) => {
    setNotifications([
      {
        type,
        content,
        id: Math.random().toString(),
        dismissible: true,
        onDismiss: () => setNotifications([])
      }
    ]);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [dash, market] = await Promise.all([
        api.fetchDashboard(),
        api.fetchMarketplace()
      ]);
      setDashboard(dash);
      setMarketplace(market);

      // Keep selected asset sync'd with fresh data
      if (selectedAsset) {
        const updated = dash.assets.find((a) => a.id === selectedAsset.id);
        if (updated) {
          setSelectedAsset(updated);
        }
      }
    } catch (err: any) {
      console.error(err);
      addNotification('error', 'Failed to load dashboard data from API');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initSessionAndLoad = async () => {
      try {
        const defaultSession = await api.demoLogin('CUSTOMER');
        setSession(defaultSession);
        setActiveHref('#overview');
      } catch (err) {
        console.error('Failed to initialize demo session', err);
      }
      loadData();
    };
    initSessionAndLoad();
  }, []);

  useEffect(() => {
    const assets = dashboard?.assets ?? [];
    if (activeHref === '#my-assets' && !selectedAsset && assets.length > 0) {
      setSelectedAsset(assets[0]);
    }
  }, [activeHref, selectedAsset, dashboard]);

  const handleRoleChange = async (role: 'CUSTOMER' | 'STAFF' | 'ADMIN') => {
    setNotifications([]); // Clear notifications on role switch!
    setSearchQuery('');  // Clear search input on role switch!
    try {
      const newSession = await api.demoLogin(role);
      setSession(newSession);

      // Set default sidebar selection for the selected role
      if (role === 'CUSTOMER') {
        setActiveHref('#overview');
      } else if (role === 'STAFF') {
        setActiveHref('#work-queue');
      } else if (role === 'ADMIN') {
        setActiveHref('#admin-overview');
      }
      setSelectedAsset(null);
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to switch demo session');
    }
  };

  // Convert File helper
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  // Submission handlers
  const onSubmitAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) {
      addNotification('error', 'No active session found');
      return;
    }
    setSubmittingAsset(true);
    try {
      // 1. Submit Asset Details
      const newAsset = await api.createAsset({
        ownerId: session.userId,
        title: pawnTitle,
        category: pawnCategory,
        description: pawnDescription,
        declaredValue: Number(pawnDeclaredValue)
      });

      // 2. Upload Evidence (Base64 file payload as required)
      if (selectedFiles.length > 0) {
        for (const file of selectedFiles) {
          try {
            const base64 = await fileToBase64(file);
            await api.uploadEvidence({
              assetId: newAsset.id,
              uploadedBy: session.userId,
              kind: 'CUSTOMER_PRE_SHIPMENT',
              fileName: file.name,
              bytesBase64: base64
            });
          } catch (err) {
            console.error('File conversion failed, falling back to mock evidence payload', err);
            await api.uploadEvidence({
              assetId: newAsset.id,
              uploadedBy: session.userId,
              kind: 'CUSTOMER_PRE_SHIPMENT',
              fileName: file.name,
              bytesBase64: 'bW9jay1maWxlLWNvbnRlbnQ='
            });
          }
        }
      } else {
        // Fallback mock evidence upload if no file is chosen
        await api.uploadEvidence({
          assetId: newAsset.id,
          uploadedBy: session.userId,
          kind: 'CUSTOMER_PRE_SHIPMENT',
          fileName: 'pre_shipment_receipt.jpg',
          bytesBase64: 'bW9jay1maWxlLWNvbnRlbnQ='
        });
      }

      addNotification('success', `Asset "${pawnTitle}" submitted successfully!`);
      
      // Reset pawn form fields
      setPawnTitle('');
      setPawnCategory('');
      setPawnDeclaredValue('');
      setPawnRequestedAmount('');
      setPawnDescription('');
      setSelectedFiles([]);
      
      await loadData();
    } catch (err: any) {
      addNotification('error', err.message || 'Asset submission failed');
    } finally {
      setSubmittingAsset(false);
    }
  };

  const handleShipAsset = async (assetId: string) => {
    if (!session) {
      addNotification('error', 'No active session found');
      return;
    }
    setActionLoadingId(assetId);
    try {
      await api.createShipment({
        assetId,
        direction: 'TO_SHOP',
        carrier: 'FedEx',
        codRequired: false
      });
      addNotification('success', 'Shipment created and tracking registered!');
      await loadData();
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to create shipment');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAcceptLoan = async (loanId: string) => {
    if (!session || !session.walletAddress) {
      addNotification('error', 'Session wallet address is required');
      return;
    }
    setActionLoadingId(loanId);
    try {
      await api.acceptLoan(loanId, {
        borrowerWallet: session.walletAddress
      });
      addNotification('success', 'Loan accepted! principal amount disbursed.');
      await loadData();
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to accept loan');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRepaySelectedLoan = async () => {
    if (!session) {
      addNotification('error', 'No active session found');
      return;
    }
    if (!selectedAsset) {
      addNotification('warning', 'Please select an asset with an active loan from the table first.');
      return;
    }
    const loan = dashboard?.loans.find((l) => l.assetId === selectedAsset.id && l.status === 'ACTIVE');
    if (!loan) {
      addNotification('error', 'No active loan found for the selected asset.');
      return;
    }

    setActionLoadingId(selectedAsset.id);
    try {
      await api.recordRepayment({
        loanId: loan.id,
        amount: loan.principal,
        txHash: '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
      });
      addNotification('success', 'Loan fully repaid! Asset collateral released.');
      setSelectedAsset(null);
      await loadData();
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to process repayment');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleListAsset = (assetId: string) => {
    setListingAssetId(assetId);
    setListPrice('');
    setIsListModalVisible(true);
  };

  const onSubmitListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session || !listingAssetId) return;
    setActionLoadingId(listingAssetId);
    try {
      await api.createListing({
        assetId: listingAssetId,
        sellerId: session.userId,
        price: Number(listPrice),
        isProtocolOwned: false
      });
      addNotification('success', 'Asset successfully listed in the Marketplace!');
      setIsListModalVisible(false);
      await loadData();
    } catch (err: any) {
      addNotification('error', err.message || 'Listing creation failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUploadUnboxingProof = async (assetId: string) => {
    if (!session) {
      addNotification('error', 'No active session found');
      return;
    }
    setActionLoadingId(assetId);
    try {
      await api.uploadEvidence({
        assetId,
        uploadedBy: session.userId,
        kind: 'STAFF_UNBOXING',
        fileName: 'unboxing_cam_4.mp4',
        bytesBase64: 'dW5ib3hpbmctdmlkZW8='
      });
      addNotification('success', 'Unboxing proof recorded! Asset marked as RECEIVED.');
      await loadData();
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to upload unboxing proof');
    } finally {
      setActionLoadingId(null);
    }
  };

  const onSubmitAppraisal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) {
      addNotification('error', 'No active session found');
      return;
    }
    setSubmittingAsset(true);
    try {
      const estimatedValue = Number(appraisalValue);
      const ltvBps = Number(appraisalLtv || 60) * 100;

      // 1. Submit the appraisal
      await api.createAppraisal({
        assetId: appraisalAssetId,
        appraiserId: session.userId,
        estimatedValue,
        ltvBps,
        interestAprBps: 500, // 5% APR
        evidenceUri: 'ipfs://mock-physical-appraisal-valuation'
      });

      // 2. Automatically create/register the Loan Offer DTO
      const asset = dashboard?.assets.find((a) => a.id === appraisalAssetId);
      if (!asset) {
        addNotification('error', 'Selected asset not found');
        return;
      }
      const borrowerId = asset.ownerId;

      await api.createLoanOffer({
        assetId: appraisalAssetId,
        borrowerId,
        principal: estimatedValue * (ltvBps / 10000),
        durationDays: 30
      });

      addNotification('success', 'Appraisal recorded and Loan Offer generated successfully!');
      setAppraisalAssetId('');
      setAppraisalValue('');
      setAppraisalLtv('60');
      await loadData();
    } catch (err: any) {
      addNotification('error', err.message || 'Failed to register appraisal');
    } finally {
      setSubmittingAsset(false);
    }
  };

  const handleBuy = async (listing: Listing) => {
    if (!session) {
      addNotification('error', 'No active session found');
      return;
    }
    setActionLoadingId(listing.id);
    try {
      await api.createLayaway({
        listingId: listing.id,
        buyerId: session.userId,
        downPayment: listing.price * 0.2, // 20% down
        monthsDuration: 6
      });
      addNotification('success', `Layaway initiated! 20% down payment processed.`);
      await loadData();
    } catch (err: any) {
      addNotification('error', err.message || 'Layaway failed');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Determine current active workspace context
  const userRole = session?.role || 'CUSTOMER';

  // Derived dashboard metrics
  const activeLoansCount = dashboard?.loans.filter((l) => l.status === 'ACTIVE').length ?? 0;
  const vaultAssetsCount = dashboard?.assets.filter((a) =>
    ['RECEIVED', 'UNDER_APPRAISAL', 'OFFER_ISSUED', 'LOAN_ACTIVE', 'DISPUTED'].includes(a.status)
  ).length ?? 0;
  const openDisputesCount = dashboard?.disputes.filter((d) => d.status === 'OPEN').length ?? 0;
  const protocolFees = dashboard?.protocolFeesCollected ?? 0;

  // Next Actions for customer
  const customerAssets = dashboard?.assets ?? [];
  const customerActiveLoans = dashboard?.loans.filter(
    (loan) => loan.borrowerId === session?.userId && loan.status === 'ACTIVE'
  ).length ?? 0;
  const customerPendingOffers = dashboard?.loans.filter(
    (loan) => loan.borrowerId === session?.userId && loan.status === 'OFFERED'
  ).length ?? 0;
  const customerMarketplaceListings = marketplace.filter(
    (listing) => listing.sellerId === session?.userId && listing.status === 'ACTIVE'
  ).length ?? 0;
  const assetsInCustody = customerAssets.filter((asset) =>
    ['RECEIVED', 'UNDER_APPRAISAL', 'OFFER_ISSUED', 'LOAN_ACTIVE'].includes(asset.status)
  ).length;
  const awaitingShipmentAssets = customerAssets.filter((asset) => asset.status === 'AWAITING_SHIPMENT');
  const inTransitAssets = customerAssets.filter((asset) => asset.status === 'IN_TRANSIT');
  const custodyVerifiedAssets = customerAssets.filter((asset) =>
    ['RECEIVED', 'UNDER_APPRAISAL', 'LOAN_ACTIVE', 'RETURNED'].includes(asset.status)
  );
  const latestShipmentAsset = [...customerAssets]
    .filter((asset) => ['AWAITING_SHIPMENT', 'IN_TRANSIT', 'RECEIVED', 'UNDER_APPRAISAL', 'LOAN_ACTIVE', 'RETURNED'].includes(asset.status))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  const nextActions: Array<{
    id: string;
    text: string;
    actionText: string;
    loadingTarget: string;
    onClick: () => void;
  }> = [];
  customerAssets.forEach((a) => {
    if (a.status === 'AWAITING_SHIPMENT') {
      nextActions.push({
        id: `ship-${a.id}`,
        text: `Asset "${a.title}" is ready to ship to custody.`,
        actionText: 'Ship Courier',
        loadingTarget: a.id,
        onClick: () => handleShipAsset(a.id)
      });
    }
    const offeredLoan = dashboard?.loans.find((l) => l.assetId === a.id && l.status === 'OFFERED');
    if (a.status === 'OFFER_ISSUED' && offeredLoan) {
      nextActions.push({
        id: `accept-${a.id}`,
        text: `Loan offer issued for "${a.title}" (${offeredLoan.principal} USDC).`,
        actionText: 'Accept Loan Offer',
        loadingTarget: offeredLoan.id,
        onClick: () => handleAcceptLoan(offeredLoan.id)
      });
    }
    const activeLoan = dashboard?.loans.find((l) => l.assetId === a.id && l.status === 'ACTIVE');
    if (a.status === 'LOAN_ACTIVE' && activeLoan) {
      nextActions.push({
        id: `repay-${a.id}`,
        text: `Active loan outstanding for "${a.title}" (${activeLoan.principal} USDC).`,
        actionText: 'Pay Off Loan',
        loadingTarget: a.id,
        onClick: () => {
          setSelectedAsset(a);
          setActiveHref('#my-assets');
        }
      });
    }
    const isListed = marketplace.some((m) => m.assetId === a.id);
    if (['RECEIVED', 'RETURNED'].includes(a.status) && !isListed) {
      nextActions.push({
        id: `list-${a.id}`,
        text: `Collateral "${a.title}" is in custody and can be listed for sale.`,
        actionText: 'List in Marketplace',
        loadingTarget: a.id,
        onClick: () => handleListAsset(a.id)
      });
    }
  });

  const customerOverviewMetrics = [
    { label: 'Active loans', value: `${customerActiveLoans}` },
    { label: 'Assets in custody', value: `${assetsInCustody}` },
    { label: 'Pending offers', value: `${customerPendingOffers}` },
    { label: 'Marketplace listings', value: `${customerMarketplaceListings}` }
  ];

  const customerShipmentSummary = [
    { label: 'Awaiting shipment', value: `${awaitingShipmentAssets.length}` },
    { label: 'In transit', value: `${inTransitAssets.length}` },
    { label: 'Custody verified', value: `${custodyVerifiedAssets.length}` },
    { label: 'Latest tracked asset', value: latestShipmentAsset ? latestShipmentAsset.title : 'No shipment activity' }
  ];

  const shipmentRecords = (dashboard?.assets ?? []).flatMap((asset) => {
    const tracking = dashboard?.loans.find((loan) => loan.assetId === asset.id)?.contractTxHash;
    if (asset.status !== 'DRAFT' && asset.status !== 'AWAITING_SHIPMENT') {
      return [
        {
          id: `SH-${asset.id.slice(2)}`,
          assetId: asset.id,
          direction: 'TO_SHOP',
          carrier: 'FedEx',
          trackingCode: tracking ? `${tracking.slice(0, 14)}...` : 'FEDEX-93041',
          status: asset.status === 'IN_TRANSIT' ? 'IN_TRANSIT' : 'DELIVERED'
        }
      ];
    }
    return [];
  });

  const shipmentSummary = {
    total: shipmentRecords.length,
    inTransit: shipmentRecords.filter((shipment) => shipment.status === 'IN_TRANSIT').length,
    delivered: shipmentRecords.filter((shipment) => shipment.status === 'DELIVERED').length,
    latestCarrier: shipmentRecords[0]?.carrier || 'FedEx'
  };

  // Sidebar items based on the active role
  const sideNavHeader = {
    href: '#overview',
    text: roleLabels[userRole]
  };

  const sideNavItems = () => {
    if (userRole === 'CUSTOMER') {
      return [
        {
          type: 'section' as const,
          text: 'Operations',
          items: [
            { type: 'link' as const, text: 'Overview', href: '#overview' },
            { type: 'link' as const, text: 'New Pawn Request', href: '#new-pawn' },
            { type: 'link' as const, text: 'My Assets & Loans', href: '#my-assets' }
          ]
        },
        {
          type: 'section' as const,
          text: 'Records',
          items: [
            { type: 'link' as const, text: 'Marketplace', href: '#marketplace' },
            { type: 'link' as const, text: 'Evidence & Shipments', href: '#evidence' }
          ]
        }
      ];
    } else if (userRole === 'STAFF') {
      return [
        {
          type: 'section' as const,
          text: 'Queue',
          items: [
            { type: 'link' as const, text: 'Work Queue', href: '#work-queue' },
            { type: 'link' as const, text: 'Intake Evidence', href: '#intake-evidence' }
          ]
        },
        {
          type: 'section' as const,
          text: 'Review',
          items: [
            { type: 'link' as const, text: 'Appraisals', href: '#appraisals' },
            { type: 'link' as const, text: 'Offer Drafting', href: '#offer-drafting' }
          ]
        }
      ];
    } else {
      return [
        {
          type: 'section' as const,
          text: 'Governance',
          items: [
            { type: 'link' as const, text: 'Overview', href: '#admin-overview' },
            { type: 'link' as const, text: 'Audit Events', href: '#audit-events' },
            { type: 'link' as const, text: 'Risk Parameters', href: '#risk-parameters' }
          ]
        },
        {
          type: 'section' as const,
          text: 'Infrastructure',
          items: [
            { type: 'link' as const, text: 'Protocol Treasury', href: '#protocol-treasury' },
            { type: 'link' as const, text: 'System Adapters', href: '#system-adapters' }
          ]
        }
      ];
    }
  };

  // Workflow steps tracking mapping helper
  const getWorkflowStep = (status: AssetStatus): number => {
    switch (status) {
      case 'DRAFT':
        return 0;
      case 'AWAITING_SHIPMENT':
      case 'IN_TRANSIT':
        return 1;
      case 'RECEIVED':
      case 'UNDER_APPRAISAL':
        return 2;
      case 'OFFER_ISSUED':
      case 'LOAN_ACTIVE':
        return 3;
      case 'RETURNING':
      case 'RETURNED':
        return 4;
      default:
        return 0;
    }
  };

  // Render Page Content based on selected menu
  const renderContent = () => {
    if (userRole === 'CUSTOMER') {
      switch (activeHref) {
        case '#overview':
          const metricSecondaryLabels: Record<string, string> = {
            'Active loans': 'Active repayment',
            'Assets in custody': 'Verified or in vault',
            'Pending offers': 'Awaiting acceptance',
            'Marketplace listings': 'Active listing'
          };

          const seenActionTexts = new Set<string>();
          const uniqueNextActions: typeof nextActions = [];
          nextActions.forEach((act) => {
            if (!seenActionTexts.has(act.text)) {
              seenActionTexts.add(act.text);
              uniqueNextActions.push(act);
            }
          });
          const displayedNextActions = uniqueNextActions.slice(0, 4);

          return (
            <SpaceBetween size="l">
              <Container className="quickstart-panel">
                <div className="quickstart-panel__content">
                  <div className="quickstart-panel__visual">
                    <div className="quickstart-vault-icon"></div>
                  </div>
                  <div className="quickstart-panel__text">
                    <Box variant="h2" padding={{ bottom: 'xxs' }}>Start a pawn-backed loan</Box>
                    <Box variant="p" color="text-body-secondary">
                      Submit an asset, ship it to the vault, review the appraisal, and accept the loan offer.
                    </Box>
                    <div className="quickstart-panel__actions">
                      <SpaceBetween direction="horizontal" size="xs">
                        <Button variant="primary" onClick={() => setActiveHref('#new-pawn')}>
                          New pawn request
                        </Button>
                        <Button variant="normal" onClick={() => setActiveHref('#my-assets')}>
                          View my assets
                        </Button>
                      </SpaceBetween>
                    </div>
                  </div>
                </div>
              </Container>

              <div className="overview-band">
                {customerOverviewMetrics.map((item) => (
                  <div key={item.label} className="metric-tile">
                    <Box variant="awsui-key-label">{item.label}</Box>
                    <Box variant="h2" className="metric-value">{item.value}</Box>
                    <div className="metric-secondary-text">
                      {metricSecondaryLabels[item.label] || ''}
                    </div>
                  </div>
                ))}
              </div>

              <div className="overview-grid">
                <div className="overview-main-column">
                  <Container
                    variant="stacked"
                    header={
                      <Header
                        variant="h2"
                        actions={
                          <Button variant="link" onClick={() => setActiveHref('#my-assets')}>
                            View all assets
                          </Button>
                        }
                      >
                        Next Actions
                      </Header>
                    }
                    disableContentPaddings
                  >
                    {displayedNextActions.length > 0 ? (
                      <div className="stacked-action-list">
                        {displayedNextActions.map((act) => (
                          <div key={act.id} className="stacked-action-row">
                            <Box variant="p" className="stacked-action-text">{act.text}</Box>
                            <Button
                              variant="normal"
                              onClick={act.onClick}
                              loading={actionLoadingId === act.loadingTarget}
                            >
                              {act.actionText}
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Box className="muted-copy" padding="l">
                        No pending actions. Assets are moving through the workflow normally.
                      </Box>
                    )}
                  </Container>
                </div>

                <div className="overview-side-column">
                  <Container variant="stacked" header={<Header variant="h2">Evidence and Shipment Summary</Header>}>
                    <div className="summary-grid">
                      {customerShipmentSummary.map((item) => (
                        <div key={item.label} className="summary-item">
                          <Box variant="awsui-key-label">{item.label}</Box>
                          <Box variant="p">{item.value}</Box>
                        </div>
                      ))}
                    </div>
                  </Container>
                </div>
              </div>

              <Container variant="stacked" header={<Header variant="h2">Recent Asset Activity</Header>}>
                <Table
                  variant="embedded"
                  contentDensity="compact"
                  columnDefinitions={[
                    { id: 'title', header: 'Asset', cell: (item) => item.title, minWidth: 220 },
                    { id: 'status', header: 'Status', cell: (item) => getStatusIndicator(item.status), minWidth: 150 },
                    {
                      id: 'value',
                      header: 'Declared Value',
                      cell: (item) => <span className="numeric-cell">{`${item.declaredValue} USDC`}</span>,
                      minWidth: 140
                    }
                  ]}
                  items={customerAssets.slice(0, 4)}
                  empty="No recent asset submissions"
                />
              </Container>
            </SpaceBetween>
          );

        case '#new-pawn':
          return (
            <Container variant="stacked" header={<Header variant="h2">New Pawn Request</Header>}>
              <form onSubmit={onSubmitAsset}>
                <Form
                  actions={
                    <SpaceBetween direction="horizontal" size="xs">
                      <Button variant="link" onClick={() => setActiveHref('#overview')}>Cancel</Button>
                      <Button variant="primary" formAction="submit" loading={submittingAsset}>
                        Submit Request
                      </Button>
                    </SpaceBetween>
                  }
                >
                  <ColumnLayout columns={2}>
                    <SpaceBetween size="l">
                      <Box variant="h3">Asset Information</Box>
                      <FormField label="Asset title" controlId="title" description="Name of the physical item.">
                        <Input
                          value={pawnTitle}
                          onChange={({ detail }) => setPawnTitle(detail.value)}
                          placeholder="18K gold necklace"
                          disabled={submittingAsset}
                        />
                      </FormField>
                      <FormField label="Category" controlId="category" description="General item classification.">
                        <Input
                          value={pawnCategory}
                          onChange={({ detail }) => setPawnCategory(detail.value)}
                          placeholder="Gold, electronics, watch"
                          disabled={submittingAsset}
                        />
                      </FormField>
                      <FormField label="Condition notes" controlId="description" description="Include serial numbers, certificates, flaws, etc.">
                        <Textarea
                          value={pawnDescription}
                          onChange={({ detail }) => setPawnDescription(detail.value)}
                          placeholder="Serial number, receipt, visible condition, accessories"
                          disabled={submittingAsset}
                        />
                      </FormField>
                    </SpaceBetween>

                    <SpaceBetween size="l">
                      <Box variant="h3">Financial Terms & Evidence</Box>
                      <FormField label="Declared value" controlId="declaredValue" description="Estimated value in USDC.">
                        <Input
                          type="number"
                          value={pawnDeclaredValue}
                          onChange={({ detail }) => setPawnDeclaredValue(detail.value)}
                          placeholder="2000"
                          disabled={submittingAsset}
                        />
                      </FormField>
                      <FormField label="Requested loan" controlId="requestedAmount" description="Requested loan size in USDC.">
                        <Input
                          type="number"
                          value={pawnRequestedAmount}
                          onChange={({ detail }) => setPawnRequestedAmount(detail.value)}
                          placeholder="1200"
                          disabled={submittingAsset}
                        />
                      </FormField>
                      <FormField label="Pre-shipment evidence" description="Upload photos or videos of the physical asset.">
                        <FileUpload
                          onChange={({ detail }) => setSelectedFiles(detail.value)}
                          value={selectedFiles}
                          i18nStrings={{
                            uploadButtonText: e =>
                              e ? "Choose files" : "Choose file",
                            dropzoneText: e =>
                              e ? "Drop files to upload" : "Drop file to upload",
                            removeFileAriaLabel: e =>
                              `Remove file ${e + 1}`,
                            limitShowFewer: "Show fewer",
                            limitShowMore: "Show more",
                            errorIconAriaLabel: "Error"
                          }}
                          showFileLastModified
                          showFileSize
                          showFileThumbnail
                          tokenLimit={3}
                          constraintText="Upload JPG, PNG, or PDF up to 10MB."
                          multiple
                        />
                      </FormField>
                    </SpaceBetween>
                  </ColumnLayout>
                </Form>
              </form>
            </Container>
          );

        case '#my-assets':
          const selectedAssetActiveLoan = dashboard?.loans.find(
            (l) => l.assetId === selectedAsset?.id && l.status === 'ACTIVE'
          );
          const selectedAssetOfferedLoan = dashboard?.loans.find(
            (l) => l.assetId === selectedAsset?.id && l.status === 'OFFERED'
          );
          const isListed = marketplace.some((m) => m.assetId === selectedAsset?.id && m.status === 'ACTIVE');

          return (
            <div className="assets-layout">
              <Container variant="stacked" header={<Header variant="h2">My Assets</Header>}>
                <div className="demo-table-wrapper">
                  <Table
                    variant="embedded"
                    contentDensity="compact"
                    columnDefinitions={[
                      {
                        id: 'id',
                        header: 'Asset ID',
                        cell: (item) => (
                          <code className="asset-id-code" title={item.id}>
                            {formatId(item.id)}
                          </code>
                        ),
                        minWidth: 120
                      },
                      { id: 'title', header: 'Asset Title', cell: (item) => item.title, minWidth: 220 },
                      { id: 'status', header: 'Status', cell: (item) => getStatusIndicator(item.status), minWidth: 150 },
                      {
                        id: 'value',
                        header: 'Declared Value',
                        cell: (item) => <span className="numeric-cell">{`${item.declaredValue} USDC`}</span>,
                        minWidth: 140
                      }
                    ]}
                    items={customerAssets}
                    selectedItems={selectedAsset ? [selectedAsset] : []}
                    onSelectionChange={({ detail }) => setSelectedAsset(detail.selectedItems[0])}
                    onRowClick={({ detail }) => setSelectedAsset(detail.item)}
                    selectionType="single"
                    trackBy="id"
                    empty="No assets found."
                  />
                </div>
              </Container>

              <Container variant="stacked" header={<Header variant="h2">Asset Lifecycle Detail</Header>}>
                {selectedAsset ? (
                  <SpaceBetween size="l">
                    <div>
                      <Box variant="h3">{selectedAsset.title}</Box>
                      <Box variant="small" color="text-body-secondary">
                        <span title={selectedAsset.id}>{formatId(selectedAsset.id)}</span>
                      </Box>
                    </div>

                    <SpaceBetween size="s">
                      {selectedAsset.status === 'AWAITING_SHIPMENT' && (
                        <Button
                          variant="primary"
                          loading={actionLoadingId === selectedAsset.id}
                          onClick={() => handleShipAsset(selectedAsset.id)}
                        >
                          Ship Courier
                        </Button>
                      )}

                      {selectedAsset.status === 'OFFER_ISSUED' && selectedAssetOfferedLoan && (
                        <Button
                          variant="primary"
                          loading={actionLoadingId === selectedAssetOfferedLoan.id}
                          onClick={() => handleAcceptLoan(selectedAssetOfferedLoan.id)}
                        >
                          Accept Loan Offer
                        </Button>
                      )}

                      {['RECEIVED', 'RETURNED'].includes(selectedAsset.status) && !isListed && (
                        <Button onClick={() => handleListAsset(selectedAsset.id)}>
                          List For Sale
                        </Button>
                      )}

                      {selectedAssetActiveLoan && (
                        <Container header={<Header variant="h3">Active Loan Repayment</Header>}>
                          <SpaceBetween size="m">
                            <div>
                              <Box variant="awsui-key-label">Principal Owed</Box>
                              <Box variant="p">{selectedAssetActiveLoan.principal} USDC</Box>
                            </div>
                            <Button
                              variant="primary"
                              loading={actionLoadingId === selectedAsset.id}
                              onClick={handleRepaySelectedLoan}
                            >
                              Repay Selected Loan
                            </Button>
                          </SpaceBetween>
                        </Container>
                      )}
                    </SpaceBetween>

                    <div className="detail-divider">
                      <Box variant="h4">Workflow Traceability</Box>
                      <ul className="workflow-list">
                        {workflowSteps.map((step, idx) => {
                          const currentStepIdx = getWorkflowStep(selectedAsset.status);
                          let statusType: 'success' | 'info' | 'pending' = 'pending';
                          if (idx < currentStepIdx) statusType = 'success';
                          else if (idx === currentStepIdx) statusType = 'info';

                          return (
                            <li key={idx} className="workflow-step">
                              <StatusIndicator type={statusType === 'success' ? 'success' : statusType === 'info' ? 'in-progress' : 'stopped'} />
                              <div className="workflow-step-copy">
                                <strong>{step.title}</strong>
                                <div className="muted-copy">{step.description}</div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </SpaceBetween>
                ) : (
                  <div className="detail-empty-state">
                    <Box variant="h3">No asset selected</Box>
                    <Box className="muted-copy">Choose an asset from the table to inspect status, actions, repayment, and workflow history.</Box>
                    <ul className="detail-empty-list">
                      <li>Asset ID, title, and custody status</li>
                      <li>Available workflow actions</li>
                      <li>Loan repayment or listing follow-up</li>
                    </ul>
                  </div>
                )}
              </Container>
            </div>
          );

        case '#marketplace':
          return (
            <SpaceBetween size="l">
              <Container variant="stacked" header={<Header variant="h2">Protocol Marketplace</Header>}>
                <div className="demo-table-wrapper marketplace-table-wrapper">
                  <Table
                    variant="embedded"
                    contentDensity="compact"
                    columnDefinitions={[
                      {
                        id: 'id',
                        header: 'Listing ID',
                        cell: (item) => (
                          <code className="asset-id-code" title={item.id}>
                            {formatId(item.id)}
                          </code>
                        ),
                        minWidth: 120
                      },
                      {
                        id: 'asset',
                        header: 'Asset',
                        cell: (item) => {
                          const asset = dashboard?.assets.find((a) => a.id === item.assetId);
                          return asset ? `${asset.title} (${asset.category})` : item.assetId;
                        },
                        minWidth: 260
                      },
                      { id: 'price', header: 'Price', cell: (item) => <span className="numeric-cell">{`${item.price.toLocaleString()} USDC`}</span>, minWidth: 120 },
                      { id: 'seller', header: 'Seller', cell: (item) => item.sellerId, minWidth: 140 },
                      { id: 'status', header: 'Status', cell: (item) => <Badge color={item.status === 'ACTIVE' ? 'green' : 'grey'}>{item.status}</Badge>, minWidth: 120 },
                      {
                        id: 'action',
                        header: 'Action',
                        cell: (item) => (
                          <Button
                            variant={item.status === 'ACTIVE' ? 'primary' : 'normal'}
                            loading={actionLoadingId === item.id}
                            disabled={item.status !== 'ACTIVE'}
                            onClick={() => handleBuy(item)}
                          >
                            Buy with Layaway
                          </Button>
                        ),
                        minWidth: 200
                      }
                    ]}
                    items={marketplace}
                    empty="No listings currently in marketplace."
                  />
                </div>
              </Container>

              <div className="marketplace-support-grid">
                <Container variant="stacked" header={<Header variant="h2">Verified Vault Sale</Header>}>
                  <SpaceBetween size="s">
                    <Box className="muted-copy">
                      Listings are published only after vault verification and custody handoff.
                    </Box>
                    <div className="summary-grid summary-grid--single">
                      <div className="summary-item">
                        <Box variant="awsui-key-label">Vault status</Box>
                        <Box variant="p">Verified before publication</Box>
                      </div>
                      <div className="summary-item">
                        <Box variant="awsui-key-label">Layaway deposit</Box>
                        <Box variant="p">20 percent down payment</Box>
                      </div>
                    </div>
                  </SpaceBetween>
                </Container>

                <Container variant="stacked" header={<Header variant="h2">Layaway Terms</Header>}>
                  <SpaceBetween size="s">
                    <Alert type="info" header="Settlement window">
                      Remaining balance is spread over a maximum duration of 6 months.
                    </Alert>
                    <Box className="muted-copy">
                      Title transfers automatically upon final transaction execution through the Smart Layaway contract.
                    </Box>
                  </SpaceBetween>
                </Container>
              </div>
            </SpaceBetween>
          );

        case '#evidence':
          return (
            <SpaceBetween size="l">
              <div className="overview-band overview-band--evidence">
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Total shipments</Box>
                  <Box variant="h2" className="metric-value">{shipmentSummary.total}</Box>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">In transit</Box>
                  <Box variant="h2" className="metric-value">{shipmentSummary.inTransit}</Box>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Delivered</Box>
                  <Box variant="h2" className="metric-value">{shipmentSummary.delivered}</Box>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Latest carrier</Box>
                  <Box variant="h2" className="metric-value">{shipmentSummary.latestCarrier}</Box>
                </div>
              </div>

              <div className="evidence-layout">
                <div className="evidence-main-column">
                  <Container variant="stacked" header={<Header variant="h2">Evidence & Shipments Logs</Header>}>
                    <div className="demo-table-wrapper">
                      <Table
                        variant="embedded"
                        contentDensity="compact"
                        columnDefinitions={[
                          {
                            id: 'id',
                            header: 'Shipment ID',
                            cell: (item) => (
                              <span title={item.id}>{formatId(item.id)}</span>
                            ),
                            minWidth: 120
                          },
                          {
                            id: 'assetId',
                            header: 'Asset ID',
                            cell: (item) => (
                              <code className="asset-id-code" title={item.assetId}>
                                {formatId(item.assetId)}
                              </code>
                            ),
                            minWidth: 120
                          },
                          { id: 'direction', header: 'Direction', cell: (item) => item.direction, minWidth: 140 },
                          { id: 'carrier', header: 'Carrier', cell: (item) => item.carrier, minWidth: 120 },
                          { id: 'trackingCode', header: 'Tracking Code', cell: (item) => item.trackingCode, minWidth: 180 },
                          { id: 'status', header: 'Status', cell: (item) => <Badge color="blue">{item.status}</Badge>, minWidth: 155 }
                        ]}
                        items={shipmentRecords}
                        empty="No courier shipments recorded"
                      />
                    </div>
                  </Container>
                </div>

                <div className="evidence-side-column">
                  <Container variant="stacked" header={<Header variant="h2">Logistics Adapter</Header>}>
                    <SpaceBetween size="s">
                      <Box className="muted-copy">
                        Mock FedEx simulator. Dispatches tracking codes automatically and records custody handoff events.
                      </Box>
                      <div className="summary-grid summary-grid--single">
                        <div className="summary-item">
                          <Box variant="awsui-key-label">Adapter status</Box>
                          <Box variant="p">Active on local Anvil</Box>
                        </div>
                        <div className="summary-item">
                          <Box variant="awsui-key-label">Evidence source</Box>
                          <Box variant="p">Customer pre-shipment and vault check records</Box>
                        </div>
                      </div>
                    </SpaceBetween>
                  </Container>
                </div>
              </div>
            </SpaceBetween>
          );

        default:
          return <Box>View not found</Box>;
      }
    } else if (userRole === 'STAFF') {
      switch (activeHref) {
        case '#work-queue':
          const readyCount = dashboard?.assets.filter(a => ['RECEIVED', 'UNDER_APPRAISAL'].includes(a.status)).length ?? 0;
          const awaitingShipmentCount = dashboard?.assets.filter(a => a.status === 'AWAITING_SHIPMENT').length ?? 0;
          const activeCustodyCount = vaultAssetsCount;
          const offersPendingCount = dashboard?.loans.filter(l => l.status === 'OFFERED').length ?? 0;

          return (
            <SpaceBetween size="l">
              <div className="overview-band">
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Ready for appraisal</Box>
                  <Box variant="h2" className="metric-value">{readyCount}</Box>
                  <div className="metric-secondary-text">Verification complete</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Awaiting shipment</Box>
                  <Box variant="h2" className="metric-value">{awaitingShipmentCount}</Box>
                  <div className="metric-secondary-text">Pending dispatch</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Active custody</Box>
                  <Box variant="h2" className="metric-value">{activeCustodyCount}</Box>
                  <div className="metric-secondary-text">Secured in vault</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Offers pending</Box>
                  <Box variant="h2" className="metric-value">{offersPendingCount}</Box>
                  <div className="metric-secondary-text">Awaiting acceptance</div>
                </div>
              </div>

              <div className="two-column-layout">
                <Container variant="stacked" header={<Header variant="h2">Validation Work Queue</Header>}>
                  <div className="demo-table-wrapper">
                    <Table
                      variant="embedded"
                      contentDensity="compact"
                      columnDefinitions={[
                        {
                          id: 'id',
                          header: 'Asset ID',
                          cell: (item) => (
                            <code className="asset-id-code" title={item.id}>
                              {formatId(item.id)}
                            </code>
                          ),
                          minWidth: 120
                        },
                        { id: 'title', header: 'Asset Name', cell: (item) => item.title, minWidth: 220 },
                        {
                          id: 'courier',
                          header: 'Courier status',
                          cell: (item) => {
                            if (item.status === 'AWAITING_SHIPMENT') return <Badge>Not Shipped</Badge>;
                            if (item.status === 'IN_TRANSIT') return <Badge color="blue">In Transit</Badge>;
                            return <Badge color="green">Delivered</Badge>;
                          }
                        },
                        {
                          id: 'evidence',
                          header: 'Evidence status',
                          cell: (item) => {
                            if (['AWAITING_SHIPMENT', 'IN_TRANSIT'].includes(item.status)) {
                              return 'Customer photos uploaded';
                            }
                            return 'Vault verified';
                          },
                          minWidth: 180
                        },
                        {
                          id: 'actions',
                          header: 'Actions Required / Queue Status',
                          cell: (item) => (
                            <SpaceBetween direction="horizontal" size="xs">
                              {item.status === 'IN_TRANSIT' && (
                                <Button
                                  variant="primary"
                                  loading={actionLoadingId === item.id}
                                  onClick={() => handleUploadUnboxingProof(item.id)}
                                >
                                  Upload Unboxing Proof
                                </Button>
                              )}
                              {['RECEIVED', 'UNDER_APPRAISAL'].includes(item.status) && (
                                <Button
                                  onClick={() => {
                                    setAppraisalAssetId(item.id);
                                    setActiveHref('#appraisals');
                                    addNotification('info', `Selected Asset ID ${item.id} for Appraisal`);
                                  }}
                                >
                                  Select for Appraisal
                                </Button>
                              )}
                              {item.status === 'OFFER_ISSUED' && <Badge color="blue">Offer Pending Customer</Badge>}
                              {item.status === 'LOAN_ACTIVE' && <Badge color="green">Active Custody</Badge>}
                              {item.status === 'RETURNED' && <Badge color="grey">Returned</Badge>}
                            </SpaceBetween>
                          )
                        }
                      ]}
                      items={dashboard?.assets ?? []}
                      selectedItems={selectedStaffAsset ? [selectedStaffAsset] : []}
                      onSelectionChange={({ detail }) => {
                        const item = detail.selectedItems[0];
                        setSelectedStaffAsset(item);
                        if (item && ['RECEIVED', 'UNDER_APPRAISAL'].includes(item.status)) {
                          setAppraisalAssetId(item.id);
                        }
                      }}
                      onRowClick={({ detail }) => {
                        const item = detail.item;
                        setSelectedStaffAsset(item);
                        if (item && ['RECEIVED', 'UNDER_APPRAISAL'].includes(item.status)) {
                          setAppraisalAssetId(item.id);
                        }
                      }}
                      selectionType="single"
                      trackBy="id"
                      empty="No items in staff validation queue."
                    />
                  </div>
                </Container>

                <Container variant="stacked" header={<Header variant="h2">Validator Next Action</Header>}>
                  {selectedStaffAsset ? (
                    <SpaceBetween size="m">
                      <div>
                        <Box variant="h3">{selectedStaffAsset.title}</Box>
                        <Box variant="small" color="text-body-secondary">{selectedStaffAsset.id}</Box>
                      </div>

                      <div className="custody-info-panel">
                        <div className="custody-info-item">
                          <span className="custody-info-label">Queue Status</span>
                          <span className="custody-info-value">{getStatusIndicator(selectedStaffAsset.status)}</span>
                        </div>
                        <div className="custody-info-item">
                          <span className="custody-info-label">Owner ID</span>
                          <span className="custody-info-value">{selectedStaffAsset.ownerId}</span>
                        </div>
                        <div className="custody-info-item">
                          <span className="custody-info-label">Declared Value</span>
                          <span className="custody-info-value">{selectedStaffAsset.declaredValue} USDC</span>
                        </div>
                      </div>

                      <Alert header="Operational Instructions" type="info">
                        {selectedStaffAsset.status === 'AWAITING_SHIPMENT' && (
                          "The customer has not yet shipped the physical asset. Await FedEx shipping confirmation."
                        )}
                        {selectedStaffAsset.status === 'IN_TRANSIT' && (
                          "Asset is currently in transit. Upon physical arrival, record the unboxing process and click 'Upload Unboxing Proof' to transition state."
                        )}
                        {['RECEIVED', 'UNDER_APPRAISAL'].includes(selectedStaffAsset.status) && (
                          "Asset has arrived and is checked in. Next step is to evaluate condition and submit the Appraisal Form to draft a loan offer."
                        )}
                        {selectedStaffAsset.status === 'OFFER_ISSUED' && (
                          "Appraisal is complete and the loan offer has been issued to the customer. Awaiting customer acceptance."
                        )}
                        {selectedStaffAsset.status === 'LOAN_ACTIVE' && (
                          "Asset is in active custody under collateral hold. Monitor repayment and release parameters."
                        )}
                        {selectedStaffAsset.status === 'RETURNED' && (
                          "The loan is closed and the asset has been returned to the customer. No actions required."
                        )}
                      </Alert>
                    </SpaceBetween>
                  ) : (
                    <div className="detail-empty-state">
                      <Box variant="h3">No item selected</Box>
                      <Box className="muted-copy">
                        Select a row from the validation queue to view custody details and operational instructions.
                      </Box>
                    </div>
                  )}
                </Container>
              </div>
            </SpaceBetween>
          );

        case '#intake-evidence':
          const totalProofs = dashboard?.assets.filter(a => a.status !== 'DRAFT' && a.status !== 'AWAITING_SHIPMENT').length ?? 0;
          const unboxingCount = dashboard?.assets.filter(a => ['RECEIVED', 'UNDER_APPRAISAL', 'OFFER_ISSUED', 'LOAN_ACTIVE'].includes(a.status)).length ?? 0;

          return (
            <SpaceBetween size="l">
              <div className="overview-band">
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Total proofs logged</Box>
                  <Box variant="h2" className="metric-value">{totalProofs}</Box>
                  <div className="metric-secondary-text">Verification files</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Unboxing proofs</Box>
                  <Box variant="h2" className="metric-value">{unboxingCount}</Box>
                  <div className="metric-secondary-text">Validator videos</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">IPFS pins</Box>
                  <Box variant="h2" className="metric-value">{totalProofs * 2}</Box>
                  <div className="metric-secondary-text">Metadata pinned</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Storage adapter</Box>
                  <Box variant="h2" className="metric-value">Active</Box>
                  <div className="metric-secondary-text">IPFS Gateways healthy</div>
                </div>
              </div>

              <div className="two-column-layout">
                <Container variant="stacked" header={<Header variant="h2">Intake Evidence Logs</Header>}>
                  <Box color="text-label" padding={{ bottom: 's' }}>Validator unboxing proof and IPFS timeline.</Box>
                  <div className="demo-table-wrapper">
                    <Table
                      variant="embedded"
                      contentDensity="compact"
                      columnDefinitions={[
                        {
                          id: 'assetId',
                          header: 'Asset ID',
                          cell: (item) => (
                            <code className="asset-id-code" title={item.id}>
                              {formatId(item.id)}
                            </code>
                          ),
                          minWidth: 120
                        },
                        { id: 'title', header: 'Asset Title', cell: (item) => item.title, minWidth: 220 },
                        {
                          id: 'evidence',
                          header: 'Evidence Status',
                          cell: (item) => {
                            if (item.status === 'AWAITING_SHIPMENT') return 'None';
                            return item.status === 'IN_TRANSIT' ? 'Customer pre-shipment photos' : 'Unboxing mp4 + Vault check IPFS';
                          }
                        }
                      ]}
                      items={dashboard?.assets ?? []}
                    />
                  </div>
                </Container>

                <Container variant="stacked" header={<Header variant="h2">Storage & Timelines</Header>}>
                  <SpaceBetween size="s">
                    <Box className="muted-copy">
                      All validator unboxing evidence files and appraisal documents are signed and pinned to the IPFS Pinata gateway.
                    </Box>
                    <div className="summary-grid summary-grid--single">
                      <div className="summary-item">
                        <Box variant="awsui-key-label">Metadata target</Box>
                        <Box variant="p">Decentralized IPFS pinning</Box>
                      </div>
                      <div className="summary-item">
                        <Box variant="awsui-key-label">Encryption standard</Box>
                        <Box variant="p">SHA-256 content addressing</Box>
                      </div>
                    </div>
                  </SpaceBetween>
                </Container>
              </div>
            </SpaceBetween>
          );

        case '#appraisals':
          const targetAsset = dashboard?.assets.find(a => a.id === appraisalAssetId);

          return (
            <div className="two-column-layout">
              <Container variant="stacked" header={<Header variant="h2">Appraisal & Offer Operations Form</Header>}>
                <form onSubmit={onSubmitAppraisal}>
                  <Form
                    actions={
                      <SpaceBetween direction="horizontal" size="xs">
                        <Button variant="link" onClick={() => setActiveHref('#work-queue')}>Cancel</Button>
                        <Button variant="primary" formAction="submit" loading={submittingAsset}>
                          Trigger Offer
                        </Button>
                      </SpaceBetween>
                    }
                  >
                    <SpaceBetween size="l">
                      <FormField label="Asset ID" controlId="assetId" description="Must match the active verification queue ID.">
                        <Input
                          value={appraisalAssetId}
                          onChange={({ detail }) => setAppraisalAssetId(detail.value)}
                          placeholder="A-1001"
                        />
                      </FormField>
                      <FormField label="Estimated value" controlId="estimatedValue" description="Staff determined valuation in USDC.">
                        <Input
                          type="number"
                          value={appraisalValue}
                          onChange={({ detail }) => setAppraisalValue(detail.value)}
                          placeholder="1500"
                        />
                      </FormField>
                      <FormField label="LTV limit" controlId="ltv" description="Maximum loan to value threshold (percent).">
                        <Input
                          type="number"
                          value={appraisalLtv}
                          onChange={({ detail }) => setAppraisalLtv(detail.value)}
                          placeholder="60"
                        />
                      </FormField>
                    </SpaceBetween>
                  </Form>
                </form>
              </Container>

              <SpaceBetween size="l">
                <Container variant="stacked" header={<Header variant="h2">Asset Context Panel</Header>}>
                  {targetAsset ? (
                    <SpaceBetween size="m">
                      <div>
                        <Box variant="awsui-key-label">Asset Title</Box>
                        <Box variant="h3">{targetAsset.title}</Box>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">Category</Box>
                        <Box variant="p">{targetAsset.category}</Box>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">Condition Notes / Description</Box>
                        <Box variant="p">{targetAsset.description}</Box>
                      </div>
                      <div>
                        <Box variant="awsui-key-label">Declared Value</Box>
                        <Box variant="p">{targetAsset.declaredValue} USDC</Box>
                      </div>
                    </SpaceBetween>
                  ) : (
                    <Box className="muted-copy">
                      Enter a valid Asset ID on the form to view real-time physical inspection details, condition notes, and pre-shipment evidence logs.
                    </Box>
                  )}
                </Container>

                <Container variant="stacked" header={<Header variant="h2">Risk Policy Guidelines</Header>}>
                  <SpaceBetween size="s">
                    <Alert header="Maximum LTV Rule" type="warning">
                      Protocol guidelines restrict appraisals to a maximum of 70% LTV of the verified physical value.
                    </Alert>
                    <Box className="muted-copy">
                      Interest rates are calculated at a base APR of 5% with a 30-day default duration limit. Collateral is locked automatically upon offer issuance.
                    </Box>
                  </SpaceBetween>
                </Container>
              </SpaceBetween>
            </div>
          );

        case '#offer-drafting':
          const draftedCount = dashboard?.loans.filter(l => l.status === 'OFFERED').length ?? 0;
          const activeCount = dashboard?.loans.filter(l => l.status === 'ACTIVE').length ?? 0;
          const repaidCount = dashboard?.loans.filter(l => l.status === 'REPAID').length ?? 0;
          const totalPrincipalSum = dashboard?.loans.reduce((acc, curr) => acc + curr.principal, 0) ?? 0;

          return (
            <SpaceBetween size="l">
              <div className="overview-band">
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Drafted offers</Box>
                  <Box variant="h2" className="metric-value">{draftedCount}</Box>
                  <div className="metric-secondary-text">Pending signature</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Active loans</Box>
                  <Box variant="h2" className="metric-value">{activeCount}</Box>
                  <div className="metric-secondary-text">Disbursed principal</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Repaid loans</Box>
                  <Box variant="h2" className="metric-value">{repaidCount}</Box>
                  <div className="metric-secondary-text">Collateral released</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Total principal</Box>
                  <Box variant="h2" className="metric-value">{totalPrincipalSum.toLocaleString()} USDC</Box>
                  <div className="metric-secondary-text">Cum. loan volume</div>
                </div>
              </div>

              <div className="two-column-layout">
                <Container variant="stacked" header={<Header variant="h2">Generated Loan Offers & Status</Header>}>
                  <div className="demo-table-wrapper">
                    <Table
                      variant="embedded"
                      contentDensity="compact"
                      columnDefinitions={[
                        {
                          id: 'id',
                          header: 'Loan ID',
                          cell: (item) => (
                            <span title={item.id}>{formatId(item.id)}</span>
                          ),
                          minWidth: 120
                        },
                        {
                          id: 'assetId',
                          header: 'Asset ID',
                          cell: (item) => (
                            <code className="asset-id-code" title={item.assetId}>
                              {formatId(item.assetId)}
                            </code>
                          ),
                          minWidth: 120
                        },
                        { id: 'principal', header: 'Principal', cell: (item) => `${item.principal} USDC`, minWidth: 120 },
                        { id: 'apr', header: 'APR', cell: (item) => `${item.aprBps / 100}%`, minWidth: 100 },
                        { id: 'duration', header: 'Duration', cell: (item) => `${item.durationDays} Days`, minWidth: 120 },
                        { id: 'status', header: 'Status', cell: (item) => <Badge color={item.status === 'ACTIVE' ? 'green' : 'blue'}>{item.status}</Badge>, minWidth: 120 }
                      ]}
                      items={dashboard?.loans ?? []}
                      empty="No loans drafted or issued yet"
                    />
                  </div>
                </Container>

                <Container variant="stacked" header={<Header variant="h2">Offer Settlement Guidelines</Header>}>
                  <SpaceBetween size="s">
                    <Box className="muted-copy">
                      Drafted loan offers are pushed to the Web3 network as signed message payloads. The customer accepts and receives the principal on-chain.
                    </Box>
                    <div className="summary-grid summary-grid--single">
                      <div className="summary-item">
                        <Box variant="awsui-key-label">Offer validity</Box>
                        <Box variant="p">7 days maximum</Box>
                      </div>
                      <div className="summary-item">
                        <Box variant="awsui-key-label">Disbursement method</Box>
                        <Box variant="p">Smart contract escrow</Box>
                      </div>
                    </div>
                  </SpaceBetween>
                </Container>
              </div>
            </SpaceBetween>
          );

        default:
          return <Box>View not found</Box>;
      }
    } else {
      // ADMIN Workspace
      switch (activeHref) {
        case '#admin-overview':
          const latestEvents = (dashboard?.auditEvents ?? []).slice(0, 5);

          return (
            <SpaceBetween size="l">
              <Cards
                variant="container"
                cardDefinition={{
                  header: (item) => item.label,
                  sections: [
                    {
                      id: 'value',
                      content: (item) => (
                        <Box variant="h3" color="inherit">
                          {item.value}
                        </Box>
                      )
                    }
                  ]
                }}
                items={[
                  { label: 'Active Loans', value: `${activeLoansCount}` },
                  { label: 'Vault Assets', value: `${vaultAssetsCount}` },
                  { label: 'Open Disputes', value: `${openDisputesCount}` },
                  { label: 'Protocol Fees', value: `${protocolFees.toLocaleString()} USDC` }
                ]}
                cardsPerRow={[{ cards: 1 }, { minWidth: 560, cards: 2 }, { minWidth: 960, cards: 4 }]}
              />

              <div className="two-column-layout">
                <Container variant="stacked" header={<Header variant="h2">Recent System Events</Header>}>
                  <div className="demo-table-wrapper">
                    <Table
                      variant="embedded"
                      contentDensity="compact"
                      columnDefinitions={[
                        { id: 'action', header: 'Event', cell: (item) => <code className="event-action-code">{item.action}</code>, minWidth: 160 },
                        { id: 'type', header: 'Type', cell: (item) => item.aggregateType, minWidth: 120 },
                        { id: 'actor', header: 'Actor', cell: (item) => item.actorId, minWidth: 100 },
                        { id: 'time', header: 'Time', cell: (item) => new Date(item.createdAt).toLocaleTimeString(), minWidth: 100 }
                      ]}
                      items={latestEvents}
                      empty="No recent audit logs available."
                    />
                  </div>
                </Container>

                <SpaceBetween size="l">
                  <Container variant="stacked" header={<Header variant="h2">Adapter Connectivity Health</Header>}>
                    <div className="health-status-grid">
                      <div className="health-card">
                        <Box variant="awsui-key-label">KYC Adapter</Box>
                        <StatusIndicator type="success">Active</StatusIndicator>
                        <span className="latency-text">Ping: 12ms</span>
                      </div>
                      <div className="health-card">
                        <Box variant="awsui-key-label">Logistics (FedEx)</Box>
                        <StatusIndicator type="success">Active</StatusIndicator>
                        <span className="latency-text">Ping: 34ms</span>
                      </div>
                      <div className="health-card">
                        <Box variant="awsui-key-label">Storage (IPFS)</Box>
                        <StatusIndicator type="success">Active</StatusIndicator>
                        <span className="latency-text">Ping: 82ms</span>
                      </div>
                      <div className="health-card">
                        <Box variant="awsui-key-label">Blockchain Gateway</Box>
                        <StatusIndicator type="success">Active</StatusIndicator>
                        <span className="latency-text">Anvil Node</span>
                      </div>
                    </div>
                  </Container>

                  <Container variant="stacked" header={<Header variant="h2">Risk Policy Limits</Header>}>
                    <div className="summary-grid">
                      <div className="summary-item">
                        <Box variant="awsui-key-label">Max LTV</Box>
                        <Box variant="p">70 percent</Box>
                      </div>
                      <div className="summary-item">
                        <Box variant="awsui-key-label">Platform Fee Cap</Box>
                        <Box variant="p">20 percent</Box>
                      </div>
                    </div>
                  </Container>
                </SpaceBetween>
              </div>
            </SpaceBetween>
          );

        case '#audit-events':
          const totalEventsCount = dashboard?.auditEvents.length ?? 0;
          const configEventsCount = dashboard?.auditEvents.filter(e => e.aggregateType === 'GLOBAL_CONFIG').length ?? 0;
          const operationalEventsCount = totalEventsCount - configEventsCount;

          return (
            <SpaceBetween size="l">
              <div className="overview-band">
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Total logged events</Box>
                  <Box variant="h2" className="metric-value">{totalEventsCount}</Box>
                  <div className="metric-secondary-text">Database logs</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">System config events</Box>
                  <Box variant="h2" className="metric-value">{configEventsCount}</Box>
                  <div className="metric-secondary-text">Governance updates</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Operational signals</Box>
                  <Box variant="h2" className="metric-value">{operationalEventsCount}</Box>
                  <div className="metric-secondary-text">Asset / Loan workflows</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Audit status</Box>
                  <Box variant="h2" className="metric-value">Connected</Box>
                  <div className="metric-secondary-text">Audit engine online</div>
                </div>
              </div>

              <Container variant="stacked" header={<Header variant="h2">Traceability Events Audit Log</Header>}>
                <div className="demo-table-wrapper">
                  <Table
                    variant="embedded"
                    contentDensity="compact"
                    columnDefinitions={[
                      { id: 'action', header: 'Event / Action', cell: (item) => <code className="event-action-code">{item.action}</code>, minWidth: 200 },
                      { id: 'type', header: 'Target Type', cell: (item) => item.aggregateType, minWidth: 140 },
                      {
                        id: 'assetId',
                        header: 'Asset ID',
                        cell: (item) => (
                          <code className="asset-id-code" title={item.aggregateId}>
                            {formatId(item.aggregateId)}
                          </code>
                        ),
                        minWidth: 120
                      },
                      { id: 'actor', header: 'Actor', cell: (item) => item.actorId, minWidth: 120 },
                      { id: 'time', header: 'Time', cell: (item) => new Date(item.createdAt).toLocaleTimeString(), minWidth: 120 }
                    ]}
                    items={dashboard?.auditEvents ?? []}
                    empty="No audit events found."
                  />
                </div>
              </Container>
            </SpaceBetween>
          );

        case '#risk-parameters':
          return (
            <SpaceBetween size="l">
              <Container variant="stacked" header={<Header variant="h2">Risk Parameters Configuration</Header>}>
                <div className="health-status-grid">
                  <div className="health-card">
                    <Box variant="awsui-key-label">Maximum LTV Threshold</Box>
                    <Box variant="h3">70%</Box>
                    <span className="latency-text">Governance Limit: 80% max LTV</span>
                  </div>
                  <div className="health-card">
                    <Box variant="awsui-key-label">Platform Fee Ceiling</Box>
                    <Box variant="h3">20%</Box>
                    <span className="latency-text">Consignment Sale Commission Cap</span>
                  </div>
                  <div className="health-card">
                    <Box variant="awsui-key-label">Appraisal Age Limit</Box>
                    <Box variant="h3">30 Days</Box>
                    <span className="latency-text">Maximum price feed validity window</span>
                  </div>
                  <div className="health-card">
                    <Box variant="awsui-key-label">Layaway Min Deposit</Box>
                    <Box variant="h3">20%</Box>
                    <span className="latency-text">Escrow requirements on marketplace buy</span>
                  </div>
                </div>
              </Container>

              <Container variant="stacked" header={<Header variant="h2">Governance Authority</Header>}>
                <SpaceBetween size="s">
                  <Box className="muted-copy">
                    Risk parameters are set on-chain and managed by the PawnShop Protocol Admin Multisig address. Updates require a minimum quorum threshold of 2/3 signatures.
                  </Box>
                  <div className="summary-grid">
                    <div className="summary-item">
                      <Box variant="awsui-key-label">Active Risk Engine</Box>
                      <Box variant="p">Local Anvil Core</Box>
                    </div>
                    <div className="summary-item">
                      <Box variant="awsui-key-label">Last Policy Update</Box>
                      <Box variant="p">Seeded defaults loaded</Box>
                    </div>
                  </div>
                </SpaceBetween>
              </Container>
            </SpaceBetween>
          );

        case '#protocol-treasury':
          return (
            <SpaceBetween size="l">
              <div className="overview-band">
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Accrued fees</Box>
                  <Box variant="h2" className="metric-value">{protocolFees.toLocaleString()} USDC</Box>
                  <div className="metric-secondary-text">Platform revenue</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">TVL collateral</Box>
                  <Box variant="h2" className="metric-value">{(vaultAssetsCount * 2500).toLocaleString()} USDC</Box>
                  <div className="metric-secondary-text">Vault valuation (est.)</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Active loan capital</Box>
                  <Box variant="h2" className="metric-value">{(activeLoansCount * 1200).toLocaleString()} USDC</Box>
                  <div className="metric-secondary-text">Outstanding debt</div>
                </div>
                <div className="metric-tile">
                  <Box variant="awsui-key-label">Reserve liquidity</Box>
                  <Box variant="h2" className="metric-value">500,000 USDC</Box>
                  <div className="metric-secondary-text">Available capital pool</div>
                </div>
              </div>

              <div className="two-column-layout">
                <Container variant="stacked" header={<Header variant="h2">Treasury Smart Contract Details</Header>}>
                  <SpaceBetween size="m">
                    <div>
                      <Box variant="awsui-key-label">Contract Address</Box>
                      <Box variant="p">0x1234567890123456789012345678901234567890</Box>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">Connected Web3 RPC Node</Box>
                      <StatusIndicator type="success">Connected (Local Anvil)</StatusIndicator>
                    </div>
                    <div>
                      <Box variant="awsui-key-label">Accrued Commissions</Box>
                      <Box variant="p">2% platform fees charged on repayment or consignment sales.</Box>
                    </div>
                  </SpaceBetween>
                </Container>

                <Container variant="stacked" header={<Header variant="h2">Liquidity & Settlement Engine</Header>}>
                  <SpaceBetween size="s">
                    <Box className="muted-copy">
                      Settlement is backed by a 500K USDC reserve fund to support active loan financing. Collateral liquidation occurs on contract maturity.
                    </Box>
                    <div className="summary-grid summary-grid--single">
                      <div className="summary-item">
                        <Box variant="awsui-key-label">Treasury Manager</Box>
                        <Box variant="p">PawnShop Protocol MultiSig</Box>
                      </div>
                      <div className="summary-item">
                        <Box variant="awsui-key-label">Liquidity Health</Box>
                        <Box variant="p">Over-collateralized (100% healthy)</Box>
                      </div>
                    </div>
                  </SpaceBetween>
                </Container>
              </div>
            </SpaceBetween>
          );

        case '#system-adapters':
          return (
            <SpaceBetween size="l">
              <Container variant="stacked" header={<Header variant="h2">System Adapters (OOP Interfaces)</Header>}>
                <ColumnLayout columns={2}>
                  <Container variant="stacked" header={<Header variant="h3">KYC/AML Provider Adapter</Header>}>
                    <SpaceBetween size="xs">
                      <StatusIndicator type="success">Connected</StatusIndicator>
                      <Box className="muted-copy">
                        Host: Mock KYC provider port. Simulates real-time AML checks and instantly verifies customer wallet addresses.
                      </Box>
                      <span className="latency-text">Port: IKycProvider | Latency: 12ms</span>
                    </SpaceBetween>
                  </Container>
                  <Container variant="stacked" header={<Header variant="h3">Logistics Courier Adapter</Header>}>
                    <SpaceBetween size="xs">
                      <StatusIndicator type="success">Connected</StatusIndicator>
                      <Box className="muted-copy">
                        Host: Mock FedEx Shipping API. Simulates cargo dispatch and generates courier tracking codes.
                      </Box>
                      <span className="latency-text">Port: ILogisticsProvider | Latency: 34ms</span>
                    </SpaceBetween>
                  </Container>
                  <Container variant="stacked" header={<Header variant="h3">Decentralized Storage Adapter</Header>}>
                    <SpaceBetween size="xs">
                      <StatusIndicator type="success">Connected</StatusIndicator>
                      <Box className="muted-copy">
                        Host: Mock IPFS Pinata Gateway. Pins unboxing video proofs and signed appraisal documents.
                      </Box>
                      <span className="latency-text">Port: IStorageProvider | Latency: 82ms</span>
                    </SpaceBetween>
                  </Container>
                  <Container variant="stacked" header={<Header variant="h3">Blockchain Web3 Gateway</Header>}>
                    <SpaceBetween size="xs">
                      <StatusIndicator type="success">Connected</StatusIndicator>
                      <Box className="muted-copy">
                        Host: http://localhost:8545 (Local Anvil node). Mints NFT receipts and triggers smart contract disbursements.
                      </Box>
                      <span className="latency-text">Port: IBlockchainGateway | Latency: Local</span>
                    </SpaceBetween>
                  </Container>
                </ColumnLayout>
              </Container>
            </SpaceBetween>
          );

        default:
          return <Box>View not found</Box>;
      }
    }
  };

  const workspaceBreadcrumbItems = [
    { text: 'PawnShop Protocol', href: '#' },
    { text: 'Workspace', href: '#' }
  ];

  return (
    <div className="app-shell">
      <header className="console-topbar">
        <div className="console-topbar__brand">
          <span className="console-topbar__title">PawnShop Protocol</span>
          <span className="console-topbar__env">Local Anvil</span>
        </div>

        <div className="console-topbar__search">
          <div className="search-input-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
            <Input
              value={searchQuery}
              onChange={({ detail }) => {
                setSearchQuery(detail.value);
              }}
              onKeyDown={(e) => {
                if (e.detail.key === 'Enter') {
                  handleSearch(searchQuery);
                }
              }}
              placeholder="Search assets, loans, listings, or tx hashes"
              type="search"
            />
            <span className="search-enter-hint" style={{ position: 'absolute', right: '8px', pointerEvents: 'none', zIndex: 10 }}>↵ Enter</span>
          </div>
        </div>

        <div className="console-topbar__actions">
          <div className="session-indicator">
            <span className="user-display-name">
              {session ? session.displayName : 'Loading demo session'}
            </span>
          </div>

          <div className="demo-session-selector">
            <Select
              className="demo-session-select"
              selectedOption={roleSelectOptions.find((option) => option.value === userRole) ?? null}
              onChange={({ detail }) => handleRoleChange(detail.selectedOption.value as 'CUSTOMER' | 'STAFF' | 'ADMIN')}
              options={roleSelectOptions}
              ariaLabel="Select demo session"
              data-testid="role-select"
            />
          </div>

          <Button
            variant="icon"
            className="utility-button"
            iconName="refresh"
            ariaLabel="Refresh dashboard"
            onClick={loadData}
            loading={loading}
          />

          <div className="wallet-connect-wrapper">
            {walletButton}
          </div>
        </div>
      </header>

      <div className="workspace-shell">
        <AppLayout
          navigationOpen={navigationOpen}
          onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
          navigation={
            <SideNavigation
              className="console-sidebar"
              activeHref={activeHref}
              header={sideNavHeader}
              onFollow={(e) => {
                e.preventDefault();
                setActiveHref(e.detail.href);
                setNotifications([]); // Clear notifications on page navigation!
                setSearchQuery('');  // Clear search input on page navigation!
              }}
              items={sideNavItems()}
            />
          }
          toolsHide={true}
          content={
            <ContentLayout
              className="content-shell"
              header={
                <SpaceBetween size="xs">
                  <BreadcrumbGroup
                    items={workspaceBreadcrumbItems}
                    onFollow={(event) => {
                      event.preventDefault();
                      setActiveHref(event.detail.href);
                      setNotifications([]); // Clear notifications on page navigation!
                      setSearchQuery('');  // Clear search input on page navigation!
                    }}
                    ariaLabel="Breadcrumbs"
                  />
                  <Header
                    variant="h1"
                    description={`${pageLabelMap[activeHref] || 'Overview'}. Demo session: ${session?.displayName ?? 'Demo Customer'}.`}
                  >
                    Physical Asset Pawnshop Operations
                  </Header>
                </SpaceBetween>
              }
            >
              <SpaceBetween size="l">
                {notifications.length > 0 && <Flashbar items={notifications} />}
                {renderContent()}
              </SpaceBetween>
            </ContentLayout>
          }
        />
      </div>

      {/* List Asset Modal */}
      <Modal
        onDismiss={() => setIsListModalVisible(false)}
        visible={isListModalVisible}
        closeAriaLabel="Close modal"
        header="List Asset for Sale"
        className="demo-list-modal"
      >
        <form onSubmit={onSubmitListing}>
          <SpaceBetween size="m">
            <FormField label="Asset ID">
              <Input value={listingAssetId || ''} disabled />
            </FormField>
            <FormField label="Listing Price (USDC)" controlId="price" description="Price in USDC to publish listing.">
              <Input
                type="number"
                value={listPrice}
                onChange={({ detail }) => setListPrice(detail.value)}
                placeholder="2000"
              />
            </FormField>
            <div className="modal-actions">
              <Button variant="link" onClick={() => setIsListModalVisible(false)}>Cancel</Button>
              <Button variant="primary" formAction="submit" loading={actionLoadingId === listingAssetId}>
                Publish Listing
              </Button>
            </div>
          </SpaceBetween>
        </form>
      </Modal>
    </div>
  );
}
