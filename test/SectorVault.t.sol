// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SectorVault} from "../src/SectorVault.sol";
import {SectorToken} from "../src/SectorToken.sol";
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

        // Deploy vault
        vault = new SectorVault(address(usdc), "DeFi Sector Token", "DEFI", underlyingTokens, targetWeights, fulfiller);

        sectorToken = vault.sectorToken();

        // Distribute tokens
        require(usdc.transfer(user1, 10_000 * 10 ** 18), "USDC transfer to user1 failed");
        require(usdc.transfer(user2, 10_000 * 10 ** 18), "USDC transfer to user2 failed");
        require(token1.transfer(fulfiller, 100_000 * 10 ** 18), "Token1 transfer failed");
        require(token2.transfer(fulfiller, 100_000 * 10 ** 18), "Token2 transfer failed");
        require(token3.transfer(fulfiller, 100_000 * 10 ** 18), "Token3 transfer failed");
    }

    function test_Deployment() public view {
        assertEq(address(vault.quoteToken()), address(usdc));
        assertEq(address(vault.sectorToken()), address(sectorToken));
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

        // Check deposit is fulfilled
        (,, bool fulfilled,) = vault.pendingDeposits(depositId);
        assertTrue(fulfilled);

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

        (,, bool fulfilled,) = vault.pendingDeposits(depositId);
        assertTrue(fulfilled); // Marked as fulfilled to prevent re-use
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
}
