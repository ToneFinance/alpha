// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./SectorToken.sol";

/**
 * @title SectorVault
 * @notice Main vault contract managing a sector basket of tokens (like an on-chain ETF)
 * @dev Users deposit quote tokens (USDC), offchain fulfillment engine provides underlying tokens,
 *      and users receive sector tokens representing their share of the basket
 */
contract SectorVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice The sector token representing shares in this vault
    SectorToken public immutable sectorToken;

    /// @notice The quote token used for deposits (e.g., USDC)
    IERC20 public immutable quoteToken;

    /// @notice Array of underlying tokens that make up the sector basket
    address[] public underlyingTokens;

    /// @notice Target weight for each underlying token (in basis points, sum should be 10000)
    mapping(address => uint256) public targetWeights;

    /// @notice Address authorized to fulfill deposits
    address public fulfillmentRole;

    /// @notice Counter for deposit IDs
    uint256 public nextDepositId;

    /// @notice Struct representing a pending deposit
    struct PendingDeposit {
        address user;
        uint256 quoteAmount;
        bool fulfilled;
        uint256 timestamp;
    }

    /// @notice Mapping of deposit ID to pending deposit
    mapping(uint256 => PendingDeposit) public pendingDeposits;

    // Events
    event DepositRequested(address indexed user, uint256 indexed depositId, uint256 quoteAmount, uint256 timestamp);

    event DepositFulfilled(address indexed user, uint256 indexed depositId, uint256 sharesAmount, uint256 timestamp);

    event DepositCancelled(address indexed user, uint256 indexed depositId, uint256 quoteAmount);

    event Withdrawal(address indexed user, uint256 sharesAmount, address[] tokens, uint256[] amounts);

    event FulfillmentRoleUpdated(address indexed oldRole, address indexed newRole);

    event BasketUpdated(address[] tokens, uint256[] weights);

    // Errors
    error InvalidAddress();
    error InvalidAmount();
    error InvalidWeights();
    error DepositNotFound();
    error DepositAlreadyFulfilled();
    error UnauthorizedFulfillment();
    error InsufficientShares();
    error EmptyBasket();

    /**
     * @notice Creates a new sector vault
     * @param _quoteToken Address of the quote token (e.g., USDC)
     * @param _sectorName Name of the sector token
     * @param _sectorSymbol Symbol of the sector token
     * @param _underlyingTokens Array of underlying token addresses
     * @param _targetWeights Array of target weights (in basis points, sum = 10000)
     * @param _fulfillmentRole Address authorized to fulfill deposits
     */
    constructor(
        address _quoteToken,
        string memory _sectorName,
        string memory _sectorSymbol,
        address[] memory _underlyingTokens,
        uint256[] memory _targetWeights,
        address _fulfillmentRole
    ) Ownable(msg.sender) {
        if (_quoteToken == address(0)) revert InvalidAddress();
        if (_fulfillmentRole == address(0)) revert InvalidAddress();
        if (_underlyingTokens.length == 0) revert EmptyBasket();
        if (_underlyingTokens.length != _targetWeights.length) revert InvalidWeights();

        // Validate weights sum to 10000 (100%)
        uint256 totalWeight;
        for (uint256 i = 0; i < _targetWeights.length; i++) {
            totalWeight += _targetWeights[i];
            if (_underlyingTokens[i] == address(0)) revert InvalidAddress();
            targetWeights[_underlyingTokens[i]] = _targetWeights[i];
        }
        if (totalWeight != 10000) revert InvalidWeights();

        quoteToken = IERC20(_quoteToken);
        underlyingTokens = _underlyingTokens;
        fulfillmentRole = _fulfillmentRole;

        // Deploy sector token with this vault as owner
        sectorToken = new SectorToken(_sectorName, _sectorSymbol, address(this));

        emit BasketUpdated(_underlyingTokens, _targetWeights);
        emit FulfillmentRoleUpdated(address(0), _fulfillmentRole);
    }

    /**
     * @notice Deposit quote tokens and request fulfillment
     * @param quoteAmount Amount of quote tokens to deposit
     * @return depositId ID of the pending deposit
     */
    function deposit(uint256 quoteAmount) external nonReentrant returns (uint256 depositId) {
        if (quoteAmount == 0) revert InvalidAmount();

        // Transfer quote tokens from user
        quoteToken.safeTransferFrom(msg.sender, address(this), quoteAmount);

        // Create pending deposit
        depositId = nextDepositId++;
        pendingDeposits[depositId] =
            PendingDeposit({user: msg.sender, quoteAmount: quoteAmount, fulfilled: false, timestamp: block.timestamp});

        emit DepositRequested(msg.sender, depositId, quoteAmount, block.timestamp);
    }

    /**
     * @notice Fulfill a pending deposit by providing underlying tokens
     * @dev Only callable by fulfillment role
     * @param depositId ID of the deposit to fulfill
     * @param underlyingAmounts Array of underlying token amounts (must match underlyingTokens order)
     */
    function fulfillDeposit(uint256 depositId, uint256[] calldata underlyingAmounts) external nonReentrant {
        if (msg.sender != fulfillmentRole) revert UnauthorizedFulfillment();

        PendingDeposit storage pendingDeposit = pendingDeposits[depositId];
        if (pendingDeposit.user == address(0)) revert DepositNotFound();
        if (pendingDeposit.fulfilled) revert DepositAlreadyFulfilled();
        if (underlyingAmounts.length != underlyingTokens.length) revert InvalidAmount();

        // Mark as fulfilled
        pendingDeposit.fulfilled = true;

        // Transfer underlying tokens from fulfiller to vault
        for (uint256 i = 0; i < underlyingTokens.length; i++) {
            if (underlyingAmounts[i] > 0) {
                IERC20(underlyingTokens[i]).safeTransferFrom(msg.sender, address(this), underlyingAmounts[i]);
            }
        }

        // Calculate shares to mint
        // For simplicity in alpha: use quote amount as share amount (1:1 for first deposit)
        // In production, calculate based on total value
        uint256 sharesToMint = calculateShares(pendingDeposit.quoteAmount);

        // Mint sector tokens to user
        sectorToken.mint(pendingDeposit.user, sharesToMint);

        emit DepositFulfilled(pendingDeposit.user, depositId, sharesToMint, block.timestamp);
    }

    /**
     * @notice Cancel a pending deposit and return quote tokens
     * @param depositId ID of the deposit to cancel
     */
    function cancelDeposit(uint256 depositId) external nonReentrant {
        PendingDeposit storage pendingDeposit = pendingDeposits[depositId];
        if (pendingDeposit.user == address(0)) revert DepositNotFound();
        if (pendingDeposit.fulfilled) revert DepositAlreadyFulfilled();
        if (pendingDeposit.user != msg.sender && msg.sender != owner()) {
            revert UnauthorizedFulfillment();
        }

        uint256 quoteAmount = pendingDeposit.quoteAmount;
        address user = pendingDeposit.user;

        // Mark as fulfilled to prevent re-entrancy
        pendingDeposit.fulfilled = true;

        // Return quote tokens to user
        quoteToken.safeTransfer(user, quoteAmount);

        emit DepositCancelled(user, depositId, quoteAmount);
    }

    /**
     * @notice Withdraw by burning sector tokens and receiving underlying tokens
     * @param sharesAmount Amount of sector tokens to burn
     */
    function withdraw(uint256 sharesAmount) external nonReentrant {
        if (sharesAmount == 0) revert InvalidAmount();
        if (sectorToken.balanceOf(msg.sender) < sharesAmount) revert InsufficientShares();

        // Calculate proportional share of underlying tokens
        uint256 totalShares = sectorToken.totalSupply();
        address[] memory tokens = new address[](underlyingTokens.length);
        uint256[] memory amounts = new uint256[](underlyingTokens.length);

        for (uint256 i = 0; i < underlyingTokens.length; i++) {
            tokens[i] = underlyingTokens[i];
            uint256 vaultBalance = IERC20(underlyingTokens[i]).balanceOf(address(this));
            amounts[i] = (vaultBalance * sharesAmount) / totalShares;

            if (amounts[i] > 0) {
                IERC20(underlyingTokens[i]).safeTransfer(msg.sender, amounts[i]);
            }
        }

        // Burn sector tokens
        sectorToken.burn(msg.sender, sharesAmount);

        emit Withdrawal(msg.sender, sharesAmount, tokens, amounts);
    }

    /**
     * @notice Calculate shares to mint for a given quote amount
     * @dev Simplified for alpha: 1:1 ratio if vault is empty, otherwise proportional to total value
     * @param quoteAmount Amount of quote tokens deposited
     * @return shares Amount of shares to mint
     */
    function calculateShares(uint256 quoteAmount) public view returns (uint256 shares) {
        uint256 totalShares = sectorToken.totalSupply();

        // First deposit: 1:1 ratio
        if (totalShares == 0) {
            return quoteAmount;
        }

        // Subsequent deposits: maintain proportional share
        // In alpha, we use simple 1:1 ratio
        // In production, this would use oracle prices to calculate total vault value
        return quoteAmount;
    }

    /**
     * @notice Update the fulfillment role
     * @param newRole Address of the new fulfillment role
     */
    function setFulfillmentRole(address newRole) external onlyOwner {
        if (newRole == address(0)) revert InvalidAddress();
        address oldRole = fulfillmentRole;
        fulfillmentRole = newRole;
        emit FulfillmentRoleUpdated(oldRole, newRole);
    }

    /**
     * @notice Update the basket composition
     * @param _underlyingTokens New array of underlying tokens
     * @param _targetWeights New array of target weights
     */
    function updateBasket(address[] calldata _underlyingTokens, uint256[] calldata _targetWeights) external onlyOwner {
        if (_underlyingTokens.length == 0) revert EmptyBasket();
        if (_underlyingTokens.length != _targetWeights.length) revert InvalidWeights();

        uint256 totalWeight;
        for (uint256 i = 0; i < _targetWeights.length; i++) {
            totalWeight += _targetWeights[i];
            if (_underlyingTokens[i] == address(0)) revert InvalidAddress();
        }
        if (totalWeight != 10000) revert InvalidWeights();

        // Clear old weights
        for (uint256 i = 0; i < underlyingTokens.length; i++) {
            delete targetWeights[underlyingTokens[i]];
        }

        // Set new basket
        underlyingTokens = _underlyingTokens;
        for (uint256 i = 0; i < _underlyingTokens.length; i++) {
            targetWeights[_underlyingTokens[i]] = _targetWeights[i];
        }

        emit BasketUpdated(_underlyingTokens, _targetWeights);
    }

    /**
     * @notice Get all underlying tokens
     * @return Array of underlying token addresses
     */
    function getUnderlyingTokens() external view returns (address[] memory) {
        return underlyingTokens;
    }

    /**
     * @notice Get vault balances for all underlying tokens
     * @return tokens Array of token addresses
     * @return balances Array of token balances
     */
    function getVaultBalances() external view returns (address[] memory tokens, uint256[] memory balances) {
        tokens = underlyingTokens;
        balances = new uint256[](underlyingTokens.length);

        for (uint256 i = 0; i < underlyingTokens.length; i++) {
            balances[i] = IERC20(underlyingTokens[i]).balanceOf(address(this));
        }
    }
}
