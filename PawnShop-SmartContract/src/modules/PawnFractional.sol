// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../PawnBase.sol";

/**
 * @title PawnFractional
 * @dev Tokenization & Asset Fractionalization Module: 
 * Allows a high-value physical asset (e.g. Rolex/Wine) to be split into multiple smaller shares, 
 * lowering the barrier for entry investments.
 */
abstract contract PawnFractional is PawnBase {

    function _validateFractionalization(uint256 assetId, uint256 totalShares, uint256 targetPrice) internal view {
        require(totalShares > 0, "Shares must be > 0");
        require(targetPrice > 0, "Price must be > 0");
        require(targetPrice % totalShares == 0, "Target price must be divisible by total shares");
        require(fractionalAssets[assetId].status == FractionalStatus.None, "Already fractionalized");
    }

    /**
     * @dev Fractionalizes defaulted or protocol-owned assets into protocol primary-market shares.
     */
    function fractionalizeItem(uint256 assetId, uint256 totalShares, uint256 targetPrice) external onlyAdmin nonReentrant {
        _validateFractionalization(assetId, totalShares, targetPrice);

        PawnLoan storage loan = pawns[assetId];
        if (loan.status == LoanStatus.Active) {
            bool isOverdue = block.timestamp > loan.startTime + loan.duration;
            require(isOverdue, "Active loan is not overdue");
            loan.isActive = false;
            loan.status = LoanStatus.Liquidated;
            emit LoanLiquidated(assetId);
        } else {
            _requireProtocolCustody(assetId);
        }

        require(listings[assetId].status != ListingStatus.Active, "Listed asset");
        require(layaways[assetId].status != LayawayStatus.Active, "Layaway asset");
        _requireProtocolCustody(assetId);

        uint256 pricePerShare = targetPrice / totalShares;

        // Mint new fraction tokens to the protocol itself to be sold
        fractionToken.mint(address(this), assetId, totalShares, "");

        fractionalAssets[assetId] = FractionalAsset({
            originalOwner: address(this),
            totalShares: totalShares,
            availableShares: totalShares, // none bought initially
            pricePerShare: pricePerShare,
            isActive: true,
            status: FractionalStatus.Active
        });

        emit AssetFractionalized(assetId, address(this), totalShares, pricePerShare);
    }

    /**
     * @dev Lets a verified owner lock an asset and receive 100% of its fractional shares.
     */
    function fractionalizeOwnedAsset(uint256 assetId, uint256 totalShares, uint256 targetPrice) external onlyKYC(msg.sender) nonReentrant {
        _validateFractionalization(assetId, totalShares, targetPrice);
        _requireAssetUnlocked(assetId);

        assetToken.transferFrom(msg.sender, address(this), assetId);

        uint256 pricePerShare = targetPrice / totalShares;
        fractionToken.mint(msg.sender, assetId, totalShares, "");

        fractionalAssets[assetId] = FractionalAsset({
            originalOwner: msg.sender,
            totalShares: totalShares,
            availableShares: 0,
            pricePerShare: pricePerShare,
            isActive: false,
            status: FractionalStatus.SoldOut
        });

        emit AssetFractionalized(assetId, msg.sender, totalShares, pricePerShare);
    }

    /**
     * @dev Users buy chunks of the asset instead of purchasing the entire expensive item
     * @param assetId The fractionalized NFT
     * @param sharesToBuy e.g., Buying 5 fractions simultaneously
     */
    function buyFractions(uint256 assetId, uint256 sharesToBuy) external nonReentrant {
        if (!kycedUsers[msg.sender]) revert KYCRequired();

        FractionalAsset storage frac = fractionalAssets[assetId];
        require(frac.status == FractionalStatus.Active, "Not active or not fractionalized");
        require(sharesToBuy > 0, "Must buy at least 1 share");

        if (frac.availableShares < sharesToBuy) revert NotEnoughFractions();

        uint256 totalCost = sharesToBuy * frac.pricePerShare;

        // Deduct from the remaining token pieces pool
        frac.availableShares -= sharesToBuy;
        // Register token portions to the buyer's balance using ERC1155
        fractionToken.safeTransferFrom(address(this), msg.sender, assetId, sharesToBuy, "");

        if (frac.originalOwner == address(this)) {
            _safePaymentTransferFrom(msg.sender, address(this), totalCost);
        } else {
            uint256 fee = (totalCost * platformFeePercentage) / MAX_BPS;
            uint256 netToOwner = totalCost - fee;
            _accrueFee(address(paymentToken), fee, "PRIMARY_FRACTION_SALE");

            _safePaymentTransferFrom(msg.sender, address(this), fee); 
            _safePaymentTransferFrom(msg.sender, frac.originalOwner, netToOwner);
        }

        emit FractionsBought(assetId, msg.sender, sharesToBuy, totalCost);

        // Mark the fractionalization process closed if successfully 100% crowdfunded
        if (frac.availableShares == 0) {
            frac.isActive = false;
            frac.status = FractionalStatus.SoldOut;
        }
    }

    /**
     * @dev Burns 100% of the ERC-1155 shares and releases the locked asset.
     */
    function redeemAsset(uint256 assetId) external nonReentrant {
        FractionalAsset storage frac = fractionalAssets[assetId];
        require(
            frac.status == FractionalStatus.Active || frac.status == FractionalStatus.SoldOut,
            "Not redeemable"
        );

        uint256 balance = fractionToken.balanceOf(msg.sender, assetId);
        if (balance != frac.totalShares) revert NotEnoughFractions();

        frac.isActive = false;
        frac.availableShares = 0;
        frac.status = FractionalStatus.Redeemed;

        fractionToken.burn(msg.sender, assetId, frac.totalShares);
        assetToken.transferFrom(address(this), msg.sender, assetId);

        emit PhysicalCustodyHandoverPending(assetId, msg.sender);
    }

    /**
     * @dev Fetch how many pieces a single user holds of an asset
     */
    function getFractionsOf(uint256 assetId, address user) external view returns (uint256) {
        return fractionToken.balanceOf(user, assetId);
    }
}
