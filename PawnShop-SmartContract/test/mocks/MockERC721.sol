// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MockERC721
 * @dev Phiên bản giả lập siêu nhỏ gọn của ERC721 (NFT) để chạy test
 */
contract MockERC721 {
    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => address) public getApproved;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    function mint(address to, uint256 tokenId) external {
        ownerOf[tokenId] = to;
    }

    function approve(address spender, uint256 tokenId) external {
        require(msg.sender == ownerOf[tokenId], "ERC721: approve caller is not owner");
        getApproved[tokenId] = spender;
    }

    function setApprovalForAll(address operator, bool approved) external {
        isApprovedForAll[msg.sender][operator] = approved;
    }

    function transferFrom(address from, address to, uint256 tokenId) external {
        require(ownerOf[tokenId] == from, "ERC721: transfer from incorrect owner");
        require(
            msg.sender == from || getApproved[tokenId] == msg.sender || isApprovedForAll[from][msg.sender],
            "ERC721: caller is not owner nor approved"
        );
        getApproved[tokenId] = address(0);
        ownerOf[tokenId] = to;
    }
}
