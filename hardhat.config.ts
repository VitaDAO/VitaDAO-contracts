import { task } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import { HardhatUserConfig } from 'hardhat/types';
import * as dotenv from "dotenv";
require('hardhat-contract-sizer');
require("hardhat-gas-reporter");
dotenv.config();


/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const config = {
  defaultNetwork: "localhost",
  solidity: {
    compilers: [{ version: "0.8.4", settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    } }],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  gasReporter: {
    enabled: (process.env.REPORT_GAS === 'true') ? true : false
  },
  networks: {
    localhost: {
      url: "http://localhost:8545",
      /*
        notice no env vars here? it will just use account 0 of the hardhat node to deploy
        (you can put in a mnemonic here to set the deployer locally)
      */
    },
    // networks without env vars set need to be commented out or they'll crash the script 
    // so only uncomment if the .env has been set
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.RINKEBY_INFURA_KEY}`,
      accounts: [`${process.env.RINKEBY_DEPLOYER_PRIV_KEY}`],
    },
    // mainnet: {
    //   url: `https://mainnet.infura.io/v3/${process.env.MAINNET_INFURA_KEY}`,
    //   accounts: [`${process.env.MAINNET_DEPLOYER_PRIV_KEY}`],
    // },
    // ropsten: {
    //   url: `https://ropsten.infura.io/v3/${process.env.ROPSTEN_INFURA_KEY}`,
    //   accounts: [`${process.env.ROPSTEN_DEPLOYER_PRIV_KEY}`],
    // },
    // goerli: {
    //   url: `https://goerli.infura.io/v3/${process.env.GOERLI_INFURA_KEY}`,
    //   accounts: [`${process.env.GOERLI_DEPLOYER_PRIV_KEY}`],
    // },
    // xdai: {
    //   url: 'https://dai.poa.network',
    //   gasPrice: 1000000000,
    //   accounts: [`${process.env.XDAI_DEPLOYER_PRIV_KEY}`],
    // },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  // mocha options can be set here
  mocha: {
    timeout: "1500s",
  },
};
export default config;
