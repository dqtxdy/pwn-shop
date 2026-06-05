// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IERC20.sol";
import "./interfaces/IERC721.sol";
import "./interfaces/IFractionToken.sol";

/**
 * @title Initializable
 * @dev Helper to replace constructor for upgradeable contracts
 */
abstract contract Initializable {
    bool private _initialized;
    bool private _initializing;

    modifier initializer() {
        require(_initializing || !_initialized, "Initializable: already initialized");
        bool isTopLevelCall = !_initializing;
        if (isTopLevelCall) {
            _initializing = true;
            _initialized = true;
        }
        _;
        if (isTopLevelCall) {
            _initializing = false;
        }
    }
}

/**
 * @title ReentrancyGuardUpgradeable
 */
abstract contract ReentrancyGuardUpgradeable is Initializable {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    function __ReentrancyGuard_init() internal initializer {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

/**
 * @title PawnBase
 * @dev Contains all State variables, Structs, Modifiers, Events, and Errors of the system.
 */
abstract contract PawnBase is ReentrancyGuardUpgradeable {
    bytes4 private constant ERC1155_ACCEPTED = 0xf23a6e61;
    bytes4 private constant ERC1155_BATCH_ACCEPTED = 0xbc197c81;

    IERC20 public paymentToken;
    IERC721 public assetToken;
    IFractionToken public fractionToken;
    
    address public admin;
    address public oracle;

    mapping(address => bool) public kycedUsers;

    uint256 public platformFeePercentage;
    uint256 public constant MAX_BPS = 10000;
    uint256 public constant YEAR_SECONDS = 365 days;

    // Admin-configurable parameters
    uint256 public minLoanDuration;
    uint256 public maxLoanDuration;
    uint256 public maxAppraisalAge;
    uint256 public maxLtvBps;
    uint256 public maxInterestRateBps;
    uint256 public minLayawayDepositBps;
    mapping(address => bool) public supportedStablecoins;
    mapping(address => uint256) public protocolFees;

    enum LoanStatus {
        None,
        Active,
        Repaid,
        Liquidated
    }

    enum ListingStatus {
        None,
        Active,
        Sold,
        Cancelled
    }

    enum LayawayStatus {
        None,
        Active,
        Completed,
        Forfeited
    }

    enum FractionalStatus {
        None,
        Active,
        SoldOut,
        Redeemed
    }

    struct Appraisal {
        uint256 value;
        uint256 timestamp;
        bool isValid;
        uint256 recommendedLTV; // Loan-to-Value in basis points (e.g., 6000 bps = 60%)
        uint256 interestRateBps; // Admin-defined interest rate for this specific asset
    }

    struct PawnLoan {
        address borrower;
        uint256 loanAmount;
        uint256 interestRate;
        uint256 startTime;
        uint256 duration;
        bool isActive;
        LoanStatus status;
    }

    struct Listing {
        address seller;
        uint256 price;
        bool isConsignment; // Consignment: Protocol takes a fee. False: Direct protocol sale.
        bool isActive;
        ListingStatus status;
    }

    struct FractionListing {
        address seller;
        uint256 assetId;
        uint256 amount;
        uint256 pricePerShare;
        bool isActive;
    }

    struct Layaway {
        address buyer;
        uint256 totalPrice;
        uint256 amountPaid;
        uint256 lastPaymentTime;
        uint256 deadline;
        uint256 monthsDuration;     // 3, 6, 9, or 12 months
        uint256 installmentAmount;  // Fixed amount to pay per month
        bool isActive;
        uint256 penaltyAccumulated; // trackers late payment penalties
        LayawayStatus status;
    }

    struct FractionalAsset {
        address originalOwner;
        uint256 totalShares;      // Total number of shares to split into (e.g., 100)
        uint256 availableShares;  // Remaining shares available for purchase
        uint256 pricePerShare;    // Target price per single share
        bool isActive;
        FractionalStatus status;
    }

    // Mappings storing core protocol data
    mapping(uint256 => Appraisal) public appraisals;
    mapping(uint256 => PawnLoan) public pawns;
    mapping(uint256 => Listing) public listings;
    mapping(uint256 => Layaway) public layaways;
    mapping(uint256 => FractionalAsset) public fractionalAssets;
    
    // Dispute Management
    struct Dispute {
        address initiator;
        string evidenceURI;
        bool isResolved;
        bool ruledInFavorOfUser;
    }
    mapping(uint256 => Dispute) public disputes;

    uint256 public nextFractionListingId;
    mapping(uint256 => FractionListing) public fractionListings;

    // user => number of shares owned for a specific asset
    mapping(uint256 => mapping(address => uint256)) public fractionBalances; 

    // Custom Errors
    error NotAuthorized();
    error NotAppraisedOrInvalid();
    error StaleAppraisal();
    error LoanNotActive();
    error LoanNotMature();
    error NotForSale();
    error LayawayExpired();
    error NotEnoughFractions();
    error InvalidMonthsDuration();
    error KYCRequired();
    error InvalidAddress();
    error InvalidAmount();
    error AssetLocked();
    error AssetNotInProtocolCustody();
    error UnsafeParameter();
    error TransferFailed();

    // Events
    event PenaltyApplied(uint256 indexed assetId, uint256 penaltyAmount);
    event AppraisalUpdated(uint256 indexed assetId, uint256 newValue, uint256 timestamp, uint256 adminLTV, uint256 interestRateBps);
    event AppraisalRevoked(uint256 indexed assetId, address indexed revokedBy);
    event LoanCreated(uint256 indexed assetId, address borrower, uint256 amount, uint256 duration);
    event LoanRepaid(uint256 indexed assetId, address borrower, uint256 totalRepaid);
    event FractionListed(uint256 indexed listingId, uint256 indexed assetId, address seller, uint256 amount, uint256 pricePerShare);
    event FractionListingCancelled(uint256 indexed listingId);
    event FractionBoughtFromListing(uint256 indexed listingId, uint256 indexed assetId, address buyer, uint256 amountBought, uint256 totalCost);
    event LoanLiquidated(uint256 indexed assetId);
    event ItemConsigned(uint256 indexed assetId, address seller, uint256 price);
    event ItemBought(uint256 indexed assetId, address buyer, uint256 price);
    event LayawayStarted(uint256 indexed assetId, address buyer, uint256 initialPayment);
    event LayawayInstallmentPaid(uint256 indexed assetId, uint256 amount);
    event LayawayCompleted(uint256 indexed assetId, address buyer);
    event LayawayForfeited(uint256 indexed assetId);
    event AssetFractionalized(uint256 indexed assetId, address owner, uint256 totalShares, uint256 pricePerShare);
    event FractionsBought(uint256 indexed assetId, address buyer, uint256 shares, uint256 totalCost);
    event DisputeOpened(uint256 indexed assetId, address initiator, string evidenceURI);
    event DisputeResolved(uint256 indexed assetId, bool ruledInFavorOfUser);
    event NotificationTriggered(uint256 indexed assetId, address indexed user, string messageType);
    event PhysicalCustodyHandoverPending(uint256 indexed assetId, address indexed target);
    event ProtocolFeeAccrued(address indexed token, uint256 amount, string reason);
    event ProtocolFeesWithdrawn(address indexed token, address indexed target, uint256 amount);
    event AssetRescued(uint256 indexed assetId, address indexed target, string reasonURI);
    event RiskParametersUpdated(uint256 maxAppraisalAge, uint256 maxLtvBps, uint256 maxInterestRateBps, uint256 minLayawayDepositBps);
    event RolesUpdated(address indexed admin, address indexed oracle);

    // Modifiers
    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAuthorized();
        _;
    }

    modifier onlyOracle() {
        if (msg.sender != oracle && msg.sender != admin) revert NotAuthorized();
        _;
    }

    modifier onlyKYC(address user) {
        if (!kycedUsers[user]) revert KYCRequired();
        _;
    }

    function _requireAddress(address account) internal pure {
        if (account == address(0)) revert InvalidAddress();
    }

    function _requireProtocolCustody(uint256 assetId) internal view {
        if (assetToken.ownerOf(assetId) != address(this)) revert AssetNotInProtocolCustody();
    }

    function _requireAssetUnlocked(uint256 assetId) internal view {
        if (
            pawns[assetId].status == LoanStatus.Active ||
            listings[assetId].status == ListingStatus.Active ||
            layaways[assetId].status == LayawayStatus.Active ||
            fractionalAssets[assetId].status == FractionalStatus.Active ||
            fractionalAssets[assetId].status == FractionalStatus.SoldOut
        ) {
            revert AssetLocked();
        }
    }

    function _safePaymentTransfer(address to, uint256 amount) internal {
        if (amount == 0) return;
        if (!paymentToken.transfer(to, amount)) revert TransferFailed();
    }

    function _safePaymentTransferFrom(address from, address to, uint256 amount) internal {
        if (amount == 0) return;
        if (!paymentToken.transferFrom(from, to, amount)) revert TransferFailed();
    }

    function _accrueFee(address token, uint256 amount, string memory reason) internal {
        if (amount == 0) return;
        protocolFees[token] += amount;
        emit ProtocolFeeAccrued(token, amount, reason);
    }

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        return ERC1155_ACCEPTED;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external pure returns (bytes4) {
        return ERC1155_BATCH_ACCEPTED;
    }

    /**
     * @dev Gap for future state extensions to prevent storage collisions in upgradeable contracts.
     */
    uint256[50] private __gap;
}
