// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../PawnBase.sol";

abstract contract PawnLayaway is PawnBase {
    /**
     * @dev Buyers make a down payment to reserve an item (Layaway / install payment plan)
     * e.g., Requires at least 10% initial deposit
     */
    function startLayaway(uint256 assetId, uint256 monthsDuration, uint256 initialPayment) external nonReentrant {
        if (!kycedUsers[msg.sender]) revert KYCRequired();
        require(monthsDuration == 3 || monthsDuration == 6 || monthsDuration == 9 || monthsDuration == 12, "Only 3, 6, 9, or 12 months allowed");

        Listing storage list = listings[assetId];
        if (!list.isActive) revert NotForSale();
        
        uint256 minDeposit = (list.price * minLayawayDepositBps) / MAX_BPS;
        require(initialPayment >= minDeposit, "Deposit too low");
        require(initialPayment < list.price, "Use direct purchase for full payment");

        list.isActive = false; // Freeze marketplace availability temporarily

        uint256 remainingAmount = list.price - initialPayment;
        uint256 installment = remainingAmount / monthsDuration;

        layaways[assetId] = Layaway({
            buyer: msg.sender,
            totalPrice: list.price,
            amountPaid: initialPayment,
            lastPaymentTime: block.timestamp,
            // Deposit is only held for e.g. duration layaway period
            deadline: block.timestamp + (monthsDuration * 30 days), 
            monthsDuration: monthsDuration,
            installmentAmount: installment,
            isActive: true,
            penaltyAccumulated: 0,
            status: LayawayStatus.Active
        });

        // Store deposit in the protocol
        _safePaymentTransferFrom(msg.sender, address(this), initialPayment);
        emit LayawayStarted(assetId, msg.sender, initialPayment);
    }

    /**
     * @dev Pay the reserve balance in installments gradually over time
     * @param amount Stablecoin amount to pay in this chunk
     */
    function payInstallment(uint256 assetId, uint256 amount) external nonReentrant {
        Layaway storage layaway = layaways[assetId];
        require(layaway.isActive, "Layaway not active");
        require(msg.sender == layaway.buyer, "Not buyer");
        
        uint256 remaining = layaway.totalPrice - layaway.amountPaid;
        uint256 requiredAmount = layaway.installmentAmount;
        if (remaining < requiredAmount || remaining - requiredAmount < requiredAmount) {
            requiredAmount = remaining; // Handle last payment and any division remainders
        }
        require(amount == requiredAmount, "Incorrect installment amount");

        uint256 expectedPaymentDate = layaway.lastPaymentTime + 30 days; 
        bool isLate = block.timestamp > expectedPaymentDate;
        
        uint256 penalty = 0;
        if (isLate) {
            penalty = (amount * 500) / MAX_BPS; // 5% penalty
            layaway.penaltyAccumulated += penalty;
            _accrueFee(address(paymentToken), penalty, "LAYAWAY_LATE_PENALTY");
        }

        layaway.amountPaid += amount;
        layaway.lastPaymentTime = block.timestamp;
        
        // Proceed deducting funds
        _safePaymentTransferFrom(msg.sender, address(this), amount + penalty);

        if (penalty > 0) {
            emit PenaltyApplied(assetId, penalty);
        }

        emit LayawayInstallmentPaid(assetId, amount);

        // System automatically completes if all due amount is satisfied
        if (layaway.amountPaid >= layaway.totalPrice) {
            layaway.isActive = false;
            layaway.status = LayawayStatus.Completed;
            
            Listing storage list = listings[assetId];
            list.status = ListingStatus.Sold;
            if (list.isConsignment) {
                // Similar to one-time buyItem, distribute total earnings & deduct final commission
                uint256 fee = (list.price * platformFeePercentage) / MAX_BPS;
                uint256 netToSeller = list.price - fee;
                _accrueFee(address(paymentToken), fee, "LAYAWAY_CONSIGNMENT");
                
                _safePaymentTransfer(list.seller, netToSeller);
            }
            
            // Release the underlying RWA to the new buyer
            assetToken.transferFrom(address(this), msg.sender, assetId);
            emit LayawayCompleted(assetId, msg.sender);
        }
    }

    /**
     * @dev Forfeits deposited money if the user fails to settle all payment parts when due. 
     * The item goes back to generic listing status.
     */
    function forfeitLayaway(uint256 assetId) external onlyAdmin {
        Layaway storage layaway = layaways[assetId];
        require(layaway.isActive, "No active layaway");
        
        bool pastDeadline = block.timestamp > layaway.deadline;
        bool pastGracePeriod = block.timestamp > layaway.lastPaymentTime + 30 days;
        require(pastDeadline || pastGracePeriod, "Cannot forfeit yet");

        layaway.isActive = false;
        layaway.status = LayawayStatus.Forfeited;
        
        Listing storage list = listings[assetId];
        list.isActive = true;
        list.status = ListingStatus.Active;

        emit LayawayForfeited(assetId);
    }
}
