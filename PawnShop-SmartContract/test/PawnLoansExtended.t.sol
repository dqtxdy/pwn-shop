// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BaseSetup.t.sol";

contract PawnLoansExtendedTest is BaseSetup {
    
    function setUp() public override {
        super.setUp();
        // Cấp KYC cho Alice
        vm.prank(admin);
        protocol.setKYCStatus(alice, true);
        
        // Cập nhật định giá cho ASSET_ID
        vm.prank(oracle);
        protocol.updateAppraisal(ASSET_ID, 10_000 * 10**18, 6000, 500, true);
    }

    function test_LiquidatePawn() public {
        // Alice tạo khoản vay
        vm.startPrank(alice);
        assetToken.approve(address(protocol), ASSET_ID);
        protocol.createPawnLoan(ASSET_ID, 30, 5_000 * 10**18);
        vm.stopPrank();

        // Thử thanh lý trước hạn -> Phải fail
        vm.prank(admin);
        vm.expectRevert(bytes4(keccak256("LoanNotMature()")));
        protocol.liquidatePawn(ASSET_ID);

        // Nhảy thời gian 31 ngày (vượt quá 30 ngày)
        vm.warp(block.timestamp + 31 days);

        // Admin thanh lý
        vm.prank(admin);
        protocol.liquidatePawn(ASSET_ID);

        // Kiểm tra loan đã inactive
        (, , , , , bool isActive, ) = protocol.pawns(ASSET_ID);
        assertFalse(isActive, "Loan should be inactive after liquidation");
        
        // NFT vẫn nằm ở protocol (Protocol sở hữu sau khi thanh lý)
        assertEq(assetToken.ownerOf(ASSET_ID), address(protocol), "Protocol should keep the NFT");
    }

    function test_FailCreateLoanWithoutKYC() public {
        // Bob chưa có KYC
        vm.prank(admin);
        assetToken.mint(bob, 2);
        
        vm.prank(oracle);
        protocol.updateAppraisal(2, 10_000 * 10**18, 6000, 500, true);

        vm.startPrank(bob);
        assetToken.approve(address(protocol), 2);
        vm.expectRevert(bytes4(keccak256("KYCRequired()")));
        protocol.createPawnLoan(2, 30, 5_000 * 10**18);
        vm.stopPrank();
    }

    function test_FailStaleAppraisal() public {
        // Nhảy thời gian 31 ngày sau khi appraisal được tạo ở setUp
        vm.warp(block.timestamp + 31 days);

        vm.startPrank(alice);
        assetToken.approve(address(protocol), ASSET_ID);
        vm.expectRevert(bytes4(keccak256("StaleAppraisal()")));
        protocol.createPawnLoan(ASSET_ID, 30, 5_000 * 10**18);
        vm.stopPrank();
    }

    function test_DisputeFlow() public {
        // Alice tạo khoản vay và bị thanh lý
        vm.startPrank(alice);
        assetToken.approve(address(protocol), ASSET_ID);
        protocol.createPawnLoan(ASSET_ID, 30, 5_000 * 10**18);
        vm.stopPrank();

        vm.warp(block.timestamp + 31 days);
        vm.prank(admin);
        protocol.liquidatePawn(ASSET_ID);

        // Alice mở dispute
        vm.prank(alice);
        protocol.openDispute(ASSET_ID, "ipfs://evidence");

        (address initiator, string memory evidence, bool isResolved, bool userWins) = protocol.disputes(ASSET_ID);
        assertEq(initiator, alice);
        assertEq(evidence, "ipfs://evidence");
        assertFalse(isResolved);

        // Admin giải quyết dispute, Alice thắng
        vm.prank(admin);
        protocol.resolveDispute(ASSET_ID, true);

        (, , isResolved, userWins) = protocol.disputes(ASSET_ID);
        assertTrue(isResolved);
        assertTrue(userWins);
    }
}
