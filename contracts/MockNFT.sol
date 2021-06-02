// FOR TESTING PURPOSES - DO NOT AUDIT!

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockNFT is ERC721("MockNFT", "mNFT") {
    function mint(address to, uint256 tokenId) public {
        _safeMint(to, tokenId, "");
    }

    function transfer(address from, address to, uint256 tokenId) public {
        _safeTransfer(from, to, tokenId, "");
    }
}