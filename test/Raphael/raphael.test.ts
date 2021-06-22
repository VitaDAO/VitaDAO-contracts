import { ethers } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";
import { expect } from "chai";

import * as nftArtifact from "../../artifacts/contracts/MockNFT.sol/MockNFT.json";
import { skipBlocks, CREATE_TO_VOTE_PROPOSAL_DELAY, VOTING_DURATION } from "./utils";

const VITA_CAP = ethers.constants.WeiPerEther.mul(BigNumber.from(64298880))

const PROPOSAL_STATUS = {
    VOTING_NOT_STARTED: 0,
    VOTING: 1,
    VOTES_FINISHED: 2,
    RESOLVED: 3,
    CANCELLED: 4,
    QUORUM_FAILED: 5,
}

const MIN_QUORUM = ethers.utils.parseUnits("964483.2");

describe("Raphael DAO contract", () => {
    let accounts: Signer[];

    let admin: Signer;
    let user: Signer;

    let adminAddress: string;
    let userAddress: string;

    let raphael: Contract;
    let token: Contract;
    let staking: Contract;
    let nft: Contract;

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        admin = accounts[1];
        user = accounts[2];

        adminAddress = await admin.getAddress();
        userAddress = await user.getAddress();
    });

    // these tests will test code written in Raphael (inheritance separately)
    describe("Raphael", () => {
        beforeEach(async () => {
            const Raphael = await ethers.getContractFactory("Raphael");
            raphael = await Raphael.connect(admin).deploy();
            await raphael.deployed();
            await raphael.connect(admin).setVotingDelayDuration(CREATE_TO_VOTE_PROPOSAL_DELAY)
            await raphael.connect(admin).setVotingDuration(VOTING_DURATION)
        });


        describe("functions", () => {

            describe("Proposal and Voting functions", async () => {

                beforeEach(async () => {
                    let Token = await ethers.getContractFactory("VITA");
                    token = await Token.connect(admin).deploy("VITA Token", "VITA", VITA_CAP);
                    await token.deployed();
                    await token.connect(admin).transferOwnership(raphael.address)

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(ethers.constants.AddressZero);

                    await raphael.connect(admin).setNativeTokenAddress(token.address);

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(token.address);

                    await raphael.connect(admin).mintNativeToken(VITA_CAP)
                    expect(await token.balanceOf(raphael.address)).to.equal(VITA_CAP)
                    await raphael.connect(admin).transferNativeToken(adminAddress, MIN_QUORUM);
                    await raphael.connect(admin).transferNativeToken(userAddress, MIN_QUORUM);

                    const Staking = await ethers.getContractFactory("Staking");
                    staking = await Staking.deploy(token.address, raphael.address);
                    await staking.deployed();

                    await raphael.connect(admin).setStakingAddress(staking.address);

                    expect(await raphael.getStakingAddress())
                        .to.equal(staking.address);

                    await token.connect(admin).approve(staking.address, MIN_QUORUM);
                    await token.connect(user).approve(staking.address, MIN_QUORUM);

                    await staking.connect(admin).stake(MIN_QUORUM);
                    await staking.connect(user).stake(MIN_QUORUM);
                });

                // tests createProposal()
                it("creates first proposal", async () => {
                    // Should start with 0 proposals
                    expect(await raphael.proposalCount()).to.equal(0);
                    let blockNumber = await ethers.provider.getBlockNumber() + 1;
                    await expect(raphael.connect(admin).createProposal("Proposal 1 details"))
                        .to.emit(raphael, 'ProposalCreated')
                        .withArgs(BigNumber.from("1"), "Proposal 1 details", BigNumber.from(blockNumber + CREATE_TO_VOTE_PROPOSAL_DELAY + ""), BigNumber.from(blockNumber + CREATE_TO_VOTE_PROPOSAL_DELAY + VOTING_DURATION + ""));
                    expect(await raphael.proposalCount()).to.equal(1);
                });

                // tests createProposal()
                it("creates 3 proposals", async () => {
                    // Should start with 0 proposals
                    expect(await raphael.proposalCount()).to.equal(0);
                    let blockNumber = await ethers.provider.getBlockNumber() + 1;
                    await expect(raphael.connect(admin).createProposal("Proposal 1 details"))
                        .to.emit(raphael, 'ProposalCreated')
                        .withArgs(BigNumber.from("1"), "Proposal 1 details", BigNumber.from(blockNumber + CREATE_TO_VOTE_PROPOSAL_DELAY + ""), BigNumber.from(blockNumber + CREATE_TO_VOTE_PROPOSAL_DELAY + VOTING_DURATION + ""));

                    expect(await raphael.proposalCount()).to.equal(1);

                    blockNumber = await ethers.provider.getBlockNumber() + 1;
                    await expect(raphael.connect(admin).createProposal("Proposal 2 details"))
                        .to.emit(raphael, 'ProposalCreated')
                        .withArgs(BigNumber.from("2"), "Proposal 2 details", BigNumber.from(blockNumber + CREATE_TO_VOTE_PROPOSAL_DELAY + ""), BigNumber.from(blockNumber + CREATE_TO_VOTE_PROPOSAL_DELAY + VOTING_DURATION + ""));
                    expect(await raphael.proposalCount()).to.equal(2);

                    blockNumber = await ethers.provider.getBlockNumber() + 1;
                    await expect(raphael.connect(admin).createProposal("Proposal 3 details"))
                        .to.emit(raphael, 'ProposalCreated')
                        .withArgs(BigNumber.from("3"), "Proposal 3 details", BigNumber.from(blockNumber + CREATE_TO_VOTE_PROPOSAL_DELAY + ""), BigNumber.from(blockNumber + CREATE_TO_VOTE_PROPOSAL_DELAY + VOTING_DURATION + ""));
                    expect(await raphael.proposalCount()).to.equal(3);
                });


                // tests vote()
                it("can't vote on proposal before voting period", async () => {
                    // Should start with 0 proposals
                    expect(await raphael.proposalCount()).to.equal(0);
                    let tx = await (await raphael.connect(admin).createProposal("Proposal n details")).wait()
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { proposalId, vote_start } = filteredEvents[0];

                    // check user's balance (voting power)
                    let userBalance = await token.balanceOf(userAddress)

                    // user must have tokens to vote
                    expect(userBalance.gt(ethers.constants.Zero));
                    // block must be before voting period
                    expect(vote_start.gt(BigNumber.from(tx.blockNumber + '')));

                    await expect(
                        raphael.connect(user).vote(proposalId, true)
                    ).to.be.revertedWith("Proposal not in voting period");

                    let proposalData = await raphael.getProposalData(proposalId)
                    let votesFor = proposalData[1]
                    let votesAgainst = proposalData[2]

                    // expect no votes for or against
                    expect(votesFor.eq(ethers.constants.Zero))
                    expect(votesAgainst.eq(ethers.constants.Zero))
                });

                it("can't create a proposal with zero stake", async () => {
                    const userStakedBalance = await staking.getStakedBalance(userAddress);
                    await staking.connect(user).withdraw(userStakedBalance);
                    expect(await staking.getStakedBalance(userAddress))
                        .to.equal(ethers.constants.Zero);

                    await expect(raphael.connect(user).createProposal("This is going to fail"))
                        .to.be.revertedWith("must stake to create proposal");
                });

                it("can't vote with zero stake", async () => {
                    expect(await raphael.proposalCount()).to.equal(0);
                    let tx = await (await raphael.connect(admin).createProposal("Proposal n details")).wait()
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { proposalId, vote_start } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber))

                    await skipBlocks(blocks_skipped)

                    tx = await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait()
                    let status = (await raphael.getProposalData(proposalId))[5]
                    expect(status).to.equal((BigNumber.from(PROPOSAL_STATUS.VOTING))) // now in voting period

                    let userStakedBalance = await staking.getStakedBalance(userAddress);
                    await staking.connect(user).withdraw(userStakedBalance);
                    expect(await staking.getStakedBalance(userAddress))
                        .to.equal(ethers.constants.Zero);

                    await expect(raphael.connect(user).vote(BigNumber.from("1"), true))
                        .to.be.revertedWith("must stake to vote");
                });

                // tests vote()
                it("can vote on proposal in voting period", async () => {
                    // Should start with 0 proposals
                    expect(await raphael.proposalCount()).to.equal(0);
                    let tx = await (await raphael.connect(admin).createProposal("Proposal n details")).wait()
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { proposalId, vote_start } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber))

                    await skipBlocks(blocks_skipped)

                    // updateProposalStatus to 1 = VOTING
                    tx = await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait()
                    let status = (await raphael.getProposalData(proposalId))[5]
                    expect(status).to.equal((BigNumber.from(PROPOSAL_STATUS.VOTING))) // now in voting period

                    // check user's balance (voting power)
                    let userStakedBalance = await staking.getStakedBalance(userAddress)
                    // user votes true (for)
                    await raphael.connect(user).vote(proposalId, true)
                    // check current votes for and against proposal
                    let proposalData = await raphael.getProposalData(proposalId)
                    let votesFor = proposalData[1]
                    let votesAgainst = proposalData[2]

                    // expect votesFor to be user's token balance
                    expect(votesFor).to.equal(userStakedBalance);
                    // expect no votes against
                    expect(votesAgainst.eq(ethers.constants.Zero))
                });

                it("weights voting properly", async () => {
                    expect(await raphael.proposalCount()).to.equal(0);
                    let tx = await (await raphael.connect(admin).createProposal("Proposal n details")).wait()
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { proposalId, vote_start } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber))

                    await skipBlocks(blocks_skipped)

                    tx = await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait()
                    let status = (await raphael.getProposalData(proposalId))[5]
                    expect(status).to.equal((BigNumber.from(PROPOSAL_STATUS.VOTING))) // now in voting period

                    const userStakedBalance = await staking.getStakedBalance(userAddress);

                    await raphael.connect(user).vote(proposalId, true);

                    let proposalData = await raphael.getProposalData(proposalId)
                    let votesFor = proposalData[1]

                    expect(votesFor).to.equal(userStakedBalance);
                });

                it("voting can increase time tokens are locked in staking contract", async () => {
                    const origLockedUntil = (await staking.getUnlockTime(userAddress));

                    expect(await raphael.proposalCount()).to.equal(0);
                    let tx = await (await raphael.connect(user).createProposal("Proposal n details")).wait()
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { proposalId, vote_start } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber))

                    await skipBlocks(blocks_skipped)

                    tx = await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait()
                    let status = (await raphael.getProposalData(proposalId))[5]
                    expect(status).to.equal((BigNumber.from(PROPOSAL_STATUS.VOTING))) // now in voting period

                    let userStakedBalance = await staking.getStakedBalance(userAddress)
                    await raphael.connect(user).vote(proposalId, true)

                    const newLockedUntil = (await staking.getUnlockTime(userAddress));

                    expect(newLockedUntil.gt(origLockedUntil)).to.be.true;
                });

                it("end block is the last block where votes can be cast", async () => {
                    expect(await raphael.proposalCount()).to.equal(0);
                    let tx = await (await raphael.connect(admin).createProposal("Proposal n details")).wait()
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { proposalId, vote_start, vote_end } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber))

                    await skipBlocks(blocks_skipped)

                    // updateProposalStatus to 1 = VOTING
                    tx = await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait()
                    let status = (await raphael.getProposalData(proposalId))[5]
                    expect(status).to.equal((BigNumber.from(PROPOSAL_STATUS.VOTING))) // now in voting period

                    // check user's balance (voting power)
                    let userStakedBalance = await staking.getStakedBalance(userAddress)

                    // the +2 is to account for the two blocks mined since
                    blocks_skipped = vote_end.sub((await ethers.provider.getBlockNumber()) + 1);
                    await skipBlocks(blocks_skipped);
                    // user votes true (for)
                    await raphael.connect(user).vote(proposalId, true);

                    // the user vote should push past the voting period
                    await expect(raphael.connect(admin).vote(proposalId, true))
                        .to.be.revertedWith("Proposal not in voting period");

                    // check current votes for and against proposal
                    let proposalData = await raphael.getProposalData(proposalId)
                    let votesFor = proposalData[1]
                    let votesAgainst = proposalData[2]

                    // expect votesFor to be user's token balance
                    expect(votesFor).to.equal(userStakedBalance);
                    // expect no votes against
                    expect(votesAgainst.eq(ethers.constants.Zero))
                });

                // tests getProposalResult() and setProposalToResolved()
                it("can get a TRUE result after resolved proposal", async () => {
                    // Should start with 0 proposals
                    expect(await raphael.proposalCount()).to.equal(0);
                    let tx = await (await raphael.connect(admin).createProposal("Proposal n details")).wait()
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { proposalId, vote_start, vote_end } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber))

                    await skipBlocks(blocks_skipped)

                    // updateProposalStatus to 1 = VOTING
                    tx = await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait()
                    let status = (await raphael.getProposalData(proposalId))[5]
                    expect(status).to.equal((BigNumber.from(PROPOSAL_STATUS.VOTING))) // now in voting period

                    // user votes true (for)
                    await raphael.connect(user).vote(proposalId, true)

                    await skipBlocks(BigNumber.from(VOTING_DURATION))

                    await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait()

                    // check its passed the voting period
                    expect(vote_end.lte(BigNumber.from(tx.blockNumber + '')))
                    // voting must be finished to set to resolved
                    expect((await raphael.getProposalData(proposalId))[5]).to.equal(PROPOSAL_STATUS.VOTES_FINISHED);

                    // admin sets proposal to resolved
                    tx = await (await raphael.connect(admin).setProposalToResolved(proposalId)).wait()

                    // check proposal is resolved
                    expect((await raphael.getProposalData(proposalId))[5]).to.equal(PROPOSAL_STATUS.RESOLVED);
                    // proposal result should be for (true)
                    expect(await raphael.getProposalResult(proposalId)).to.equal(true);
                });

                // tests getProposalResult() and setProposalToResolved()
                it("can get an FALSE result after resolved proposal", async () => {
                    // Should start with 0 proposals
                    expect(await raphael.proposalCount()).to.equal(0);
                    let tx = await (await raphael.connect(admin).createProposal("Proposal n details")).wait()
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { proposalId, vote_start, vote_end } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber))

                    await skipBlocks(blocks_skipped)

                    // updateProposalStatus to 1 = VOTING
                    tx = await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait()
                    let status = (await raphael.getProposalData(proposalId))[5]
                    expect(status).to.equal((BigNumber.from(PROPOSAL_STATUS.VOTING))) // now in voting period

                    // user votes false (against)
                    await raphael.connect(user).vote(proposalId, false)

                    await skipBlocks(BigNumber.from(VOTING_DURATION))

                    await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait()

                    // check its passed the voting period
                    expect(vote_end.lte(BigNumber.from(tx.blockNumber + '')))
                    // voting must be finished to set to resolved
                    expect((await raphael.getProposalData(proposalId))[5]).to.equal(PROPOSAL_STATUS.VOTES_FINISHED);

                    // admin sets proposal to resolved
                    tx = await (await raphael.connect(admin).setProposalToResolved(proposalId)).wait()

                    // check proposal is resolved
                    expect((await raphael.getProposalData(proposalId))[5]).to.equal(PROPOSAL_STATUS.RESOLVED);
                    // proposal result should be against (false)
                    expect(await raphael.getProposalResult(proposalId)).to.equal(false);
                });

                it("gives FALSE result if quorum fails", async () => {
                    // set quorum
                    await raphael.connect(admin).setMinVotesNeeded(MIN_QUORUM.mul(2));

                    // Should start with 0 proposals
                    expect(await raphael.proposalCount()).to.equal(0);
                    let tx = await (await raphael.connect(admin).createProposal("Proposal n details")).wait()
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event ==="ProposalCreated")
                                                    .map((eventItem: any) => eventItem.args)
                    const { proposalId, vote_start, vote_end } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber))

                    await skipBlocks(blocks_skipped)

                    // updateProposalStatus to 1 = VOTING
                    tx = await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait()
                    let status = (await raphael.getProposalData(proposalId))[5]
                    expect(status).to.equal((BigNumber.from(PROPOSAL_STATUS.VOTING))) // now in voting period

                    // user votes true (for)
                    await raphael.connect(user).vote(proposalId, true)

                    await skipBlocks(BigNumber.from(VOTING_DURATION))

                    await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait()

                    // check its passed the voting period
                    expect(vote_end.lte(BigNumber.from(tx.blockNumber + '')))

                    // check the status
                    expect((await raphael.getProposalData(proposalId))[5]).to.equal(PROPOSAL_STATUS.QUORUM_FAILED);

                    // proposal result should be against (false)
                    expect(await raphael.getProposalResult(proposalId)).to.equal(false);
                })

                it("owner can cancel proposal during voting period", async () => {
                    await raphael.connect(user).createProposal("Proposal 1");

                    const startBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;
                    const endBlock = startBlock + VOTING_DURATION;

                    await skipBlocks(BigNumber.from(startBlock - await ethers.provider.getBlockNumber()));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    expect(await raphael.connect(user).vote(BigNumber.from("1"), true));

                    await raphael.connect(admin).setProposalToCancelled(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.CANCELLED);
                });

                it("can't update nonexistant proposal", async () => {
                    await expect(raphael.connect(user).updateProposalStatus(BigNumber.from("2")))
                        .to.be.revertedWith("Proposal doesn't exist");
                });

                it("can't update resolved proposal", async () => {
                    await raphael.connect(user).createProposal("Proposal 1");

                    const startBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;
                    const endBlock = startBlock + VOTING_DURATION;

                    await skipBlocks(BigNumber.from(startBlock - await ethers.provider.getBlockNumber()));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    await raphael.connect(user).vote(BigNumber.from("1"), false);

                    await skipBlocks(BigNumber.from(endBlock - await ethers.provider.getBlockNumber()));

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTES_FINISHED);

                    await raphael.connect(admin).setProposalToResolved(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.RESOLVED);

                    await expect(raphael.connect(admin).updateProposalStatus(BigNumber.from("1")))
                        .to.be.revertedWith("Proposal already resolved");
                });

                it("can't update cancelled proposal", async () => {
                    await raphael.connect(user).createProposal("Proposal 1");

                    const startBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;
                    const endBlock = startBlock + VOTING_DURATION;

                    await skipBlocks(BigNumber.from(startBlock - await ethers.provider.getBlockNumber()));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    await raphael.connect(admin).setProposalToCancelled(BigNumber.from("1"));

                    await expect(raphael.connect(admin).updateProposalStatus(BigNumber.from("1")))
                        .to.be.revertedWith("Proposal cancelled");
                });

                it("can't update a proposal after quorum fails", async () => {
                    await raphael.connect(admin).setMinVotesNeeded(BigNumber.from("100"));

                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(BigNumber.from("100"));

                    await raphael.connect(user).createProposal("Proposal 1");

                    const startBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;
                    const endBlock = startBlock + VOTING_DURATION;

                    await skipBlocks(BigNumber.from(startBlock - await ethers.provider.getBlockNumber()));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    await skipBlocks(BigNumber.from(endBlock - await ethers.provider.getBlockNumber()));

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.QUORUM_FAILED);

                    await expect(raphael.connect(admin).updateProposalStatus(BigNumber.from("1")))
                        .to.be.revertedWith("Proposal failed to meet quorum");
                });

                it("can't start voting before time", async () => {
                    await raphael.connect(user).createProposal("Proposal 1");

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await expect(raphael.connect(admin).updateProposalStatus(BigNumber.from("1")))
                        .to.be.revertedWith("Too early to move to voting");
                });

                it("can't finish voting before time", async () => {
                    await raphael.connect(user).createProposal("Proposal 1");

                    const startBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;

                    await skipBlocks(BigNumber.from(startBlock - await ethers.provider.getBlockNumber()));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    await expect(raphael.connect(admin).updateProposalStatus(BigNumber.from("1")))
                        .to.be.revertedWith("Still in voting period");
                });

                it("updates from VOTING_NOT_STARTED to VOTING", async () => {
                    await raphael.connect(user).createProposal("Proposal 1");

                    const startBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;
                    const endBlock = startBlock + VOTING_DURATION;

                    await skipBlocks(BigNumber.from(startBlock - await ethers.provider.getBlockNumber()));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);
                });

                it("updates from VOTING to VOTES_FINISHED", async () => {
                    await raphael.connect(user).createProposal("Proposal 1");

                    const startBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;
                    const endBlock = startBlock + VOTING_DURATION;

                    await skipBlocks(BigNumber.from(startBlock - await ethers.provider.getBlockNumber()));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    expect(await raphael.connect(user).vote(BigNumber.from("1"), true));

                    await skipBlocks(BigNumber.from(endBlock - await ethers.provider.getBlockNumber()));

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTES_FINISHED);
                });

                it("can't resolve a nonexistant proposal", async () => {
                    await expect(raphael.connect(admin).setProposalToResolved(BigNumber.from("2")))
                        .to.be.revertedWith("Proposal doesn't exist")
                })

                it("can't resolve voting before VOTES_FINISHED", async () => {
                    await raphael.connect(user).createProposal("Proposal 1");

                    const startBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;
                    const endBlock = startBlock + VOTING_DURATION;

                    await skipBlocks(BigNumber.from(startBlock - await ethers.provider.getBlockNumber()));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    expect(await raphael.connect(user).vote(BigNumber.from("1"), true));

                    await expect(raphael.connect(admin).setProposalToResolved(BigNumber.from("1")))
                        .to.be.revertedWith("Proposal not in VOTES_FINISHED")
                });

                it("can't resolve a cancelled proposal", async () => {
                    await raphael.connect(user).createProposal("Proposal 1");

                    const startBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;
                    const endBlock = startBlock + VOTING_DURATION;

                    await skipBlocks(BigNumber.from(startBlock - await ethers.provider.getBlockNumber()));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    await raphael.connect(admin).setProposalToCancelled(BigNumber.from("1"));

                    await expect(raphael.connect(admin).setProposalToResolved(BigNumber.from("1")))
                        .to.be.revertedWith("Proposal not in VOTES_FINISHED")
                });

                it("can't cancel nonexistant proposal", async () => {
                    await expect(raphael.connect(admin).setProposalToCancelled(BigNumber.from("2")))
                        .to.be.revertedWith("Proposal doesn't exist")
                });

                it("can't cancel proposal after voting period", async () => {
                    await raphael.connect(user).createProposal("Proposal 1");

                    const startBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;
                    const endBlock = startBlock + VOTING_DURATION;

                    await skipBlocks(BigNumber.from(startBlock - await ethers.provider.getBlockNumber()));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    expect(await raphael.connect(user).vote(BigNumber.from("1"), true));

                    await skipBlocks(BigNumber.from(endBlock - await ethers.provider.getBlockNumber()));

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTES_FINISHED);

                    await expect(raphael.connect(admin).setProposalToCancelled(BigNumber.from("1")))
                        .to.be.revertedWith("Can't cancel if vote finished");
                });

                it("can't cancel a resolved proposal", async () => {
                    let tx = await (await raphael.connect(admin).createProposal("Proposal n details")).wait()
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { proposalId, details, vote_start, vote_end } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber))

                    await skipBlocks(blocks_skipped)

                    // updateProposalStatus to 1 = VOTING
                    tx = await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait()
                    expect((await raphael.getProposalData(proposalId))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    // user votes true (for)
                    await raphael.connect(user).vote(proposalId, true)

                    await skipBlocks(BigNumber.from(VOTING_DURATION))

                    await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait()

                    // check its passed the voting period
                    expect(vote_end.lte(BigNumber.from(tx.blockNumber + '')))
                    // voting must be finished to set to resolved
                    expect((await raphael.getProposalData(proposalId))[5]).to.equal(PROPOSAL_STATUS.VOTES_FINISHED);

                    // admin sets proposal to resolved
                    tx = await (await raphael.connect(admin).setProposalToResolved(proposalId)).wait()

                    // check proposal is resolved
                    expect((await raphael.getProposalData(proposalId))[5]).to.equal(PROPOSAL_STATUS.RESOLVED);
                    // proposal result should be for (true)
                    expect(await raphael.getProposalResult(proposalId)).to.equal(true);

                    await expect(raphael.connect(admin).setProposalToCancelled(BigNumber.from("1")))
                        .to.be.revertedWith("Proposal already resolved");
                });

                it("can't cancel proposal after quorum failed", async () => {
                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(MIN_QUORUM);

                    await staking.connect(user).withdraw((await staking.getStakedBalance(userAddress)).sub(1));

                    const tx = await (await raphael.connect(admin).createProposal("Proposal 1 details")).wait();
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { vote_start, vote_end } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber));

                    await skipBlocks(blocks_skipped);
                    await raphael.connect(admin).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    await raphael.connect(user).vote(BigNumber.from("1"), true);

                    await skipBlocks(vote_end.sub(await ethers.provider.getBlockNumber()));

                    expect(vote_end.lte(await ethers.provider.getBlockNumber())).to.be.true;

                    await raphael.connect(admin).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.QUORUM_FAILED);

                    await expect(raphael.connect(admin).setProposalToCancelled(BigNumber.from("1")))
                        .to.be.revertedWith("Proposal already failed quorum");
                });

                it("can't cancel a cancelled proposal", async () => {
                    await raphael.connect(user).createProposal("Proposal 1");

                    const startBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;
                    const endBlock = startBlock + VOTING_DURATION;

                    await skipBlocks(BigNumber.from(startBlock - await ethers.provider.getBlockNumber()));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    expect(await raphael.connect(user).vote(BigNumber.from("1"), true));

                    await raphael.connect(admin).setProposalToCancelled(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.CANCELLED);

                    await expect(raphael.connect(admin).setProposalToCancelled(BigNumber.from("1")))
                        .to.be.revertedWith("Proposal already cancelled");
                });

                it("can't vote on same proposal twice from one address", async () => {
                    await raphael.connect(user).createProposal("Proposal 1");

                    const startBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;

                    await skipBlocks(BigNumber.from(startBlock - await ethers.provider.getBlockNumber()));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    expect(await raphael.connect(user).vote(BigNumber.from("1"), false));

                    // check user's balance (voting power)
                    const userStakedBalance = await staking.getStakedBalance(userAddress);
                    // check current votes for and against proposal
                    let proposalData = await raphael.getProposalData(BigNumber.from("1"))
                    let votesFor = proposalData[1]
                    let votesAgainst = proposalData[2]

                    // expect votesFor to be user's token balance
                    expect(votesAgainst).to.equal(userStakedBalance);
                    // expect no votes against
                    expect(votesFor.eq(ethers.constants.Zero));

                    await expect(raphael.connect(user).vote(BigNumber.from("1"), true))
                        .to.be.revertedWith("Already voted from this address");
                });

                it("can vote on separate proposals from same address", async () => {
                    await raphael.connect(user).createProposal("Proposal 1");
                    await raphael.connect(user).createProposal("Proposal 2");

                    const startBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;

                    await skipBlocks(BigNumber.from(startBlock - await ethers.provider.getBlockNumber()));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);
                    expect((await raphael.getProposalData(BigNumber.from("2")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);

                    await raphael.connect(user).updateProposalStatus(BigNumber.from("1"));
                    await raphael.connect(user).updateProposalStatus(BigNumber.from("2"));

                    expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);
                    expect((await raphael.getProposalData(BigNumber.from("2")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTING);

                    const userStakedBalance = await staking.getStakedBalance(userAddress);

                    expect(await raphael.connect(user).vote(BigNumber.from("1"), false));
                    expect(await raphael.connect(user).vote(BigNumber.from("2"), true));

                    let proposalData = await raphael.getProposalData(BigNumber.from("1"))
                    let votesFor = proposalData[1]
                    let votesAgainst = proposalData[2]
                    expect(votesAgainst).to.equal(userStakedBalance);
                    expect(votesFor.eq(ethers.constants.Zero));

                    proposalData = await raphael.getProposalData(BigNumber.from("2"))
                    votesFor = proposalData[1]
                    votesAgainst = proposalData[2]
                    expect(votesFor).to.equal(userStakedBalance);
                    expect(votesAgainst.eq(ethers.constants.Zero));
                });
            });


            describe("Quorum feature", async () => {
                let testProposalId;

                beforeEach(async () => {
                    let Token = await ethers.getContractFactory("VITA");
                    token = await Token.connect(admin).deploy("VITA Token", "VITA", VITA_CAP);
                    await token.deployed();
                    await token.connect(admin).transferOwnership(raphael.address)

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(ethers.constants.AddressZero);

                    await raphael.connect(admin).setNativeTokenAddress(token.address);

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(token.address);

                    await raphael.connect(admin).mintNativeToken(VITA_CAP)
                    expect(await token.balanceOf(raphael.address)).to.equal(VITA_CAP)

                    await raphael.connect(admin).transferNativeToken(adminAddress, ethers.utils.parseUnits("10"));
                    await raphael.connect(admin).transferNativeToken(userAddress, ethers.utils.parseUnits("10"));

                    const Staking = await ethers.getContractFactory("Staking");
                    staking = await Staking.deploy(token.address, raphael.address);
                    await staking.deployed();

                    await raphael.connect(admin).setStakingAddress(staking.address);

                    expect(await raphael.getStakingAddress())
                        .to.equal(staking.address);

                    await token.connect(admin).approve(staking.address, (ethers.utils.parseUnits("10")).add(1));
                    await token.connect(user).approve(staking.address, (ethers.utils.parseUnits("10")).add(1));

                    await staking.connect(admin).stake(ethers.utils.parseUnits("10"));
                    await staking.connect(user).stake(ethers.utils.parseUnits("10"));


                    expect(await raphael.proposalCount()).to.equal(0);

                    const tx = await (await raphael.connect(admin).createProposal("Proposal 1 details")).wait()
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { proposalId, details, vote_start, vote_end } = filteredEvents[0];
                    const txBlock = tx.blockNumber

                    expect(proposalId).to.equal(BigNumber.from("1"));
                    expect(details).to.equal("Proposal 1 details");
                    expect(vote_start).to.equal(BigNumber.from(txBlock + CREATE_TO_VOTE_PROPOSAL_DELAY + ""));
                    expect(vote_end).to.equal(BigNumber.from(txBlock + CREATE_TO_VOTE_PROPOSAL_DELAY + VOTING_DURATION + ""));
                    expect(await raphael.proposalCount()).to.equal(1);

                    testProposalId = proposalId;
                });

                it("quorum is not intialized to zero", async () => {
                    expect((await raphael.getMinVotesNeeded()).gt(ethers.constants.Zero))
                        .to.be.true;
                });

                it("quorum cannot be set to zero", async () => {
                    await expect(raphael.connect(admin).setMinVotesNeeded(ethers.constants.Zero))
                        .to.be.revertedWith("quorum cannot be 0");
                });

                it("quorum cannot be greater than token supply", async () => {
                    const totalSupply = await token.totalSupply();
                    await expect(raphael.connect(admin).setMinVotesNeeded(totalSupply.add(1)))
                        .to.be.revertedWith('votes needed > token supply');
                })

                it("getMinVotesNeeded works as expected", async () => {
                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(MIN_QUORUM);
                })

                it("minVotesNeeded can be changed by owner", async () => {
                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(MIN_QUORUM);

                    await raphael.connect(admin).setMinVotesNeeded(BigNumber.from("1"));

                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(BigNumber.from("1"));
                });

                it("Proposal is QUORUM_FAILED if min votes NOT met", async () => {
                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(MIN_QUORUM);

                    await raphael.connect(admin).setMinVotesNeeded(ethers.utils.parseUnits("50"));

                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(ethers.utils.parseUnits("50"));

                    const tx = await (await raphael.connect(admin).createProposal("Proposal 2 details")).wait();
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { vote_start } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber));

                    await skipBlocks(blocks_skipped);
                    await raphael.connect(admin).updateProposalStatus(BigNumber.from("2"));
                    await raphael.connect(user).vote(BigNumber.from("2"), true);

                    await skipBlocks(BigNumber.from(VOTING_DURATION));

                    await raphael.connect(admin).updateProposalStatus(BigNumber.from("2"));

                    expect((await raphael.getProposalData(BigNumber.from("2")))[5])
                        .to.equal(PROPOSAL_STATUS.QUORUM_FAILED);
                });

                it("Proposal is VOTES_FINISHED if min votes met", async () => {
                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(MIN_QUORUM);

                    await raphael.connect(admin).setMinVotesNeeded(BigNumber.from("5"));

                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(BigNumber.from("5"));

                    // transfer tokens to user so they have voting power
                    await raphael.connect(admin).transferNativeToken(userAddress, ethers.utils.parseUnits("10"));

                    const tx = await (await raphael.connect(admin).createProposal("Proposal 2 details")).wait();
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { vote_start } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber));

                    await skipBlocks(blocks_skipped);
                    await raphael.connect(admin).updateProposalStatus(BigNumber.from("2"));
                    await raphael.connect(user).vote(BigNumber.from("2"), true);

                    await skipBlocks(BigNumber.from(VOTING_DURATION));

                    await raphael.connect(admin).updateProposalStatus(BigNumber.from("2"));

                    expect((await raphael.getProposalData(BigNumber.from("2")))[5])
                        .to.equal(PROPOSAL_STATUS.VOTES_FINISHED);
                });

                it("Proposal can't be resolved by owner if QUORUM_FAILED", async () => {
                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(MIN_QUORUM);

                    await raphael.connect(admin).setMinVotesNeeded(MIN_QUORUM.mul(2));

                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(MIN_QUORUM.mul(2));

                    const tx = await (await raphael.connect(admin).createProposal("Proposal 2 details")).wait();
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { vote_start } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber));

                    await skipBlocks(blocks_skipped);
                    await raphael.connect(admin).updateProposalStatus(BigNumber.from("2"));
                    await raphael.connect(user).vote(BigNumber.from("2"), true);

                    await skipBlocks(BigNumber.from(VOTING_DURATION));

                    await raphael.connect(admin).updateProposalStatus(BigNumber.from("2"));

                    expect((await raphael.getProposalData(BigNumber.from("2")))[5])
                        .to.equal(PROPOSAL_STATUS.QUORUM_FAILED);

                    await expect(raphael.connect(admin).setProposalToResolved(BigNumber.from("2")))
                        .to.be.revertedWith("Proposal not in VOTES_FINISHED");
                });

                it("Proposal can't be cancelled by owner if QUORUM_FAILED", async () => {
                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(MIN_QUORUM);

                    await raphael.connect(admin).setMinVotesNeeded(MIN_QUORUM.mul(2));

                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(MIN_QUORUM.mul(2));

                    const tx = await (await raphael.connect(admin).createProposal("Proposal 2 details")).wait();
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { vote_start } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber));

                    await skipBlocks(blocks_skipped);
                    await raphael.connect(admin).updateProposalStatus(BigNumber.from("2"));
                    await raphael.connect(user).vote(BigNumber.from("2"), true);

                    await skipBlocks(BigNumber.from(VOTING_DURATION));

                    await raphael.connect(admin).updateProposalStatus(BigNumber.from("2"));

                    expect((await raphael.getProposalData(BigNumber.from("2")))[5])
                        .to.equal(PROPOSAL_STATUS.QUORUM_FAILED);

                    await expect(raphael.connect(admin).setProposalToCancelled(BigNumber.from("2")))
                        .to.be.revertedWith("Proposal already failed quorum");
                });

                it("updateProposal reverts if proposal is QUORUM_FAILED", async () => {
                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(MIN_QUORUM);

                    await raphael.connect(admin).setMinVotesNeeded(MIN_QUORUM.mul(2));

                    expect(await raphael.getMinVotesNeeded())
                        .to.equal(MIN_QUORUM.mul(2));

                    const tx = await (await raphael.connect(admin).createProposal("Proposal 2 details")).wait();
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { vote_start } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber));

                    await skipBlocks(blocks_skipped);
                    await raphael.connect(admin).updateProposalStatus(BigNumber.from("2"));
                    await raphael.connect(user).vote(BigNumber.from("2"), true);

                    await skipBlocks(BigNumber.from(VOTING_DURATION));

                    await raphael.connect(admin).updateProposalStatus(BigNumber.from("2"));

                    expect((await raphael.getProposalData(BigNumber.from("2")))[5])
                        .to.equal(PROPOSAL_STATUS.QUORUM_FAILED);

                    await expect(raphael.connect(user).updateProposalStatus(BigNumber.from("2")))
                        .to.be.revertedWith("Proposal failed to meet quorum");
                });
            })

            describe("Voting Delays", async () => {
                it("delay to voting can be changed by owner", async () => {
                    let Token = await ethers.getContractFactory("VITA");
                    token = await Token.connect(admin).deploy("VITA Token", "VITA", VITA_CAP);
                    await token.deployed();
                    await token.connect(admin).transferOwnership(raphael.address)

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(ethers.constants.AddressZero);

                    await raphael.connect(admin).setNativeTokenAddress(token.address);

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(token.address);

                    await raphael.connect(admin).mintNativeToken(VITA_CAP)
                    expect(await token.balanceOf(raphael.address)).to.equal(VITA_CAP)

                    await raphael.connect(admin).transferNativeToken(userAddress, ethers.utils.parseUnits("10"));

                    const Staking = await ethers.getContractFactory("Staking");
                    staking = await Staking.deploy(token.address, raphael.address);
                    await staking.deployed();

                    await raphael.connect(admin).setStakingAddress(staking.address);

                    expect(await raphael.getStakingAddress())
                        .to.equal(staking.address);

                    await token.connect(user).approve(staking.address, (ethers.utils.parseUnits("10")).add(1));

                    await staking.connect(user).stake(ethers.utils.parseUnits("10"));

                    let tx = await (await raphael.connect(user).createProposal("Proposal 1 details")).wait()
                    let filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    var { proposalId, details, vote_start, vote_end } = filteredEvents[0]
                    let txBlock = tx.blockNumber

                    expect(proposalId).to.equal(BigNumber.from("1"));
                    expect(details).to.equal("Proposal 1 details");
                    expect(vote_start).to.equal(BigNumber.from(txBlock + CREATE_TO_VOTE_PROPOSAL_DELAY + ""));
                    expect(vote_end).to.equal(BigNumber.from(txBlock + CREATE_TO_VOTE_PROPOSAL_DELAY + VOTING_DURATION + ""));
                    expect(await raphael.proposalCount()).to.equal(1);

                    expect(vote_start.sub(txBlock)).to.equal(CREATE_TO_VOTE_PROPOSAL_DELAY);

                    await raphael.connect(admin).setVotingDelayDuration(BigNumber.from("50000"));
                    tx = await (await raphael.connect(user).createProposal("Proposal 2 details")).wait()
                    filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    var { proposalId, details, vote_start, vote_end } = filteredEvents[0]
                    txBlock = tx.blockNumber


                    expect(proposalId).to.equal(BigNumber.from("2"));
                    expect(details).to.equal("Proposal 2 details");
                    expect(vote_start).to.equal(BigNumber.from(txBlock + 50000 + ""));
                    expect(vote_end).to.equal(BigNumber.from(txBlock + 50000 + VOTING_DURATION + ""));
                    expect(await raphael.proposalCount()).to.equal(2);
                });

                it("voting duration can be changed by owner", async () => {
                    let Token = await ethers.getContractFactory("VITA");
                    token = await Token.connect(admin).deploy("VITA Token", "VITA", VITA_CAP);
                    await token.deployed();
                    await token.connect(admin).transferOwnership(raphael.address)

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(ethers.constants.AddressZero);

                    await raphael.connect(admin).setNativeTokenAddress(token.address);

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(token.address);

                    await raphael.connect(admin).mintNativeToken(VITA_CAP)
                    expect(await token.balanceOf(raphael.address)).to.equal(VITA_CAP)

                    await raphael.connect(admin).transferNativeToken(userAddress, ethers.utils.parseUnits("10"));

                    const Staking = await ethers.getContractFactory("Staking");
                    staking = await Staking.deploy(token.address, raphael.address);
                    await staking.deployed();

                    await raphael.connect(admin).setStakingAddress(staking.address);

                    expect(await raphael.getStakingAddress())
                        .to.equal(staking.address);

                    await token.connect(user).approve(staking.address, (ethers.utils.parseUnits("10")).add(1));

                    await staking.connect(user).stake(ethers.utils.parseUnits("10"));

                    let tx = await (await raphael.connect(user).createProposal("Proposal 1 details")).wait()
                    let filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    var { proposalId, details, vote_start, vote_end } = filteredEvents[0]
                    let txBlock = tx.blockNumber

                    expect(proposalId).to.equal(BigNumber.from("1"));
                    expect(details).to.equal("Proposal 1 details");
                    expect(vote_start).to.equal(BigNumber.from(txBlock + CREATE_TO_VOTE_PROPOSAL_DELAY + ""));
                    expect(vote_end).to.equal(BigNumber.from(txBlock + CREATE_TO_VOTE_PROPOSAL_DELAY + VOTING_DURATION + ""));
                    expect(await raphael.proposalCount()).to.equal(1);

                    expect(vote_end.sub(vote_start)).to.equal(VOTING_DURATION);

                    await raphael.connect(admin).setVotingDuration(BigNumber.from("50000"));

                    tx = await (await raphael.connect(user).createProposal("Proposal 2 details")).wait()
                    filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    var { proposalId, details, vote_start, vote_end } = filteredEvents[0]
                    txBlock = tx.blockNumber

                    expect(proposalId).to.equal(BigNumber.from("2"));
                    expect(details).to.equal("Proposal 2 details");
                    expect(vote_start).to.equal(BigNumber.from(txBlock + CREATE_TO_VOTE_PROPOSAL_DELAY + ""));
                    expect(vote_end).to.equal(BigNumber.from(txBlock + CREATE_TO_VOTE_PROPOSAL_DELAY + 50000 + ""));
                    expect(await raphael.proposalCount()).to.equal(2);
                });

                it("delay to voting cannot be less than minimum duration length", async () => {
                    await expect(raphael.connect(admin).setVotingDelayDuration(BigNumber.from("1")))
                        .to.be.revertedWith("duration must be >5 <190000");
                });

                it("voting duration cannot be less than minimum duration length", async () => {
                    await expect(raphael.connect(admin).setVotingDuration(BigNumber.from("1")))
                        .to.be.revertedWith("duration must be >5 <190000");
                });

                it("delay to voting cannot be more than maximum duration length", async () => {
                    await expect(raphael.connect(admin).setVotingDelayDuration(BigNumber.from("190001")))
                        .to.be.revertedWith("duration must be >5 <190000");
                });

                it("voting duration cannot be more than maximum duration length", async () => {
                    await expect(raphael.connect(admin).setVotingDuration(BigNumber.from("190001")))
                        .to.be.revertedWith("duration must be >5 <190000");
                });
            });

            describe("Staking Contract functions", async () => {
                beforeEach(async () => {
                    let Token = await ethers.getContractFactory("VITA");
                    token = await Token.connect(admin).deploy("VITA Token", "VITA", VITA_CAP);
                    await token.deployed();
                    await token.connect(admin).transferOwnership(raphael.address)

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(ethers.constants.AddressZero);

                    await raphael.connect(admin).setNativeTokenAddress(token.address);

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(token.address);

                    const Staking = await ethers.getContractFactory("Staking");
                    staking = await Staking.deploy(token.address, raphael.address);
                    await staking.deployed();
                });

                it("getStaking Address returns proper staking contract address", async () => {
                    expect(await raphael.getStakingAddress())
                        .to.equal(ethers.constants.AddressZero);

                    await raphael.connect(admin).setStakingAddress(staking.address);

                    expect(await raphael.getStakingAddress())
                        .to.equal(staking.address);
                });

                it("setStakingAddress sets staking contract address properly", async () => {
                    expect(await raphael.getStakingAddress())
                        .to.equal(ethers.constants.AddressZero);

                    await raphael.connect(admin).setStakingAddress(staking.address);

                    expect(await raphael.getStakingAddress())
                        .to.equal(staking.address);
                });
            });

            describe("ERC20 functions", async () => {
                beforeEach(async () => {
                    let Token = await ethers.getContractFactory("VITA");
                    token = await Token.connect(admin).deploy("VITA Token", "VITA", VITA_CAP);
                    await token.deployed();
                    await token.connect(admin).transferOwnership(raphael.address)

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(ethers.constants.AddressZero);

                    await raphael.connect(admin).setNativeTokenAddress(token.address);

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(token.address);



                    const Staking = await ethers.getContractFactory("Staking");
                    staking = await Staking.deploy(token.address, raphael.address);
                    await staking.deployed();

                    await raphael.connect(admin).setStakingAddress(staking.address);

                    expect(await raphael.getStakingAddress())
                        .to.equal(staking.address);
                });

                it("returns address of native token", async () => {
                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(token.address);
                });

                it("returns DAO balance in native token", async () => {
                    expect(await raphael.getNativeTokenBalance())
                        .to.equal(await token.balanceOf(raphael.address));
                });

                it("returns if DAO is shutdown", async () => {
                    expect(await raphael.isShutdown())
                        .to.be.false;

                    await raphael.connect(admin).emergencyShutdown();

                    expect(await raphael.isShutdown())
                        .to.be.true;
                });

                it("admin can set native token address", async () => {
                    const SecondToken = await ethers.getContractFactory("MockToken");
                    const secondToken = await SecondToken.deploy(raphael.address);
                    await secondToken.deployed();

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(token.address);

                    await raphael.connect(admin).setNativeTokenAddress(secondToken.address);

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(secondToken.address);
                });

                it("transfers native token", async () => {
                    expect(await token.balanceOf(userAddress))
                        .to.equal(ethers.constants.Zero);
                    await raphael.connect(admin).mintNativeToken(VITA_CAP)
                    expect(await token.balanceOf(raphael.address)).to.equal(VITA_CAP)
                    expect(await raphael.getNativeTokenBalance())
                        .to.equal(VITA_CAP);
                    const initialSupply = await token.totalSupply();

                    // Improvement: should be able to expect result to be true
                    await raphael.connect(admin).transferNativeToken(userAddress, ethers.utils.parseUnits("100"))

                    expect(await token.balanceOf(userAddress))
                        .to.equal(ethers.utils.parseUnits("100"));
                    expect(await raphael.getNativeTokenBalance())
                        .to.equal(VITA_CAP.sub(ethers.utils.parseUnits("100")));
                    expect(await token.totalSupply())
                        .to.equal(initialSupply);
                });

                it("Can mint native tokens to DAO", async () => {
                    let bal = await token.balanceOf(raphael.address)

                    await raphael.connect(admin).mintNativeToken(ethers.utils.parseUnits("100"))

                    expect(await token.balanceOf(raphael.address)).to.equal(bal.add(ethers.utils.parseUnits("100")))
                });
                it("Can't mint native token if shutdown", async () => {
                    await raphael.connect(admin).emergencyShutdown();

                    await expect(raphael.connect(admin).mintNativeToken(ethers.utils.parseUnits("100")))
                        .to.be.revertedWith("cannot be called after shutdown");
                });
                it("Can't mint 0 native tokens", async () => {
                    await expect(raphael.connect(admin).mintNativeToken(0))
                        .to.be.revertedWith("Can't mint 0 tokens");
                });
                it("Can't mint native tokens if not DAO owner", async () => {
                    await expect(raphael.connect(user).mintNativeToken(ethers.utils.parseUnits("100")))
                        .to.be.revertedWith("Ownable: caller is not the owner");
                });
                it("Can mint max supply", async () => {
                    await raphael.connect(admin).mintNativeToken(VITA_CAP)
                    expect(await token.balanceOf(raphael.address)).to.equal(VITA_CAP)
                });
                it("Can't mint more tokens than max supply", async () => {
                    await expect(raphael.connect(admin).mintNativeToken(VITA_CAP.add(1)))
                        .to.be.revertedWith("ERC20Capped: cap exceeded");
                });
            });

            describe("NFT functions", async () => {
                const mintUserNFT = async () => {
                    await nft.connect(user).mint(userAddress, BigNumber.from("1"));
                    expect(await nft.ownerOf(BigNumber.from("1")))
                        .to.equal(userAddress);
                };

                beforeEach(async () => {
                    const NFT = await ethers.getContractFactory("MockNFT");
                    nft = await NFT.deploy();
                    await nft.deployed();
                });

                it("receives NFTs properly", async () => {
                    await mintUserNFT();

                    await nft.connect(user).transfer(userAddress, raphael.address, BigNumber.from("1"));

                    expect(await nft.ownerOf(BigNumber.from("1")))
                        .to.equal(raphael.address);
                });

                it("adds NFT contract address to nftContractAddresses if not yet present", async () => {
                    expect((await raphael.getNftContractAddresses()).length)
                        .to.equal(0);

                    await mintUserNFT();

                    await nft.connect(user).transfer(userAddress, raphael.address, BigNumber.from("1"));

                    expect(await nft.ownerOf(BigNumber.from("1")))
                        .to.equal(raphael.address);
                    expect((await raphael.getNftContractAddresses())[0])
                        .to.equal(nft.address);
                    expect((await raphael.getNftContractAddresses()).length)
                        .to.equal(1);
                });

                it("can transfer NFTs", async () => {
                    await mintUserNFT();

                    await nft.connect(user).transfer(userAddress, raphael.address, BigNumber.from("1"));

                    expect(await nft.ownerOf(BigNumber.from("1")))
                        .to.equal(raphael.address);

                    // Improvement: should be able to expect result to be true
                    await raphael.connect(admin).transferNFT(nft.address, userAddress, BigNumber.from("1"))

                    expect(await nft.ownerOf(BigNumber.from("1")))
                        .to.equal(userAddress);
                });

                it("multiple listings from same contract allowed", async () => {
                    expect((await raphael.getNftContractAddresses()).length)
                        .to.equal(0);

                    await mintUserNFT();

                    await nft.connect(user).transfer(userAddress, raphael.address, BigNumber.from("1"));

                    expect(await nft.ownerOf(BigNumber.from("1")))
                        .to.equal(raphael.address);
                    expect((await raphael.getNftContractAddresses())[0])
                        .to.equal(nft.address);
                    expect((await raphael.getNftContractAddresses()).length)
                        .to.equal(1);

                    await nft.connect(user).mint(raphael.address, BigNumber.from("2"));
                    expect(await nft.ownerOf(BigNumber.from("2")))
                        .to.equal(raphael.address);
                    expect((await raphael.getNftContractAddresses()).length)
                        .to.equal(2);

                    await raphael.connect(admin).transferNFT(nft.address, userAddress, BigNumber.from("1"));

                    expect(await nft.ownerOf(BigNumber.from("1")))
                        .to.equal(userAddress);
                    expect((await raphael.getNftContractAddresses())[0])
                        .to.equal(nft.address);
                    expect((await raphael.getNftContractAddresses())[1])
                        .to.equal(nft.address);
                    expect((await raphael.getNftContractAddresses()).length)
                        .to.equal(2);
                });

                it("getNftContractAddresses returns the list of NFT contract addresses", async () => {
                    let addrs: string[] = [];
                    for (let i = 0; i < 10; i++) {
                        const NFT = await ethers.getContractFactory("MockNFT");
                        nft = await NFT.deploy();
                        await nft.deployed();

                        addrs.push(nft.address);

                        await nft.connect(admin).mint(raphael.address, BigNumber.from("1"));

                        expect((await raphael.getNftContractAddresses())[i])
                            .to.equal(addrs[i]);
                    }

                    const addrsFromContract = await raphael.getNftContractAddresses();
                    addrs.forEach((addr: string, i: number) => {
                        expect(addr).to.equal(addrsFromContract[i]);
                    });
                });
            });

            describe("Emergency Shutdown", () => {
                let secondNFT: Contract;
                let evilNFT: Contract;

                const mintNFTs = async () => {
                    for (let i = 1; i < 11; i++) {
                        // contract lets us switch off minting from different contracts
                        const contract = i % 2 === 1 ? nft : secondNFT;
                        await contract.connect(admin).mint(raphael.address, BigNumber.from(Math.floor(i / 2).toString()));

                        expect(await contract.ownerOf(BigNumber.from(Math.floor(i / 2).toString())))
                            .to.equal(raphael.address);
                    }
                }

                const mintandTransferEvilNFT = async () => {
                    let EvilNFT = await ethers.getContractFactory("EvilMockNFT");
                    evilNFT = await EvilNFT.connect(user).deploy();

                    await evilNFT.connect(user).mint(raphael.address, BigNumber.from("1"));
                }

                beforeEach(async () => {
                    let Token = await ethers.getContractFactory("VITA");
                    token = await Token.connect(admin).deploy("VITA Token", "VITA", VITA_CAP);
                    await token.deployed();
                    await token.connect(admin).transferOwnership(raphael.address)

                    await raphael.connect(admin).setNativeTokenAddress(token.address);

                    await raphael.connect(admin).mintNativeToken(VITA_CAP)
                    expect(await token.balanceOf(raphael.address)).to.equal(VITA_CAP)
                    await raphael.connect(admin).transferNativeToken(adminAddress, MIN_QUORUM);
                    await raphael.connect(admin).transferNativeToken(userAddress, MIN_QUORUM);

                    const Staking = await ethers.getContractFactory("Staking");
                    staking = await Staking.deploy(token.address, raphael.address);
                    await staking.deployed();

                    await raphael.connect(admin).setStakingAddress(staking.address);

                    expect(await raphael.getStakingAddress())
                        .to.equal(staking.address);

                    await token.connect(admin).approve(staking.address, (MIN_QUORUM).add(1));
                    await token.connect(user).approve(staking.address, (MIN_QUORUM).add(1));

                    await staking.connect(admin).stake(MIN_QUORUM);
                    await staking.connect(user).stake(MIN_QUORUM);

                    expect(await raphael.proposalCount()).to.equal(0);

                    const tx = await (await raphael.connect(admin).createProposal("Proposal 1 details")).wait()
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { proposalId, details, vote_start, vote_end } = filteredEvents[0];
                    const txBlock = tx.blockNumber

                    expect(proposalId).to.equal(BigNumber.from("1"));
                    expect(details).to.equal("Proposal 1 details");
                    expect(vote_start).to.equal(BigNumber.from(txBlock + CREATE_TO_VOTE_PROPOSAL_DELAY + ""));
                    expect(vote_end).to.equal(BigNumber.from(txBlock + CREATE_TO_VOTE_PROPOSAL_DELAY + VOTING_DURATION + ""));
                    expect(await raphael.proposalCount()).to.equal(1);

                    const NFT = await ethers.getContractFactory("MockNFT");
                    nft = await NFT.deploy();
                    await nft.deployed();

                    secondNFT = await NFT.deploy();
                    await secondNFT.deployed();

                    // sweep native asset in order to shutdown
                    await raphael.connect(admin).transferNativeToken(adminAddress, await raphael.getNativeTokenBalance());
                });

                it("locks setStakingAddress", async () => {
                    await raphael.connect(admin).emergencyShutdown();

                    await expect(raphael.connect(admin).setStakingAddress(token.address))
                        .to.be.revertedWith("cannot be called after shutdown");
                });

                it("locks setNativeTokenAddress", async () => {
                    await raphael.connect(admin).emergencyShutdown();

                    await expect(raphael.connect(admin).setNativeTokenAddress(staking.address))
                        .to.be.revertedWith("cannot be called after shutdown");
                });

                it("locks createProposal", async () => {
                    await raphael.connect(admin).emergencyShutdown();

                    await expect(raphael.connect(admin).createProposal("details"))
                        .to.be.revertedWith("cannot be called after shutdown");
                });

                it("locks updateProposalStatus", async () => {
                    await raphael.connect(admin).emergencyShutdown();

                    await expect(raphael.connect(admin).updateProposalStatus(BigNumber.from("1")))
                        .to.be.revertedWith("cannot be called after shutdown");
                });

                it("locks setProposalToResolved", async () => {
                    await raphael.connect(admin).emergencyShutdown();

                    await expect(raphael.connect(admin).setProposalToResolved(BigNumber.from("1")))
                        .to.be.revertedWith("cannot be called after shutdown");
                });

                it("locks setMinVotesNeeded", async () => {
                    await raphael.connect(admin).emergencyShutdown();

                    await expect(raphael.connect(admin).setMinVotesNeeded(BigNumber.from("1")))
                        .to.be.revertedWith("cannot be called after shutdown");
                });

                it("locks setProposalToCancelled", async () => {
                    await raphael.connect(admin).emergencyShutdown();

                    await expect(raphael.connect(admin).setProposalToCancelled(BigNumber.from("1")))
                        .to.be.revertedWith("cannot be called after shutdown");
                });

                it("locks vote", async () => {
                    await raphael.connect(admin).emergencyShutdown();

                    await expect(raphael.connect(admin).vote(BigNumber.from("1"), true))
                        .to.be.revertedWith("cannot be called after shutdown");
                });

                it("locks transferNativeToken", async () => {
                    await raphael.connect(admin).emergencyShutdown();

                    await expect(raphael.connect(admin).transferNativeToken(userAddress, ethers.utils.parseUnits("100")))
                        .to.be.revertedWith("cannot be called after shutdown");
                });

                it("locks transferNFT", async () => {
                    await raphael.connect(admin).emergencyShutdown();

                    await expect(raphael.connect(admin).transferNFT(nft.address, userAddress, BigNumber.from("1")))
                        .to.be.revertedWith("cannot be called after shutdown");
                });

                it("locks onERC721Received", async () => {
                    await raphael.connect(admin).emergencyShutdown();

                    await nft.connect(user).mint(userAddress, BigNumber.from("5"));

                    await expect(nft.connect(user).transfer(userAddress, raphael.address, BigNumber.from("5")))
                        .to.be.revertedWith("cannot be called after shutdown");
                });

                it("locks emergencyShutdown", async () => {
                    await raphael.connect(admin).emergencyShutdown();

                    await expect(raphael.connect(admin).emergencyShutdown())
                        .to.be.revertedWith("cannot be called after shutdown");
                })

                it("shuts down staking contract", async () => {
                    expect(await staking.isShutdown())
                        .to.be.false;

                    await raphael.connect(admin).emergencyShutdown();

                    expect(await staking.isShutdown())
                        .to.be.true;
                });

                describe("post-shutdown functions: proposals", async () => {
                    it("emergency proposal cancellation is locked before shutdown", async () => {
                        await expect(raphael.connect(admin).emergencyProposalCancellation(BigNumber.from("1"), BigNumber.from("2")))
                            .to.be.revertedWith("can only call after shutdown");
                    });

                    it("reverts if end index isn't greater than start index", async () => {
                        await raphael.connect(admin).emergencyShutdown();
                        await expect(raphael.connect(admin).emergencyProposalCancellation(BigNumber.from("1"), BigNumber.from("1")))
                            .to.be.revertedWith("end index must be > start index");
                    });

                    it("reverts if index 0 is given", async () => {
                        await raphael.connect(admin).emergencyShutdown();
                        await expect(raphael.connect(admin).emergencyProposalCancellation(ethers.constants.Zero, BigNumber.from("1")))
                            .to.be.revertedWith("starting index must exceed 0");
                    });

                    it("reverts if index is too high", async () => {
                        await raphael.connect(admin).emergencyShutdown();
                        await expect(raphael.connect(admin).emergencyProposalCancellation(BigNumber.from("1"), BigNumber.from("100")))
                            .to.be.revertedWith("end index > proposal count + 1");
                    });

                    it("cancels pre-vote proposals", async () => {
                        expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                            .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);
    
                        await raphael.connect(admin).emergencyShutdown();
                        await raphael.connect(admin).emergencyProposalCancellation(BigNumber.from("1"), BigNumber.from("2"));
    
                        expect((await raphael.getProposalData(BigNumber.from("1")))[5])
                            .to.equal(PROPOSAL_STATUS.CANCELLED);
                    });
    
                    it("cancels proposals in active voting", async () => {
                        let tx = await (await raphael.connect(admin).createProposal("Proposal n details")).wait()
                        const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                            .map((eventItem: any) => eventItem.args)
                        const { proposalId, details, vote_start, vote_end } = filteredEvents[0];
    
                        let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber))
    
                        await skipBlocks(blocks_skipped)
    
                        tx = await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait();
                        let status = (await raphael.getProposalData(proposalId))[5];
                        expect(status).to.equal((BigNumber.from(PROPOSAL_STATUS.VOTING)));
    
                        await raphael.connect(admin).emergencyShutdown();
                        await raphael.connect(admin).emergencyProposalCancellation(proposalId, proposalId.add(1));
    
                        expect((await raphael.getProposalData(proposalId))[5])
                            .to.equal(PROPOSAL_STATUS.CANCELLED);
                    });
    
                    it("cancels proposals of status VOTES_FINISHED", async () => {
                        let tx = await (await raphael.connect(admin).createProposal("Proposal n details")).wait()
                        const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                            .map((eventItem: any) => eventItem.args)
                        const { proposalId, details, vote_start, vote_end } = filteredEvents[0];
    
                        let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber))
    
                        await skipBlocks(blocks_skipped)
    
                        tx = await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait();
                        let status = (await raphael.getProposalData(proposalId))[5];
                        expect(status).to.equal((BigNumber.from(PROPOSAL_STATUS.VOTING)));
    
                        await raphael.connect(user).vote(proposalId, true);
    
                        await skipBlocks(BigNumber.from(VOTING_DURATION))
    
                        await raphael.connect(admin).updateProposalStatus(proposalId)
    
                        expect((await raphael.getProposalData(proposalId))[5])
                            .to.equal(PROPOSAL_STATUS.VOTES_FINISHED);
    
                        await raphael.connect(admin).emergencyShutdown();
                        await raphael.connect(admin).emergencyProposalCancellation(proposalId, proposalId.add(1));
    
                        expect((await raphael.getProposalData(proposalId))[5])
                            .to.equal(PROPOSAL_STATUS.CANCELLED);
                    });
    
                    it("does not cancel resolved proposals", async () => {
                        let tx = await (await raphael.connect(admin).createProposal("Proposal n details")).wait()
                        const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                            .map((eventItem: any) => eventItem.args)
                        const { proposalId, details, vote_start, vote_end } = filteredEvents[0];
    
                        let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber))
    
                        await skipBlocks(blocks_skipped)
    
                        tx = await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait();
                        let status = (await raphael.getProposalData(proposalId))[5];
                        expect(status).to.equal((BigNumber.from(PROPOSAL_STATUS.VOTING)));
    
                        await raphael.connect(user).vote(proposalId, true);
    
                        await skipBlocks(BigNumber.from(VOTING_DURATION))
    
                        await raphael.connect(admin).updateProposalStatus(proposalId)
    
                        expect((await raphael.getProposalData(proposalId))[5])
                            .to.equal(PROPOSAL_STATUS.VOTES_FINISHED);
    
                        tx = await raphael.connect(admin).setProposalToResolved(proposalId);
    
                        await raphael.connect(admin).emergencyShutdown();
                        await raphael.connect(admin).emergencyProposalCancellation(proposalId, proposalId.add(1));
    
                        expect((await raphael.getProposalData(proposalId))[5])
                            .to.equal(PROPOSAL_STATUS.RESOLVED);
                    });
    
                    it("does not cancel proposals with failed quorum", async () => {
                        let tx = await (await raphael.connect(admin).createProposal("Proposal n details")).wait()
                        const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                            .map((eventItem: any) => eventItem.args)
                        const { proposalId, details, vote_start, vote_end } = filteredEvents[0];
    
                        let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber))
    
                        await skipBlocks(blocks_skipped)
    
                        tx = await (await raphael.connect(admin).updateProposalStatus(proposalId)).wait();
                        let status = (await raphael.getProposalData(proposalId))[5];
                        expect(status).to.equal((BigNumber.from(PROPOSAL_STATUS.VOTING)));
    
                        await skipBlocks(BigNumber.from(VOTING_DURATION))
    
                        await raphael.connect(admin).updateProposalStatus(proposalId)
    
                        expect((await raphael.getProposalData(proposalId))[5])
                            .to.equal(PROPOSAL_STATUS.QUORUM_FAILED);
    
                        await raphael.connect(admin).emergencyShutdown();
                        await raphael.connect(admin).emergencyProposalCancellation(proposalId, proposalId.add(1));
    
                        expect((await raphael.getProposalData(proposalId))[5])
                            .to.equal(PROPOSAL_STATUS.QUORUM_FAILED);
                    });
    
                    it("cancels proposals even with inactive proposals in the middle", async () => {
                        [1, 2, 3, 4, 5].forEach(async (i: number) => await raphael.connect(admin).createProposal(`Proposal ${i} details`));
    
                        const startBlock = await ethers.provider.getBlockNumber() + CREATE_TO_VOTE_PROPOSAL_DELAY;
                        // add 5 to offset the 5 blocks of proposals from automining
                        const endBlock = startBlock + 5 + VOTING_DURATION;
    
                        const blocks_skipped = BigNumber.from(startBlock - await ethers.provider.getBlockNumber());
                        await skipBlocks(blocks_skipped);
    
                        await raphael.connect(user).updateProposalStatus(BigNumber.from(`2`));
                        await raphael.connect(user).updateProposalStatus(BigNumber.from(`4`));
    
                        expect(await raphael.connect(user).vote(BigNumber.from("2"), true));
    
                        await skipBlocks(BigNumber.from(endBlock + 1 - await ethers.provider.getBlockNumber()));
    
                        await raphael.connect(user).updateProposalStatus(BigNumber.from(`2`));
                        await raphael.connect(user).updateProposalStatus(BigNumber.from(`4`));
    
                        await raphael.connect(admin).setProposalToResolved(BigNumber.from("2"));
    
                        for (let i = 1; i < 6; i++) {
                            if (i === 2) {
                                expect((await raphael.getProposalData(BigNumber.from(`${i}`)))[5])
                                    .to.equal(PROPOSAL_STATUS.RESOLVED);
                            } else if (i == 4) {
                                expect((await raphael.getProposalData(BigNumber.from(`${i}`)))[5])
                                    .to.equal(PROPOSAL_STATUS.QUORUM_FAILED);
                            } else {
                                expect((await raphael.getProposalData(BigNumber.from(`${i}`)))[5])
                                    .to.equal(PROPOSAL_STATUS.VOTING_NOT_STARTED);
                            }
                        }
    
                        await raphael.connect(admin).emergencyShutdown();
                        await raphael.connect(admin).emergencyProposalCancellation(BigNumber.from("1"), BigNumber.from("6"));
    
                        for (let i = 1; i < 6; i++) {
                            if (i === 2) {
                                expect((await raphael.getProposalData(BigNumber.from(`${i}`)))[5])
                                    .to.equal(PROPOSAL_STATUS.RESOLVED);
                            } else if (i == 4) {
                                expect((await raphael.getProposalData(BigNumber.from(`${i}`)))[5])
                                    .to.equal(PROPOSAL_STATUS.QUORUM_FAILED);
                            } else {
                                expect((await raphael.getProposalData(BigNumber.from(`${i}`)))[5])
                                    .to.equal(PROPOSAL_STATUS.CANCELLED);
                            }
                        }
                    });
                })

                describe("post-shutdown functions: NFTs", async () => {
                    it("emergency approval is locked before shutdown", async () => {
                        await expect(raphael.connect(admin).emergencyNftApproval(BigNumber.from("0"), BigNumber.from("1")))
                            .to.be.revertedWith("can only call after shutdown");
                    });

                    it("reverts if end index isn't greater than start index", async () => {
                        await raphael.connect(admin).emergencyShutdown();
                        await expect(raphael.connect(admin).emergencyNftApproval(BigNumber.from("1"), BigNumber.from("1")))
                            .to.be.revertedWith("end index must be > start index");
                    });

                    it("reverts if index is too high", async () => {
                        await raphael.connect(admin).emergencyShutdown();
                        await expect(raphael.connect(admin).emergencyNftApproval(BigNumber.from("0"), BigNumber.from("100")))
                            .to.be.revertedWith("end index > nft array len");
                    });

                    it("approves admins on all NFT contracts", async () => {
                        await mintNFTs();
    
                        const nftContractAddresses = await raphael.getNftContractAddresses();
                        expect(nftContractAddresses.length).to.equal(10);
                        expect(nftContractAddresses[0]).to.equal(nft.address);
                        expect(nftContractAddresses[1]).to.equal(secondNFT.address);
    
                        await raphael.connect(admin).emergencyShutdown();
                        await raphael.connect(admin).emergencyNftApproval(BigNumber.from("0"), BigNumber.from("10"));
    
                        nftContractAddresses.forEach(async (addr: string) => {
                            const contract = new ethers.Contract(addr, nftArtifact.abi, ethers.provider);
                            expect(await contract.isApprovedForAll(raphael.address, adminAddress))
                                .to.be.true;
                        });
                    });
    
                    it("testing evilness of evil NFTs", async () => {
                        await mintandTransferEvilNFT();
                        await evilNFT.connect(user).mint(userAddress, BigNumber.from("2"));
    
                        await expect(evilNFT.connect(user).setApprovalForAll(adminAddress, true))
                            .to.be.revertedWith("not gonna shut down now, are you?");
                    });
    
                    it("evil NFTs do not cause Emergency NFT Approval to revert", async () => {
                        await mintandTransferEvilNFT();
    
                        await raphael.connect(admin).emergencyShutdown();
                        await expect(raphael.connect(admin).emergencyNftApproval(BigNumber.from("0"), BigNumber.from("1")))
                            .to.not.be.reverted;
                    });
    
                    it("evil NFTs do not stop real NFTs from being approved", async () => {
                        await mintandTransferEvilNFT();
                        await mintNFTs();

                        await raphael.connect(admin).emergencyShutdown();
                        await expect(raphael.connect(admin).emergencyNftApproval(BigNumber.from("0"), BigNumber.from("3")))
                            .to.not.be.reverted;
                        expect(await nft.isApprovedForAll(raphael.address, adminAddress))
                            .to.be.true;
                        expect(await secondNFT.isApprovedForAll(raphael.address, adminAddress))
                            .to.be.true;
                    });
                });         
            })
        })

        describe("events", () => {
            describe("Proposal events", () => {
                beforeEach(async () => {
                    let Token = await ethers.getContractFactory("VITA");
                    token = await Token.connect(admin).deploy("VITA Token", "VITA", VITA_CAP);
                    await token.deployed();
                    await token.connect(admin).transferOwnership(raphael.address)

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(ethers.constants.AddressZero);

                    await raphael.connect(admin).setNativeTokenAddress(token.address);

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(token.address);

                    await raphael.connect(admin).mintNativeToken(VITA_CAP)
                    expect(await token.balanceOf(raphael.address)).to.equal(VITA_CAP)
                    await raphael.connect(admin).transferNativeToken(adminAddress, MIN_QUORUM);
                    await raphael.connect(admin).transferNativeToken(userAddress, MIN_QUORUM);

                    const Staking = await ethers.getContractFactory("Staking");
                    staking = await Staking.deploy(token.address, raphael.address);
                    await staking.deployed();

                    await raphael.connect(admin).setStakingAddress(staking.address);

                    expect(await raphael.getStakingAddress())
                        .to.equal(staking.address);

                    await token.connect(admin).approve(staking.address, (MIN_QUORUM).add(1));
                    await token.connect(user).approve(staking.address, (MIN_QUORUM).add(1));

                    await staking.connect(admin).stake(MIN_QUORUM);
                    await staking.connect(user).stake(MIN_QUORUM);
                })
                it("ProposalCreated emits properly", async () => {
                    const expectedStartBlock = await ethers.provider.getBlockNumber() + 1 + CREATE_TO_VOTE_PROPOSAL_DELAY;
                    const expectedEndBlock = expectedStartBlock + VOTING_DURATION;
                    await expect(raphael.connect(user).createProposal("Proposal 1 details"))
                        .to.emit(raphael, "ProposalCreated")
                        .withArgs(BigNumber.from("1"), "Proposal 1 details", expectedStartBlock, expectedEndBlock);
                });

                it("ProposalStatusChanged emits from updateProposalStatus properly", async () => {
                    const tx = await (await raphael.connect(admin).createProposal("Proposal 1 details")).wait();
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args)
                    const { vote_start } = filteredEvents[0];;

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber));

                    await skipBlocks(blocks_skipped);

                    await expect(raphael.connect(user).updateProposalStatus(BigNumber.from("1")))
                        .to.emit(raphael, "ProposalStatusChanged")
                        .withArgs(BigNumber.from("1"), PROPOSAL_STATUS.VOTING);
                });

                it("ProposalStatusChanged emits from setProposalToResolved properly", async () => {
                    const tx = await (await raphael.connect(admin).createProposal("Proposal 1 details")).wait();
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args);
                    const { vote_start } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber));

                    await skipBlocks(blocks_skipped);

                    await expect(raphael.connect(user).updateProposalStatus(BigNumber.from("1")))
                        .to.emit(raphael, "ProposalStatusChanged")
                        .withArgs(BigNumber.from("1"), PROPOSAL_STATUS.VOTING);

                    await raphael.connect(user).vote(BigNumber.from("1"), true);

                    await skipBlocks(BigNumber.from(VOTING_DURATION));

                    await expect(raphael.connect(user).updateProposalStatus(BigNumber.from("1")))
                        .to.emit(raphael, "ProposalStatusChanged")
                        .withArgs(BigNumber.from("1"), PROPOSAL_STATUS.VOTES_FINISHED);

                    await expect(raphael.connect(admin).setProposalToResolved(BigNumber.from("1")))
                        .to.emit(raphael, "ProposalStatusChanged")
                        .withArgs(BigNumber.from("1"), PROPOSAL_STATUS.RESOLVED);
                });

                it("ProposalStatusChanged emits from setProposalToCancelled properly", async () => {
                    const tx = await (await raphael.connect(admin).createProposal("Proposal 1 details")).wait();
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args);
                    const { vote_start } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber));

                    await skipBlocks(blocks_skipped);

                    await expect(raphael.connect(user).updateProposalStatus(BigNumber.from("1")))
                        .to.emit(raphael, "ProposalStatusChanged")
                        .withArgs(BigNumber.from("1"), PROPOSAL_STATUS.VOTING);

                    await raphael.connect(user).vote(BigNumber.from("1"), true);

                    await expect(raphael.connect(admin).setProposalToCancelled(BigNumber.from("1")))
                        .to.emit(raphael, "ProposalStatusChanged")
                        .withArgs(BigNumber.from("1"), PROPOSAL_STATUS.CANCELLED);
                });

                it("Voted emits properly", async () => {
                    const tx = await (await raphael.connect(admin).createProposal("Proposal 1 details")).wait();
                    const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                        .map((eventItem: any) => eventItem.args);
                    const { vote_start } = filteredEvents[0];

                    let blocks_skipped = vote_start.sub(BigNumber.from(tx.blockNumber));

                    await skipBlocks(blocks_skipped);

                    await expect(raphael.connect(user).updateProposalStatus(BigNumber.from("1")))
                        .to.emit(raphael, "ProposalStatusChanged")
                        .withArgs(BigNumber.from("1"), PROPOSAL_STATUS.VOTING);

                    await expect(raphael.connect(user).vote(BigNumber.from("1"), true))
                        .to.emit(raphael, "Voted")
                        .withArgs(userAddress, BigNumber.from("1"), MIN_QUORUM, true);
                });
            });

            describe("Vote Duration events", () => {
                it("emits VotingDelayChanged properly", async () => {
                    await expect(raphael.connect(admin).setVotingDelayDuration(BigNumber.from("100000")))
                        .to.emit(raphael, "VotingDelayChanged")
                        .withArgs(BigNumber.from("100000"));
                });

                it("emits VotingDurationChanged properly", async () => {
                    await expect(raphael.connect(admin).setVotingDuration(BigNumber.from("100000")))
                        .to.emit(raphael, "VotingDurationChanged")
                        .withArgs(BigNumber.from("100000"));
                });
            });

            describe("Staking Contract Address event", () => {
                it("emits StakingAddressChanged properly", async () => {
                    const Staking = await ethers.getContractFactory("Staking");
                    staking = await Staking.deploy(ethers.constants.AddressZero, raphael.address);
                    await staking.deployed();

                    await expect(raphael.connect(admin).setStakingAddress(staking.address))
                        .to.emit(raphael, "StakingAddressChanged")
                        .withArgs(staking.address, ethers.constants.AddressZero, adminAddress);
                });
            })

            describe("ERC20 events", () => {
                beforeEach(async () => {
                    let Token = await ethers.getContractFactory("VITA");
                    token = await Token.connect(admin).deploy("VITA Token", "VITA", VITA_CAP);
                    await token.deployed();
                    await token.connect(admin).transferOwnership(raphael.address)

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(ethers.constants.AddressZero);

                    await raphael.connect(admin).setNativeTokenAddress(token.address);

                    expect(await raphael.getNativeTokenAddress())
                        .to.equal(token.address);

                    await raphael.connect(admin).mintNativeToken(VITA_CAP)
                    expect(await token.balanceOf(raphael.address)).to.equal(VITA_CAP)
                });

                it("NativeTokenChanged emits properly", async () => {
                    const SecondToken = await ethers.getContractFactory("MockToken");
                    const secondToken = await SecondToken.deploy(raphael.address);
                    await secondToken.deployed;

                    await expect(raphael.connect(admin).setNativeTokenAddress(secondToken.address))
                        .to.emit(raphael, "NativeTokenChanged")
                        .withArgs(secondToken.address, token.address, adminAddress);
                });

                it("NativeTokenTransferred emits properly", async () => {
                    await expect(raphael.connect(admin).transferNativeToken(userAddress, ethers.utils.parseUnits("100")))
                        .to.emit(raphael, "NativeTokenTransferred")
                        .withArgs(adminAddress, userAddress, ethers.utils.parseUnits("100"));
                });
            })
            describe("NFT events", () => {

                beforeEach(async () => {
                    const NFT = await ethers.getContractFactory("MockNFT");
                    nft = await NFT.deploy();
                    await nft.deployed();

                    await nft.connect(user).mint(userAddress, BigNumber.from("1"));
                    expect(await nft.ownerOf(BigNumber.from("1")))
                        .to.equal(userAddress);
                });

                it("NFTReceived emits properly", async () => {
                    await expect(nft.connect(user).transfer(userAddress, raphael.address, BigNumber.from("1")))
                        .to.emit(raphael, "NFTReceived")
                        .withArgs(nft.address, userAddress, BigNumber.from("1"));
                });

                it("NFTTransferred emits properly", async () => {
                    await nft.connect(user).transfer(userAddress, raphael.address, BigNumber.from("1"));

                    await expect(raphael.connect(admin).transferNFT(nft.address, userAddress, BigNumber.from("1")))
                        .to.emit(raphael, "NFTTransferred")
                        .withArgs(nft.address, userAddress, BigNumber.from("1"));
                });
            });
            describe("Emergency Shutdown events", () => {
                let secondNFT: Contract;
                let evilNFT: Contract;

                const mintNfts = async () => {
                    for (let i = 1; i < 11; i++) {
                        // contract lets us switch off minting from different contracts
                        // this was useful when emergencyShutdown transferred instead of approving
                        const contract = i % 2 === 1 ? nft : secondNFT;
                        await contract.connect(admin).mint(raphael.address, BigNumber.from(Math.floor(i / 2).toString()));

                        expect(await contract.ownerOf(BigNumber.from(Math.floor(i / 2).toString())))
                            .to.equal(raphael.address);
                    }
                };

                const mintandTransferEvilNFT = async () => {
                    let EvilNFT = await ethers.getContractFactory("EvilMockNFT");
                    evilNFT = await EvilNFT.connect(user).deploy();

                    await evilNFT.connect(user).mint(raphael.address, BigNumber.from("1"));
                }

                beforeEach(async () => {
                    let Token = await ethers.getContractFactory("VITA");
                    token = await Token.connect(admin).deploy("VITA Token", "VITA", VITA_CAP);
                    await token.deployed();
                    await token.connect(admin).transferOwnership(raphael.address)

                    const NFT = await ethers.getContractFactory("MockNFT");
                    nft = await NFT.deploy();
                    await nft.deployed();

                    secondNFT = await NFT.deploy();
                    await secondNFT.deployed();

                    await raphael.connect(admin).setNativeTokenAddress(token.address);

                    await raphael.connect(admin).mintNativeToken(VITA_CAP)
                    expect(await token.balanceOf(raphael.address)).to.equal(VITA_CAP)

                    await raphael.connect(admin).transferNativeToken(userAddress, ethers.utils.parseUnits("10"));

                    const Staking = await ethers.getContractFactory("Staking");
                    staking = await Staking.deploy(token.address, raphael.address);
                    await staking.deployed();

                    await raphael.connect(admin).setStakingAddress(staking.address);

                    expect(await raphael.getStakingAddress())
                        .to.equal(staking.address);

                    await token.connect(user).approve(staking.address, (ethers.utils.parseUnits("10")).add(1));

                    await staking.connect(user).stake(ethers.utils.parseUnits("10"));

                    // clear native tokens
                    await raphael.connect(admin).transferNativeToken(adminAddress, await raphael.getNativeTokenBalance());
                });

                it("EmergencyShutdown emitted properly", async () => {
                    await expect(raphael.connect(admin).emergencyShutdown())
                        .to.emit(raphael, "EmergencyShutdown")
                        // getBlockNumber + 1 only works because of automining
                        // the function returns the block before this tx is mined, and it's automined,
                        // so adding 1 gives the right block
                        .withArgs(adminAddress, BigNumber.from((await ethers.provider.getBlockNumber() + 1).toString()));
                });

                describe("Emergency Proposal Cancellation events", async () => {
                    it("emits ProposalStatusChanged if there is a proposal cancelled", async () => {
                        await raphael.connect(user).createProposal("Proposal 1 details")
    
                        await raphael.connect(admin).emergencyShutdown()
                        await expect(raphael.connect(admin).emergencyProposalCancellation(BigNumber.from("1"), BigNumber.from("2")))
                            .to.emit(raphael, "ProposalStatusChanged")
                            .withArgs(BigNumber.from("1"), PROPOSAL_STATUS.CANCELLED);
                    });
    
                    it("does not emit ProposalStatusChanged if there is no proposal cancelled", async () => {
                        await expect(raphael.connect(admin).emergencyShutdown())
                            .to.not.emit(raphael, "ProposalStatusChanged");
                    });
                });

                describe("Emergency NFT Approval events", async () => {
                    it("emits EmergencyNFTApproval on shutdown", async () => {
                        await mintNfts();
                        const nftContractAddresses = await raphael.getNftContractAddresses();
    
                        await raphael.connect(admin).emergencyShutdown();
                        await expect(raphael.connect(admin).emergencyNftApproval(ethers.constants.Zero, BigNumber.from("1")))
                            .to.emit(raphael, "EmergencyNFTApproval")
                            .withArgs(adminAddress, nftContractAddresses, ethers.constants.Zero, BigNumber.from("1"));
                    });
    
                    it("reverts if there were never NFTs", async () => {
                        expect((await raphael.getNftContractAddresses()).length)
                            .to.equal(0);
    
                        await raphael.connect(admin).emergencyShutdown();
                        await expect(raphael.connect(admin).emergencyNftApproval(ethers.constants.Zero, BigNumber.from("1")))
                            .to.be.revertedWith("end index > nft array len");
                    });
    
                    it("emits EmergencyNFTApprovalFail if there are evil NFTs", async () => {
                        await mintandTransferEvilNFT();
    
                        await raphael.connect(admin).emergencyShutdown();
                        await expect(raphael.connect(admin).emergencyNftApproval(ethers.constants.Zero, BigNumber.from("1")))
                            .to.emit(raphael, "EmergencyNFTApprovalFail")
                            .withArgs(evilNFT.address);
                    });
    
                    it("does not emit EmergencyNFTApprovalFail if there are not evil NFTs", async () => {
                        await mintNfts();
                        await raphael.connect(admin).emergencyShutdown();
                        await expect(raphael.connect(admin).emergencyNftApproval(ethers.constants.Zero, BigNumber.from("10")))
                            .to.not.emit(raphael, "EmergencyNFTApprovalFail");
                    });
                });
            })
        })
    });

    // tests for the OZ Ownable module and its implementation
    describe("Ownable", () => {
        describe("Ownable functions", () => {
            beforeEach(async () => {
                const Raphael = await ethers.getContractFactory("Raphael");
                raphael = await Raphael.connect(admin).deploy();
                await raphael.deployed();

                await raphael.connect(admin).setVotingDelayDuration(CREATE_TO_VOTE_PROPOSAL_DELAY)
                await raphael.connect(admin).setVotingDuration(VOTING_DURATION)

                let Token = await ethers.getContractFactory("VITA");
                token = await Token.connect(admin).deploy("VITA Token", "VITA", VITA_CAP);
                await token.deployed();
                await token.connect(admin).transferOwnership(raphael.address)

                await raphael.connect(admin).setNativeTokenAddress(token.address);

                expect(await raphael.getNativeTokenAddress())
                    .to.equal(token.address);

                await raphael.connect(admin).mintNativeToken(VITA_CAP)
                expect(await token.balanceOf(raphael.address)).to.equal(VITA_CAP)

                await raphael.connect(admin).transferNativeToken(adminAddress, ethers.utils.parseUnits("10"));
                await raphael.connect(admin).transferNativeToken(userAddress, ethers.utils.parseUnits("10"));

                const Staking = await ethers.getContractFactory("Staking");
                staking = await Staking.deploy(token.address, raphael.address);
                await staking.deployed();

                await raphael.connect(admin).setStakingAddress(staking.address);

                expect(await raphael.getStakingAddress())
                    .to.equal(staking.address);

                await token.connect(admin).approve(staking.address, (ethers.utils.parseUnits("10")).add(1));
                await token.connect(user).approve(staking.address, (ethers.utils.parseUnits("10")).add(1));

                await staking.connect(admin).stake(ethers.utils.parseUnits("10"));
                await staking.connect(user).stake(ethers.utils.parseUnits("10"));

                expect(await raphael.proposalCount()).to.equal(0);

                const tx = await (await raphael.connect(admin).createProposal("Proposal 1 details")).wait()
                const filteredEvents = tx?.events.filter((eventItem: any) => eventItem.event === "ProposalCreated")
                    .map((eventItem: any) => eventItem.args)
                const { proposalId, details, vote_start, vote_end } = filteredEvents[0];
                const txBlock = tx.blockNumber

                expect(proposalId).to.equal(BigNumber.from("1"));
                expect(details).to.equal("Proposal 1 details");
                expect(vote_start).to.equal(BigNumber.from(txBlock + CREATE_TO_VOTE_PROPOSAL_DELAY + ""));
                expect(vote_end).to.equal(BigNumber.from(txBlock + CREATE_TO_VOTE_PROPOSAL_DELAY + VOTING_DURATION + ""));
                expect(await raphael.proposalCount()).to.equal(1);


                const NFT = await ethers.getContractFactory("MockNFT");
                nft = await NFT.deploy();
                await nft.deployed();
            });

            it("deployer is set to owner on deploy", async () => {
                expect(await raphael.owner())
                    .to.equal(adminAddress);
            });

            it("setVotingDelayDuration cannot be called by non-owner", async () => {
                await expect(raphael.connect(user).setVotingDelayDuration(BigNumber.from("100000")))
                    .to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("setVotingDuration cannot be called by non-owner", async () => {
                await expect(raphael.connect(user).setVotingDuration(BigNumber.from("100000")))
                    .to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("setStakingAddress cannot be called by non-owner", async () => {
                await expect(raphael.connect(user).setStakingAddress(ethers.constants.AddressZero))
                    .to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("setProposalToResolved cannot be called by non-owner", async () => {
                await expect(raphael.connect(user).setProposalToResolved(BigNumber.from("1")))
                    .to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("setProposalToCancelled cannot be called by non-owner", async () => {
                await expect(raphael.connect(user).setProposalToCancelled(BigNumber.from("1")))
                    .to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("setMinVotesNeeded cannot be called by non-owner", async () => {
                await expect(raphael.connect(user).setMinVotesNeeded(BigNumber.from("1")))
                    .to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("setNativeTokenAddress cannot be called by non-owner", async () => {
                await expect(raphael.connect(user).setNativeTokenAddress(token.address))
                    .to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("transferNativeToken cannot be called by non-owner", async () => {
                await expect(raphael.connect(user).transferNativeToken(userAddress, ethers.utils.parseUnits("100")))
                    .to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("transferNFT cannot be called by non-owner", async () => {
                await nft.connect(admin).mint(raphael.address, BigNumber.from("1"));
                expect(await nft.ownerOf(BigNumber.from("1")))
                    .to.equal(raphael.address);

                await expect(raphael.connect(user).transferNFT(nft.address, userAddress, BigNumber.from("1")))
                    .to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("emergencyShutdown cannot be called by non-owner", async () => {
                await expect(raphael.connect(user).emergencyShutdown())
                    .to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("emergencyProposalCancellation cannot be called by non-owner", async () => {
                await raphael.connect(admin).emergencyShutdown();
                await expect(raphael.connect(user).emergencyProposalCancellation(BigNumber.from("1"), BigNumber.from("2")))
                    .to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("emergencyNftApproval cannot be called by non-owner", async () => {
                await nft.connect(admin).mint(raphael.address, BigNumber.from("1"));
                await raphael.connect(admin).emergencyShutdown();
                await expect(raphael.connect(user).emergencyNftApproval(BigNumber.from("0"), BigNumber.from("1")))
                    .to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("transferOwnership functions as expected", async () => {
                expect(await raphael.owner())
                    .to.equal(adminAddress);

                await raphael.connect(admin).transferOwnership(userAddress);

                expect(await raphael.owner())
                    .to.equal(userAddress);

                // reset owner to admin
                await raphael.connect(user).transferOwnership(adminAddress);

                expect(await raphael.owner())
                    .to.equal(adminAddress);
            });

            // this may need to be the last test
            it("renounceOwnership functions as expected", async () => {
                expect(await raphael.owner())
                    .to.equal(adminAddress);

                await raphael.connect(admin).renounceOwnership();

                expect(await raphael.owner())
                    .to.equal(ethers.constants.AddressZero);
            });
        });

        describe("Ownable events", () => {
            beforeEach(async () => {
                const Raphael = await ethers.getContractFactory("Raphael");
                raphael = await Raphael.connect(admin).deploy();
                await raphael.deployed();
            });

            it("emits OwnershipTransferred on transfer properly", async () => {
                expect(await raphael.owner())
                    .to.equal(adminAddress);

                await expect(raphael.connect(admin).transferOwnership(userAddress))
                    .to.emit(raphael, "OwnershipTransferred")
                    .withArgs(adminAddress, userAddress);

                await raphael.connect(user).transferOwnership(adminAddress);

                expect(await raphael.owner())
                    .to.equal(adminAddress);
            });

            it("emits OwnershipTransferred on renounce properly", async () => {
                expect(await raphael.owner())
                    .to.equal(adminAddress);

                await expect(raphael.connect(admin).renounceOwnership())
                    .to.emit(raphael, "OwnershipTransferred")
                    .withArgs(adminAddress, ethers.constants.AddressZero);
            });
        })
    });
})
