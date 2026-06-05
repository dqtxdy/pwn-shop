// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";

contract PawnAdminSafetyTest is BaseSetup {
    function _createLoan() internal {
        vm.prank(admin);
        protocol.setKYCStatus(alice, true);

        vm.prank(oracle);
        protocol.updateAppraisal(ASSET_ID, 10_000 * 10**18, 6000, 500, true);

        vm.startPrank(alice);
        assetToken.approve(address(protocol), ASSET_ID);
        protocol.createPawnLoan(ASSET_ID, 30, 5_000 * 10**18);
        vm.stopPrank();
    }

    function test_WithdrawOnlyAccruedFees() public {
        _createLoan();

        vm.prank(admin);
        vm.expectRevert("Insufficient accrued fees");
        protocol.withdrawFees(address(paymentToken), admin, 501 * 10**18);

        vm.prank(admin);
        protocol.withdrawFees(address(paymentToken), admin, 500 * 10**18);

        assertEq(paymentToken.balanceOf(admin), 500 * 10**18, "Admin withdraws only recorded fees");
        assertEq(protocol.protocolFees(address(paymentToken)), 0, "Fee ledger is decremented");
    }

    function test_RescueBlocksActiveLoanAsset() public {
        _createLoan();

        vm.prank(admin);
        vm.expectRevert(bytes4(keccak256("AssetLocked()")));
        protocol.rescueAsset(ASSET_ID, admin, "ipfs://ops-note");
    }

    function test_RescueLiquidatedAsset() public {
        _createLoan();

        vm.warp(block.timestamp + 31 days);
        vm.prank(admin);
        protocol.liquidatePawn(ASSET_ID);

        vm.prank(admin);
        protocol.rescueAsset(ASSET_ID, admin, "ipfs://ops-note");

        assertEq(assetToken.ownerOf(ASSET_ID), admin, "Admin can recover an unlocked protocol-custodied asset");
    }
}
