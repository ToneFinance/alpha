// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MockOracle} from "../src/MockOracle.sol";

/**
 * @title UpdateOraclePrices
 * @notice Script to update mock oracle prices to real-world values
 * @dev Run with: forge script script/UpdateOraclePrices.s.sol:UpdateOraclePrices --rpc-url base_sepolia --broadcast
 * @dev Prices fetched on October 24, 2025
 */
contract UpdateOraclePrices is Script {
    // MockOracle address from deployment
    address constant MOCK_ORACLE = 0x8E6596749b8aDa46195C04e03297469aFA2fd4F3;

    // Token configuration
    struct TokenConfig {
        string name;
        address addr;
        uint256 price;
        uint8 decimals;
    }

    TokenConfig[] public tokens;

    constructor() {
        tokens.push(TokenConfig("BAT", 0x02A8Db2231F88FEe863081Aa7BAA4b7e3795e84D, 259544000000000000, 18));
        tokens.push(TokenConfig("BDX", 0xC8805760222BD0A26A9cD0517fEcd47f8A0f735f, 84793000000000000, 18));
        tokens.push(TokenConfig("FIL", 0x4e248E77CCfF9766eC3d836a8219d5DD4B646D1d, 1470000000000000000, 18));
        tokens.push(TokenConfig("GLM", 0xEc675EF3Bd4Db1cE1E01990984222636311854D0, 213199000000000000, 18));
        tokens.push(TokenConfig("ICP", 0xB6eB2a1b73bC0D9402c59C1B092AbCec900b3d04, 3340000000000000000, 18));
        tokens.push(TokenConfig("NEAR", 0x31d0d71D767CE6B4d92aF123476f6dB87A4f4249, 1720000000000000000, 18));
        tokens.push(TokenConfig("NMR", 0x7ae619FB4025218ba58F0541CC6ebaaeFB604769, 11380000000000000000, 18));
        tokens.push(TokenConfig("SIREN", 0x4221C19e2BeBD58a3bc7b8D38C76BDC72644Ff9f, 6628260000000000, 18));
        tokens.push(TokenConfig("TRAC", 0x812CE10fB1B923C054c47c0CD93244B45850E6a8, 515818000000000000, 18));
        tokens.push(TokenConfig("VANA", 0x2832BFd3B0141ef7f1452eA1975323153ac0a7c7, 2750000000000000000, 18));
        tokens.push(TokenConfig("BCH", 0xbe1e8Ce9C2e3125Aa4155e360caB1dE1d6109239, 574630000000000000000, 18));
        tokens.push(TokenConfig("COMP", 0x07c0080711B2E937F32846779eE6C5828b8ab24D, 31180000000000000000, 18));
        tokens.push(TokenConfig("FRAX", 0x9baBf71CFF53A59Cbd5AafF768238A60c6Ac3F4B, 993675000000000000, 18));
        tokens.push(TokenConfig("KAS", 0x0Fe6Ef67eff87378F49864e666039387ff8adE4E, 50324000000000000, 18));
        tokens.push(TokenConfig("LTC", 0x0C4cEbA4DEf071a21650E54e598a6602157521cc, 83210000000000000000, 18));
        tokens.push(TokenConfig("UNI", 0xF07F3722753Db48f1C967D97EeFCdD837a247105, 5470000000000000000, 18));
        tokens.push(TokenConfig("WLFI", 0x3eEFe62cb64E762B2C207A5e901a16e616a0Dc7c, 148292000000000000, 18));
        tokens.push(TokenConfig("XRP", 0xeF28F15FfF0dF624C7cAFe1Fcd59A73f366559cA, 2050000000000000000, 18));
        tokens.push(TokenConfig("ZEN", 0xAdc745FbacA7D2F6857A19C64f1D0b26094E1033, 9100000000000000000, 18));
    }

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Updating oracle prices with account:", deployer);
        console.log("Account balance:", deployer.balance);
        console.log("Oracle address:", MOCK_ORACLE);

        vm.startBroadcast(deployerPrivateKey);

        MockOracle oracle = MockOracle(MOCK_ORACLE);

        address[] memory tokenAddrs = new address[](tokens.length);
        uint256[] memory prices = new uint256[](tokens.length);
        uint8[] memory decimals = new uint8[](tokens.length);

        for (uint256 i = 0; i < tokens.length; i++) {
            tokenAddrs[i] = tokens[i].addr;
            prices[i] = tokens[i].price;
            decimals[i] = tokens[i].decimals;
        }

        oracle.setTokenDecimalsBatch(tokenAddrs, decimals);
        oracle.setPrices(tokenAddrs, prices);

        console.log("\n=== Real-World Prices Updated (Oct 24, 2025) ===");
        for (uint256 i = 0; i < tokens.length; i++) {
            console.log(tokens[i].name, "price set");
        }
        console.log("\nAll token decimals set to 18");

        vm.stopBroadcast();
    }
}
