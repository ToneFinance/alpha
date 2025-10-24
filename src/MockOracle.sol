// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/**
 * @title MockOracle
 * @notice Simple mock oracle for testing that returns fixed prices
 * @dev In production, this would be replaced with Chainlink, Pyth, or another oracle solution
 */
contract MockOracle is IPriceOracle {
    /// @notice Decimals for price precision (matches USDC - 6 decimals)
    uint8 public constant DECIMALS = 6;

    /// @notice Mapping of token address to price in USDC (with 6 decimals)
    mapping(address => uint256) public prices;

    /// @notice Mapping of token address to its decimals
    mapping(address => uint8) public tokenDecimals;

    /// @notice Owner who can set prices
    address public owner;

    event PriceUpdated(address indexed token, uint256 price);
    event TokenDecimalsUpdated(address indexed token, uint8 decimals);

    error Unauthorized();
    error InvalidPrice();
    error InvalidDecimals();

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    function _checkOwner() internal view {
        if (msg.sender != owner) revert Unauthorized();
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Set price for a token
     * @param token Address of the token
     * @param price Price in USDC (with 6 decimals, e.g., 1000000 = $1.00)
     */
    function setPrice(address token, uint256 price) external onlyOwner {
        if (price == 0) revert InvalidPrice();
        prices[token] = price;
        emit PriceUpdated(token, price);
    }

    /**
     * @notice Batch set prices for multiple tokens
     * @param tokens Array of token addresses
     * @param _prices Array of prices (with 6 decimals)
     */
    function setPrices(address[] calldata tokens, uint256[] calldata _prices) external onlyOwner {
        require(tokens.length == _prices.length, "Length mismatch");
        for (uint256 i = 0; i < tokens.length; i++) {
            if (_prices[i] == 0) revert InvalidPrice();
            prices[tokens[i]] = _prices[i];
            emit PriceUpdated(tokens[i], _prices[i]);
        }
    }

    /**
     * @notice Set decimals for a token
     * @param token Address of the token
     * @param tokenDec Number of decimals for the token
     */
    function setTokenDecimals(address token, uint8 tokenDec) external onlyOwner {
        if (tokenDec == 0) revert InvalidDecimals();
        tokenDecimals[token] = tokenDec;
        emit TokenDecimalsUpdated(token, tokenDec);
    }

    /**
     * @notice Batch set decimals for multiple tokens
     * @param tokens Array of token addresses
     * @param tokenDecs Array of decimal values
     */
    function setTokenDecimalsBatch(address[] calldata tokens, uint8[] calldata tokenDecs) external onlyOwner {
        require(tokens.length == tokenDecs.length, "Length mismatch");
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokenDecs[i] == 0) revert InvalidDecimals();
            tokenDecimals[tokens[i]] = tokenDecs[i];
            emit TokenDecimalsUpdated(tokens[i], tokenDecs[i]);
        }
    }

    /**
     * @notice Get price for a token
     * @param token Address of the token
     * @return price Price in USDC (with 6 decimals)
     */
    function getPrice(address token) external view override returns (uint256) {
        uint256 price = prices[token];
        if (price == 0) revert InvalidPrice();
        return price;
    }

    /**
     * @notice Get value of a token amount in USDC
     * @param token Address of the token
     * @param amount Amount of tokens (in token's native decimals)
     * @return value Value in USDC (with 6 decimals)
     */
    function getValue(address token, uint256 amount) external view override returns (uint256) {
        uint256 price = prices[token];
        if (price == 0) revert InvalidPrice();

        uint8 tokenDec = tokenDecimals[token];
        if (tokenDec == 0) revert InvalidDecimals();

        // Proper calculation accounting for token decimals:
        // (amount * price) / 10^tokenDec
        // amount is in token decimals, price is in 6 decimals (USDC)
        // Result has 6 decimals (USDC decimals)
        return (amount * price) / (10 ** tokenDec);
    }

    /**
     * @notice Get the number of decimals for prices
     * @return Number of decimals (6 for USDC)
     */
    function decimals() external pure override returns (uint8) {
        return DECIMALS;
    }
}
