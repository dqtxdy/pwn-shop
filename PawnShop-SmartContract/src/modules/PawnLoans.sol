// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../PawnBase.sol";

abstract contract PawnLoans is PawnBase {
    /**
     * @dev Creates a loan backed by the physical/RWA NFT. Ensures the appraisal is not outdated.
     * @param assetId The ID of the NFT collateral
     * @param durationDays Number of days the loan is active for
     * @param requestedAmount The stablecoin amount the borrower is requesting
     */
    function createPawnLoan(uint256 assetId, uint256 durationDays, uint256 requestedAmount) external onlyKYC(msg.sender) nonReentrant {
        require(supportedStablecoins[address(paymentToken)], "Payment token not supported");
        if (requestedAmount == 0) revert InvalidAmount();
        _requireAssetUnlocked(assetId);

        uint256 duration = durationDays * 1 days;
        require(durationDays * 1 days >= minLoanDuration && durationDays * 1 days <= maxLoanDuration, "Invalid loan duration");

        Appraisal memory app = appraisals[assetId];
        
        if (!app.isValid) revert NotAppraisedOrInvalid();
        
        // Prevent using outdated market price (e.g. older than 30 days)
        if (block.timestamp - app.timestamp > maxAppraisalAge) revert StaleAppraisal();

        uint256 maxLoan = (app.value * app.recommendedLTV) / MAX_BPS;
        require(requestedAmount <= maxLoan, "Exceeds max LTV");

        // Use the custom interest rate defined by the Admin/Oracle during appraisal
        uint256 interestRateBps = app.interestRateBps; 

        // Lock the NFT into the smart contract
        assetToken.transferFrom(msg.sender, address(this), assetId);

        pawns[assetId] = PawnLoan({
            borrower: msg.sender,
            loanAmount: requestedAmount,
            interestRate: interestRateBps,
            startTime: block.timestamp,
            duration: duration,
            isActive: true,
            status: LoanStatus.Active
        });

        // Deduct an upfront origination fee from the requested amount
        uint256 originationFee = (requestedAmount * platformFeePercentage) / MAX_BPS;
        uint256 netDisbursed = requestedAmount - originationFee;
        _accrueFee(address(paymentToken), originationFee, "LOAN_ORIGINATION");

        // Disburse the net funds to the borrower (Fee remains inside the protocol)
        _safePaymentTransfer(msg.sender, netDisbursed);

        emit LoanCreated(assetId, msg.sender, requestedAmount, durationDays);
    }

    /**
     * @dev Quotes the single full repayment required by the SRS.
     */
    function quotePawnRepayment(uint256 assetId) public view returns (uint256 principal, uint256 interest, uint256 total) {
        PawnLoan storage loan = pawns[assetId];
        if (!loan.isActive) revert LoanNotActive();

        uint256 elapsed = block.timestamp - loan.startTime;
        interest = (loan.loanAmount * loan.interestRate * elapsed) / (MAX_BPS * YEAR_SECONDS);
        principal = loan.loanAmount;
        total = principal + interest;
    }

    /**
     * @dev Borrower repays the full principal + interest to get their NFT back
     */
    function repayPawn(uint256 assetId) external nonReentrant {
        PawnLoan storage loan = pawns[assetId];
        if (!loan.isActive) revert LoanNotActive();
        if (msg.sender != loan.borrower) revert NotAuthorized();

        (, uint256 interest, uint256 totalRepay) = quotePawnRepayment(assetId);

        loan.isActive = false;
        loan.status = LoanStatus.Repaid;
        _accrueFee(address(paymentToken), interest, "LOAN_INTEREST");
        
        // Take stablecoins from the user and unlock the physical NFT back to them
        _safePaymentTransferFrom(msg.sender, address(this), totalRepay);
        assetToken.transferFrom(address(this), msg.sender, assetId);

        emit LoanRepaid(assetId, msg.sender, totalRepay);
    }

    /**
     * @dev Liquidates the loan if overdue. The protocol keeps the NFT.
     */
    function liquidatePawn(uint256 assetId) external onlyAdmin {
        PawnLoan storage loan = pawns[assetId];
        if (!loan.isActive) revert LoanNotActive();
        
        // Verify that the loan is actually overdue
        if (block.timestamp <= loan.startTime + loan.duration) revert LoanNotMature();

        loan.isActive = false;
        loan.status = LoanStatus.Liquidated;
        // The NFT is officially retained by the protocol, which then can be put onto the marketplace
        emit LoanLiquidated(assetId);
    }
}
