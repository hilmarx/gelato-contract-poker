import { deployments, ethers, getNamedAccounts } from "hardhat";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";
import { sleep } from "../src/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  //   if (hre.network.name === "ropsten") {
  //     console.log(
  //       `Deploying ContractPoker to ${hre.network.name}. Hit ctrl + c to abort`
  //     );
  //     await sleep(10000);
  //   }

  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("ContractPoker", {
    from: deployer,
    maxFeePerGas: ethers.utils.parseUnits("38", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("1.5", "gwei"),
    log: hre.network.name !== "hardhat" ? true : false,
  });
};

export default func;

func.tags = ["ContractPoker"];
