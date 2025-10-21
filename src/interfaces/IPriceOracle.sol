// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IPriceOracle
 * @notice Interface for price oracles
 * @dev This interface can be implemented by mock oracles, Chainlink, Pyth, or any other oracle solution
 */
interface IPriceOracle {
    /**
     * @notice Get price for a token in USDC
     * @param token Address of the token
     * @return price Price in USDC (with 6 decimals, e.g., 1000000 = $1.00)
     */
    function getPrice(address token) external view returns (uint256 price);

    /**
     * @notice Get value of a token amount in USDC
     * @param token Address of the token
     * @param amount Amount of tokens (in token's native decimals)
     * @return value Value in USDC (with 6 decimals)
     */
    function getValue(address token, uint256 amount) external view returns (uint256 value);

    /**
     * @notice Get the number of decimals for prices
     * @return Number of decimals (typically 6 for USDC, 8 for Chainlink)
     */
    function decimals() external view returns (uint8);
}
