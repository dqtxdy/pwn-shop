import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import App from './App';

// Mock Web3 Address
vi.mock('@ant-design/web3', () => ({
  Address: ({ address }: { address: string }) => <span>{address}</span>
}));

// Mock wagmi hooks to prevent context provider errors in unit tests
vi.mock('wagmi', () => ({
  useAccount: () => ({
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    isConnected: true
  }),
  useSendTransaction: () => ({
    sendTransactionAsync: vi.fn().mockResolvedValue('0xmockTxHash')
  }),
  useWriteContract: () => ({
    writeContractAsync: vi.fn().mockResolvedValue('0xmockTxHash')
  }),
  usePublicClient: () => ({
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: 1 })
  })
}));

// Mock Cloudscape Select component to render as a native HTML select,
// which makes role switching in unit tests simple and 100% reliable.
vi.mock('@cloudscape-design/components/select', () => ({
  default: ({ selectedOption, onChange, options, className }: any) => (
    <select
      className={className}
      data-testid="role-select"
      value={selectedOption?.value}
      onChange={(e) => {
        const val = e.target.value;
        const opt = options.find((o: any) => o.value === val);
        onChange({ detail: { selectedOption: opt } });
      }}
    >
      {options.map((o: any) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}));

afterEach(() => {
  cleanup();
});

const mockDashboardData = {
  assets: [
    {
      id: 'A-1001',
      ownerId: 'customer-1',
      title: 'Mock Gold Necklace',
      category: 'gold',
      description: 'Test description',
      status: 'AWAITING_SHIPMENT',
      declaredValue: 2000,
      createdAt: new Date().toISOString()
    },
    {
      id: 'A-1004',
      ownerId: 'customer-1',
      title: 'Mock Returned Ring',
      category: 'gold',
      description: 'Returned ring description',
      status: 'RETURNED',
      declaredValue: 1500,
      createdAt: new Date().toISOString()
    }
  ],
  loans: [],
  listings: [],
  disputes: [],
  auditEvents: [
    {
      id: 'E-101',
      actorId: 'admin-1',
      action: 'RISK_PARAMETER_UPDATE',
      aggregateType: 'GLOBAL_CONFIG',
      aggregateId: 'RISK-01',
      metadata: {},
      createdAt: new Date().toISOString()
    }
  ],
  protocolFeesCollected: 8420
};

const mockMarketplaceData: any[] = [];

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('App', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (url: string, options?: any) => {
      if (url.endsWith('/admin/dashboard')) {
        return {
          ok: true,
          json: async () => mockDashboardData
        };
      }
      if (url.endsWith('/auth/demo-login')) {
        const bodyObj = options?.body ? JSON.parse(options.body) : {};
        const role = bodyObj.role || 'CUSTOMER';
        let userId = bodyObj.userId || 'customer-1';
        let displayName = userId === 'customer-2' ? 'Demo Customer Buyer' : 'Demo Customer Seller';
        if (role === 'STAFF') {
          userId = 'staff-1';
          displayName = 'Demo Staff';
        } else if (role === 'ADMIN') {
          userId = 'admin-1';
          displayName = 'Demo Admin';
        }
        return {
          ok: true,
          json: async () => ({
            userId,
            displayName,
            role,
            walletAddress: userId === 'customer-2' ? '0x90f79bf6eb2c4f870365e785982e1f101e93b906' : '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            token: 'mock-jwt-token'
          })
        };
      }
      if (url.endsWith('/marketplace/listings')) {
        return {
          ok: true,
          json: async () => ({ id: 'LIST-001', status: 'ACTIVE' })
        };
      }
      if (url.endsWith('/marketplace')) {
        return {
          ok: true,
          json: async () => mockMarketplaceData
        };
      }
      if (url.endsWith('/assets')) {
        return {
          ok: true,
          json: async () => ({
            id: 'A-1002',
            ownerId: 'customer-1',
            title: 'MacBook Pro',
            category: 'electronics',
            declaredValue: 1500,
            status: 'AWAITING_SHIPMENT',
            createdAt: new Date().toISOString()
          })
        };
      }
      if (url.endsWith('/evidence')) {
        return {
          ok: true,
          json: async () => ({ id: 'E-999' })
        };
      }
      return { ok: false, status: 404 };
    });
  });

  it('renders the operational workspace with Customer navigation by default', async () => {
    render(<App walletButton={<button type="button">Connect Wallet</button>} />);
    expect(screen.getByText('Physical Asset Pawnshop Operations')).toBeInTheDocument();
    
    // Default session is Customer
    await waitFor(() => {
      expect(screen.getByText('Customer Workspace')).toBeInTheDocument();
    });

    // Customer navigation items are visible
    expect(screen.getByText('New Pawn Request')).toBeInTheDocument();
    expect(screen.getByText('My Assets & Loans')).toBeInTheDocument();
    
    // Validator and Admin navigation items are NOT visible
    expect(screen.queryByText('Work Queue')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit Events')).not.toBeInTheDocument();
  });

  it('submits asset form and calls the API', async () => {
    render(<App walletButton={<button type="button">Connect Wallet</button>} />);

    // Go to New Pawn Request tab
    await waitFor(() => {
      expect(screen.getByText('Customer Workspace')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('New Pawn Request'));

    // Wait for form to render (navigation may be async in Cloudscape SideNavigation)
    await waitFor(() => {
      expect(screen.queryByLabelText('Asset title')).toBeInTheDocument();
    });

    // Fill in the form fields
    const titleInput = screen.getByLabelText('Asset title');
    const categoryInput = screen.getByLabelText('Category');
    const declaredValueInput = screen.getByLabelText('Declared value');
    const requestedAmountInput = screen.getByLabelText('Requested loan');
    const descriptionInput = screen.getByLabelText('Condition notes');

    fireEvent.change(titleInput, { target: { value: 'MacBook Pro' } });
    fireEvent.change(categoryInput, { target: { value: 'electronics' } });
    fireEvent.change(declaredValueInput, { target: { value: 1500 } });
    fireEvent.change(requestedAmountInput, { target: { value: 1000 } });
    fireEvent.change(descriptionInput, { target: { value: 'Like new' } });

    // Submit form — use fireEvent.submit on the <form> element because Cloudscape's
    // formAction="submit" may not propagate native form submission in JSDOM via button click.
    // Find the containing form by traversing up from the title input.
    const pawnForm = titleInput.closest('form') ?? document.querySelector('form');
    fireEvent.submit(pawnForm!);

    // Verify /assets POST call
    await waitFor(() => {
      const assetCall = mockFetch.mock.calls.find((call) => call[0].endsWith('/assets') && call[1]?.method === 'POST');
      expect(assetCall).toBeDefined();
      const body = JSON.parse(assetCall![1].body);
      expect(body.title).toBe('MacBook Pro');
      expect(body.category).toBe('electronics');
      expect(body.declaredValue).toBe(1500);
    });

    // Verify /evidence POST call
    await waitFor(() => {
      const evidenceCall = mockFetch.mock.calls.find((call) => call[0].endsWith('/evidence'));
      expect(evidenceCall).toBeDefined();
      const body = JSON.parse(evidenceCall![1].body);
      expect(body.assetId).toBe('A-1002');
      expect(body.kind).toBe('CUSTOMER_PRE_SHIPMENT');
    });
  });

  it('lists returned asset for sale and calls the marketplace/listings API', async () => {
    render(<App walletButton={<button type="button">Connect Wallet</button>} />);

    // Go to My Assets & Loans tab
    await waitFor(() => {
      expect(screen.getByText('Customer Workspace')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('My Assets & Loans'));

    // Select the returned asset row in table
    await waitFor(() => {
      expect(screen.getByText('Mock Returned Ring')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Mock Returned Ring'));

    // Find "List For Sale" button in detail panel and click
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /List For Sale/i })).toBeInTheDocument();
    });
    const listButton = screen.getByRole('button', { name: /List For Sale/i });
    fireEvent.click(listButton);

    // Fill in price in modal
    await waitFor(() => {
      expect(screen.getByLabelText('Listing Price (USDC)')).toBeInTheDocument();
    });
    const priceInput = screen.getByLabelText('Listing Price (USDC)');
    fireEvent.change(priceInput, { target: { value: 1800 } });

    // Submit form
    const publishButton = screen.getByRole('button', { name: /Publish Listing/i });
    fireEvent.click(publishButton);

    // Verify /marketplace/listings POST call
    await waitFor(() => {
      const listingCall = mockFetch.mock.calls.find((call) => call[0].endsWith('/marketplace/listings'));
      expect(listingCall).toBeDefined();
      const body = JSON.parse(listingCall![1].body);
      expect(body.assetId).toBe('A-1004');
      expect(body.price).toBe(1800);
      expect(body.isProtocolOwned).toBe(false);
    });
  });

  it('proves customer listing uses the current session userId, not a hardcoded literal', async () => {
    // Override the mock to return a custom user ID 'customer-999' on login
    mockFetch.mockImplementation(async (url: string, options?: any) => {
      if (url.endsWith('/admin/dashboard')) {
        const customizedDashboard = {
          ...mockDashboardData,
          assets: mockDashboardData.assets.map(asset => ({ ...asset, ownerId: 'customer-999' }))
        };
        return { ok: true, json: async () => customizedDashboard };
      }
      if (url.endsWith('/auth/demo-login')) {
        return {
          ok: true,
          json: async () => ({
            userId: 'customer-999',
            displayName: 'Test Customer 999',
            role: 'CUSTOMER',
            walletAddress: '0x1111111111111111111111111111111111111111',
            token: 'mock-jwt-token'
          })
        };
      }
      if (url.endsWith('/marketplace/listings')) {
        return { ok: true, json: async () => ({ id: 'LIST-001', status: 'ACTIVE' }) };
      }
      if (url.endsWith('/marketplace')) {
        return { ok: true, json: async () => mockMarketplaceData };
      }
      return { ok: false, status: 404 };
    });

    render(<App walletButton={<button type="button">Connect Wallet</button>} />);

    // Wait for session to load
    await waitFor(() => {
      expect(screen.getByText('Test Customer 999')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('My Assets & Loans'));

    await waitFor(() => {
      expect(screen.getByText('Mock Returned Ring')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Mock Returned Ring'));

    // Find "List For Sale" button and click
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /List For Sale/i })).toBeInTheDocument();
    });
    const listButton = screen.getByRole('button', { name: /List For Sale/i });
    fireEvent.click(listButton);

    // Fill in price in modal
    await waitFor(() => {
      expect(screen.getByLabelText('Listing Price (USDC)')).toBeInTheDocument();
    });
    const priceInput = screen.getByLabelText('Listing Price (USDC)');
    fireEvent.change(priceInput, { target: { value: 1800 } });

    // Submit form
    const publishButton = screen.getByRole('button', { name: /Publish Listing/i });
    fireEvent.click(publishButton);

    await waitFor(() => {
      const listingCall = mockFetch.mock.calls.find((call) => {
        if (!call[1] || !call[1].headers) return false;
        const authHeader = call[1].headers['Authorization'] || call[1].headers['authorization'];
        return call[0].endsWith('/marketplace/listings') && authHeader === 'Bearer mock-jwt-token';
      });
      expect(listingCall).toBeDefined();
    });
  });

  it('proves switching role changes displayed workspace and side nav visibility', async () => {
    render(<App walletButton={<button type="button">Connect Wallet</button>} />);

    // Wait for session to load
    await waitFor(() => {
      expect(screen.getByText('Demo Customer Seller')).toBeInTheDocument();
    });

    // Switch to Validator (STAFF)
    const select = screen.getByTestId('role-select');
    fireEvent.change(select, { target: { value: 'STAFF' } });

    // Verify topbar user displays Demo Staff
    await waitFor(() => {
      expect(screen.getByText('Demo Staff')).toBeInTheDocument();
    });

    // Verify side nav is now Validator Workspace
    expect(screen.getByText('Validator Workspace')).toBeInTheDocument();
    expect(screen.getByText('Work Queue')).toBeInTheDocument();
    expect(screen.getByText('Appraisals')).toBeInTheDocument();

    // Verify Customer/Admin navigation is hidden
    expect(screen.queryByText('New Pawn Request')).not.toBeInTheDocument();
    expect(screen.queryByText('Audit Events')).not.toBeInTheDocument();

    // Switch to Admin
    fireEvent.change(select, { target: { value: 'ADMIN' } });

    // Verify topbar user displays Demo Admin
    await waitFor(() => {
      expect(screen.getByText('Demo Admin')).toBeInTheDocument();
    });

    // Verify side nav is now Admin Workspace
    expect(screen.getByText('Admin Workspace')).toBeInTheDocument();
    expect(screen.getByText('Audit Events')).toBeInTheDocument();
    expect(screen.getByText('System Adapters')).toBeInTheDocument();

    // Verify Customer/Validator navigation is hidden
    expect(screen.queryByText('New Pawn Request')).not.toBeInTheDocument();
    expect(screen.queryByText('Work Queue')).not.toBeInTheDocument();
  });

  it('proves Demo Customer Buyer does not see customer-1 assets in My Assets/Next Actions', async () => {
    render(<App walletButton={<button type="button">Connect Wallet</button>} />);

    // Wait for default session (customer-1) to load
    await waitFor(() => {
      expect(screen.getByText('Demo Customer Seller')).toBeInTheDocument();
    });

    // Switch to Demo Customer Buyer (customer-2)
    const select = screen.getByTestId('role-select');
    fireEvent.change(select, { target: { value: 'customer-2' } });

    // Verify topbar user displays Demo Customer Buyer
    await waitFor(() => {
      expect(screen.getByText('Demo Customer Buyer')).toBeInTheDocument();
    });

    // Go to My Assets & Loans tab
    fireEvent.click(screen.getByText('My Assets & Loans'));

    // Verify customer-1 assets (e.g. Mock Returned Ring, Mock Gold Necklace) are NOT displayed
    await waitFor(() => {
      expect(screen.queryByText('Mock Returned Ring')).not.toBeInTheDocument();
      expect(screen.queryByText('Mock Gold Necklace')).not.toBeInTheDocument();
      expect(screen.getByText('No assets found.')).toBeInTheDocument();
    });

    // Go to Overview tab
    fireEvent.click(screen.getByText('Overview'));

    // Verify Next Actions is empty of customer-1 asset actions
    await waitFor(() => {
      expect(screen.queryByText(/is ready to ship to custody/)).not.toBeInTheDocument();
    });
  });

  it('My Layaways table shows only buyer layaways and Pay Installment button', async () => {
    const dashboardWithLayaways = {
      ...mockDashboardData,
      layaways: [
        {
          id: 'LAY-001',
          listingId: 'LIST-001',
          buyerId: 'customer-1',
          totalPrice: 1000,
          amountPaid: 200,
          deadline: new Date(Date.now() + 6 * 30 * 24 * 3600000).toISOString(),
          status: 'ACTIVE',
          monthsDuration: 6,
          installmentAmount: 133
        },
        {
          id: 'LAY-002',
          listingId: 'LIST-002',
          buyerId: 'customer-2',
          totalPrice: 500,
          amountPaid: 100,
          deadline: new Date(Date.now() + 6 * 30 * 24 * 3600000).toISOString(),
          status: 'ACTIVE',
          monthsDuration: 6,
          installmentAmount: 66
        }
      ]
    };

    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/admin/dashboard')) {
        return { ok: true, json: async () => dashboardWithLayaways };
      }
      if (url.endsWith('/auth/demo-login')) {
        return {
          ok: true,
          json: async () => ({
            userId: 'customer-1',
            displayName: 'Demo Customer Seller',
            role: 'CUSTOMER',
            walletAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            token: 'mock-jwt-token'
          })
        };
      }
      if (url.endsWith('/marketplace')) {
        return { ok: true, json: async () => [] };
      }
      return { ok: false, status: 404 };
    });

    render(<App walletButton={<button type="button">Connect Wallet</button>} />);

    await waitFor(() => {
      expect(screen.getByText('Demo Customer Seller')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText('200 / 1,000 USDC')).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /Pay Installment/i })).toBeInTheDocument();
    expect(screen.queryByText('100 / 500 USDC')).not.toBeInTheDocument();
  });

  it('Pay Installment button calls /layaways/:id/pay with correct installment amount', async () => {
    const layaway = {
      id: 'LAY-001',
      listingId: 'LIST-001',
      buyerId: 'customer-1',
      totalPrice: 1000,
      amountPaid: 200,
      deadline: new Date(Date.now() + 6 * 30 * 24 * 3600000).toISOString(),
      status: 'ACTIVE',
      monthsDuration: 6,
      installmentAmount: 133
    };

    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/admin/dashboard')) {
        return { ok: true, json: async () => ({ ...mockDashboardData, layaways: [layaway] }) };
      }
      if (url.endsWith('/auth/demo-login')) {
        return {
          ok: true,
          json: async () => ({
            userId: 'customer-1',
            displayName: 'Demo Customer Seller',
            role: 'CUSTOMER',
            walletAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            token: 'mock-jwt-token'
          })
        };
      }
      if (url.endsWith('/marketplace')) { return { ok: true, json: async () => [] }; }
      if (url.includes('/layaways/LAY-001/pay')) {
        return { ok: true, json: async () => ({ ...layaway, amountPaid: 333 }) };
      }
      return { ok: false, status: 404 };
    });

    render(<App walletButton={<button type="button">Connect Wallet</button>} />);

    await waitFor(() => {
      expect(screen.getByText('Demo Customer Seller')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Pay Installment/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Pay Installment/i }));

    await waitFor(() => {
      const payCall = mockFetch.mock.calls.find((call) => call[0]?.includes('/layaways/LAY-001/pay'));
      expect(payCall).toBeDefined();
      const body = JSON.parse(payCall![1].body);
      expect(body.amount).toBe(133);
    });
  });

  it('navigates to fractions workspace and displays tables and handles fractionalize/buy forms', async () => {
    const mockFracAssets = [
      {
        assetId: 'A-1001',
        originalOwner: 'customer-2',
        totalShares: 100,
        availableShares: 60,
        pricePerShare: 20,
        status: 'ACTIVE'
      }
    ];

    const mockFracPositions = [
      {
        id: 'pos-1',
        assetId: 'A-1001',
        holderId: 'customer-1',
        shares: 40,
        totalShares: 100
      }
    ];

    mockFetch.mockImplementation((url, init) => {
      if (url.includes('/auth/demo-login')) {
        return {
          ok: true,
          json: async () => ({
            userId: 'customer-1',
            displayName: 'Demo Customer Seller',
            role: 'CUSTOMER',
            walletAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            token: 'mock-jwt-token'
          })
        };
      }
      if (url.endsWith('/admin/dashboard')) {
        return { ok: true, json: async () => mockDashboardData };
      }
      if (url.endsWith('/marketplace')) {
        return { ok: true, json: async () => [] };
      }
      if (url.endsWith('/blockchain/config')) {
        return { ok: true, json: async () => ({ mode: 'mock' }) };
      }
      if (url.endsWith('/blockchain/health')) {
        return { ok: true, json: async () => ({ healthy: true }) };
      }
      if (url.endsWith('/fractions/assets')) {
        return { ok: true, json: async () => mockFracAssets };
      }
      if (url.includes('/fractions/positions/')) {
        return { ok: true, json: async () => mockFracPositions };
      }
      if (url.includes('/fractions/fractionalize')) {
        return {
          ok: true,
          json: async () => ({
            assetId: 'A-1004',
            originalOwner: 'customer-1',
            totalShares: 100,
            availableShares: 0,
            pricePerShare: 15,
            status: 'SOLD_OUT'
          })
        };
      }
      if (url.includes('/fractions/buy')) {
        return {
          ok: true,
          json: async () => ({
            assetId: 'A-1001',
            originalOwner: 'customer-2',
            totalShares: 100,
            availableShares: 50,
            pricePerShare: 20,
            status: 'ACTIVE'
          })
        };
      }
      return { ok: false, status: 404 };
    });

    render(<App walletButton={<button type="button">Connect Wallet</button>} />);

    await waitFor(() => {
      expect(screen.getByText('Demo Customer Seller')).toBeInTheDocument();
    });

    const fractionsLink = screen.getByRole('link', { name: /Fractions/i });
    expect(fractionsLink).toBeInTheDocument();
    fireEvent.click(fractionsLink);

    await waitFor(() => {
      expect(screen.getByText('Active Fractional Pools')).toBeInTheDocument();
    });

    expect(screen.getByText('Eligible Assets for Fractionalization')).toBeInTheDocument();
    expect(screen.getByText('My Fraction Holdings')).toBeInTheDocument();

    // Use exact regex to avoid matching the hidden modal's 'Fractionalize Asset' submit button
    // which is rendered in the DOM even when the modal is not visible (Cloudscape behavior).
    const fractionalizeBtn = screen.getAllByRole('button', { name: /^Fractionalize$/i })[0];
    expect(fractionalizeBtn).toBeInTheDocument();
    fireEvent.click(fractionalizeBtn);

    expect(screen.getByText('Fractionalize Physical Asset')).toBeInTheDocument();

    const targetPriceInput = screen.getByPlaceholderText('5000');
    fireEvent.change(targetPriceInput, { target: { value: '1500' } });

    const submitBtn = screen.getByRole('button', { name: 'Fractionalize Asset' });
    // Submit via the modal's <form> element since Cloudscape formAction="submit" doesn't
    // propagate native form submission on button click in JSDOM.
    const fractionalizeForm = targetPriceInput.closest('form')!;
    fireEvent.submit(fractionalizeForm);

    await waitFor(() => {
      const fracCall = mockFetch.mock.calls.find((call) => call[0]?.includes('/fractions/fractionalize'));
      expect(fracCall).toBeDefined();
      const body = JSON.parse(fracCall![1].body);
      expect(body.assetId).toBe('A-1004');
      expect(body.totalShares).toBe(100);
      expect(body.targetPrice).toBe(1500);
    });

    // Use getAllByRole to handle the case where the modal's submit button may still be in the DOM.
    const buyBtn = screen.getAllByRole('button', { name: /^Buy Fractions$/i })[0];
    expect(buyBtn).toBeInTheDocument();
    fireEvent.click(buyBtn);

    expect(screen.getByText('Buy Fractional Shares')).toBeInTheDocument();

    const sharesInput = screen.getByPlaceholderText('1');
    fireEvent.change(sharesInput, { target: { value: '10' } });

    // Submit buy fractions via the modal's form element
    const buyForm = sharesInput.closest('form')!;
    fireEvent.submit(buyForm);

    await waitFor(() => {
      const buyCall = mockFetch.mock.calls.find((call) => call[0]?.includes('/fractions/buy'));
      expect(buyCall).toBeDefined();
      const body = JSON.parse(buyCall![1].body);
      expect(body.assetId).toBe('A-1001');
      expect(body.sharesToBuy).toBe(10);
    });
  });
});
