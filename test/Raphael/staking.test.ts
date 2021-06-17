import { ethers } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";
import { expect } from "chai";
import { skipBlocks, CREATE_TO_VOTE_PROPOSAL_DELAY, VOTING_DURATION } from "./utils";

const VITA_CAP = ethers.constants.WeiPerEther.mul(BigNumber.from(64298880))

// Large amount needed to pass quorom + extra for approval loss
const ONE_ETHER_TOKENS = ethers.constants.WeiPerEther.add(BigNumber.from(10))

describe("Staking System", () => {
    let accounts: Signer[];

    let admin: Signer;
    let user1Alice: Signer;
    let user2Bob: Signer;
    let user3Cat: Signer;

    let adminAddress: string;
    let user1AliceAddress: string;
    let user2BobAddress: string;
    let user3CatAddress: string;

    let raphael: Contract;
    let token: Contract;
    let staking: Contract;

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        admin = accounts[1];
        user1Alice = accounts[2];
        user2Bob = accounts[3];
        user3Cat = accounts[4];

        adminAddress = await admin.getAddress();
        user1AliceAddress = await user1Alice.getAddress();
        user2BobAddress = await user2Bob.getAddress();
        user3CatAddress = await user3Cat.getAddress();
    });

    describe("Staking contract", () => {
        beforeEach(async () => {
            let Raphael = await ethers.getContractFactory("Raphael");
            raphael = await Raphael.connect(admin).deploy();
            await raphael.deployed();
            await raphael.connect(admin).setVotingDelayDuration(CREATE_TO_VOTE_PROPOSAL_DELAY)
            await raphael.connect(admin).setVotingDuration(VOTING_DURATION)
            let Token = await ethers.getContractFactory("VITA");
            token = await Token.connect(admin).deploy("VITA Token", "VITA", VITA_CAP);
            await token.deployed();
            await token.connect(admin).transferOwnership(raphael.address)
            let Staking = await ethers.getContractFactory("Staking");
            staking = await Staking.connect(admin).deploy(token.address, raphael.address);
            await staking.deployed();
            expect(await raphael.getStakingAddress()).to.equal(ethers.constants.AddressZero)
            expect(await raphael.getNativeTokenAddress()).to.equal(ethers.constants.AddressZero)
            await raphael.connect(admin).setNativeTokenAddress(token.address);
            await raphael.connect(admin).setStakingAddress(staking.address)
            await raphael.connect(admin).mintNativeToken(VITA_CAP)
            expect(await token.balanceOf(raphael.address)).to.equal(VITA_CAP)
        });


        describe("Functions", () => {

            describe("Contract setup", async () => {

                it("Deploys contract correctly", async () => {
                    // Checks all contracts are hooked up to each other
                    expect(await raphael.getStakingAddress()).to.equal(staking.address)
                    expect(await raphael.getNativeTokenAddress()).to.equal(token.address)
                    expect(await staking.getTokenAddress()).to.equal(token.address)
                    expect(await staking.getDaoAddress()).to.equal(raphael.address)
                    expect(await token.balanceOf(raphael.address)).to.equal(VITA_CAP)
                });

            })

            describe("User staking functions", async () => {
                let proposal

                const stakeAndCreateProposal = async (id: number) => {
                    let proposalId = id

                    // Cat stakes 9 tokens
                    await raphael.connect(admin).transferNativeToken(user3CatAddress, 10)
                    await token.connect(user3Cat).approve(staking.address, 10)
                    await staking.connect(user3Cat).stake(9)
                    expect((await staking.getStakedBalance(user3CatAddress)).gt(BigNumber.from(1)))

                    // Cat creates a new proposal
                    await (await raphael.connect(user3Cat).createProposal("Prop " + proposalId)).wait()
                    return {
                        data: await raphael.getProposalData(proposalId),
                        id: proposalId
                    }
                }

                beforeEach(async () => {
                    // Burning any voting tokens user owns before each test

                    let bal = await token.balanceOf(user1AliceAddress)
                    if (bal.gt(BigNumber.from(0))) {
                        await token.connect(user1Alice).transfer(ethers.constants.AddressZero, bal)
                    }
                    bal = await token.balanceOf(user3CatAddress)
                    if (bal.gt(BigNumber.from(0))) {
                        await token.connect(user3Cat).transfer(ethers.constants.AddressZero, bal)
                    }
                });

                it("User can stake tokens they own on vote", async () => {
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                    await raphael.connect(admin).transferNativeToken(user1AliceAddress, 10)
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(BigNumber.from(10))

                    await token.connect(user1Alice).approve(staking.address, 10)
                    await staking.connect(user1Alice).stake(9)

                    expect(await token.balanceOf(user1AliceAddress)).to.equal(BigNumber.from(1))
                    expect(await token.balanceOf(staking.address)).to.equal(BigNumber.from(9))
                    expect(await staking.getStakedBalance(user1AliceAddress)).to.equal(BigNumber.from(9))
                });

                it("User cannot stake more tokens than they own", async () => {
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                    await raphael.connect(admin).transferNativeToken(user1AliceAddress, 10)
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(BigNumber.from(10))

                    await token.connect(user1Alice).approve(staking.address, 10)

                    await expect(
                        staking.connect(user1Alice).stake(20)
                    ).to.be.revertedWith("Amount higher than user's balance");

                    expect(await token.balanceOf(user1AliceAddress)).to.equal(BigNumber.from(10))
                });

                it("User can withdraw tokens after proposal ends", async () => {

                    proposal = await stakeAndCreateProposal(1)

                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                    await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)

                    // Alice approves then stakes
                    await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)
                    let tx = await staking.connect(user1Alice).stake(ONE_ETHER_TOKENS.sub(BigNumber.from(1)))

                    // skip blocks to get to voting period
                    let blockToSkip = proposal.data[3].sub(tx.blockNumber)
                    await skipBlocks(blockToSkip)
                    await raphael.connect(admin).updateProposalStatus(proposal.id)

                    // Alice votes
                    tx = await raphael.connect(user1Alice).vote(proposal.id, true)

                    // skip to proposal end block
                    blockToSkip = proposal.data[4].sub(tx.blockNumber)
                    await skipBlocks(blockToSkip)

                    // update
                    await raphael.connect(admin).updateProposalStatus(proposal.id)

                    // check that Alice can withdraw her staked tokens
                    expect(await staking.getStakedBalance(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS.sub(BigNumber.from(1)))
                    await staking.connect(user1Alice).withdraw(ONE_ETHER_TOKENS.sub(BigNumber.from(1)))
                    expect(await staking.getStakedBalance(user1AliceAddress)).to.equal(ethers.constants.Zero)
                });

                it("User cannot withdraw tokens before proposal ends", async () => {

                    proposal = await stakeAndCreateProposal(1)

                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                    await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)

                    // Alice approves then stakes
                    await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)
                    let tx = await staking.connect(user1Alice).stake(ONE_ETHER_TOKENS.sub(BigNumber.from(1)))

                    // skip blocks to get to voting period
                    let blocksToSkip = proposal.data[3].sub(tx.blockNumber)
                    await skipBlocks(blocksToSkip)
                    await raphael.connect(admin).updateProposalStatus(proposal.id)

                    // Alice votes
                    tx = await raphael.connect(user1Alice).vote(proposal.id, true)

                    // check block is before end of proposal - can't withdraw
                    // expect(BigNumber.from(tx.blockNumber).lt(proposal.data[4]))

                    // we'll skip to the endTime block just to check
                    // there will be 3 blocks mined (outside skipping) in total, 
                    // so we subtract 3
                    await skipBlocks(BigNumber.from(`${VOTING_DURATION - 3}`));

                    // Should revert - not out of voting period
                    await expect(
                        raphael.connect(admin).updateProposalStatus(proposal.id)
                    ).to.be.revertedWith("Still in voting period");

                    // check that Alice CANNOT withdraw her staked tokens
                    expect(await staking.getStakedBalance(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS.sub(BigNumber.from(1)))

                    await expect(
                        staking.connect(user1Alice).withdraw(ONE_ETHER_TOKENS.sub(BigNumber.from(1)))
                    ).to.be.revertedWith("Tokens not unlocked yet");

                    expect(await staking.getStakedBalance(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS.sub(BigNumber.from(1)))
                });

                it("User can extend stake period by voting on a new proposal", async () => {
                    // start proposal 1 - Cat
                    proposal = await stakeAndCreateProposal(1)

                    // send Alice tokens
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                    await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)

                    // Alice approves then stakes
                    await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)
                    let tx = await staking.connect(user1Alice).stake(ONE_ETHER_TOKENS.sub(BigNumber.from(1)))

                    // skip blocks to get to voting period
                    let blockToSkip = proposal.data[3].sub(tx.blockNumber)
                    await skipBlocks(blockToSkip)
                    await raphael.connect(admin).updateProposalStatus(proposal.id)

                    // Alice votes on Proposal 1
                    tx = await raphael.connect(user1Alice).vote(proposal.id, true)

                    // Check Alice's unlock time
                    let unlockTime1 = await staking.getUnlockTime(user1AliceAddress)
                    // should unlock at end of prop 1 voting
                    expect(unlockTime1.eq(proposal.data[4]))

                    // Admin sets voting time for next proposal to 100 blocks
                    await raphael.connect(admin).setVotingDuration(BigNumber.from(100))

                    // start proposal 2 - Cat (starts before prop 1 ends, ends later)
                    proposal = await stakeAndCreateProposal(2)

                    // Check Alice's unlock time hasn't changed
                    let unlockTime2 = await staking.getUnlockTime(user1AliceAddress)
                    expect(unlockTime2).to.equal(unlockTime1)

                    // skip blocks to get to voting period
                    blockToSkip = proposal.data[3].sub(tx.blockNumber)
                    await skipBlocks(blockToSkip)
                    await raphael.connect(admin).updateProposalStatus(proposal.id)

                    // Alice votes in prop 2
                    tx = await raphael.connect(user1Alice).vote(proposal.id, true)

                    // Check Alice's unlock time has extended
                    unlockTime2 = await staking.getUnlockTime(user1AliceAddress)
                    // unlock time greater than original time
                    expect(unlockTime2.gt(unlockTime1))
                    // unlock time same as new proposal vote end time
                    expect(unlockTime2.eq(proposal.data[4]))
                });

                it("User's stake period doesn't extend if 2nd proposal ends before 1st proposal", async () => {

                    // Admin sets voting time for next proposal to 100 blocks
                    await raphael.connect(admin).setVotingDuration(BigNumber.from(100))

                    // start proposal 1 - Cat
                    let proposal1 = await stakeAndCreateProposal(1)

                    // Alice recieves, approves, and stakes tokens
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                    await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)
                    await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)
                    let tx = await staking.connect(user1Alice).stake(ONE_ETHER_TOKENS.sub(BigNumber.from(1)))

                    // Make voting period for next prop much shorter
                    await raphael.connect(admin).setVotingDuration(BigNumber.from(20))

                    // start proposal 2 - Cat
                    let proposal2 = await stakeAndCreateProposal(2)

                    // check proposal 1 ends 80 blocks after proposal 2
                    expect(proposal1.data[4].eq(proposal2.data[4].add(BigNumber.from(80))))

                    // skip blocks to get to voting period for PROP 1
                    let blockToSkip = proposal1.data[3].sub(tx.blockNumber)
                    await skipBlocks(blockToSkip)
                    await raphael.connect(admin).updateProposalStatus(proposal1.id)

                    // Alice votes on Proposal 1
                    tx = await raphael.connect(user1Alice).vote(proposal1.id, true)

                    // skip blocks to get to voting period for PROP 2
                    blockToSkip = proposal2.data[3].sub(tx.blockNumber)
                    await skipBlocks(blockToSkip)
                    await raphael.connect(admin).updateProposalStatus(proposal2.id)

                    // Check Alice's unlock time - should be end of prop 1
                    let unlockTime1 = await staking.getUnlockTime(user1AliceAddress)
                    expect(unlockTime1.eq(proposal1.data[4]))

                    // Alice votes in prop 2
                    tx = await raphael.connect(user1Alice).vote(proposal2.id, true)

                    // Check Alice's unlock time hasn't changed
                    let unlockTime2 = await staking.getUnlockTime(user1AliceAddress)

                    // unlock time should be same - still end of prop 1
                    expect(unlockTime2.eq(proposal1.data[4]))
                    expect(unlockTime2).to.equal(unlockTime1)
                });

                it("User cannot withdraw after 1st proposal ends and before 2nd proposal ends", async () => {
                    // Admin sets voting time for next proposal to 20 blocks
                    await raphael.connect(admin).setVotingDuration(BigNumber.from(20))

                    // start proposal 1 - Cat
                    let proposal1 = await stakeAndCreateProposal(1)

                    // Alice recieves, approves, and stakes tokens
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                    await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)
                    await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)
                    let tx = await staking.connect(user1Alice).stake(ONE_ETHER_TOKENS.sub(BigNumber.from(1)))

                    // Make voting period for next prop much longer
                    await raphael.connect(admin).setVotingDuration(BigNumber.from(100))

                    // start proposal 2 - Cat
                    let proposal2 = await stakeAndCreateProposal(2)

                    // check proposal 2 ends 80 blocks after proposal 1
                    expect(proposal2.data[4].eq(proposal1.data[4].add(BigNumber.from(80))))

                    // skip blocks to get to voting period for PROP 1
                    let blockToSkip = proposal1.data[3].sub(tx.blockNumber)
                    await skipBlocks(blockToSkip)
                    await raphael.connect(admin).updateProposalStatus(proposal1.id)

                    // Alice votes on Proposal 1
                    tx = await raphael.connect(user1Alice).vote(proposal1.id, true)

                    // skip blocks to get to voting period for PROP 2
                    blockToSkip = proposal2.data[3].sub(tx.blockNumber)
                    await skipBlocks(blockToSkip)
                    await raphael.connect(admin).updateProposalStatus(proposal2.id)

                    // Check Alice's unlock time - should be end of prop 1
                    let unlockTime1 = await staking.getUnlockTime(user1AliceAddress)
                    expect(unlockTime1.eq(proposal1.data[4]))

                    // Alice votes in prop 2
                    tx = await raphael.connect(user1Alice).vote(proposal2.id, true)

                    // Check Alice's unlock time hasn't changed
                    let unlockTime2 = await staking.getUnlockTime(user1AliceAddress)

                    // should unlock end of prop 2 = (end of prop 1 + 80 blocks)
                    expect(unlockTime2.eq(proposal2.data[4]))
                    expect(unlockTime2.gt(unlockTime1.add(BigNumber.from(80))))

                    // skip to end of prop 1 - then update status
                    blockToSkip = proposal1.data[4].sub(tx.blockNumber)
                    await skipBlocks(blockToSkip)
                    await raphael.connect(admin).updateProposalStatus(proposal1.id)

                    // atttempt Alice withdraw - should revert because still locked
                    await expect(
                        staking.connect(user1Alice).withdraw(ONE_ETHER_TOKENS.sub(BigNumber.from(500)))
                    ).to.be.revertedWith("Tokens not unlocked yet")

                    // skip to end of prop 2 - then update status
                    let currentBlock = await ethers.provider.getBlockNumber()
                    blockToSkip = proposal2.data[4].sub(currentBlock)
                    await skipBlocks(blockToSkip)
                    await raphael.connect(admin).updateProposalStatus(proposal2.id)

                    // Alice should be able to withdraw now
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(BigNumber.from(1))
                    await staking.connect(user1Alice).withdraw(ONE_ETHER_TOKENS.sub(BigNumber.from(1)))
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)
                });

                it("User can add to staked balance", async () => {
                    // Alice recieves, approves, and stakes tokens
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                    await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)
                    await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)

                    // Alice stakes quarter of her tokens
                    const quarterTokens = ONE_ETHER_TOKENS.div(4)
                    await staking.connect(user1Alice).stake(quarterTokens)

                    // Check stakedBalance for Alice is quarter of her tokens
                    let balance = await staking.getStakedBalance(user1AliceAddress)
                    expect(balance.eq(quarterTokens))

                    // Alice stakes another quarter
                    await staking.connect(user1Alice).stake(quarterTokens)

                    // Check stakedBalance for Alice is 2x quarter of her tokens
                    balance = await staking.getStakedBalance(user1AliceAddress)
                    expect(balance).to.equal(quarterTokens.mul(2))
                });

                it("Adding to staked balance doesn't affect lock time", async () => {
                    // start proposal 1 - Cat
                    let proposal1 = await stakeAndCreateProposal(1)

                    // Alice recieves, approves, and stakes tokens
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                    await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)
                    await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)

                    // Alice stakes quarter of her tokens
                    const quarterTokens = ONE_ETHER_TOKENS.div(4)
                    await staking.connect(user1Alice).stake(quarterTokens)

                    // Check stakedBalance for Alice is quarter of her tokens
                    let balance = await staking.getStakedBalance(user1AliceAddress)
                    expect(balance.eq(quarterTokens))

                    // skip to end of prop 1 - then update status
                    let currentBlock = await ethers.provider.getBlockNumber()
                    let blockToSkip = proposal1.data[3].sub(currentBlock)
                    await skipBlocks(blockToSkip)
                    await raphael.connect(admin).updateProposalStatus(proposal1.id)

                    // Alice stakes another quarter
                    await staking.connect(user1Alice).stake(quarterTokens)

                    // Alice votes in prop 1
                    await raphael.connect(user1Alice).vote(proposal1.id, true)

                    let unlockTime1 = await staking.getUnlockTime(user1AliceAddress)

                    // Check stakedBalance for Alice is 2x quarter of her tokens
                    balance = await staking.getStakedBalance(user1AliceAddress)
                    expect(balance).to.equal(quarterTokens.mul(2))

                    // Check unlock time hasn't changed
                    let unlockTime2 = await staking.getUnlockTime(user1AliceAddress)
                    expect(unlockTime2.eq(unlockTime1))
                });

                it("Adding to staked balance increases voting power for new proposals", async () => {
                    // Gives us time for txs while having 2 proposals running 
                    await raphael.connect(admin).setVotingDuration(BigNumber.from(25))
                    // start proposal 1 - Cat
                    let proposal1 = await stakeAndCreateProposal(1)
                    let proposal2 = await stakeAndCreateProposal(2)

                    // Alice recieves, approves, and stakes tokens
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                    await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)
                    await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)

                    // Alice stakes quarter of her tokens
                    const quarterTokens = ONE_ETHER_TOKENS.div(4)
                    await staking.connect(user1Alice).stake(quarterTokens)

                    // Check stakedBalance for Alice is quarter of her tokens
                    let balance = await staking.getStakedBalance(user1AliceAddress)
                    expect(balance.eq(quarterTokens))

                    // get prop 1 to voting
                    let currentBlock = await ethers.provider.getBlockNumber()
                    let blockToSkip = proposal1.data[3].sub(currentBlock)
                    await skipBlocks(blockToSkip)
                    await raphael.connect(admin).updateProposalStatus(proposal1.id)

                    // Alice votes in prop 1
                    await raphael.connect(user1Alice).vote(proposal1.id, true)
                    // check votes in prop 1
                    let propData1 = await raphael.getProposalData(proposal1.id)

                    expect(propData1[1].eq(quarterTokens))

                    // Alice stakes another quarter
                    await staking.connect(user1Alice).stake(quarterTokens)

                    // get prop 2 to voting
                    currentBlock = await ethers.provider.getBlockNumber()
                    blockToSkip = proposal2.data[3].sub(currentBlock)
                    await skipBlocks(blockToSkip)
                    await raphael.connect(admin).updateProposalStatus(proposal2.id)

                    // Alice votes in prop 2
                    await raphael.connect(user1Alice).vote(proposal2.id, true)
                    // check votes in prop 2
                    let propData2 = await raphael.getProposalData(proposal1.id)

                    // check votes in prop 2
                    expect(propData2[1].eq(quarterTokens.mul(2)))
                });

            })

            describe("Emergency Shutdown (ES)", async () => {
                const stakeAndCreateProposal = async (id: number) => {
                    let proposalId = id

                    // Cat stakes 9 tokens
                    await raphael.connect(admin).transferNativeToken(user3CatAddress, 10)
                    await token.connect(user3Cat).approve(staking.address, 10)
                    await staking.connect(user3Cat).stake(9)
                    expect((await staking.getStakedBalance(user3CatAddress)).gt(BigNumber.from(1)))

                    // Cat creates a new proposal
                    await (await raphael.connect(user3Cat).createProposal("Prop " + proposalId)).wait()
                    return {
                        data: await raphael.getProposalData(proposalId),
                        id: proposalId
                    }
                }

                it("ES unlocks all stakers' funds for withdrawal", async () => {

                    // start proposal 1 - Cat
                    let firstProposal = await stakeAndCreateProposal(1)

                    // Alice recieves, approves, and stakes tokens
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                    await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)
                    await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)

                    // Alice stakes quarter of her tokens
                    const quarterTokens = ONE_ETHER_TOKENS.div(4)
                    await staking.connect(user1Alice).stake(quarterTokens)

                    // Check stakedBalance for Alice is quarter of her tokens
                    let balance = await staking.getStakedBalance(user1AliceAddress)
                    expect(balance.eq(quarterTokens))

                    // get prop 1 to voting
                    let currentBlock = await ethers.provider.getBlockNumber()
                    let blockToSkip = firstProposal.data[3].sub(currentBlock)
                    await skipBlocks(blockToSkip)
                    await raphael.connect(admin).updateProposalStatus(firstProposal.id)

                    // Alice votes in prop 1
                    await raphael.connect(user1Alice).vote(firstProposal.id, true)

                    // can't withdraw
                    await expect(
                        staking.connect(user1Alice).withdraw(ONE_ETHER_TOKENS.sub(BigNumber.from(1)))
                    ).to.be.revertedWith("Tokens not unlocked yet");

                    // sweep out DAO funds (prereq for shutdown)
                    await raphael.connect(admin).transferNativeToken(adminAddress, await raphael.getNativeTokenBalance());

                    // Call emergencyShutdown
                    expect(await staking.isShutdown()).to.equal(false)
                    await raphael.connect(admin).emergencyShutdown()
                    expect(await staking.isShutdown()).to.equal(true)

                    // Should be able to withdraw
                    balance = await staking.getStakedBalance(user1AliceAddress)
                    expect(balance.eq(quarterTokens))
                    staking.connect(user1Alice).withdraw(balance)
                    balance = await staking.getStakedBalance(user1AliceAddress)
                    expect(balance.eq(0))
                });

                it("ES prevents new staking from users", async () => {

                    // Alice recieves, approves, and stakes tokens
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                    await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                    expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)
                    await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)

                    // sweep out DAO funds (prereq for shutdown)
                    await raphael.connect(admin).transferNativeToken(adminAddress, await raphael.getNativeTokenBalance());

                    // Call emergencyShutdown
                    expect(await staking.isShutdown()).to.equal(false)
                    await raphael.connect(admin).emergencyShutdown()
                    expect(await staking.isShutdown()).to.equal(true)

                    // Alice stakes quarter of her tokens
                    const quarterTokens = ONE_ETHER_TOKENS.div(4)
                    await expect(
                        staking.connect(user1Alice).stake(quarterTokens)
                    ).to.be.revertedWith("cannot be called after shutdown");
                });
            })

        })

        describe("Events", async () => {

            const stakeAndCreateProposal = async (id: number) => {
                let proposalId = id

                // Cat stakes 9 tokens
                await raphael.connect(admin).transferNativeToken(user3CatAddress, 10)
                await token.connect(user3Cat).approve(staking.address, 10)
                await staking.connect(user3Cat).stake(9)
                expect((await staking.getStakedBalance(user3CatAddress)).gt(BigNumber.from(1)))

                // Cat creates a new proposal
                await (await raphael.connect(user3Cat).createProposal("Prop " + proposalId)).wait()
                return {
                    data: await raphael.getProposalData(proposalId),
                    id: proposalId
                }
            }

            beforeEach(async () => {

            });

            it("StakeChanged emits correctly", async () => {

                // Alice recieves, approves, and stakes tokens
                expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)
                await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)

                // Alice stakes quarter of her tokens
                const quarterTokens = ONE_ETHER_TOKENS.div(4)
                let tx = await (await staking.connect(user1Alice).stake(quarterTokens)).wait()

                expect(tx?.events[2]?.args?.staker).to.equal(user1AliceAddress)
                expect(tx?.events[2]?.args?.newStakedBalance).to.equal(quarterTokens)

            });

            it("UnlockTimeIncreased emits correctly", async () => {

                let firstProposal = await stakeAndCreateProposal(1)

                // Alice recieves, approves, and stakes tokens
                expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)
                await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)

                // Alice stakes quarter of her tokens
                const quarterTokens = ONE_ETHER_TOKENS.div(4)
                let tx = await (await staking.connect(user1Alice).stake(quarterTokens)).wait()

                // get prop 1 to voting
                let currentBlock = await ethers.provider.getBlockNumber()
                let blockToSkip = firstProposal.data[3].sub(currentBlock)
                await skipBlocks(blockToSkip)
                await raphael.connect(admin).updateProposalStatus(firstProposal.id)

                await expect(raphael.connect(user1Alice).vote(firstProposal.id, true))
                    .to.emit(staking, 'UnlockTimeIncreased')
                    .withArgs(user1AliceAddress, firstProposal.data[4]);

            });

            it("EmergencyShutdown emits correctly", async () => {
                // Call emergencyShutdown
                expect(await staking.isShutdown()).to.equal(false)

                // sweep out DAO funds (prereq for shutdown)
                await raphael.connect(admin).transferNativeToken(adminAddress, await raphael.getNativeTokenBalance());

                let block = await ethers.provider.getBlockNumber()
                block += 1;

                await expect(raphael.connect(admin).emergencyShutdown())
                    .to.emit(staking, 'EmergencyShutdown')
                    .withArgs(adminAddress, BigNumber.from(block));

                expect(await staking.isShutdown()).to.equal(true)
            });
        })

        describe("Modifiers", async () => {
            const stakeAndCreateProposal = async (id: number) => {
                let proposalId = id

                // Cat stakes 9 tokens
                await raphael.connect(admin).transferNativeToken(user3CatAddress, 10)
                await token.connect(user3Cat).approve(staking.address, 10)
                await staking.connect(user3Cat).stake(9)
                expect((await staking.getStakedBalance(user3CatAddress)).gt(BigNumber.from(1)))

                // Cat creates a new proposal
                await (await raphael.connect(user3Cat).createProposal("Prop " + proposalId)).wait()
                return {
                    data: await raphael.getProposalData(proposalId),
                    id: proposalId
                }
            }

            it("onlyDao: functions can be called by DAO", async () => {
                // sweep out DAO funds (prereq for shutdown)
                await raphael.connect(admin).transferNativeToken(adminAddress, await raphael.getNativeTokenBalance());
                
                expect(await staking.isShutdown()).to.equal(false)
                await raphael.connect(admin).emergencyShutdown()
                expect(await staking.isShutdown()).to.equal(true)
            });

            it("onlyDao: functions cannot be called by admin or user", async () => {
                expect(await staking.isShutdown()).to.equal(false)

                await expect(
                    raphael.connect(user1Alice).emergencyShutdown()
                ).to.reverted;

                await expect(
                    staking.connect(user1Alice).emergencyShutdown()
                ).to.reverted;

                expect(await staking.isShutdown()).to.equal(false)
            });

            it("notShutdown: functions can be called if not shutdown", async () => {
                let isShutdown = await staking.isShutdown()
                expect(isShutdown).to.equal(false)

                // start proposal 1 - Cat
                let proposal1 = await stakeAndCreateProposal(1)

                // Alice recieves, approves, and stakes tokens
                expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)
                await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)

                // Alice stakes quarter of her tokens
                await staking.connect(user1Alice).stake(ONE_ETHER_TOKENS.sub(1)) //TODO mabye add sub(1) ???

                // get prop 1 to voting
                let currentBlock = await ethers.provider.getBlockNumber()
                let blockToSkip = proposal1.data[3].sub(currentBlock)
                await skipBlocks(blockToSkip)
                await raphael.connect(admin).updateProposalStatus(proposal1.id)

                // Alice votes in prop 1
                await raphael.connect(user1Alice).vote(proposal1.id, true)

                // check vote worked (implies stake worked if can vote)
                let propData1 = await raphael.getProposalData(proposal1.id)
                expect(propData1[1].eq(ONE_ETHER_TOKENS.sub(1)))

                // check still not shutdown
                isShutdown = await staking.isShutdown()
                expect(isShutdown).to.equal(false)
            });

            it("notShutdown: functions cannot be called if shutdown", async () => {

                // Alice recieves, approves, and stakes tokens
                expect(await token.balanceOf(user1AliceAddress)).to.equal(ethers.constants.Zero)
                await raphael.connect(admin).transferNativeToken(user1AliceAddress, ONE_ETHER_TOKENS)
                expect(await token.balanceOf(user1AliceAddress)).to.equal(ONE_ETHER_TOKENS)
                await token.connect(user1Alice).approve(staking.address, ONE_ETHER_TOKENS)

                // sweep out DAO funds (prereq for shutdown)
                await raphael.connect(admin).transferNativeToken(adminAddress, await raphael.getNativeTokenBalance());

                // Call emergencyShutdown
                expect(await staking.isShutdown()).to.equal(false)
                await raphael.connect(admin).emergencyShutdown()
                expect(await staking.isShutdown()).to.equal(true)

                // Can't stake if shut down
                await expect(
                    staking.connect(user1Alice).stake(ONE_ETHER_TOKENS.sub(1))
                ).to.revertedWith("cannot be called after shutdown");
            });
        })

    })

})