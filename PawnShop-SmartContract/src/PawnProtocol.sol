// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./modules/PawnAppraisal.sol";
import "./modules/PawnLoans.sol";
import "./modules/PawnMarketplace.sol";
import "./modules/PawnLayaway.sol";
import "./modules/PawnFractional.sol";

/**
 * @title PawnProtocol
 * @dev Main Smart Contract weaving all logic facades: Appraisal, Loans, Marketplace, Layaway, and Fractionalization.
 */
contract PawnProtocol is Initializable, PawnAppraisal, PawnLoans, PawnMarketplace, PawnLayaway, PawnFractional {
    
    /**
     * @dev Initializer replaces constructor for upgradeable contracts.
     * @param _paymentToken Base stablecoin used in the platform (e.g. USDC contract address)
     * @param _assetToken The original 721 format items contract (e.g. RWA NFTs representing physical properties)
     * @param _fractionToken The ERC1155 token contract used for fractional ownership representation
     */
    function initialize(address _paymentToken, address _assetToken, address _fractionToken) public initializer {
        _requireAddress(_paymentToken);
        _requireAddress(_assetToken);
        _requireAddress(_fractionToken);

        __ReentrancyGuard_init();
        
        admin = msg.sender;
        oracle = msg.sender;
        paymentToken = IERC20(_paymentToken);
        assetToken = IERC721(_assetToken);
        fractionToken = IFractionToken(_fractionToken);

        platformFeePercentage = 1000; // Default 10%
        minLoanDuration = 7 days;
        maxLoanDuration = 365 days;
        maxAppraisalAge = 30 days;
        maxLtvBps = 7000;
        maxInterestRateBps = 10000;
        minLayawayDepositBps = 2000;
    }

    event AssetReturned(uint256 indexed assetId, address target);

    /**
     * @dev Allows admin to return an asset following a declined appraisal or request.
     * This syncs the on-chain state with the physical return shipment.
     */
    function returnAsset(address target, uint256 assetId) external onlyAdmin {
        _requireAddress(target);
        _requireAssetUnlocked(assetId);
        _requireProtocolCustody(assetId);

        assetToken.transferFrom(address(this), target, assetId);
        
        // Mark appraisal as invalid to prevent any further actions
        appraisals[assetId].isValid = false;
        
        emit AssetReturned(assetId, target);
    }

    /**
     * @dev Emergency recovery for assets that are in protocol custody but not locked by active user workflows.
     */
    function rescueAsset(uint256 assetId, address target, string calldata reasonURI) external onlyAdmin {
        _requireAddress(target);
        _requireAssetUnlocked(assetId);
        _requireProtocolCustody(assetId);

        appraisals[assetId].isValid = false;
        assetToken.transferFrom(address(this), target, assetId);

        emit AssetRescued(assetId, target, reasonURI);
    }

    /**
     * @dev Opens a dispute for an asset. 
     * Can be called by the borrower if they disagree with an appraisal or liquidation.
     * @param assetId The ID of the asset under dispute
     * @param evidenceURI IPFS link to evidence (photos, documents)
     */
    function openDispute(uint256 assetId, string calldata evidenceURI) external nonReentrant {
        // Simple logic: borrower or admin can open
        require(msg.sender == pawns[assetId].borrower || msg.sender == admin, "Not authorized to open dispute");
        require(bytes(evidenceURI).length > 0, "Evidence required");
        
        disputes[assetId] = Dispute({
            initiator: msg.sender,
            evidenceURI: evidenceURI,
            isResolved: false,
            ruledInFavorOfUser: false
        });

        emit DisputeOpened(assetId, msg.sender, evidenceURI);
    }

    /**
     * @dev Resolves a dispute. Only admin (acting as arbitrator) can call this.
     * @param assetId The ID of the asset
     * @param userWins True if the decision is in favor of the user
     */
    function resolveDispute(uint256 assetId, bool userWins) external onlyAdmin {
        Dispute storage dispute = disputes[assetId];
        require(!dispute.isResolved, "Already resolved");

        dispute.isResolved = true;
        dispute.ruledInFavorOfUser = userWins;

        // If user wins and it was a liquidation dispute, admin might need to return asset
        // This is a hook for manual administrative action triggered by the ruling.

        emit DisputeResolved(assetId, userWins);
    }

    /**
     * @dev Update the platform fee percentage. Max 20% to protect users.
     * @param newFeeBps The new fee in basis points (e.g., 1000 = 10%)
     */
    function updatePlatformFee(uint256 newFeeBps) external onlyAdmin {
        require(newFeeBps <= 2000, "Fee too high"); // hard cap at 20% to prevent abuse
        platformFeePercentage = newFeeBps;
    }

    /**
     * @dev System authorities re-config mapping
     * @param _newAdmin Overarching administration rights
     * @param _newOracle Price feed estimation node address
     */
    function setRoles(address _newAdmin, address _newOracle) external onlyAdmin {
        _requireAddress(_newAdmin);
        _requireAddress(_newOracle);
        admin = _newAdmin;
        oracle = _newOracle;
        emit RolesUpdated(_newAdmin, _newOracle);
    }

    /**
     * @dev Set KYC status for a user.
     * @param user The user address.
     * @param status True if KYC is passed.
     */
    function setKYCStatus(address user, bool status) external onlyAdmin {
        kycedUsers[user] = status;
    }

    /**
     * @dev Set supported stablecoin status.
     * @param coin The address of the stablecoin (e.g. USDC, USDT)
     * @param status True if the coin is approved for use in the system.
     */
    function setStablecoinStatus(address coin, bool status) external onlyAdmin {
        _requireAddress(coin);
        supportedStablecoins[coin] = status;
    }

    /**
     * @dev Configure loan duration limits.
     * @param min Min duration in seconds
     * @param max Max duration in seconds
     */
    function setLoanDurationLimits(uint256 min, uint256 max) external onlyAdmin {
        require(min > 0 && min < max, "Invalid limits");
        minLoanDuration = min;
        maxLoanDuration = max;
    }

    /**
     * @dev Adjusts bounded risk parameters used by appraisals, loans, and layaway contracts.
     */
    function setRiskParameters(
        uint256 _maxAppraisalAge,
        uint256 _maxLtvBps,
        uint256 _maxInterestRateBps,
        uint256 _minLayawayDepositBps
    ) external onlyAdmin {
        if (_maxAppraisalAge == 0) revert UnsafeParameter();
        if (_maxLtvBps == 0 || _maxLtvBps > 7000) revert UnsafeParameter();
        if (_maxInterestRateBps > MAX_BPS) revert UnsafeParameter();
        if (_minLayawayDepositBps == 0 || _minLayawayDepositBps > 5000) revert UnsafeParameter();

        maxAppraisalAge = _maxAppraisalAge;
        maxLtvBps = _maxLtvBps;
        maxInterestRateBps = _maxInterestRateBps;
        minLayawayDepositBps = _minLayawayDepositBps;

        emit RiskParametersUpdated(_maxAppraisalAge, _maxLtvBps, _maxInterestRateBps, _minLayawayDepositBps);
    }

    /**
     * @dev Allows admin to withdraw accumulated platform fees (USDC/Stablecoins) or mistakenly sent tokens.
     * @param tokenAddress The ERC20 token address to withdraw
     * @param target The address to receive the funds
     * @param amount The amount to withdraw
     */
    function withdrawFees(address tokenAddress, address target, uint256 amount) external onlyAdmin {
        _requireAddress(tokenAddress);
        _requireAddress(target);
        if (amount == 0) revert InvalidAmount();
        require(protocolFees[tokenAddress] >= amount, "Insufficient accrued fees");

        protocolFees[tokenAddress] -= amount;
        if (!IERC20(tokenAddress).transfer(target, amount)) revert TransferFailed();

        emit ProtocolFeesWithdrawn(tokenAddress, target, amount);
    }
}
