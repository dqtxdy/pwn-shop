// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AssetToken
 * @dev Represents real-world physical assets (RWA) or standard NFTs to be used as collateral.
 * Note: Requires OpenZeppelin standard contracts
 */
contract AssetToken is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    constructor(address initialOwner) ERC721("Pawnshop Physical Asset", "RWA") Ownable(initialOwner) {}

    /**
     * @dev Mint a new physical asset token.
     * @param to The address receiving the NFT.
     * @param uri The metadata IPFS/HTTP link of the asset (images, valuation proof).
     */
    function mint(address to, string memory uri) public onlyOwner returns (uint256) {
        uint256 tokenId = ++_nextTokenId;
        _mint(to, tokenId);
        _setTokenURI(tokenId, uri);
        return tokenId;
    }

    // Required overrides
    function tokenURI(uint256 tokenId) public view override(ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}