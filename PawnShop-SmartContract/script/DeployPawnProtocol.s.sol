// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {MockERC20} from "../test/mocks/MockERC20.sol";
import {AssetToken} from "../src/tokens/AssetToken.sol";
import {FractionToken} from "../src/tokens/FractionToken.sol";
import {PawnProtocol} from "../src/PawnProtocol.sol";

contract DeployPawnProtocol is Script {
    function run() public {
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy payment token (Mock stablecoin)
        MockERC20 paymentToken = new MockERC20();

        // 2. Deploy AssetToken (RWA NFT)
        AssetToken assetToken = new AssetToken(deployer);

        // 3. Deploy FractionToken (ERC1155 fractions)
        FractionToken fractionToken = new FractionToken(deployer, "https://api.pwnshop.local/metadata/{id}");

        // 4. Deploy PawnProtocol
        PawnProtocol protocol = new PawnProtocol();

        // 5. Initialize protocol
        protocol.initialize(address(paymentToken), address(assetToken), address(fractionToken));

        // 6. Set Stablecoin Status
        protocol.setStablecoinStatus(address(paymentToken), true);

        // 7. Authorize PawnProtocol minter status on FractionToken
        fractionToken.setMinter(address(protocol), true);

        // 8. Seed protocol liquidity: mint 1,000,000 payment tokens to PawnProtocol
        paymentToken.mint(address(protocol), 1_000_000 * 10**18);

        // 9. Seed demo users liquidity & KYC status (using default Anvil accounts for convenience)
        // Account 0 (deployer): 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        // Account 1 (alice): 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
        // Account 2 (bob): 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
        // Account 3 (charlie): 0x90F79bf6EB2c4f870365E785982E1f101E93b906
        address alice = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        address bob = 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC;
        address charlie = 0x90F79bf6EB2c4f870365E785982E1f101E93b906;

        protocol.setKYCStatus(deployer, true);
        protocol.setKYCStatus(alice, true);
        protocol.setKYCStatus(bob, true);
        protocol.setKYCStatus(charlie, true);

        paymentToken.mint(deployer, 100_000 * 10**18);
        paymentToken.mint(alice, 100_000 * 10**18);
        paymentToken.mint(bob, 100_000 * 10**18);
        paymentToken.mint(charlie, 100_000 * 10**18);

        // Mint demo AssetToken NFTs to Alice matching app assets A-1001 to A-1005
        assetToken.mint(alice, "https://api.pwnshop.local/metadata/A-1001");
        assetToken.mint(alice, "https://api.pwnshop.local/metadata/A-1002");
        assetToken.mint(alice, "https://api.pwnshop.local/metadata/A-1003");
        assetToken.mint(alice, "https://api.pwnshop.local/metadata/A-1004");
        assetToken.mint(alice, "https://api.pwnshop.local/metadata/A-1005");

        vm.stopBroadcast();

        // Write the deployment configuration details to local-anvil.json
        string memory obj = "deployment";
        vm.serializeUint(obj, "chainId", block.chainid);
        vm.serializeAddress(obj, "pawnProtocol", address(protocol));
        vm.serializeAddress(obj, "paymentToken", address(paymentToken));
        vm.serializeAddress(obj, "assetToken", address(assetToken));
        vm.serializeAddress(obj, "fractionToken", address(fractionToken));
        vm.serializeString(obj, "abiPath", "out/PawnProtocol.sol/PawnProtocol.json");
        string memory tokenIdMapJson = '{"A-1001":1,"A-1002":2,"A-1003":3,"A-1004":4,"A-1005":5}';
        string memory finalJson = vm.serializeString(obj, "tokenIdMap", tokenIdMapJson);

        vm.writeJson(finalJson, "./deployments/local-anvil.json");
    }
}
