import { ethers } from "hardhat";
import { BigNumber, Contract, Signer } from "ethers";
import { expect } from "chai";

const VITA_CAP = ethers.constants.WeiPerEther.mul(BigNumber.from(64298880))

describe("Vita DAO token", () => {
    let accounts: Signer[];

    let admin: Signer;
    let user: Signer;

    let adminAddress: string;
    let userAddress: string;

    let raphael: Contract;
    let token: Contract;
    let nft: Contract;

    beforeEach(async () => {
        accounts = await ethers.getSigners();
        admin = accounts[1];
        user = accounts[2];

        adminAddress = await admin.getAddress();
        userAddress = await user.getAddress();
    });


    describe("VITA token", () => {
        beforeEach(async () => {
            const Raphael = await ethers.getContractFactory("Raphael");
            raphael = await Raphael.connect(admin).deploy();
            await raphael.deployed();

            const Token = await ethers.getContractFactory("VITA");
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

        // ERC20 SNAPSHOT TESTING
        describe("ERC20Snapshot functions", async () => {

            it("premint is transferred to DAO", async () => {
                // the ERC20 token should send the whole 10 million supply to Raphael
                expect(await token.balanceOf(raphael.address))
                    .to.equal(VITA_CAP);

                expect(await token.balanceOf(raphael.address))
                    .to.equal(await token.totalSupply());
            });

            // we aren't doing snapshot ERC anymore

            
            // it("creates a snapshot", async () => {
            //     // the ERC20 token should send the whole 10 million supply to Raphael
            //     expect(await token.balanceOf(raphael.address))
            //         .to.equal(VITA_CAP);

            //     let tx = await (await token.snapshot()).wait();
            //     expect(tx?.events[0].args.id.eq(BigNumber.from(1)))

            //     tx = await (await token.snapshot()).wait();
            //     expect(tx?.events[0].args.id.eq(BigNumber.from(2)))

            // });
        });
    });
});