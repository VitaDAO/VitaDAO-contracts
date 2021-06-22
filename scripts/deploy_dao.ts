import hre, { ethers } from "hardhat";
import "@nomiclabs/hardhat-etherscan";
import chalk from "chalk";
import fs from "fs";
import { Contract } from "ethers";
import ProgressBar from "progress";

interface DeploymentObject {
  name: string;
  address: string;
  args: any;
  contract: Contract;
}

// custom `deploy` in order to make verifying easier
const deploy = async (contractName: string, _args: any[] = [], overrides = {}, libraries = {}) => {
  console.log(` 🛰  Deploying: ${contractName}`);

  const contractArgs: any = _args || [];
  const stringifiedArgs = JSON.stringify(contractArgs);
  const contractArtifacts = await ethers.getContractFactory(contractName,{libraries: libraries});
  const contract = await contractArtifacts.deploy(...contractArgs, overrides);
  const contractAddress = contract.address;
  fs.writeFileSync(`artifacts/${contractName}.address`, contractAddress);
  fs.writeFileSync(`artifacts/${contractName}.args`, stringifiedArgs);

  // tslint:disable-next-line: no-console
  console.log("Deploying", chalk.cyan(contractName), "contract to", chalk.magenta(contractAddress));

  await contract.deployed();

  const deployed: DeploymentObject = { name: contractName, address: contractAddress, args: contractArgs, contract };

  return deployed
}

const pause = (time: number) => new Promise(resolve => setTimeout(resolve, time));

const verifiableNetwork = ["mainnet", "ropsten", "rinkeby", "goerli", "kovan"];

async function main() {
  const network = process.env.HARDHAT_NETWORK === undefined ? "localhost" : process.env.HARDHAT_NETWORK;
  
  // tslint:disable-next-line: no-console
  console.log("🚀 Deploying to", chalk.magenta(network), "!");
  if(
    network === "localhost" || 
    network === "hardhat"
  ) {
    const [deployer] = await ethers.getSigners();

    // tslint:disable-next-line: no-console
    console.log(
      chalk.cyan("deploying contracts with the account:"),
      chalk.green(deployer.address)
    );

    // tslint:disable-next-line: no-console
    console.log("Account balance:", (await deployer.getBalance()).toString());
  }

  // this array stores the data for contract verification
  let contracts: DeploymentObject[] = [];

  // In order to set scripts for certain nets (rinkeby, mainnet), use the 
  // network variable. For example, if you want to set conditions that are 
  // only triggered in a mainnet deployment:
  // if(network === "mainnet"){
  //   // set logic here
  // }

  let tokenAddress: string | undefined;
  let dao: DeploymentObject;
  let staking: DeploymentObject;
  
  switch(network){
    // local testing setup, also deploys token
    case "localhost":
      console.log("\nDeploying to localhost...")
      const token = await deploy("VITA", ["test VITA token", "tVITA", ethers.utils.parseUnits("64298880")]);
      tokenAddress = token.address;
      dao = await deploy("Raphael");
      staking = await deploy("Staking", [token.address, dao.address]);
      console.log(chalk.greenBright.bold("Token, DAO, and Staking contracts deployed!"));

      // initial setup - set token and staking address on DAO
      await dao.contract.setNativeTokenAddress(tokenAddress);
      console.log(`Token address set in DAO to ${chalk.green(tokenAddress)}`);
      await dao.contract.setStakingAddress(staking.address);
      console.log(`Staking address set in DAO to ${chalk.green(staking.address)}`);

      break;
    // testnet deploy, relies on previous token deployment
    case "goerli":
      tokenAddress = process.env.GOERLI_VITA_ADDRESS;
      dao = await deploy("Raphael");
      contracts.push(dao);
      staking = await deploy("Staking", [tokenAddress, dao.address]);
      contracts.push(staking);

      // initial setup
      await dao.contract.setNativeTokenAddress(tokenAddress);
      console.log(`Token address set in DAO to ${chalk.green(tokenAddress)}`);
      await dao.contract.setStakingAddress(staking.address);
      console.log(`Staking address set in DAO to ${chalk.green(staking.address)}`);

      break;
    case "rinkeby":
      tokenAddress = process.env.RINKEBY_VITA_ADDRESS;
      dao = await deploy("Raphael");
      contracts.push(dao);
      staking = await deploy("Staking", [tokenAddress, dao.address]);
      contracts.push(staking);

      // initial setup
      await dao.contract.setNativeTokenAddress(tokenAddress);
      console.log(`Token address set in DAO to ${chalk.green(tokenAddress)}`);
      await dao.contract.setStakingAddress(staking.address);
      console.log(`Staking address set in DAO to ${chalk.green(staking.address)}`);

      break;
    // mainnet deploy
    case "mainnet":
      tokenAddress = process.env.MAINNET_VITA_ADDRESS;
      dao = await deploy("Raphael");
      contracts.push(dao);
      staking = await deploy("Staking", [tokenAddress, dao.address]);
      contracts.push(staking);

      // initial setup
      await dao.contract.setNativeTokenAddress(tokenAddress);
      console.log(`Token address set in DAO to ${chalk.green(tokenAddress)}`);
      await dao.contract.setStakingAddress(staking.address);
      console.log(`Staking address set in DAO to ${chalk.green(staking.address)}`);

      break;
    default:
      console.log(chalk.magenta("Please switch network to localhost, rinkeby, goerli, or mainnet"));
  }

  // verification
  if(
    verifiableNetwork.includes(network)
    ) {
      let counter = 0;
      
      // tslint:disable-next-line: no-console
      console.log("Beginning Etherscan verification process...\n", 
        chalk.yellow(`WARNING: The process will wait two minutes for Etherscan 
        to update their backend before commencing, please wait and do not stop 
        the terminal process...`)
      );

      const bar = new ProgressBar('Etherscan update: [:bar] :percent :etas', { 
        total: 50,
        complete: '\u2588',
        incomplete: '\u2591',
      });

      // two minute timeout to let Etherscan update
      const timer = setInterval(() => {
        bar.tick();
        if(bar.complete) {
          clearInterval(timer);
        }
      }, 2300);

      await pause(120000);

      // tslint:disable-next-line: no-console
      console.log(chalk.cyan("\n🔍 Running Etherscan verification..."));

      await Promise.all(contracts.map(async contract => {
        // tslint:disable-next-line: no-console
        console.log(`Verifying ${contract.name}...`);
        try {
          await hre.run("verify:verify", {
            address: contract.address,
            constructorArguments: contract.args
          });
          await pause(2000);
          // tslint:disable-next-line: no-console
          console.log(chalk.cyan(`✅ ${contract.name} verified!`));
        } catch (error) {
          // tslint:disable-next-line: no-console
          console.log(error);
        }
      }));
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    // tslint:disable-next-line: no-console
    console.error(error);
    process.exit(1);
  });