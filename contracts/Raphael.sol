// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./IStaking.sol";
import "./IVITA.sol";

contract Raphael is ERC721Holder, Ownable, ReentrancyGuard {
    // Different stages of a proposal
    enum ProposalStatus {
        VOTING_NOT_STARTED,
        VOTING,
        VOTES_FINISHED,
        RESOLVED,
        CANCELLED,
        QUORUM_FAILED
    }

    struct Proposal {
        string details;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 startBlock;
        uint256 endBlock;
        ProposalStatus status;
    }

    // key is a self-incrementing number
    mapping(uint256 => Proposal) private proposals;

    mapping(uint256 => mapping(address => bool)) private voted; //global voted mapping

    uint256 public proposalCount;
    uint256 public minVotesNeeded;

    address private nativeTokenAddress;
    address private stakingContractAddress;
    address[] private nftContractAddresses;
    IVITA nativeTokenContract;
    IStaking stakingContract;

    bool private shutdown = false;

    uint256 public CREATE_TO_VOTE_PROPOSAL_DELAY = 18500; // ~3 days
    uint256 public VOTING_DURATION = 30850; // ~5 days

    // commenting out for testing
    uint256 public constant MIN_DURATION = 5; // testing value
    uint256 public constant MAX_DURATION = 190000; // ~1 month

    event VotingDelayChanged(uint256 newDuration);
    event VotingDurationChanged(uint256 newDuration);
    event NativeTokenChanged(
        address newAddress,
        address oldAddress,
        address changedBy
    );
    event StakingAddressChanged(
        address newAddress,
        address oldAddress,
        address changedBy
    );
    event NativeTokenTransferred(
        address authorizedBy,
        address to,
        uint256 amount
    );
    event NFTReceived(address nftContract, address sender, uint256 tokenId);
    event NFTTransferred(address nftContract, address to, uint256 tokenId);
    event EmergencyShutdown(address triggeredBy, uint256 currentBlock);
    event EmergencyProposalCancellation(address triggeredBy, uint256 index);
    event EmergencyNFTApproval(
        address triggeredBy,
        address[] nftContractAddresses
    );

    event ProposalCreated(
        uint256 proposalId,
        string details,
        uint256 vote_start,
        uint256 vote_end
    );
    event ProposalStatusChanged(uint256 proposalId, ProposalStatus newStatus);

    event Voted(address voter, uint256 proposalId, uint256 weight, bool direction);

    modifier notShutdown() {
        require(!shutdown, "cannot be called after shutdown");
        _;
    }

    constructor() Ownable() {
        proposalCount = 0; //starts with 0 proposals
        minVotesNeeded = 9644832 * 1e17; // 5% of initial distribution
    }

    /**
     * @dev returns all data for a specified proposal
     * @param proposalIndex           uint index of proposal
     * @return string, 5 x uint (the parts of a Proposal object)
     */
    function getProposalData(uint256 proposalIndex)
        public
        view
        returns (
            string memory,
            uint256,
            uint256,
            uint256,
            uint256,
            uint8
        )
    {
        require(proposalIndex <= proposalCount, "Proposal doesn't exist");
        return (
            proposals[proposalIndex].details,
            proposals[proposalIndex].votesFor,
            proposals[proposalIndex].votesAgainst,
            proposals[proposalIndex].startBlock,
            proposals[proposalIndex].endBlock,
            uint8(proposals[proposalIndex].status)
        );
    }

    /**
     * @dev returns result of a proposal
     * @param proposalIndex           uint index of proposal
     * @return true if proposal passed, otherwise false
     */
    function getProposalResult(uint256 proposalIndex)
        public
        view
        returns (bool)
    {
        require(proposalIndex <= proposalCount, "Proposal doesn't exist");
        require(
            proposals[proposalIndex].status == ProposalStatus.VOTES_FINISHED ||
                proposals[proposalIndex].status == ProposalStatus.RESOLVED ||
                proposals[proposalIndex].status == ProposalStatus.QUORUM_FAILED,
            "Proposal must be after voting"
        );
        bool result; // is already false, only need to cover the true case
        if (proposals[proposalIndex].votesFor >
            proposals[proposalIndex].votesAgainst && (
                proposals[proposalIndex].status == ProposalStatus.VOTES_FINISHED ||
                proposals[proposalIndex].status == ProposalStatus.RESOLVED   
            )) {
            result = true;
        }

        return result;
    }

    /**
     * @dev returns minimum amount of votes needed for a proposal to pass
     * @return minVotesNeeded value
     */
    function getMinVotesNeeded() public view returns (uint256) {
        return minVotesNeeded;
    }

    /**
     * @dev returns address of the token associated with the DAO
     *
     * @return the address of the token contract
     */
    function getNativeTokenAddress() public view returns (address) {
        return nativeTokenAddress;
    }

    /**
     * @dev returns the DAO's balance of the native token
     */
    function getNativeTokenBalance() public view returns (uint256) {
        return nativeTokenContract.balanceOf(address(this));
    }

    /**
     * @dev returns an array of the NFTs owned by the DAO
     *
     * @return an array of nft structs
     */
    function getNftContractAddresses() public view returns (address[] memory) {
        return nftContractAddresses;
    }

    function getStakingAddress() public view returns (address) {
        return stakingContractAddress;
    }

    /**
     * @dev returns if DAO is shutdown or not
     */
    function isShutdown() public view returns (bool) {
        return shutdown;
    }

    /****************************
     * STATE CHANGING FUNCTIONS *
     ***************************/

    ////////////////////////
    // PLATFORM VARIABLES //
    ////////////////////////

    function setVotingDelayDuration(uint256 newDuration) public onlyOwner {
        require(
            newDuration > MIN_DURATION && newDuration < MAX_DURATION,
            "duration must be >5 <190000"
        );
        CREATE_TO_VOTE_PROPOSAL_DELAY = newDuration;

        emit VotingDelayChanged(newDuration);
    }

    function setVotingDuration(uint256 newDuration) public onlyOwner {
        require(
            newDuration > MIN_DURATION && newDuration < MAX_DURATION,
            "duration must be >5 <190000"
        );
        VOTING_DURATION = newDuration;

        emit VotingDurationChanged(newDuration);
    }

    /**
     * @dev Updates the min total votes needed for a proposal to pass
     * @param newVotesNeeded          uint new min vote threshold
     */
    function setMinVotesNeeded(uint256 newVotesNeeded)
        public
        onlyOwner
        notShutdown
    {
        require(newVotesNeeded > 0, "quorum cannot be 0");
        require(
            newVotesNeeded < nativeTokenContract.totalSupply(),
            "votes needed > token supply"
        );
        minVotesNeeded = newVotesNeeded;
    }

    /**
     * @dev allows admins to set the address of the staking contract associated with the DAO
     *
     * @param _stakingContractAddress  the (new) address of the staking contract
     */
    function setStakingAddress(address _stakingContractAddress)
        public
        onlyOwner
        notShutdown
    {
        address oldAddress = stakingContractAddress;
        stakingContractAddress = _stakingContractAddress;
        stakingContract = IStaking(stakingContractAddress);
        emit StakingAddressChanged(
            stakingContractAddress,
            oldAddress,
            _msgSender()
        );
    }

    /**
     * @dev allows admins to set the address of the token associated with the DAO
     *
     * @param tokenContractAddress  the address of the ERC20 asset
     */
    function setNativeTokenAddress(address tokenContractAddress)
        public
        onlyOwner
        notShutdown
    {
        address oldAddress = nativeTokenAddress;
        nativeTokenAddress = tokenContractAddress;
        nativeTokenContract = IVITA(nativeTokenAddress);
        emit NativeTokenChanged(nativeTokenAddress, oldAddress, _msgSender());
    }

    //////////////////////////
    // PROPOSALS AND VOTING //
    //////////////////////////

    /**
     * @dev Creates a proposal
     * @param details           string with proposal details
     *
     */
    function createProposal(string memory details)
        public
        notShutdown
        nonReentrant
    {
        require(
            stakingContract.getStakedBalance(_msgSender()) > 0,
            "must stake to create proposal"
        );
        uint256 start_block = block.number + CREATE_TO_VOTE_PROPOSAL_DELAY;
        uint256 end_block = start_block + VOTING_DURATION;

        Proposal memory newProposal =
            Proposal(
                details,
                0, //votesFor
                0, //votesAgainst
                start_block,
                end_block,
                ProposalStatus.VOTING_NOT_STARTED
            );

        require(
            stakingContract.voted(_msgSender(), newProposal.endBlock),
            "createProposal: token lock fail"
        );
        proposalCount += 1;
        // Add new Proposal instance
        proposals[proposalCount] = newProposal;

        // lock staked tokens for duration of proposal

        emit ProposalCreated(proposalCount, details, start_block, end_block);
    }

    /**
     * @dev Moves proposal to the status it should be in
     *
     * @param proposalIndex          uint proposal key
     */
    function updateProposalStatus(uint256 proposalIndex) public notShutdown {
        require(proposalIndex <= proposalCount, "Proposal doesn't exist");

        Proposal memory currentProp = proposals[proposalIndex];
        // Can't change status of CANCELLED or RESOLVED proposals
        require(
            currentProp.status != ProposalStatus.CANCELLED,
            "Proposal cancelled"
        );
        require(
            currentProp.status != ProposalStatus.RESOLVED,
            "Proposal already resolved"
        );
        require(
            currentProp.status != ProposalStatus.QUORUM_FAILED,
            "Proposal failed to meet quorum"
        );

        // revert if no change needed
        if (
            // still before voting period
            currentProp.status == ProposalStatus.VOTING_NOT_STARTED &&
            block.number < currentProp.startBlock
        ) {
            revert("Too early to move to voting");
        } else if (
            // still in voting period
            currentProp.status == ProposalStatus.VOTING &&
            block.number >= currentProp.startBlock &&
            block.number <= currentProp.endBlock
        ) {
            revert("Still in voting period");
        }

        if (
            block.number >= currentProp.startBlock &&
            block.number <= currentProp.endBlock &&
            currentProp.status != ProposalStatus.VOTING
        ) {
            currentProp.status = ProposalStatus.VOTING;
        } else if (
            block.number < currentProp.startBlock &&
            currentProp.status != ProposalStatus.VOTING_NOT_STARTED
        ) {
            currentProp.status = ProposalStatus.VOTING_NOT_STARTED;
        } else if (
            block.number > currentProp.endBlock &&
            currentProp.status != ProposalStatus.VOTES_FINISHED
        ) {
            if (
                currentProp.votesFor + currentProp.votesAgainst >=
                minVotesNeeded
            ) {
                currentProp.status = ProposalStatus.VOTES_FINISHED;
            } else {
                currentProp.status = ProposalStatus.QUORUM_FAILED;
            }
        }

        // Save changes in the proposal mapping
        proposals[proposalIndex] = currentProp;

        emit ProposalStatusChanged(proposalIndex, currentProp.status);
    }

    /**
     * @dev Only for setting proposal to RESOLVED.
     * @dev Only callable from the multi-sig
     * @param proposalIndex          uint proposal key
     *
     */
    function setProposalToResolved(uint256 proposalIndex)
        public
        onlyOwner
        notShutdown
    {
        require(proposalIndex <= proposalCount, "Proposal doesn't exist");
        require(
            proposals[proposalIndex].status == ProposalStatus.VOTES_FINISHED,
            "Proposal not in VOTES_FINISHED"
        );
        proposals[proposalIndex].status = ProposalStatus.RESOLVED;
        emit ProposalStatusChanged(proposalIndex, ProposalStatus.RESOLVED);
    }

    /**
     * @dev Only for setting proposal to CANCELLED.
     * @dev Only callable from the multi-sig
     * @param proposalIndex          uint proposal key
     *
     */
    function setProposalToCancelled(uint256 proposalIndex)
        public
        onlyOwner
        notShutdown
    {
        require(proposalIndex <= proposalCount, "Proposal doesn't exist");
        require(
            proposals[proposalIndex].status != ProposalStatus.VOTES_FINISHED,
            "Can't cancel if vote finished"
        );
        require(
            proposals[proposalIndex].status != ProposalStatus.RESOLVED,
            "Proposal already resolved"
        );
        require(
            proposals[proposalIndex].status != ProposalStatus.QUORUM_FAILED,
            "Proposal already failed quorum"
        );
        require(
            proposals[proposalIndex].status != ProposalStatus.CANCELLED,
            "Proposal already cancelled"
        );

        proposals[proposalIndex].status = ProposalStatus.CANCELLED;
        emit ProposalStatusChanged(proposalIndex, ProposalStatus.CANCELLED);
    }

    /**
     * @dev Allows any address to vote on a proposal
     * @param proposalIndex           key to proposal in mapping
     * @param _vote                   true = for, false = against
     */
    function vote(uint256 proposalIndex, bool _vote) public notShutdown {
        uint256 stakedBalance = stakingContract.getStakedBalance(_msgSender());
        require(stakedBalance > 0, "must stake to vote");
        // check msg.sender hasn't already voted
        require(
            voted[proposalIndex][_msgSender()] == false,
            "Already voted from this address"
        );

        Proposal memory currentProp = proposals[proposalIndex];

        // Call updateProposalStatus() if proposal should be in VOTING stage
        require(
            currentProp.status == ProposalStatus.VOTING &&
                block.number <= currentProp.endBlock,
            "Proposal not in voting period"
        );

        // TODO add delegated voting power here - post-MVP

        if (_vote) {
            currentProp.votesFor += stakedBalance;
        } else {
            currentProp.votesAgainst += stakedBalance;
        }

        voted[proposalIndex][_msgSender()] = true;
        require(
            stakingContract.voted(
                _msgSender(),
                proposals[proposalIndex].endBlock
            ),
            "vote: token lock fail"
        );

        // Save changes in the proposal mapping
        proposals[proposalIndex] = currentProp;

        emit Voted(_msgSender(), proposalIndex, stakedBalance, _vote);
    }

    function delegate(address delegateAddress) public {}

    //////////////////////
    // ASSET MANAGEMENT //
    //////////////////////

    /**
     * @dev                 enables DAO to mint native tokens
     * @param _amount       the amount of tokens to mint
     */
    function mintNativeToken(uint256 _amount) public onlyOwner notShutdown {
        require(_amount > 0, "Can't mint 0 tokens");
        
        nativeTokenContract.mint(address(this), _amount);
    } 

    /**
     * @dev enables DAO to transfer the token it is associated with
     *
     * @param to                    the address to send tokens to
     * @param amount                the amount to send
     *
     * @return success or fail bool
     */
    function transferNativeToken(address to, uint256 amount)
        public
        onlyOwner
        notShutdown
        returns (bool)
    {
        require(
            nativeTokenContract.transfer(to, amount),
            "ERC20 transfer failed"
        );

        emit NativeTokenTransferred(_msgSender(), to, amount);
        return true;
    }

    /**
     * @dev enables DAO to transfer NFTs received
     *
     * @param nftContractAddress    the address of the NFT contract
     * @param recipient             the address to send the NFT to
     * @param tokenId               the id of the token in the NFT contract
     *
     * @return success or fail bool
     */
    function transferNFT(
        address nftContractAddress,
        address recipient,
        uint256 tokenId
    ) public onlyOwner notShutdown returns (bool) {
        IERC721 nftContract = IERC721(nftContractAddress);
        nftContract.safeTransferFrom(
            address(this),
            recipient,
            tokenId // what if there isn't one?
        );
        require(
            nftContract.ownerOf(tokenId) == recipient,
            "NFT transfer failed"
        );

        if (nftContract.balanceOf(address(this)) == 0) {
            for (uint256 i = 0; i < nftContractAddresses.length; i++) {
                if (nftContractAddresses[i] == nftContractAddress) {
                    delete nftContractAddresses[i];
                    break;
                }
            }
        }

        emit NFTTransferred(nftContractAddress, recipient, tokenId);
        return true;
    }

    ////////////////////////
    // EMERGENCY SHUTDOWN //
    ////////////////////////

    /**
     * @dev allows the admins to shut down the DAO (proposals, voting, transfers)
     * and also sweeps out any NFTs and native tokens owned by the DAO
     *
     * @notice this is an irreversible process!
     */
    function emergencyShutdown() public onlyOwner notShutdown nonReentrant {
        require(getNativeTokenBalance() == 0, "transfer tokens before shutdown");

        // cancel all active proposals
        // there is no proposal in the zero slot
        for (uint256 i = 1; i <= proposalCount; i++) {
            if (
                proposals[i].status != ProposalStatus.RESOLVED &&
                proposals[i].status != ProposalStatus.QUORUM_FAILED
            ) {
                proposals[i].status = ProposalStatus.CANCELLED;
                emit EmergencyProposalCancellation(_msgSender(), i);
            }
        }

        stakingContract.emergencyShutdown(_msgSender());

        // approve all NFTs
        for (uint256 i = 0; i < nftContractAddresses.length; i++) {
            if (nftContractAddresses[i] != address(0)) {
                IERC721 nftContract = IERC721(nftContractAddresses[i]);
                if (!nftContract.isApprovedForAll(address(this), owner()))
                    nftContract.setApprovalForAll(owner(), true);
            }
        }
        emit EmergencyNFTApproval(_msgSender(), nftContractAddresses);

        shutdown = true;

        emit EmergencyShutdown(_msgSender(), block.number);
    }

    /**
     * @dev function for receiving and recording an NFT
     * @notice calls "super" to the OpenZeppelin function inherited
     *
     * @param operator          the sender of the NFT (I think)
     * @param from              not really sure, has generally been the zero address
     * @param tokenId           the tokenId of the NFT
     * @param data              any additional data sent with the NFT
     *
     * @return `IERC721Receiver.onERC721Received.selector`
     */
    function onERC721Received(
        address operator,
        address from,
        uint256 tokenId,
        bytes memory data
    ) public override notShutdown returns (bytes4) {
        bool duplicate = false;
        for (uint256 i = 0; i < nftContractAddresses.length; i++) {
            if (nftContractAddresses[i] == _msgSender()) {
                duplicate = true;
                break;
            }
        }
        if (!duplicate) nftContractAddresses.push(_msgSender());

        emit NFTReceived(_msgSender(), operator, tokenId);

        return super.onERC721Received(operator, from, tokenId, data);
    }
}
