// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SectorVault} from "../src/SectorVault.sol";
import {SectorToken} from "../src/SectorToken.sol";
import {MockOracle} from "../src/MockOracle.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Mock ERC20 token for testing
contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/**
 * @title SectorVaultWithdrawalTest
 * @notice Comprehensive test suite for USDC withdrawal mechanism
 * @dev Tests the two-step withdrawal flow: request -> fulfill
 */
contract SectorVaultWithdrawalTest is Test {
    SectorVault public vault;
    SectorToken public sectorToken;
    MockOracle public oracle;
    MockERC20 public usdc;
    MockERC20 public token1;
    MockERC20 public token2;
    MockERC20 public token3;

    address public owner;
    address public fulfiller;
    address public user1;
    address public user2;

    address[] public underlyingTokens;
    uint256[] public targetWeights;

    // Events to test
    event WithdrawalRequested(
        address indexed user, uint256 indexed withdrawalId, uint256 sharesAmount, uint256 timestamp
    );
    event WithdrawalFulfilled(address indexed user, uint256 indexed withdrawalId, uint256 usdcAmount, uint256 timestamp);
    event WithdrawalCancelled(address indexed user, uint256 indexed withdrawalId, uint256 sharesAmount);

    function setUp() public {
        owner = address(this);
        fulfiller = makeAddr("fulfiller");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");

        // Deploy mock tokens
        usdc = new MockERC20("USD Coin", "USDC");
        token1 = new MockERC20("Token 1", "TK1");
        token2 = new MockERC20("Token 2", "TK2");
        token3 = new MockERC20("Token 3", "TK3");

        // Set up basket: 40% TK1, 30% TK2, 30% TK3
        underlyingTokens.push(address(token1));
        underlyingTokens.push(address(token2));
        underlyingTokens.push(address(token3));
        targetWeights.push(4000); // 40%
        targetWeights.push(3000); // 30%
        targetWeights.push(3000); // 30%

        // Deploy oracle and set prices to $1.00 (1000000 with 6 decimals)
        oracle = new MockOracle();
        oracle.setPrice(address(token1), 1_000_000);
        oracle.setPrice(address(token2), 1_000_000);
        oracle.setPrice(address(token3), 1_000_000);

        // Set token decimals (all test tokens have 18 decimals)
        oracle.setTokenDecimals(address(token1), 18);
        oracle.setTokenDecimals(address(token2), 18);
        oracle.setTokenDecimals(address(token3), 18);

        // Deploy vault
        vault = new SectorVault(
            address(usdc), "DeFi Sector Token", "DEFI", underlyingTokens, targetWeights, fulfiller, address(oracle)
        );

        sectorToken = vault.SECTOR_TOKEN();

        // Distribute tokens
        require(usdc.transfer(user1, 10_000 * 10 ** 18), "USDC transfer to user1 failed");
        require(usdc.transfer(user2, 10_000 * 10 ** 18), "USDC transfer to user2 failed");
        require(usdc.transfer(fulfiller, 50_000 * 10 ** 18), "USDC transfer to fulfiller failed");
        require(token1.transfer(fulfiller, 100_000 * 10 ** 18), "Token1 transfer failed");
        require(token2.transfer(fulfiller, 100_000 * 10 ** 18), "Token2 transfer failed");
        require(token3.transfer(fulfiller, 100_000 * 10 ** 18), "Token3 transfer failed");
    }

    /// @notice Helper to create a fully deposited position for testing withdrawals
    function _setupUserPosition(address user, uint256 depositAmount) internal returns (uint256 sharesAmount) {
        // User deposits
        vm.startPrank(user);
        usdc.approve(address(vault), depositAmount);
        uint256 depositId = vault.deposit(depositAmount);
        vm.stopPrank();

        // Fulfill deposit
        uint256[] memory underlyingAmounts = new uint256[](3);
        underlyingAmounts[0] = (depositAmount * 4000) / 10000; // 40%
        underlyingAmounts[1] = (depositAmount * 3000) / 10000; // 30%
        underlyingAmounts[2] = (depositAmount * 3000) / 10000; // 30%

        vm.startPrank(fulfiller);
        token1.approve(address(vault), underlyingAmounts[0]);
        token2.approve(address(vault), underlyingAmounts[1]);
        token3.approve(address(vault), underlyingAmounts[2]);
        vault.fulfillDeposit(depositId, underlyingAmounts);
        vm.stopPrank();

        return sectorToken.balanceOf(user);
    }

    // ============================================
    // Test: requestWithdrawal - Success Cases
    // ============================================

    function test_requestWithdrawal_Success() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        uint256 withdrawAmount = shares / 2; // Withdraw 50%

        vm.startPrank(user1);

        // Expect event emission
        vm.expectEmit(true, true, false, true);
        emit WithdrawalRequested(user1, 0, withdrawAmount, block.timestamp);

        uint256 withdrawalId = vault.requestWithdrawal(withdrawAmount);
        vm.stopPrank();

        // Assertions
        assertEq(withdrawalId, 0, "First withdrawal ID should be 0");
        assertEq(vault.nextWithdrawalId(), 1, "nextWithdrawalId should increment");

        // Check pending withdrawal state
        (address user, uint256 sharesAmount, bool fulfilled, uint256 timestamp) = vault.pendingWithdrawals(withdrawalId);
        assertEq(user, user1, "User should match");
        assertEq(sharesAmount, withdrawAmount, "Shares amount should match");
        assertFalse(fulfilled, "Should not be fulfilled yet");
        assertGt(timestamp, 0, "Timestamp should be set");

        // Check sector tokens stay with user (not transferred)
        assertEq(sectorToken.balanceOf(user1), shares, "User shares should stay the same");
        assertEq(sectorToken.balanceOf(address(vault)), 0, "Vault should not hold shares");
    }

    function test_requestWithdrawal_MultipleSequential() public {
        uint256 depositAmount = 3000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        vm.startPrank(user1);
        uint256 withdrawal1 = vault.requestWithdrawal(shares / 3);
        uint256 withdrawal2 = vault.requestWithdrawal(shares / 3);
        vm.stopPrank();

        assertEq(withdrawal1, 0, "First ID should be 0");
        assertEq(withdrawal2, 1, "Second ID should be 1");
        assertEq(vault.nextWithdrawalId(), 2, "Next ID should be 2");

        // User should still have all shares (not transferred yet)
        assertEq(sectorToken.balanceOf(user1), shares, "User should still have all shares");
        assertEq(sectorToken.balanceOf(address(vault)), 0, "Vault should not hold shares");
    }

    function test_requestWithdrawal_FullBalance() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(shares);

        assertEq(sectorToken.balanceOf(user1), shares, "User should still have all shares");
        assertEq(sectorToken.balanceOf(address(vault)), 0, "Vault should not hold shares");
    }

    // ============================================
    // Test: requestWithdrawal - Failure Cases
    // ============================================

    function test_requestWithdrawal_RevertInsufficientShares() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        vm.startPrank(user1);
        vm.expectRevert(SectorVault.InsufficientShares.selector);
        vault.requestWithdrawal(shares + 1); // Try to withdraw more than owned
        vm.stopPrank();
    }

    function test_requestWithdrawal_RevertZeroAmount() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        _setupUserPosition(user1, depositAmount);

        vm.startPrank(user1);
        vm.expectRevert(SectorVault.InvalidAmount.selector);
        vault.requestWithdrawal(0);
        vm.stopPrank();
    }

    function test_requestWithdrawal_RevertNoShares() public {
        // User2 has no shares
        vm.startPrank(user2);
        vm.expectRevert(SectorVault.InsufficientShares.selector);
        vault.requestWithdrawal(100 * 10 ** 18);
        vm.stopPrank();
    }

    // ============================================
    // Test: calculateWithdrawalValue
    // ============================================

    function test_calculateWithdrawalValue_HalfPosition() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        // NAV should be $1000 (1,000,000,000 with 6 decimals)
        uint256 totalValue = vault.getTotalValue();
        assertEq(totalValue, 1_000_000_000, "NAV should be $1000");

        // Withdraw 50% should give $500 (in USDC decimals = 18)
        uint256 expectedValue = vault.calculateWithdrawalValue(shares / 2);
        assertEq(expectedValue, 500 * 10 ** 18, "50% withdrawal should be $500");
    }

    function test_calculateWithdrawalValue_FullPosition() public {
        uint256 depositAmount = 2000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        uint256 expectedValue = vault.calculateWithdrawalValue(shares);
        assertEq(expectedValue, 2000 * 10 ** 18, "Full withdrawal should equal NAV");
    }

    function test_calculateWithdrawalValue_WithChangingPrices() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        // Initially at $1/token, NAV = $1000
        uint256 valueBefore = vault.calculateWithdrawalValue(shares);
        assertEq(valueBefore, 1000 * 10 ** 18, "Initial value should be $1000");

        // Double prices -> NAV doubles
        oracle.setPrice(address(token1), 2_000_000);
        oracle.setPrice(address(token2), 2_000_000);
        oracle.setPrice(address(token3), 2_000_000);

        uint256 valueAfter = vault.calculateWithdrawalValue(shares);
        assertEq(valueAfter, 2000 * 10 ** 18, "Value should double to $2000");
        assertEq(valueAfter, valueBefore * 2, "Value should be exactly 2x");
    }

    function test_calculateWithdrawalValue_MultipleUsers() public {
        // User1 deposits 1000
        uint256 shares1 = _setupUserPosition(user1, 1000 * 10 ** 18);

        // User2 deposits 2000
        uint256 shares2 = _setupUserPosition(user2, 2000 * 10 ** 18);

        // Total NAV = $3000
        assertEq(vault.getTotalValue(), 3_000_000_000, "Total NAV should be $3000");

        // User1 owns 1/3, should get $1000 (in USDC decimals = 18)
        uint256 value1 = vault.calculateWithdrawalValue(shares1);
        assertEq(value1, 1000 * 10 ** 18, "User1 value should be $1000");

        // User2 owns 2/3, should get $2000 (in USDC decimals = 18)
        uint256 value2 = vault.calculateWithdrawalValue(shares2);
        assertEq(value2, 2000 * 10 ** 18, "User2 value should be $2000");
    }

    // ============================================
    // Test: fulfillWithdrawal - Success Cases
    // ============================================

    function test_fulfillWithdrawal_Success() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        // Request withdrawal
        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(shares);

        // Calculate expected USDC (in USDC decimals = 18)
        uint256 expectedUSDC = vault.calculateWithdrawalValue(shares);
        assertEq(expectedUSDC, 1000 * 10 ** 18, "Expected USDC should be $1000");

        // Get vault balances before
        (address[] memory tokens, uint256[] memory balancesBefore) = vault.getVaultBalances();
        uint256 user1USDCBefore = usdc.balanceOf(user1);
        uint256 totalSupplyBefore = sectorToken.totalSupply();

        // Fulfiller fulfills
        vm.startPrank(fulfiller);
        usdc.approve(address(vault), expectedUSDC);

        // Expect event
        vm.expectEmit(true, true, false, true);
        emit WithdrawalFulfilled(user1, withdrawalId, expectedUSDC, block.timestamp);

        vault.fulfillWithdrawal(withdrawalId, balancesBefore);
        vm.stopPrank();

        // Assertions
        // 1. User received USDC
        uint256 user1USDCAfter = usdc.balanceOf(user1);
        assertEq(user1USDCAfter - user1USDCBefore, expectedUSDC, "User should receive USDC");

        // 2. Shares were burned
        assertEq(sectorToken.totalSupply(), totalSupplyBefore - shares, "Shares should be burned");

        // 3. Vault no longer holds shares
        assertEq(sectorToken.balanceOf(address(vault)), 0, "Vault should not hold shares");

        // 4. Fulfiller received underlying tokens (net zero since they provided them during deposit)
        assertEq(token1.balanceOf(fulfiller), 100_000 * 10 ** 18, "Fulfiller back to original token1");
        assertEq(token2.balanceOf(fulfiller), 100_000 * 10 ** 18, "Fulfiller back to original token2");
        assertEq(token3.balanceOf(fulfiller), 100_000 * 10 ** 18, "Fulfiller back to original token3");

        // 5. Vault balances are zero
        (, uint256[] memory balancesAfter) = vault.getVaultBalances();
        assertEq(balancesAfter[0], 0, "Vault token1 should be 0");
        assertEq(balancesAfter[1], 0, "Vault token2 should be 0");
        assertEq(balancesAfter[2], 0, "Vault token3 should be 0");

        // 6. Pending withdrawal deleted
        (address user,,,) = vault.pendingWithdrawals(withdrawalId);
        assertEq(user, address(0), "Withdrawal should be deleted");
    }

    function test_fulfillWithdrawal_PartialPosition() public {
        uint256 depositAmount = 2000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        // Withdraw 50%
        uint256 withdrawAmount = shares / 2;

        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(withdrawAmount);

        // Expected USDC = $1000 (50% of $2000) (in USDC decimals = 18)
        uint256 expectedUSDC = vault.calculateWithdrawalValue(withdrawAmount);
        assertEq(expectedUSDC, 1000 * 10 ** 18, "Expected $1000");

        // Get proportional token amounts
        (, uint256[] memory vaultBalances) = vault.getVaultBalances();
        uint256[] memory underlyingAmounts = new uint256[](3);
        uint256 totalShares = sectorToken.totalSupply();
        for (uint256 i = 0; i < 3; i++) {
            underlyingAmounts[i] = (vaultBalances[i] * withdrawAmount) / totalShares;
        }

        // Fulfill
        vm.startPrank(fulfiller);
        usdc.approve(address(vault), expectedUSDC);
        vault.fulfillWithdrawal(withdrawalId, underlyingAmounts);
        vm.stopPrank();

        // User should still have 50% shares
        assertEq(sectorToken.balanceOf(user1), shares / 2, "User should have 50% shares left");

        // Vault should have ~50% tokens left
        (, uint256[] memory balancesAfter) = vault.getVaultBalances();
        assertApproxEqAbs(balancesAfter[0], vaultBalances[0] / 2, 1, "~50% token1 left");
        assertApproxEqAbs(balancesAfter[1], vaultBalances[1] / 2, 1, "~50% token2 left");
        assertApproxEqAbs(balancesAfter[2], vaultBalances[2] / 2, 1, "~50% token3 left");
    }

    function test_fulfillWithdrawal_WithChangedPrices() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        // Double token prices
        oracle.setPrice(address(token1), 2_000_000);
        oracle.setPrice(address(token2), 2_000_000);
        oracle.setPrice(address(token3), 2_000_000);

        // Request withdrawal
        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(shares);

        // Expected USDC should be $2000 (doubled NAV) (in USDC decimals = 18)
        uint256 expectedUSDC = vault.calculateWithdrawalValue(shares);
        assertEq(expectedUSDC, 2000 * 10 ** 18, "Expected $2000 due to price increase");

        // Fulfill
        (, uint256[] memory underlyingAmounts) = vault.getVaultBalances();

        vm.startPrank(fulfiller);
        usdc.approve(address(vault), expectedUSDC);
        vault.fulfillWithdrawal(withdrawalId, underlyingAmounts);
        vm.stopPrank();

        // User should receive $2000
        assertGt(usdc.balanceOf(user1), depositAmount, "User should profit from price increase");
        assertEq(usdc.balanceOf(user1), 10_000 * 10 ** 18 - depositAmount + expectedUSDC, "Exact USDC calculation");
    }

    // ============================================
    // Test: fulfillWithdrawal - Failure Cases
    // ============================================

    function test_fulfillWithdrawal_RevertUnauthorized() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(shares);

        (, uint256[] memory underlyingAmounts) = vault.getVaultBalances();

        // User2 tries to fulfill (not authorized)
        vm.startPrank(user2);
        vm.expectRevert(SectorVault.UnauthorizedFulfillment.selector);
        vault.fulfillWithdrawal(withdrawalId, underlyingAmounts);
        vm.stopPrank();
    }

    function test_fulfillWithdrawal_RevertWithdrawalNotFound() public {
        uint256[] memory amounts = new uint256[](3);

        vm.startPrank(fulfiller);
        vm.expectRevert(SectorVault.WithdrawalNotFound.selector);
        vault.fulfillWithdrawal(999, amounts); // Non-existent ID
        vm.stopPrank();
    }

    function test_fulfillWithdrawal_RevertAlreadyFulfilled() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(shares);

        (, uint256[] memory underlyingAmounts) = vault.getVaultBalances();
        uint256 expectedUSDC = vault.calculateWithdrawalValue(shares);

        // Fulfill once
        vm.startPrank(fulfiller);
        usdc.approve(address(vault), expectedUSDC);
        vault.fulfillWithdrawal(withdrawalId, underlyingAmounts);

        // Try to fulfill again
        vm.expectRevert(SectorVault.WithdrawalNotFound.selector); // Deleted after fulfillment
        vault.fulfillWithdrawal(withdrawalId, underlyingAmounts);
        vm.stopPrank();
    }

    function test_fulfillWithdrawal_RevertUSDCValueMismatch() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(shares);

        // Fulfiller provides wrong underlying amounts (only 50% of what's needed)
        (, uint256[] memory correctAmounts) = vault.getVaultBalances();
        uint256[] memory wrongAmounts = new uint256[](3);
        wrongAmounts[0] = correctAmounts[0] / 2; // Only 50% of token1
        wrongAmounts[1] = correctAmounts[1] / 2; // Only 50% of token2
        wrongAmounts[2] = correctAmounts[2] / 2; // Only 50% of token3

        uint256 expectedUSDC = vault.calculateWithdrawalValue(shares);

        vm.startPrank(fulfiller);
        usdc.approve(address(vault), expectedUSDC);
        vm.expectRevert(SectorVault.FulfillmentUSDCMismatch.selector);
        vault.fulfillWithdrawal(withdrawalId, wrongAmounts); // Wrong underlying amounts
        vm.stopPrank();
    }

    function test_fulfillWithdrawal_RevertInvalidArrayLength() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(shares);

        // Wrong array length
        uint256[] memory wrongAmounts = new uint256[](2); // Should be 3

        vm.startPrank(fulfiller);
        vm.expectRevert(SectorVault.InvalidAmount.selector);
        vault.fulfillWithdrawal(withdrawalId, wrongAmounts);
        vm.stopPrank();
    }

    // ============================================
    // Test: cancelWithdrawal
    // ============================================

    function test_cancelWithdrawal_ByUser() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(shares);

        // Shares still with user before cancel (never transferred)
        assertEq(sectorToken.balanceOf(user1), shares, "User should still have shares");

        // Expect event
        vm.expectEmit(true, true, false, true);
        emit WithdrawalCancelled(user1, withdrawalId, shares);

        // Cancel
        vm.prank(user1);
        vault.cancelWithdrawal(withdrawalId);

        // Shares still with user after cancel (nothing changed)
        assertEq(sectorToken.balanceOf(user1), shares, "Shares should still be with user");
        assertEq(sectorToken.balanceOf(address(vault)), 0, "Vault should not hold shares");

        // Withdrawal deleted
        (address user,,,) = vault.pendingWithdrawals(withdrawalId);
        assertEq(user, address(0), "Withdrawal should be deleted");
    }

    function test_cancelWithdrawal_ByOwner() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(shares);

        // Owner cancels
        vault.cancelWithdrawal(withdrawalId);

        // Shares still with user1 (were never transferred)
        assertEq(sectorToken.balanceOf(user1), shares, "Shares should still be with user");
    }

    function test_cancelWithdrawal_RevertUnauthorized() public {
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(shares);

        // User2 tries to cancel user1's withdrawal
        vm.startPrank(user2);
        vm.expectRevert(SectorVault.UnauthorizedFulfillment.selector);
        vault.cancelWithdrawal(withdrawalId);
        vm.stopPrank();
    }

    function test_cancelWithdrawal_RevertNotFound() public {
        vm.startPrank(user1);
        vm.expectRevert(SectorVault.WithdrawalNotFound.selector);
        vault.cancelWithdrawal(999); // Non-existent
        vm.stopPrank();
    }

    // ============================================
    // Test: Integration & Edge Cases
    // ============================================

    function test_fullWithdrawalFlow_Integration() public {
        // Complete flow: deposit -> request withdrawal -> fulfill -> verify

        uint256 depositAmount = 5000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        uint256 initialUSDC = usdc.balanceOf(user1);

        // Request withdrawal
        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(shares);

        // Calculate expected
        uint256 expectedUSDC = vault.calculateWithdrawalValue(shares);
        (, uint256[] memory underlyingAmounts) = vault.getVaultBalances();

        // Fulfill
        vm.startPrank(fulfiller);
        usdc.approve(address(vault), expectedUSDC);
        vault.fulfillWithdrawal(withdrawalId, underlyingAmounts);
        vm.stopPrank();

        // Final state
        assertEq(sectorToken.balanceOf(user1), 0, "User should have 0 shares");
        assertEq(sectorToken.totalSupply(), 0, "Total supply should be 0");
        assertEq(usdc.balanceOf(user1), initialUSDC + expectedUSDC, "User got USDC back");
        assertEq(vault.getTotalValue(), 0, "Vault NAV should be 0");
    }

    function test_multipleUsersWithdrawing() public {
        // Setup two users with different positions
        uint256 shares1 = _setupUserPosition(user1, 1000 * 10 ** 18);
        uint256 shares2 = _setupUserPosition(user2, 2000 * 10 ** 18);

        // Both request withdrawals
        vm.prank(user1);
        uint256 withdrawal1 = vault.requestWithdrawal(shares1);

        vm.prank(user2);
        uint256 withdrawal2 = vault.requestWithdrawal(shares2);

        // Fulfill user1 first
        uint256 totalShares = sectorToken.totalSupply();
        (, uint256[] memory vaultBalances) = vault.getVaultBalances();

        uint256[] memory amounts1 = new uint256[](3);
        for (uint256 i = 0; i < 3; i++) {
            amounts1[i] = (vaultBalances[i] * shares1) / totalShares;
        }

        uint256 expectedUSDC1 = vault.calculateWithdrawalValue(shares1);

        vm.startPrank(fulfiller);
        usdc.approve(address(vault), expectedUSDC1);
        vault.fulfillWithdrawal(withdrawal1, amounts1);
        vm.stopPrank();

        // Fulfill user2
        (, vaultBalances) = vault.getVaultBalances();
        uint256 expectedUSDC2 = vault.calculateWithdrawalValue(shares2);

        vm.startPrank(fulfiller);
        usdc.approve(address(vault), expectedUSDC2);
        vault.fulfillWithdrawal(withdrawal2, vaultBalances);
        vm.stopPrank();

        // Both users got their USDC
        assertGt(usdc.balanceOf(user1), 0, "User1 received USDC");
        assertGt(usdc.balanceOf(user2), 0, "User2 received USDC");
        assertEq(sectorToken.totalSupply(), 0, "All shares burned");
    }

    function test_withdrawalWithComplexPrices() public {
        // Setup position with uniform prices first
        uint256 depositAmount = 1000 * 10 ** 18;
        uint256 shares = _setupUserPosition(user1, depositAmount);

        // THEN change prices to test withdrawal value calculation with complex prices
        oracle.setPrice(address(token1), 250_000); // $0.25 (was $1.00)
        oracle.setPrice(address(token2), 468_400); // $0.4684 (was $1.00)
        oracle.setPrice(address(token3), 2_220_000); // $2.22 (was $1.00)

        // NAV should change based on new prices
        uint256 nav = vault.getTotalValue();
        // 400 tokens @ $0.25 = $100
        // 300 tokens @ $0.4684 = $140.52
        // 300 tokens @ $2.22 = $666
        // Total ≈ $906.52
        assertApproxEqAbs(nav, 906_520_000, 10_000_000, "NAV should be ~$906.52");

        // Request withdrawal
        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(shares);

        // Calculate expected USDC (should be ~906.52)
        uint256 expectedUSDC = vault.calculateWithdrawalValue(shares);
        (, uint256[] memory underlyingAmounts) = vault.getVaultBalances();

        // Fulfill
        vm.startPrank(fulfiller);
        usdc.approve(address(vault), expectedUSDC);
        vault.fulfillWithdrawal(withdrawalId, underlyingAmounts);
        vm.stopPrank();

        // User should receive the changed NAV value
        uint256 userUSDC = usdc.balanceOf(user1);
        // Started with 10k, deposited 1k, so had 9k left
        // Now receives ~906.52, so should have ~9906.52
        assertApproxEqAbs(userUSDC, 9906_520_000_000_000_000_000, 100 * 10 ** 18, "User should get changed value");
    }

    function test_withdrawalCleanup() public {
        uint256 shares = _setupUserPosition(user1, 1000 * 10 ** 18);

        vm.prank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(shares);

        // Verify exists
        (address user,,,) = vault.pendingWithdrawals(withdrawalId);
        assertEq(user, user1, "Withdrawal should exist");

        // Fulfill
        uint256 expectedUSDC = vault.calculateWithdrawalValue(shares);
        (, uint256[] memory amounts) = vault.getVaultBalances();

        vm.startPrank(fulfiller);
        usdc.approve(address(vault), expectedUSDC);
        vault.fulfillWithdrawal(withdrawalId, amounts);
        vm.stopPrank();

        // Verify deleted
        (user,,,) = vault.pendingWithdrawals(withdrawalId);
        assertEq(user, address(0), "Withdrawal should be deleted");

        // Verify nextWithdrawalId still increments
        shares = _setupUserPosition(user1, 500 * 10 ** 18);
        vm.prank(user1);
        uint256 newWithdrawalId = vault.requestWithdrawal(shares);
        assertEq(newWithdrawalId, withdrawalId + 1, "IDs should increment monotonically");
    }
}
