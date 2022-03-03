import { expect } from "chai";
import { Signer } from "@ethersproject/abstract-signer";
import hre = require("hardhat");

import { ContractPoker, IERC20 } from "../typechain";
import { Ops } from "./types/Ops";
import { abi as OpsAbi } from "./abis/Ops.json";
import { abi as ForwarderAbi } from "./abis/Forwarder.json";
import { abi as CvxStakingAbi } from "./abis/CvxStaking.json";
import { BigNumber } from "ethers";

const { ethers, deployments } = hre;

const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const cvxCrvAddress = "0x62b9c7356a2dc64a1969e19c23e4f579f9810aa7";
const cvxStakingAddress = "0xE096ccEc4a1D36F191189Fe61E803d8B2044DFC3";

describe("Test Bot Proxy Smart Contract", function () {
  this.timeout(0);

  let owner: Signer;
  let executor: Signer;

  let ownerAddress: string;
  let executorAddress: string;

  let poker: ContractPoker;
  let ops: Ops;
  let forwarder: any;
  let cvxStaking: any;
  let cvxCrv: IERC20;

  let resolverHash: string;
  let execData: string;

  beforeEach("tests", async function () {
    if (hre.network.name !== "hardhat") {
      console.error("Test Suite is meant to be run on hardhat only");
      process.exit(1);
    }

    await deployments.fixture();
    [owner] = await hre.ethers.getSigners();
    ownerAddress = await owner.getAddress();

    poker = await ethers.getContract("ContractPoker");
    executorAddress = await poker.GELATO();
    const opsAddress = await poker.GELATO_OPS();
    ops = <Ops>await ethers.getContractAt(OpsAbi, opsAddress);
    cvxStaking = await ethers.getContractAt(CvxStakingAbi, cvxStakingAddress);
    cvxCrv = await ethers.getContractAt("IERC20", cvxCrvAddress);

    const forwarderAddress = "0xA9AB392d9c725a302329434E92812fdeD02160d4";
    forwarder = await ethers.getContractAt(ForwarderAbi, forwarderAddress);

    executor = await ethers.provider.getSigner(executorAddress);
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [executorAddress],
    });
  });

  it("swap all, 10% profit", async () => {
    const profitMargin = 110;
    const fee = ethers.utils.parseEther("0.02");

    await createTask(profitMargin, true);
    await poker.maxApprove(cvxCrvAddress, true);

    const res = await executeAndGetProfit(fee, profitMargin, true);
    if (res.isExecuted)
      expect(res.profit).to.be.gte(fee.mul(profitMargin - 100).div(100));
  });

  it("swap all, 50% profit", async () => {
    const profitMargin = 150;
    const fee = ethers.utils.parseEther("0.02");

    await createTask(profitMargin, true);
    await poker.maxApprove(cvxCrvAddress, true);

    const res = await executeAndGetProfit(fee, profitMargin, true);
    if (res.isExecuted)
      expect(res.profit).to.be.gte(fee.mul(profitMargin - 100).div(100));
  });

  it("swap all, 100% profit", async () => {
    const profitMargin = 200;
    const fee = ethers.utils.parseEther("0.02");

    await createTask(profitMargin, true);
    await poker.maxApprove(cvxCrvAddress, true);

    const res = await executeAndGetProfit(fee, profitMargin, true);
    if (res.isExecuted)
      expect(res.profit).to.be.gte(fee.mul(profitMargin - 100).div(100));
  });

  it("dont swap all, 10% profit", async () => {
    const profitMargin = 110;
    const fee = ethers.utils.parseEther("0.02");

    await createTask(profitMargin, false);
    await poker.maxApprove(cvxCrvAddress, true);

    const res = await executeAndGetProfit(fee, profitMargin, false);
    if (res.isExecuted) expect(res.profit).to.be.gt(0);
  });

  it("dont swap all, 50% profit", async () => {
    const profitMargin = 150;
    const fee = ethers.utils.parseEther("0.02");

    await createTask(profitMargin, false);
    await poker.maxApprove(cvxCrvAddress, true);

    const res = await executeAndGetProfit(fee, profitMargin, false);
    if (res.isExecuted) expect(res.profit).to.be.gt(0);
  });

  it("dont swap all, 100% profit", async () => {
    const profitMargin = 200;
    const fee = ethers.utils.parseEther("0.02");

    await createTask(profitMargin, false);
    await poker.maxApprove(cvxCrvAddress, true);

    const res = await executeAndGetProfit(fee, profitMargin, false);
    if (res.isExecuted) expect(res.profit).to.be.gt(0);
  });

  //--------------------------------------------------------------------------------------

  const executeAndGetProfit = async (
    fee: BigNumber,
    profitMargin: number,
    swapAll: boolean
  ): Promise<{ isExecuted: boolean; profit: BigNumber }> => {
    try {
      if (swapAll) {
        const balanceBefore = await ethers.provider.getBalance(poker.address);
        await execute(fee);
        const balanceAfter = await ethers.provider.getBalance(poker.address);
        const profit = balanceAfter.sub(balanceBefore);

        return { isExecuted: true, profit };
      } else {
        const balanceBefore = await cvxCrv.balanceOf(poker.address);
        await execute(fee);
        const balanceAfter = await cvxCrv.balanceOf(poker.address);
        const profit = balanceAfter.sub(balanceBefore);

        return { isExecuted: true, profit };
      }
    } catch (err) {
      console.log("Not profitable with margin: ", profitMargin - 100);
      return { isExecuted: false, profit: ethers.BigNumber.from("0") };
    }
  };

  const createTask = async (profitMargin: number, swapAll: boolean) => {
    const execAddress = poker.address;
    const execSelector = poker.interface.getSighash("poke");
    const pokeCallData = cvxStaking.interface.encodeFunctionData("distribute");
    execData = poker.interface.encodeFunctionData("poke", [
      cvxStakingAddress,
      pokeCallData,
      cvxCrvAddress,
      profitMargin,
      swapAll,
      true,
    ]);
    const resolverAddress = forwarder.address;
    const resolverData = forwarder.interface.encodeFunctionData("checker", [
      execData,
    ]);

    resolverHash = await ops.getResolverHash(resolverAddress, resolverData);

    const taskId = await ops.getTaskId(
      ownerAddress,
      execAddress,
      execSelector,
      false,
      ETH,
      resolverHash
    );

    await ops.createTaskNoPrepayment(
      execAddress,
      execSelector,
      resolverAddress,
      resolverData,
      ETH
    );

    expect(await ops.taskCreator(taskId)).to.be.eql(ownerAddress);
  };

  const execute = async (fee: BigNumber) => {
    await ops
      .connect(executor)
      .exec(
        fee,
        ETH,
        ownerAddress,
        false,
        true,
        resolverHash,
        poker.address,
        execData
      );
  };
});
