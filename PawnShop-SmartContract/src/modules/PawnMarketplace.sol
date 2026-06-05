// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../PawnBase.sol";

abstract contract PawnMarketplace is PawnBase {
    /**
     * @dev Users list their NFT for sale or consignment.
     * @param price Listing price in stablecoins
     * @param isConsigned Flag: True if selling user's item, False if protocol is selling liquidated goods
     */
    function createListing(uint256 assetId, uint256 price, bool isConsigned) external nonReentrant {
        if (price == 0) revert InvalidAmount();
        if(isConsigned) {
            if (!kycedUsers[msg.sender]) revert KYCRequired();
            _requireAssetUnlocked(assetId);
            assetToken.transferFrom(msg.sender, address(this), assetId);
            listings[assetId] = Listing(msg.sender, price, true, true, ListingStatus.Active);
        } else {
            if (msg.sender != admin) revert NotAuthorized();
            _requireAssetUnlocked(assetId);
            _requireProtocolCustody(assetId);
            listings[assetId] = Listing(address(this), price, false, true, ListingStatus.Active);
        }
        emit ItemConsigned(assetId, msg.sender, price);
    }

    /**
     * @dev Cancel listing and retrieve back the asset
     */
    function cancelListing(uint256 assetId) external nonReentrant {
        Listing storage list = listings[assetId];
        if (!list.isActive) revert NotForSale();
        if (msg.sender != list.seller && msg.sender != admin) revert NotAuthorized();

        list.isActive = false;
        list.status = ListingStatus.Cancelled;
        
        // Return asset logic only makes sense if it's a user consignment
        if(list.isConsignment) {
            assetToken.transferFrom(address(this), list.seller, assetId);
        }
    }

    /**
     * @dev Buy the item with a one-time full payment
     */
    function buyItem(uint256 assetId) external nonReentrant {
        if (!kycedUsers[msg.sender]) revert KYCRequired();

        Listing storage list = listings[assetId];
        if (!list.isActive) revert NotForSale();

        list.isActive = false;
        list.status = ListingStatus.Sold;

        // Route payment distributions based on whether it is Consigned or Protocol's
        if (list.isConsignment) {
            // Apply platform fee commission
            uint256 fee = (list.price * platformFeePercentage) / MAX_BPS;
            uint256 netToSeller = list.price - fee;
            _accrueFee(address(paymentToken), fee, "MARKETPLACE_CONSIGNMENT");
            
            _safePaymentTransferFrom(msg.sender, address(this), fee);
            _safePaymentTransferFrom(msg.sender, list.seller, netToSeller);
        } else {
            _safePaymentTransferFrom(msg.sender, address(this), list.price);
        }

        // Deliver the NFT RWA
        assetToken.transferFrom(address(this), msg.sender, assetId);
        emit ItemBought(assetId, msg.sender, list.price);
        emit PhysicalCustodyHandoverPending(assetId, msg.sender);
    }

    /**
     * @dev Users list their fractional tokens for sale.
     * @param assetId The fractionalized NFT
     * @param amount The number of fraction tokens to sell
     * @param pricePerShare The price per share in stablecoins
     */
    function createFractionListing(uint256 assetId, uint256 amount, uint256 pricePerShare) external nonReentrant returns (uint256 listingId) {
        if (!kycedUsers[msg.sender]) revert KYCRequired();
        require(amount > 0, "Amount must be > 0");
        require(pricePerShare > 0, "Price must be > 0");
        
        fractionToken.safeTransferFrom(msg.sender, address(this), assetId, amount, "");
        
        listingId = nextFractionListingId++;
        fractionListings[listingId] = FractionListing({
            seller: msg.sender,
            assetId: assetId,
            amount: amount,
            pricePerShare: pricePerShare,
            isActive: true
        });
        
        emit FractionListed(listingId, assetId, msg.sender, amount, pricePerShare);
    }

    /**
     * @dev Cancel a fraction listing and retrieve back the fraction tokens
     */
    function cancelFractionListing(uint256 listingId) external nonReentrant {
        FractionListing storage list = fractionListings[listingId];
        if (!list.isActive) revert NotForSale();
        if (msg.sender != list.seller && msg.sender != admin) revert NotAuthorized();

        list.isActive = false;
        
        fractionToken.safeTransferFrom(address(this), list.seller, list.assetId, list.amount, "");
        emit FractionListingCancelled(listingId);
    }

    /**
     * @dev Buy fractions from a specific listing
     */
    function buyFractionListing(uint256 listingId, uint256 amountToBuy) external nonReentrant {
        if (!kycedUsers[msg.sender]) revert KYCRequired();

        FractionListing storage list = fractionListings[listingId];
        if (!list.isActive) revert NotForSale();
        require(amountToBuy > 0, "Amount must be > 0");
        if (list.amount < amountToBuy) revert NotEnoughFractions();

        uint256 totalCost = amountToBuy * list.pricePerShare;
        
        list.amount -= amountToBuy;
        if (list.amount == 0) {
            list.isActive = false;
        }

        // Apply platform fee commission
        uint256 fee = (totalCost * platformFeePercentage) / MAX_BPS;
        uint256 netToSeller = totalCost - fee;
        _accrueFee(address(paymentToken), fee, "FRACTION_MARKETPLACE");

        _safePaymentTransferFrom(msg.sender, address(this), fee);
        _safePaymentTransferFrom(msg.sender, list.seller, netToSeller);

        fractionToken.safeTransferFrom(address(this), msg.sender, list.assetId, amountToBuy, "");

        emit FractionBoughtFromListing(listingId, list.assetId, msg.sender, amountToBuy, totalCost);
    }
}
