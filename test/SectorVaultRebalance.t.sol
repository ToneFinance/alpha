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

contract SectorVaultRebalanceTest is Test {
    SectorVault public vault;
    SectorToken public sectorToken;
    MockOracle public oracle;
    MockERC20 public usdc;
    MockERC20 public token1;
    MockERC20 public token2;
    MockERC20 public token3;
    MockERC20 public token4; // New token for rebalance

    address public owner;
    address public fulfiller;
    address public user1;

    address[] public underlyingTokens;
    uint256[] public targetWeights;

    function setUp() public {
        owner = address(this);
        fulfiller = makeAddr("fulfiller");
        user1 = makeAddr("user1");

        // Deploy mock tokens
        usdc = new MockERC20("USD Coin", "USDC");
        token1 = new MockERC20("Token 1", "TK1");
        token2 = new MockERC20("Token 2", "TK2");
        token3 = new MockERC20("Token 3", "TK3");
        token4 = new MockERC20("Token 4", "TK4");

        // Set up initial basket: 40% TK1, 30% TK2, 30% TK3
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
        oracle.setPrice(address(token4), 1_000_000);

        // Set token decimals (all test tokens have 18 decimals)
        oracle.setTokenDecimals(address(token1), 18);
        oracle.setTokenDecimals(address(token2), 18);
        oracle.setTokenDecimals(address(token3), 18);
        oracle.setTokenDecimals(address(token4), 18);

        // Deploy vault
        vault = new SectorVault(
            address(usdc), "DeFi Sector Token", "DEFI", underlyingTokens, targetWeights, fulfiller, address(oracle)
        );

        sectorToken = vault.SECTOR_TOKEN();

        // Distribute tokens
        usdc.transfer(user1, 10_000 * 10 ** 18);
        token1.transfer(fulfiller, 100_000 * 10 ** 18);
        token2.transfer(fulfiller, 100_000 * 10 ** 18);
        token3.transfer(fulfiller, 100_000 * 10 ** 18);
        token4.transfer(fulfiller, 100_000 * 10 ** 18);
    }

    /**
     * @notice Test the full rebalance workflow
     * @dev This test illustrates the complete rebalance process:
     * 1. Initial vault state with deposits
     * 2. Owner creates a rebalance request with new tokens/weights
     * 3. New deposit/withdrawal requests are prevented during rebalance
     * 4. Existing pending requests must be fulfilled first
     * 5. Fulfillment engine executes the rebalance:
     *    - Vault transfers old tokens to fulfiller
     *    - Fulfiller transfers new tokens to vault
     * 6. Vault composition is updated
     * 7. Normal operations resume
     */
    function test_FullRebalanceWorkflow() public {
        // ========================================
        // STEP 1: Setup initial vault state
        // ========================================

        // User deposits 1000 USDC
        vm.startPrank(user1);
        usdc.approve(address(vault), 1000 * 10 ** 18);
        uint256 depositId = vault.deposit(1000 * 10 ** 18);
        vm.stopPrank();

        // Fulfiller fulfills deposit with underlying tokens
        vm.startPrank(fulfiller);
        token1.approve(address(vault), 400 * 10 ** 18); // 40% of 1000
        token2.approve(address(vault), 300 * 10 ** 18); // 30% of 1000
        token3.approve(address(vault), 300 * 10 ** 18); // 30% of 1000

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 400 * 10 ** 18;
        amounts[1] = 300 * 10 ** 18;
        amounts[2] = 300 * 10 ** 18;
        vault.fulfillDeposit(depositId, amounts);
        vm.stopPrank();

        // Verify vault has tokens
        assertEq(token1.balanceOf(address(vault)), 400 * 10 ** 18);
        assertEq(token2.balanceOf(address(vault)), 300 * 10 ** 18);
        assertEq(token3.balanceOf(address(vault)), 300 * 10 ** 18);
        assertGt(sectorToken.balanceOf(user1), 0);

        // ========================================
        // STEP 2: Create a pending deposit before rebalance
        // ========================================

        vm.startPrank(user1);
        usdc.approve(address(vault), 500 * 10 ** 18);
        uint256 pendingDepositId = vault.deposit(500 * 10 ** 18);
        vm.stopPrank();

        // ========================================
        // STEP 3: Owner creates rebalance request
        // ========================================
        // New composition: 50% TK2, 50% TK4 (removing TK1, TK3; keeping TK2; adding TK4)

        address[] memory newTokens = new address[](2);
        newTokens[0] = address(token2);
        newTokens[1] = address(token4);

        uint256[] memory newWeights = new uint256[](2);
        newWeights[0] = 5000; // 50%
        newWeights[1] = 5000; // 50%

        vault.requestRebalance(newTokens, newWeights);

        // ========================================
        // STEP 4: Verify new requests are blocked
        // ========================================

        // Attempt new deposit - should revert with RebalancePending
        vm.startPrank(user1);
        usdc.approve(address(vault), 100 * 10 ** 18);
        vm.expectRevert(SectorVault.RebalancePending.selector);
        vault.deposit(100 * 10 ** 18);
        vm.stopPrank();

        // ========================================
        // STEP 5: Fulfill pending deposits/withdrawals
        // ========================================

        // Fulfiller fulfills the pending deposit with OLD token composition
        vm.startPrank(fulfiller);
        token1.approve(address(vault), 200 * 10 ** 18);
        token2.approve(address(vault), 150 * 10 ** 18);
        token3.approve(address(vault), 150 * 10 ** 18);

        uint256[] memory pendingAmounts = new uint256[](3);
        pendingAmounts[0] = 200 * 10 ** 18;
        pendingAmounts[1] = 150 * 10 ** 18;
        pendingAmounts[2] = 150 * 10 ** 18;
        vault.fulfillDeposit(pendingDepositId, pendingAmounts);
        vm.stopPrank();

        // ========================================
        // STEP 6: Execute rebalance
        // ========================================

        // At this point, vault holds:
        // - 600 TK1 (400 + 200)
        // - 450 TK2 (300 + 150)
        // - 450 TK3 (300 + 150)
        // Total value: 1500 USDC

        // New composition should be:
        // - 0 TK1 (removed)
        // - 750 TK2 (50% of 1500)
        // - 0 TK3 (removed)
        // - 750 TK4 (50% of 1500, new)

        // Fulfiller needs to:
        // - Receive 600 TK1 from vault (excess)
        // - Receive 450 TK3 from vault (removed)
        // - Keep 300 TK2 from vault (reduced from 450 to 750)
        // - Actually: Receive (450 - 750) = -300 TK2? No, vault needs MORE TK2
        // Let me recalculate:
        // - Vault has 450 TK2, needs 750 TK2 -> fulfiller provides 300 TK2
        // - Vault has 0 TK4, needs 750 TK4 -> fulfiller provides 750 TK4
        // - Vault has 600 TK1, needs 0 TK1 -> vault sends 600 TK1 to fulfiller
        // - Vault has 450 TK3, needs 0 TK3 -> vault sends 450 TK3 to fulfiller

        vm.startPrank(fulfiller);

        // The fulfiller needs to provide ALL tokens for the new basket
        // because fulfillRebalance sends ALL old tokens to the fulfiller first
        // Approve tokens that fulfiller will provide
        token2.approve(address(vault), 750 * 10 ** 18); // All 750 TK2 needed
        token4.approve(address(vault), 750 * 10 ** 18); // All 750 TK4 needed

        // Call fulfillRebalance with final token amounts
        uint256[] memory rebalanceAmounts = new uint256[](2);
        rebalanceAmounts[0] = 750 * 10 ** 18; // 750 TK2
        rebalanceAmounts[1] = 750 * 10 ** 18; // 750 TK4
        vault.fulfillRebalance(rebalanceAmounts);

        vm.stopPrank();

        // ========================================
        // STEP 7: Verify final state
        // ========================================

        // Verify vault composition changed
        address[] memory finalTokens = vault.getUnderlyingTokens();
        assertEq(finalTokens.length, 2);
        assertEq(finalTokens[0], address(token2));
        assertEq(finalTokens[1], address(token4));

        // Verify vault balances
        assertEq(token1.balanceOf(address(vault)), 0);
        assertEq(token2.balanceOf(address(vault)), 750 * 10 ** 18);
        assertEq(token3.balanceOf(address(vault)), 0);
        assertEq(token4.balanceOf(address(vault)), 750 * 10 ** 18);

        // Verify weights updated
        assertEq(vault.targetWeights(address(token2)), 5000);
        assertEq(vault.targetWeights(address(token4)), 5000);
        assertEq(vault.targetWeights(address(token1)), 0);
        assertEq(vault.targetWeights(address(token3)), 0);

        // Verify normal operations can resume
        vm.startPrank(user1);
        usdc.approve(address(vault), 100 * 10 ** 18);
        vault.deposit(100 * 10 ** 18); // Should succeed now
        vm.stopPrank();
    }

    /**
     * @notice Test that rebalance fails if there are pending withdrawals
     */
    function test_RebalanceBlockedByPendingWithdrawals() public {
        // Setup initial deposit
        vm.startPrank(user1);
        usdc.approve(address(vault), 1000 * 10 ** 18);
        uint256 depositId = vault.deposit(1000 * 10 ** 18);
        vm.stopPrank();

        vm.startPrank(fulfiller);
        token1.approve(address(vault), 400 * 10 ** 18);
        token2.approve(address(vault), 300 * 10 ** 18);
        token3.approve(address(vault), 300 * 10 ** 18);

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 400 * 10 ** 18;
        amounts[1] = 300 * 10 ** 18;
        amounts[2] = 300 * 10 ** 18;
        vault.fulfillDeposit(depositId, amounts);
        vm.stopPrank();

        // Create pending withdrawal
        vm.startPrank(user1);
        uint256 withdrawalId = vault.requestWithdrawal(100 * 10 ** 18);
        vm.stopPrank();

        // Try to create rebalance - should succeed (rebalance request created)
        address[] memory newTokens = new address[](2);
        newTokens[0] = address(token2);
        newTokens[1] = address(token4);

        uint256[] memory newWeights = new uint256[](2);
        newWeights[0] = 5000;
        newWeights[1] = 5000;

        vault.requestRebalance(newTokens, newWeights);

        // Try to fulfill rebalance - should fail because withdrawal is pending
        vm.startPrank(fulfiller);
        token2.approve(address(vault), 500 * 10 ** 18);
        token4.approve(address(vault), 500 * 10 ** 18);

        uint256[] memory rebalanceAmounts = new uint256[](2);
        rebalanceAmounts[0] = 500 * 10 ** 18;
        rebalanceAmounts[1] = 500 * 10 ** 18;

        vm.expectRevert(SectorVault.PendingRequestsExist.selector);
        vault.fulfillRebalance(rebalanceAmounts);
        vm.stopPrank();

        // Fulfill the withdrawal
        vm.stopPrank();

        // Give fulfiller some USDC for the withdrawal
        usdc.transfer(fulfiller, 1000 * 10 ** 18);

        vm.startPrank(fulfiller);
        uint256[] memory withdrawalAmounts = new uint256[](3);
        withdrawalAmounts[0] = 40 * 10 ** 18;
        withdrawalAmounts[1] = 30 * 10 ** 18;
        withdrawalAmounts[2] = 30 * 10 ** 18;

        usdc.approve(address(vault), 100 * 10 ** 18);
        vault.fulfillWithdrawal(withdrawalId, withdrawalAmounts);

        // Now rebalance fulfillment should succeed
        // After withdrawal, vault has: 360 TK1, 270 TK2, 270 TK3 (900 total value)
        // New composition needs: 450 TK2, 450 TK4
        token2.approve(address(vault), 450 * 10 ** 18);
        token4.approve(address(vault), 450 * 10 ** 18);

        uint256[] memory finalRebalanceAmounts = new uint256[](2);
        finalRebalanceAmounts[0] = 450 * 10 ** 18; // 50% of 900 remaining
        finalRebalanceAmounts[1] = 450 * 10 ** 18; // 50% of 900 remaining
        vault.fulfillRebalance(finalRebalanceAmounts);
        vm.stopPrank();
    }

    /**
     * @notice Test that owner can cancel a rebalance request
     */
    function test_CancelRebalance() public {
        // Create rebalance request
        address[] memory newTokens = new address[](2);
        newTokens[0] = address(token2);
        newTokens[1] = address(token4);

        uint256[] memory newWeights = new uint256[](2);
        newWeights[0] = 5000;
        newWeights[1] = 5000;

        vault.requestRebalance(newTokens, newWeights);

        // Verify deposits are blocked
        vm.startPrank(user1);
        usdc.approve(address(vault), 100 * 10 ** 18);
        vm.expectRevert(SectorVault.RebalancePending.selector);
        vault.deposit(100 * 10 ** 18);
        vm.stopPrank();

        // Cancel rebalance
        vault.cancelRebalance();

        // Verify deposits are allowed again
        vm.startPrank(user1);
        usdc.approve(address(vault), 100 * 10 ** 18);
        vault.deposit(100 * 10 ** 18); // Should succeed
        vm.stopPrank();
    }

    /**
     * @notice Test that vault NAV (Net Asset Value) remains stable during rebalance
     * @dev This is a critical invariant: rebalancing should NOT significantly change
     *      the total value of the vault, only its composition. Users' shares should
     *      represent the same value before and after the rebalance.
     */
    function test_RebalancePreservesVaultValue() public {
        // ========================================
        // STEP 1: Setup initial vault state
        // ========================================

        // User deposits 1000 USDC
        vm.startPrank(user1);
        usdc.approve(address(vault), 1000 * 10 ** 18);
        uint256 depositId = vault.deposit(1000 * 10 ** 18);
        vm.stopPrank();

        // Fulfiller fulfills deposit with underlying tokens
        vm.startPrank(fulfiller);
        token1.approve(address(vault), 400 * 10 ** 18);
        token2.approve(address(vault), 300 * 10 ** 18);
        token3.approve(address(vault), 300 * 10 ** 18);

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 400 * 10 ** 18;
        amounts[1] = 300 * 10 ** 18;
        amounts[2] = 300 * 10 ** 18;
        vault.fulfillDeposit(depositId, amounts);
        vm.stopPrank();

        // Record the vault value BEFORE rebalance
        uint256 valueBeforeRebalance = vault.getTotalValue();
        uint256 sharesBeforeRebalance = sectorToken.totalSupply();
        uint256 user1SharesBeforeRebalance = sectorToken.balanceOf(user1);

        // Verify initial state
        // 1000 tokens @ $1 each = $1000, which in oracle decimals (6) = 1,000,000,000
        assertEq(valueBeforeRebalance, 1_000_000_000);
        assertGt(sharesBeforeRebalance, 0);
        assertEq(user1SharesBeforeRebalance, sharesBeforeRebalance); // User owns all shares

        // ========================================
        // STEP 2: Execute rebalance
        // ========================================
        // Change composition from [40% TK1, 30% TK2, 30% TK3]
        // to [50% TK2, 50% TK4]

        address[] memory newTokens = new address[](2);
        newTokens[0] = address(token2);
        newTokens[1] = address(token4);

        uint256[] memory newWeights = new uint256[](2);
        newWeights[0] = 5000; // 50%
        newWeights[1] = 5000; // 50%

        vault.requestRebalance(newTokens, newWeights);

        // Fulfiller executes rebalance
        // - Vault sends: 400 TK1, 300 TK3 (total value: 700 USDC)
        // - Vault keeps: 300 TK2
        // - Fulfiller provides: 0 TK2 (vault already has 300), 500 TK4
        // Wait, let me recalculate for 1000 total value:
        // - Target: 500 TK2, 500 TK4
        // - Current: 400 TK1, 300 TK2, 300 TK3
        // - Vault sends to fulfiller: 400 TK1, 300 TK3
        // - Fulfiller sends to vault: 200 TK2 (to reach 500), 500 TK4

        vm.startPrank(fulfiller);
        // Fulfiller needs to provide all tokens for new basket
        token2.approve(address(vault), 500 * 10 ** 18);
        token4.approve(address(vault), 500 * 10 ** 18);

        uint256[] memory rebalanceAmounts = new uint256[](2);
        rebalanceAmounts[0] = 500 * 10 ** 18; // 500 TK2
        rebalanceAmounts[1] = 500 * 10 ** 18; // 500 TK4
        vault.fulfillRebalance(rebalanceAmounts);

        vm.stopPrank();

        // ========================================
        // STEP 3: Verify vault value is preserved
        // ========================================

        uint256 valueAfterRebalance = vault.getTotalValue();
        uint256 sharesAfterRebalance = sectorToken.totalSupply();
        uint256 user1SharesAfterRebalance = sectorToken.balanceOf(user1);

        // Vault NAV should be exactly the same (or within a tiny rounding tolerance)
        // Allow 0.1% tolerance for rounding errors
        uint256 tolerance = valueBeforeRebalance / 1000;
        assertApproxEqAbs(
            valueAfterRebalance, valueBeforeRebalance, tolerance, "Vault value changed significantly during rebalance"
        );

        // Total shares should NOT change (no minting/burning during rebalance)
        assertEq(sharesAfterRebalance, sharesBeforeRebalance, "Total shares changed during rebalance");

        // User's shares should NOT change (no redistribution during rebalance)
        assertEq(user1SharesAfterRebalance, user1SharesBeforeRebalance, "User shares changed during rebalance");

        // Verify new composition
        address[] memory finalTokens = vault.getUnderlyingTokens();
        assertEq(finalTokens.length, 2);
        assertEq(token1.balanceOf(address(vault)), 0);
        assertEq(token2.balanceOf(address(vault)), 500 * 10 ** 18);
        assertEq(token3.balanceOf(address(vault)), 0);
        assertEq(token4.balanceOf(address(vault)), 500 * 10 ** 18);
    }

    /**
     * @notice Test rebalance value preservation with different token prices
     * @dev This test ensures rebalancing works correctly even when tokens have
     *      different prices (not just $1.00 each)
     */
    function test_RebalancePreservesValueWithDifferentPrices() public {
        // Set different prices for tokens
        oracle.setPrice(address(token1), 2_000_000); // $2.00
        oracle.setPrice(address(token2), 500_000); // $0.50
        oracle.setPrice(address(token3), 1_000_000); // $1.00
        oracle.setPrice(address(token4), 4_000_000); // $4.00

        // User deposits 1000 USDC
        vm.startPrank(user1);
        usdc.approve(address(vault), 1000 * 10 ** 18);
        uint256 depositId = vault.deposit(1000 * 10 ** 18);
        vm.stopPrank();

        // Fulfiller fulfills deposit with tokens at different prices
        // Target: 40% TK1 ($2), 30% TK2 ($0.50), 30% TK3 ($1)
        // For $1000 total:
        // - 40% = $400 -> 200 TK1 @ $2
        // - 30% = $300 -> 600 TK2 @ $0.50
        // - 30% = $300 -> 300 TK3 @ $1
        vm.startPrank(fulfiller);
        token1.approve(address(vault), 200 * 10 ** 18);
        token2.approve(address(vault), 600 * 10 ** 18);
        token3.approve(address(vault), 300 * 10 ** 18);

        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 200 * 10 ** 18;
        amounts[1] = 600 * 10 ** 18;
        amounts[2] = 300 * 10 ** 18;
        vault.fulfillDeposit(depositId, amounts);
        vm.stopPrank();

        // Record value before rebalance
        uint256 valueBeforeRebalance = vault.getTotalValue();
        // 1000 tokens total @ various prices = $1000, which in oracle decimals (6) = 1,000,000,000
        assertEq(valueBeforeRebalance, 1_000_000_000);

        // Rebalance to 50% TK2, 50% TK4
        // Target for $1000:
        // - 50% = $500 -> 1000 TK2 @ $0.50
        // - 50% = $500 -> 125 TK4 @ $4.00

        address[] memory newTokens = new address[](2);
        newTokens[0] = address(token2);
        newTokens[1] = address(token4);

        uint256[] memory newWeights = new uint256[](2);
        newWeights[0] = 5000;
        newWeights[1] = 5000;

        vault.requestRebalance(newTokens, newWeights);

        vm.startPrank(fulfiller);
        // Fulfiller needs to provide all tokens for new basket
        token2.approve(address(vault), 1000 * 10 ** 18);
        token4.approve(address(vault), 125 * 10 ** 18);

        uint256[] memory rebalanceAmounts = new uint256[](2);
        rebalanceAmounts[0] = 1000 * 10 ** 18; // 1000 TK2
        rebalanceAmounts[1] = 125 * 10 ** 18; // 125 TK4
        vault.fulfillRebalance(rebalanceAmounts);
        vm.stopPrank();

        // Verify value preserved
        uint256 valueAfterRebalance = vault.getTotalValue();
        uint256 tolerance = valueBeforeRebalance / 1000;
        assertApproxEqAbs(
            valueAfterRebalance, valueBeforeRebalance, tolerance, "Vault value not preserved with different prices"
        );
    }
}
