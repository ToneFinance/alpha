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

contract SectorVaultTest is Test {
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
        require(token1.transfer(fulfiller, 100_000 * 10 ** 18), "Token1 transfer failed");
        require(token2.transfer(fulfiller, 100_000 * 10 ** 18), "Token2 transfer failed");
        require(token3.transfer(fulfiller, 100_000 * 10 ** 18), "Token3 transfer failed");
    }

    function test_Deployment() public view {
        assertEq(address(vault.QUOTE_TOKEN()), address(usdc));
        assertEq(address(vault.SECTOR_TOKEN()), address(sectorToken));
        assertEq(vault.fulfillmentRole(), fulfiller);
        assertEq(vault.owner(), owner);

        address[] memory tokens = vault.getUnderlyingTokens();
        assertEq(tokens.length, 3);
        assertEq(tokens[0], address(token1));
        assertEq(tokens[1], address(token2));
        assertEq(tokens[2], address(token3));

        assertEq(vault.targetWeights(address(token1)), 4000);
        assertEq(vault.targetWeights(address(token2)), 3000);
        assertEq(vault.targetWeights(address(token3)), 3000);
    }

    function test_Deposit() public {
        uint256 depositAmount = 1000 * 10 ** 18;

        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 depositId = vault.deposit(depositAmount);
        vm.stopPrank();

        assertEq(depositId, 0);
        assertEq(usdc.balanceOf(address(vault)), depositAmount);

        (address user, uint256 quoteAmount, bool fulfilled, uint256 timestamp) = vault.pendingDeposits(depositId);
        assertEq(user, user1);
        assertEq(quoteAmount, depositAmount);
        assertFalse(fulfilled);
        assertGt(timestamp, 0);
    }

    function test_FulfillDeposit() public {
        uint256 depositAmount = 1000 * 10 ** 18;

        // User deposits
        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 depositId = vault.deposit(depositAmount);
        vm.stopPrank();

        // Fulfiller fulfills deposit
        uint256[] memory underlyingAmounts = new uint256[](3);
        underlyingAmounts[0] = 400 * 10 ** 18; // 40%
        underlyingAmounts[1] = 300 * 10 ** 18; // 30%
        underlyingAmounts[2] = 300 * 10 ** 18; // 30%

        vm.startPrank(fulfiller);
        token1.approve(address(vault), underlyingAmounts[0]);
        token2.approve(address(vault), underlyingAmounts[1]);
        token3.approve(address(vault), underlyingAmounts[2]);
        vault.fulfillDeposit(depositId, underlyingAmounts);
        vm.stopPrank();

        // Check deposit has been deleted (cleaned up)
        (address user,,,) = vault.pendingDeposits(depositId);
        assertEq(user, address(0), "Deposit should be deleted after fulfillment");

        // Check user received sector tokens
        assertEq(sectorToken.balanceOf(user1), depositAmount);

        // Check vault received underlying tokens
        assertEq(token1.balanceOf(address(vault)), underlyingAmounts[0]);
        assertEq(token2.balanceOf(address(vault)), underlyingAmounts[1]);
        assertEq(token3.balanceOf(address(vault)), underlyingAmounts[2]);
    }

    function test_RevertFulfillDeposit_UnauthorizedFulfillment() public {
        uint256 depositAmount = 1000 * 10 ** 18;

        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 depositId = vault.deposit(depositAmount);
        vm.stopPrank();

        uint256[] memory underlyingAmounts = new uint256[](3);
        underlyingAmounts[0] = 400 * 10 ** 18;
        underlyingAmounts[1] = 300 * 10 ** 18;
        underlyingAmounts[2] = 300 * 10 ** 18;

        vm.startPrank(user2);
        vm.expectRevert(SectorVault.UnauthorizedFulfillment.selector);
        vault.fulfillDeposit(depositId, underlyingAmounts);
        vm.stopPrank();
    }

    function test_CancelDeposit() public {
        uint256 depositAmount = 1000 * 10 ** 18;

        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 depositId = vault.deposit(depositAmount);

        uint256 balanceBefore = usdc.balanceOf(user1);
        vault.cancelDeposit(depositId);
        uint256 balanceAfter = usdc.balanceOf(user1);
        vm.stopPrank();

        assertEq(balanceAfter - balanceBefore, depositAmount);
        assertEq(usdc.balanceOf(address(vault)), 0);

        // Check deposit has been deleted (cleaned up)
        (address user,,,) = vault.pendingDeposits(depositId);
        assertEq(user, address(0), "Deposit should be deleted after cancellation");
    }

    function test_Withdraw() public {
        // First, do a deposit and fulfillment
        uint256 depositAmount = 1000 * 10 ** 18;

        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 depositId = vault.deposit(depositAmount);
        vm.stopPrank();

        uint256[] memory underlyingAmounts = new uint256[](3);
        underlyingAmounts[0] = 400 * 10 ** 18;
        underlyingAmounts[1] = 300 * 10 ** 18;
        underlyingAmounts[2] = 300 * 10 ** 18;

        vm.startPrank(fulfiller);
        token1.approve(address(vault), underlyingAmounts[0]);
        token2.approve(address(vault), underlyingAmounts[1]);
        token3.approve(address(vault), underlyingAmounts[2]);
        vault.fulfillDeposit(depositId, underlyingAmounts);
        vm.stopPrank();

        // Now withdraw half
        uint256 withdrawAmount = depositAmount / 2;

        vm.startPrank(user1);
        uint256 tk1Before = token1.balanceOf(user1);
        uint256 tk2Before = token2.balanceOf(user1);
        uint256 tk3Before = token3.balanceOf(user1);

        vault.withdraw(withdrawAmount);

        uint256 tk1After = token1.balanceOf(user1);
        uint256 tk2After = token2.balanceOf(user1);
        uint256 tk3After = token3.balanceOf(user1);
        vm.stopPrank();

        // User should receive 50% of underlying tokens
        assertEq(tk1After - tk1Before, underlyingAmounts[0] / 2);
        assertEq(tk2After - tk2Before, underlyingAmounts[1] / 2);
        assertEq(tk3After - tk3Before, underlyingAmounts[2] / 2);

        // User should have 50% sector tokens left
        assertEq(sectorToken.balanceOf(user1), depositAmount / 2);
    }

    function test_MultipleDepositsAndWithdrawals() public {
        // User 1 deposits
        uint256 depositAmount1 = 1000 * 10 ** 18;
        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount1);
        uint256 depositId1 = vault.deposit(depositAmount1);
        vm.stopPrank();

        // Fulfill user 1's deposit
        uint256[] memory underlyingAmounts1 = new uint256[](3);
        underlyingAmounts1[0] = 400 * 10 ** 18;
        underlyingAmounts1[1] = 300 * 10 ** 18;
        underlyingAmounts1[2] = 300 * 10 ** 18;

        vm.startPrank(fulfiller);
        token1.approve(address(vault), underlyingAmounts1[0]);
        token2.approve(address(vault), underlyingAmounts1[1]);
        token3.approve(address(vault), underlyingAmounts1[2]);
        vault.fulfillDeposit(depositId1, underlyingAmounts1);
        vm.stopPrank();

        // User 2 deposits
        uint256 depositAmount2 = 2000 * 10 ** 18;
        vm.startPrank(user2);
        usdc.approve(address(vault), depositAmount2);
        uint256 depositId2 = vault.deposit(depositAmount2);
        vm.stopPrank();

        // Fulfill user 2's deposit
        uint256[] memory underlyingAmounts2 = new uint256[](3);
        underlyingAmounts2[0] = 800 * 10 ** 18;
        underlyingAmounts2[1] = 600 * 10 ** 18;
        underlyingAmounts2[2] = 600 * 10 ** 18;

        vm.startPrank(fulfiller);
        token1.approve(address(vault), underlyingAmounts2[0]);
        token2.approve(address(vault), underlyingAmounts2[1]);
        token3.approve(address(vault), underlyingAmounts2[2]);
        vault.fulfillDeposit(depositId2, underlyingAmounts2);
        vm.stopPrank();

        // Check total supply
        assertEq(sectorToken.totalSupply(), depositAmount1 + depositAmount2);
        assertEq(sectorToken.balanceOf(user1), depositAmount1);
        assertEq(sectorToken.balanceOf(user2), depositAmount2);

        // User 1 withdraws all
        vm.startPrank(user1);
        vault.withdraw(depositAmount1);
        vm.stopPrank();

        // User 1 should have 1/3 of total underlying (since they had 1000 out of 3000 shares)
        assertEq(sectorToken.balanceOf(user1), 0);
        assertGt(token1.balanceOf(user1), 0);
    }

    function test_SetFulfillmentRole() public {
        address newFulfiller = makeAddr("newFulfiller");
        vault.setFulfillmentRole(newFulfiller);
        assertEq(vault.fulfillmentRole(), newFulfiller);
    }

    function test_SetOracle() public {
        // Deploy a new oracle
        MockOracle newOracle = new MockOracle();
        newOracle.setPrice(address(token1), 2_000_000); // $2.00
        newOracle.setPrice(address(token2), 2_000_000);
        newOracle.setPrice(address(token3), 2_000_000);

        // Set token decimals for new oracle
        newOracle.setTokenDecimals(address(token1), 18);
        newOracle.setTokenDecimals(address(token2), 18);
        newOracle.setTokenDecimals(address(token3), 18);

        // Update oracle
        vault.setOracle(address(newOracle));
        assertEq(address(vault.oracle()), address(newOracle));

        // Verify new oracle is being used
        // Make a deposit with the new oracle (where tokens are worth $2 each)
        uint256 depositAmount = 1000 * 10 ** 18;

        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 depositId = vault.deposit(depositAmount);
        vm.stopPrank();

        // Fulfill with underlying tokens worth $1000
        // With tokens at $2 each, we need HALF the amount
        uint256[] memory underlyingAmounts = new uint256[](3);
        underlyingAmounts[0] = 200 * 10 ** 18; // 200 tokens @ $2 = $400
        underlyingAmounts[1] = 150 * 10 ** 18; // 150 tokens @ $2 = $300
        underlyingAmounts[2] = 150 * 10 ** 18; // 150 tokens @ $2 = $300
        // Total value = $1000

        vm.startPrank(fulfiller);
        token1.approve(address(vault), underlyingAmounts[0]);
        token2.approve(address(vault), underlyingAmounts[1]);
        token3.approve(address(vault), underlyingAmounts[2]);
        vault.fulfillDeposit(depositId, underlyingAmounts);
        vm.stopPrank();

        // With new oracle at $2/token, total value should be $1,000 (1,000,000,000 with 6 decimals)
        // 200 tokens @ $2 = $400, 150 @ $2 = $300, 150 @ $2 = $300 = $1000 total
        uint256 totalValue = vault.getTotalValue();
        assertEq(totalValue, 1_000_000_000, "Total value should be $1000 with new oracle");
    }

    function test_UpdateBasket() public {
        address[] memory newTokens = new address[](2);
        newTokens[0] = address(token1);
        newTokens[1] = address(token2);

        uint256[] memory newWeights = new uint256[](2);
        newWeights[0] = 6000; // 60%
        newWeights[1] = 4000; // 40%

        vault.updateBasket(newTokens, newWeights);

        address[] memory tokens = vault.getUnderlyingTokens();
        assertEq(tokens.length, 2);
        assertEq(vault.targetWeights(address(token1)), 6000);
        assertEq(vault.targetWeights(address(token2)), 4000);
    }

    function test_RevertUpdateBasket_InvalidWeights() public {
        address[] memory newTokens = new address[](2);
        newTokens[0] = address(token1);
        newTokens[1] = address(token2);

        uint256[] memory newWeights = new uint256[](2);
        newWeights[0] = 6000;
        newWeights[1] = 3000; // Sum = 9000, not 10000

        vm.expectRevert(SectorVault.InvalidWeights.selector);
        vault.updateBasket(newTokens, newWeights);
    }

    function test_GetVaultBalances() public {
        // Deposit and fulfill
        uint256 depositAmount = 1000 * 10 ** 18;

        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 depositId = vault.deposit(depositAmount);
        vm.stopPrank();

        uint256[] memory underlyingAmounts = new uint256[](3);
        underlyingAmounts[0] = 400 * 10 ** 18;
        underlyingAmounts[1] = 300 * 10 ** 18;
        underlyingAmounts[2] = 300 * 10 ** 18;

        vm.startPrank(fulfiller);
        token1.approve(address(vault), underlyingAmounts[0]);
        token2.approve(address(vault), underlyingAmounts[1]);
        token3.approve(address(vault), underlyingAmounts[2]);
        vault.fulfillDeposit(depositId, underlyingAmounts);
        vm.stopPrank();

        (address[] memory tokens, uint256[] memory balances) = vault.getVaultBalances();

        assertEq(tokens.length, 3);
        assertEq(balances.length, 3);
        assertEq(balances[0], underlyingAmounts[0]);
        assertEq(balances[1], underlyingAmounts[1]);
        assertEq(balances[2], underlyingAmounts[2]);
    }

    function test_NAVCalculationWithTwoDeposits() public {
        // First deposit: User1 deposits 1 USDC (with 18 decimals)
        uint256 deposit1Amount = 1 * 10 ** 18;

        vm.startPrank(user1);
        usdc.approve(address(vault), deposit1Amount);
        uint256 depositId1 = vault.deposit(deposit1Amount);
        vm.stopPrank();

        // Fulfill with underlying tokens worth $1
        // With all tokens at $1 per token, we give 1 token of each
        uint256[] memory underlyingAmounts1 = new uint256[](3);
        underlyingAmounts1[0] = 0.4 * 10 ** 18; // 0.4 tokens @ $1 = $0.40
        underlyingAmounts1[1] = 0.3 * 10 ** 18; // 0.3 tokens @ $1 = $0.30
        underlyingAmounts1[2] = 0.3 * 10 ** 18; // 0.3 tokens @ $1 = $0.30
        // Total value = $1.00

        vm.startPrank(fulfiller);
        token1.approve(address(vault), underlyingAmounts1[0]);
        token2.approve(address(vault), underlyingAmounts1[1]);
        token3.approve(address(vault), underlyingAmounts1[2]);
        vault.fulfillDeposit(depositId1, underlyingAmounts1);
        vm.stopPrank();

        // First deposit should get 1:1 ratio (1 USDC = 1 share token)
        uint256 user1Shares = sectorToken.balanceOf(user1);
        assertEq(user1Shares, deposit1Amount, "First deposit should be 1:1");

        // Check NAV is correct
        uint256 totalValue = vault.getTotalValue();
        // Total value should be 1 USDC (1000000 with 6 decimals)
        assertEq(totalValue, 1_000_000, "Total value should be $1.00");

        // Second deposit: User2 deposits 1 USDC
        uint256 deposit2Amount = 1 * 10 ** 18;

        vm.startPrank(user2);
        usdc.approve(address(vault), deposit2Amount);
        uint256 depositId2 = vault.deposit(deposit2Amount);
        vm.stopPrank();

        // Fulfill with same amounts (vault value doubles)
        uint256[] memory underlyingAmounts2 = new uint256[](3);
        underlyingAmounts2[0] = 0.4 * 10 ** 18;
        underlyingAmounts2[1] = 0.3 * 10 ** 18;
        underlyingAmounts2[2] = 0.3 * 10 ** 18;

        vm.startPrank(fulfiller);
        token1.approve(address(vault), underlyingAmounts2[0]);
        token2.approve(address(vault), underlyingAmounts2[1]);
        token3.approve(address(vault), underlyingAmounts2[2]);
        vault.fulfillDeposit(depositId2, underlyingAmounts2);
        vm.stopPrank();

        // User2 should get same amount of shares since they deposited same value
        uint256 user2Shares = sectorToken.balanceOf(user2);
        assertEq(user2Shares, user1Shares, "Equal deposits should get equal shares");

        // Total supply should be 2x the first deposit
        assertEq(sectorToken.totalSupply(), deposit1Amount + deposit2Amount);

        // Total NAV should be $2.00 (2000000 with 6 decimals)
        assertEq(vault.getTotalValue(), 2_000_000, "Total value should be $2.00");

        // Both users should have equal ownership (50% each)
        assertEq(user1Shares, sectorToken.totalSupply() / 2);
        assertEq(user2Shares, sectorToken.totalSupply() / 2);
    }

    function test_DepositCleanupAfterFulfillment() public {
        // Make a deposit
        uint256 depositAmount = 1000 * 10 ** 18;

        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 depositId = vault.deposit(depositAmount);
        vm.stopPrank();

        // Verify deposit exists
        (address user, uint256 quoteAmount, bool fulfilled,) = vault.pendingDeposits(depositId);
        assertEq(user, user1);
        assertEq(quoteAmount, depositAmount);
        assertFalse(fulfilled);

        // Fulfill deposit
        uint256[] memory underlyingAmounts = new uint256[](3);
        underlyingAmounts[0] = 400 * 10 ** 18;
        underlyingAmounts[1] = 300 * 10 ** 18;
        underlyingAmounts[2] = 300 * 10 ** 18;

        vm.startPrank(fulfiller);
        token1.approve(address(vault), underlyingAmounts[0]);
        token2.approve(address(vault), underlyingAmounts[1]);
        token3.approve(address(vault), underlyingAmounts[2]);
        vault.fulfillDeposit(depositId, underlyingAmounts);
        vm.stopPrank();

        // Verify deposit has been deleted
        (user, quoteAmount, fulfilled,) = vault.pendingDeposits(depositId);
        assertEq(user, address(0));
        assertEq(quoteAmount, 0);
        assertFalse(fulfilled);

        // Verify nextDepositId still increments monotonically
        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 newDepositId = vault.deposit(depositAmount);
        vm.stopPrank();

        assertEq(newDepositId, depositId + 1, "Deposit IDs should increment monotonically");
    }

    function test_DepositCleanupAfterCancellation() public {
        // Make a deposit
        uint256 depositAmount = 1000 * 10 ** 18;

        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 depositId = vault.deposit(depositAmount);
        vm.stopPrank();

        // Verify deposit exists
        (address user, uint256 quoteAmount, bool fulfilled,) = vault.pendingDeposits(depositId);
        assertEq(user, user1);
        assertEq(quoteAmount, depositAmount);
        assertFalse(fulfilled);

        // Cancel deposit
        vm.startPrank(user1);
        vault.cancelDeposit(depositId);
        vm.stopPrank();

        // Verify deposit has been deleted
        (user, quoteAmount, fulfilled,) = vault.pendingDeposits(depositId);
        assertEq(user, address(0));
        assertEq(quoteAmount, 0);
        assertFalse(fulfilled);

        // Verify USDC was returned
        assertEq(usdc.balanceOf(user1), 10_000 * 10 ** 18, "USDC should be returned to user");

        // Verify nextDepositId still increments monotonically
        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 newDepositId = vault.deposit(depositAmount);
        vm.stopPrank();

        assertEq(newDepositId, depositId + 1, "Deposit IDs should increment monotonically");
    }

    function test_NAVCalculationWithChangingPrices() public {
        // ===== STEP 1: First deposit at $1 per token =====
        uint256 deposit1Amount = 1000 * 10 ** 18; // 1000 USDC (18 decimals)

        vm.startPrank(user1);
        usdc.approve(address(vault), deposit1Amount);
        uint256 depositId1 = vault.deposit(deposit1Amount);
        vm.stopPrank();

        // Fulfill with underlying tokens worth $1 each
        uint256[] memory underlyingAmounts1 = new uint256[](3);
        underlyingAmounts1[0] = 400 * 10 ** 18; // 400 tokens @ $1 = $400
        underlyingAmounts1[1] = 300 * 10 ** 18; // 300 tokens @ $1 = $300
        underlyingAmounts1[2] = 300 * 10 ** 18; // 300 tokens @ $1 = $300
        // Total value = $1000

        vm.startPrank(fulfiller);
        token1.approve(address(vault), underlyingAmounts1[0]);
        token2.approve(address(vault), underlyingAmounts1[1]);
        token3.approve(address(vault), underlyingAmounts1[2]);
        vault.fulfillDeposit(depositId1, underlyingAmounts1);
        vm.stopPrank();

        // User1 should receive 1000 shares (1:1 for first deposit)
        uint256 user1Shares = sectorToken.balanceOf(user1);
        assertEq(user1Shares, deposit1Amount, "First deposit should be 1:1");

        // NAV should be $1000 (1,000,000,000 with 6 decimals)
        uint256 navBefore = vault.getTotalValue();
        assertEq(navBefore, 1_000_000_000, "Initial NAV should be $1000");

        // ===== STEP 2: Update oracle prices to $2 per token =====
        oracle.setPrice(address(token1), 2_000_000); // $2.00
        oracle.setPrice(address(token2), 2_000_000); // $2.00
        oracle.setPrice(address(token3), 2_000_000); // $2.00

        // NAV should DOUBLE to $2000 (2,000,000,000 with 6 decimals)
        // 400 tokens @ $2 = $800, 300 @ $2 = $600, 300 @ $2 = $600 = $2000
        uint256 navAfter = vault.getTotalValue();
        assertEq(navAfter, 2_000_000_000, "NAV should double when prices double");
        assertEq(navAfter, navBefore * 2, "NAV should be exactly 2x initial NAV");

        // ===== STEP 3: Second deposit at new prices =====
        // User2 deposits same amount (1000 USDC) but should get HALF the shares
        // because vault is now worth $2000
        uint256 deposit2Amount = 1000 * 10 ** 18;

        vm.startPrank(user2);
        usdc.approve(address(vault), deposit2Amount);
        uint256 depositId2 = vault.deposit(deposit2Amount);
        vm.stopPrank();

        // Fulfill with HALF the token amounts (to match $1000 at $2/token prices)
        uint256[] memory underlyingAmounts2 = new uint256[](3);
        underlyingAmounts2[0] = 200 * 10 ** 18; // 200 tokens @ $2 = $400
        underlyingAmounts2[1] = 150 * 10 ** 18; // 150 tokens @ $2 = $300
        underlyingAmounts2[2] = 150 * 10 ** 18; // 150 tokens @ $2 = $300
        // Total value = $1000

        vm.startPrank(fulfiller);
        token1.approve(address(vault), underlyingAmounts2[0]);
        token2.approve(address(vault), underlyingAmounts2[1]);
        token3.approve(address(vault), underlyingAmounts2[2]);
        vault.fulfillDeposit(depositId2, underlyingAmounts2);
        vm.stopPrank();

        // User2 should receive HALF the shares of user1
        // shares = (quoteAmount * totalShares) / totalValue
        // shares = (1000 * 1000) / 2000 = 500 (in normalized units)
        uint256 user2Shares = sectorToken.balanceOf(user2);
        assertEq(user2Shares, deposit1Amount / 2, "User2 should get half shares due to doubled prices");
        assertEq(user2Shares, user1Shares / 2, "User2 shares should be half of user1 shares");

        // Total shares should be 1500
        assertEq(sectorToken.totalSupply(), user1Shares + user2Shares);

        // Total NAV should now be $3000 (3,000,000,000 with 6 decimals)
        // (400 + 200) tokens @ $2 = $1200 from token1
        // (300 + 150) tokens @ $2 = $900 from token2
        // (300 + 150) tokens @ $2 = $900 from token3
        // Total: 600 @ $2 = $1200, 450 @ $2 = $900, 450 @ $2 = $900 = $3000
        uint256 finalNav = vault.getTotalValue();
        assertEq(finalNav, 3_000_000_000, "Final NAV should be $3000");

        // ===== STEP 4: Update prices to $0.50 per token =====
        oracle.setPrice(address(token1), 500_000); // $0.50
        oracle.setPrice(address(token2), 500_000); // $0.50
        oracle.setPrice(address(token3), 500_000); // $0.50

        // NAV should be QUARTER of previous ($3000 / 4 = $750)
        // 600 tokens @ $0.50 = $300, 450 @ $0.50 = $225, 450 @ $0.50 = $225 = $750
        uint256 navAfterDrop = vault.getTotalValue();
        assertEq(navAfterDrop, 750_000_000, "NAV should be $750 after price drops to $0.50");
        assertEq(navAfterDrop, finalNav / 4, "NAV should be 1/4 of previous when prices drop to 1/4");

        // Shares remain unchanged - only NAV changes with prices
        assertEq(sectorToken.balanceOf(user1), user1Shares, "User1 shares unchanged");
        assertEq(sectorToken.balanceOf(user2), user2Shares, "User2 shares unchanged");
    }

    function test_FulfillDeposit_WithComplicatedPrices() public {
        // This test verifies that fulfillment works with varied prices that cause rounding
        // Simulates real-world scenario with prices like: $0.25, $0.35, $0.4684, $2.22, $391.73

        // Update prices to varied amounts (similar to real oracle prices)
        oracle.setPrice(address(token1), 250_000);   // TK1 = $0.25
        oracle.setPrice(address(token2), 468_400);   // TK2 = $0.4684
        oracle.setPrice(address(token3), 2_220_000); // TK3 = $2.22

        // User deposits 1000 USDC
        uint256 depositAmount = 1000 * 10 ** 18;
        vm.startPrank(user1);
        usdc.approve(address(vault), depositAmount);
        uint256 depositId = vault.deposit(depositAmount);
        vm.stopPrank();

        // With weights 40%, 30%, 30% and prices $0.25, $0.4684, $2.22:
        // - TK1: (1000 * 0.40) / 0.25 = 1600 tokens
        // - TK2: (1000 * 0.30) / 0.4684 ≈ 640.77 tokens (rounding occurs here)
        // - TK3: (1000 * 0.30) / 2.22 ≈ 135.14 tokens (rounding occurs here)

        // Calculate approximate amounts the fulfiller would send
        // Value for TK1: 1000 * 40% = 400 USDC
        // Amount for TK1 @ $0.25 = 400 / 0.25 = 1600 tokens
        uint256 tk1Amount = 1600 * 10 ** 18;

        // Value for TK2: 1000 * 30% = 300 USDC
        // Amount for TK2 @ $0.4684 = 300 / 0.4684 ≈ 640.77 tokens
        uint256 tk2Amount = 640769 * 10 ** 15; // ~640.769 tokens

        // Value for TK3: 1000 * 30% = 300 USDC
        // Amount for TK3 @ $2.22 = 300 / 2.22 ≈ 135.14 tokens
        uint256 tk3Amount = 135135 * 10 ** 15; // ~135.135 tokens

        // Attempt fulfillment - should succeed with tolerance
        vm.startPrank(fulfiller);
        token1.approve(address(vault), tk1Amount);
        token2.approve(address(vault), tk2Amount);
        token3.approve(address(vault), tk3Amount);

        // This should NOT revert, thanks to the tolerance fix
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = tk1Amount;
        amounts[1] = tk2Amount;
        amounts[2] = tk3Amount;
        vault.fulfillDeposit(depositId, amounts);
        vm.stopPrank();

        // Verify user received sector tokens
        uint256 userShares = sectorToken.balanceOf(user1);
        assertGt(userShares, 0, "User should have received sector tokens");

        // Verify NAV is approximately 1000 USDC
        uint256 nav = vault.getTotalValue();
        assertGt(nav, 990_000_000, "NAV should be ~$1000 (allowing for rounding)");
        assertLt(nav, 1010_000_000, "NAV should be ~$1000 (allowing for rounding)");
    }
}
