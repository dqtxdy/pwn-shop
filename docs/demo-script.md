# Demo Script: Local Anvil Integration and Real Lifecycle Workflows

> [!NOTE]
> By default, the application runs in **Mock Mode** (`BLOCKCHAIN_MODE=mock`), which does not require starting an Anvil node or deploying contracts. E2E tests run in this default mock mode. Follow the instructions below to run and verify the system in **Local Anvil Mode** (with real smart contract integrations).

## Step 1: Start a Local Anvil Node

Open a separate terminal window and start a local Ethereum network using Foundry's Anvil:

```bash
anvil
```

This node runs locally at `http://127.0.0.1:8545` with chain ID `31337` and pre-funds 10 test accounts with 10,000 ETH each.

---

## Step 2: Deploy the Smart Contracts

From the repository root, run the bounded local deploy runner:

```bash
npm run deploy:local
```

Upon successful completion, this script will:
1. Deploy `MockERC20` (payment token), `AssetToken` (NFT asset), `FractionToken` (fractions), and `PawnProtocol`.
2. Mint 5 demo collateral NFTs (token IDs 1-5) to Alice (`0x70997970C51812dc3A010C7d01b50e0d17dc79C8`), matching the app's seeded assets `A-1001` through `A-1005`.
3. Mint ERC20 stablecoins and set KYC status for Alice, Bob, and Charlie.
4. Set up protocol role variables and KYC approvals.
5. Serialize the address mapping and `tokenIdMap` directly to `deployments/local-anvil.json`.

---

## Step 3: Configure and Start the Backend API

Configure the backend to use `anvil` mode and start the dev server:

1. Create or edit `apps/api/.env`:
   ```bash
   DEMO_MODE=true
   BLOCKCHAIN_MODE=anvil
   ```

2. Start the backend application:
   ```bash
   npm run dev:api
   ```

3. Call the API config and health endpoints to verify that the deployment artifact and connection are healthy:
   ```bash
   curl http://localhost:3000/api/blockchain/config
   curl http://localhost:3000/api/blockchain/health
   ```

   **Expected Output (Health check when active):**
   ```json
   {
     "mode": "anvil",
     "healthy": true
   }
   ```

---

## Step 4: Configure MetaMask and Run the Frontend App

1. **MetaMask Setup**:
   - Add a custom network in MetaMask:
     - RPC URL: `http://127.0.0.1:8545`
     - Chain ID: `31337`
     - Currency Symbol: `ETH`
   - Import Alice's test wallet into MetaMask using her private key:
     `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` (Alice's address: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`).

2. **Start Web Server**:
   ```bash
   npm run dev:web
   ```

3. **Explore Web App**:
   - Open `http://localhost:5173` in your browser.
   - Click the Web3 **Connect** button in the header and select MetaMask. Make sure you are connected as Alice (`0x7099...79C8`).
   - Notice the status bar in the top-right displays: **Anvil Network (Connected)**.

---

## Step 5: Execute On-Chain Loan Acceptance

1. Select **Staff** in the topbar session selector.
2. Go to the assets list and locate **18K gold necklace** (`A-1001`). Upload evidence (kind: Staff Unboxing) if it is not received, and submit an Appraisal (e.g., Estimated Value: `2400` USDC, LTV: `60`%, Interest: `5`%).
3. Switch back to **Customer** in the session selector.
4. Click **Inspect Asset** for the gold necklace (`A-1001`).
5. Review the appraisal details and click **Accept Loan Offer**.
6. MetaMask will prompt you sequentially:
   - **Transaction 1**: Approve `PawnProtocol` to manage your NFT asset (`A-1001` -> token ID `1`). Confirm the transaction.
   - **Transaction 2**: Call `createPawnLoan` to borrow the principal amount. Confirm the transaction.
7. Upon successful completion, the loan status updates to **Active** and the collateral asset is transferred to the protocol vault.

---

## Step 6: Execute On-Chain Repayment

1. While logged in as the Customer (Alice), click **Inspect Asset** for your active loan on the gold necklace (`A-1001`).
2. Click **Repay Selected Loan**.
3. MetaMask will prompt you sequentially:
   - **Transaction 1**: Approve `PawnProtocol` to spend the repayment ERC20 tokens. Confirm the transaction.
   - **Transaction 2**: Call `repayPawn` to repay the principal + interest. Confirm the transaction.
4. Once both transactions complete, the status updates to **Repaid** and the NFT collateral is returned to Alice's wallet on-chain.

---

## Step 7: Execute On-Chain Marketplace Listing (Consignment)

1. Switch back to **Customer** in the session selector (Alice).
2. Go to the assets list and locate an owned received/returned asset (e.g. **Gold ring set** `A-1004` which is seeded in the `Received` status).
3. Click **List Asset** to list it on the marketplace.
4. Input a listing price (e.g., `1000` USDC) and submit the form.
5. MetaMask will prompt you sequentially:
   - **Transaction 1**: Approve `PawnProtocol` to transfer your NFT asset (`A-1004` -> token ID `4`). Confirm the transaction.
   - **Transaction 2**: Call `createListing` on `PawnProtocol` to list the item. Confirm the transaction.
6. Upon successful completion, the listing status updates to **Active** and the asset status changes to **Listed**.

---

## Step 8: Execute On-Chain Layaway Purchase

1. Import Charlie's test wallet into MetaMask using his private key:
   `0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` (Charlie's address: `0x90F79bf6EB2c4f870365E785982E1f101E93b906`). Note that Charlie is pre-funded with ERC20 stablecoins and has his KYC verification seeded by the deployment scripts.
2. Select **Demo Customer 2** (`customer-2` / Charlie) in the topbar session selector.
3. Switch your connected wallet in MetaMask to Charlie (`0x90F7...b906`). Make sure the connected wallet matches your active session, as the wallet safety guard will block transactions if they do not match.
4. Go to the **Marketplace** tab and locate the **Gold ring set** (`A-1004`) listed by Alice. Note that the "Buy with Layaway" button is disabled on listings owned by your current active profile to prevent self-trading.
5. Click **Buy with Layaway** to initiate a layaway on the listing.
6. MetaMask will prompt you sequentially:
   - **Transaction 1**: Approve `PawnProtocol` to spend the ERC20 down payment (20% of the price, i.e., `200` USDC). Confirm the transaction.
   - **Transaction 2**: Call `startLayaway` on `PawnProtocol` to reserve the item. Confirm the transaction.
7. Upon completion, the listing status updates to **Reserved** and the layaway plan becomes active for the buyer (visible in the **My Layaways** section under **Customer Overview**).

---

## Step 9: Execute On-Chain Layaway Installment Payments and Completion

1. Select **Demo Customer 2** (`customer-2` / Charlie) in the topbar session selector. Ensure Charlie's wallet (`0x90F7...b906`) is connected in MetaMask.
2. Under **Customer Overview**, navigate to the **My Layaways** section.
3. Observe the progress display showing the total paid amount vs total price (e.g., `200 / 1000 USDC`) and the calculated next installment amount (e.g., `133 USDC`).
4. Click **Pay Next Installment**.
5. MetaMask will prompt you sequentially:
   - **Transaction 1**: Approve `PawnProtocol` to spend the installment payment amount (e.g., `133` USDC). Confirm the transaction.
   - **Transaction 2**: Call `payInstallment` on `PawnProtocol` to pay the installment. Confirm the transaction.
6. The frontend will wait for the receipts and submit the transaction hash back to the backend.
7. Repeat the payment process until the layaway is fully paid.
   - The final installment amount will automatically adjust to cover the remaining balance (e.g., `135 USDC` for the 6th installment).
8. Once the final installment is paid:
   - The layaway status updates to **Completed**.
   - The listing status updates to **Sold**.
   - The underlying asset token (NFT) is transferred from the protocol contract to Charlie's wallet on-chain.
   - The asset owner changes to Charlie, and status changes to **RETURNING**.

---

## Step 10: Execute On-Chain Customer NFT Fractionalization

1. Select **Customer** (Alice) in the session selector, and connect Alice's wallet (`0x7099...79C8`) in MetaMask.
2. Click the **Fractions** workspace tab on the left navigation bar.
3. Under **Eligible Owned Assets**, locate **Vintage luxury watch** (`A-1002`).
4. Click **Fractionalize**.
5. In the modal, input `100` total shares and a target price of `1000` USDC. Click **Confirm**.
6. MetaMask will prompt you sequentially:
   - **Transaction 1**: Approve `PawnProtocol` to manage your NFT asset (`A-1002` -> token ID `2`). Confirm the transaction.
   - **Transaction 2**: Call `fractionalizeOwnedAsset` on `PawnProtocol` to lock the NFT and mint fractional tokens. Confirm the transaction.
7. Upon verification, the watch status changes to `Fractionalized`. Because Alice is the owner, she holds 100% of the fractions initially.

---

## Step 11: Execute On-Chain Purchase of Fractional Shares

1. Connect Charlie's wallet (`0x90F7...b906`) in MetaMask and select **Demo Customer 2** (`customer-2` / Charlie) in the session selector.
2. Go to the **Fractions** workspace tab.
3. Locate the fractionalized pool for the asset (e.g., protocol-fractionalized asset `A-1003` which has 100 available shares).
4. Click **Buy Shares**.
5. Input `100` shares (to purchase the full supply) and click **Confirm**.
6. MetaMask will prompt you sequentially:
   - **Transaction 1**: Approve `PawnProtocol` to spend the total cost in ERC20 payment tokens (`2000` USDC). Confirm the transaction.
   - **Transaction 2**: Call `buyFractions` on `PawnProtocol` to buy the shares. Confirm the transaction.
7. Once confirmed and verified, Charlie's fraction holdings display `100 / 100` shares.

---

## Step 12: Execute On-Chain Redemption of Physical Collateral

1. While logged in as Charlie (`customer-2`) with Charlie's wallet connected, stay in the **Fractions** workspace tab.
2. Under **My Fraction Holdings & Redemptions**, locate the pool for `A-1003` where Charlie owns `100 / 100` shares.
3. Click the **Redeem Asset** button (which is active because Charlie owns 100% of the fractions).
4. MetaMask will prompt you:
   - **Transaction 1**: Call `redeemAsset` on `PawnProtocol` to burn the fractions and reclaim the physical NFT. Confirm the transaction.
5. Upon receipt verification:
   - The pool status transitions to `REDEEMED`.
   - The asset owner transitions to Charlie.
   - The underlying NFT is transferred to Charlie's wallet on-chain.
   - The physical asset status changes to `RETURNING` (ready for pickup or handover).
