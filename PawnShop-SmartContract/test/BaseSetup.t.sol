// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/PawnProtocol.sol";
import "./mocks/MockERC20.sol";
import "./mocks/MockERC721.sol";
import "./mocks/MockERC1155.sol";

abstract contract BaseSetup is Test {
    PawnProtocol public protocol;
    MockERC20 public paymentToken;
    MockERC721 public assetToken;
    MockERC1155 public fractionToken;

    address public admin = address(0x111);
    address public oracle = address(0x222);
    address public alice = address(0x333);
    address public bob = address(0x444);

    uint256 public constant ASSET_ID = 1;

    function setUp() public virtual {
        paymentToken = new MockERC20();
        assetToken = new MockERC721();
        fractionToken = new MockERC1155();

        vm.startPrank(admin);
        protocol = new PawnProtocol();
        protocol.initialize(address(paymentToken), address(assetToken), address(fractionToken));
        
        protocol.setRoles(admin, oracle);
        vm.stopPrank();

        paymentToken.mint(address(protocol), 1_000_000 * 10**18);

        paymentToken.mint(alice, 100_000 * 10**18);
        paymentToken.mint(bob, 100_000 * 10**18);

        vm.prank(admin);
        protocol.setStablecoinStatus(address(paymentToken), true);

        assetToken.mint(alice, ASSET_ID);
    }
}