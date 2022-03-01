/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { ethers } from "ethers";
import {
  FactoryOptions,
  HardhatEthersHelpers as HardhatEthersHelpersBase,
} from "@nomiclabs/hardhat-ethers/types";

import * as Contracts from ".";

declare module "hardhat/types/runtime" {
  interface HardhatEthersHelpers extends HardhatEthersHelpersBase {
    getContractFactory(
      name: "OwnableUpgradeable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.OwnableUpgradeable__factory>;
    getContractFactory(
      name: "Ownable",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Ownable__factory>;
    getContractFactory(
      name: "TypedMemView",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TypedMemView__factory>;
    getContractFactory(
      name: "Common",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Common__factory>;
    getContractFactory(
      name: "Inbox",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Inbox__factory>;
    getContractFactory(
      name: "MerkleTreeManager",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.MerkleTreeManager__factory>;
    getContractFactory(
      name: "Outbox",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Outbox__factory>;
    getContractFactory(
      name: "BadRecipient1",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.BadRecipient1__factory>;
    getContractFactory(
      name: "BadRecipient2",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.BadRecipient2__factory>;
    getContractFactory(
      name: "BadRecipient3",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.BadRecipient3__factory>;
    getContractFactory(
      name: "BadRecipient4",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.BadRecipient4__factory>;
    getContractFactory(
      name: "BadRecipient5",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.BadRecipient5__factory>;
    getContractFactory(
      name: "BadRecipient6",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.BadRecipient6__factory>;
    getContractFactory(
      name: "BadRecipientHandle",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.BadRecipientHandle__factory>;
    getContractFactory(
      name: "MysteryMath",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.MysteryMath__factory>;
    getContractFactory(
      name: "MysteryMathV1",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.MysteryMathV1__factory>;
    getContractFactory(
      name: "MysteryMathV2",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.MysteryMathV2__factory>;
    getContractFactory(
      name: "TestCommon",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TestCommon__factory>;
    getContractFactory(
      name: "TestInbox",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TestInbox__factory>;
    getContractFactory(
      name: "TestMerkle",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TestMerkle__factory>;
    getContractFactory(
      name: "TestMessage",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TestMessage__factory>;
    getContractFactory(
      name: "TestOutbox",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TestOutbox__factory>;
    getContractFactory(
      name: "TestRecipient",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.TestRecipient__factory>;
    getContractFactory(
      name: "UpgradeBeacon",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.UpgradeBeacon__factory>;
    getContractFactory(
      name: "UpgradeBeaconController",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.UpgradeBeaconController__factory>;
    getContractFactory(
      name: "UpgradeBeaconProxy",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.UpgradeBeaconProxy__factory>;
    getContractFactory(
      name: "ValidatorManager",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.ValidatorManager__factory>;
    getContractFactory(
      name: "Version0",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.Version0__factory>;
    getContractFactory(
      name: "XAppConnectionManager",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.XAppConnectionManager__factory>;
    getContractFactory(
      name: "IMessageRecipient",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IMessageRecipient__factory>;
    getContractFactory(
      name: "IValidatorManager",
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<Contracts.IValidatorManager__factory>;

    // default types
    getContractFactory(
      name: string,
      signerOrOptions?: ethers.Signer | FactoryOptions
    ): Promise<ethers.ContractFactory>;
    getContractFactory(
      abi: any[],
      bytecode: ethers.utils.BytesLike,
      signer?: ethers.Signer
    ): Promise<ethers.ContractFactory>;
  }
}
