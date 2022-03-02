import { assert } from 'chai';
import * as ethers from 'ethers';

import * as types from './types';
import { getHexStringByteLength } from './utils';
import { AbacusDeployment } from './AbacusDeployment';

export class Validator {
  localDomain: types.Domain;
  signer: ethers.Signer;
  address: types.Address;

  constructor(
    signer: ethers.Signer,
    address: types.Address,
    localDomain: types.Domain,
    disableWarn: boolean,
  ) {
    if (!disableWarn) {
      throw new Error('Please use `Validator.fromSigner()` to instantiate.');
    }
    this.localDomain = localDomain ? localDomain : 0;
    this.signer = signer;
    this.address = address;
  }

  static async fromSigner(signer: ethers.Signer, localDomain: types.Domain) {
    return new Validator(signer, await signer.getAddress(), localDomain, true);
  }

  domainHash() {
    return domainHash(this.localDomain);
  }

  message(root: types.HexString, index: number) {
    return ethers.utils.solidityPack(
      ['bytes32', 'bytes32', 'uint256'],
      [this.domainHash(), root, index],
    );
  }

  async signCheckpoint(root: types.HexString, index: number) {
    let message = this.message(root, index);
    let msgHash = ethers.utils.arrayify(ethers.utils.keccak256(message));
    let signature = await this.signer.signMessage(msgHash);
    return {
      origin: this.localDomain,
      root,
      index,
      signature,
    };
  }
}

const formatMessage = (
  localDomain: types.Domain,
  senderAddr: types.Address,
  sequence: number,
  destinationDomain: types.Domain,
  recipientAddr: types.Address,
  body: types.HexString,
): string => {
  senderAddr = ethersAddressToBytes32(senderAddr);
  recipientAddr = ethersAddressToBytes32(recipientAddr);

  return ethers.utils.solidityPack(
    ['uint32', 'bytes32', 'uint32', 'uint32', 'bytes32', 'bytes'],
    [localDomain, senderAddr, sequence, destinationDomain, recipientAddr, body],
  );
};

export enum AbacusState {
  UNINITIALIZED = 0,
  ACTIVE,
  FAILED,
}

export enum GovernanceMessage {
  CALL = 1,
  TRANSFERGOVERNOR = 2,
  SETROUTER = 3,
}

export enum MessageStatus {
  NONE = 0,
  PENDING,
  PROCESSED,
}

function formatTransferGovernor(
  newDomain: types.Domain,
  newAddress: types.Address,
): string {
  return ethers.utils.solidityPack(
    ['bytes1', 'uint32', 'bytes32'],
    [GovernanceMessage.TRANSFERGOVERNOR, newDomain, newAddress],
  );
}

function formatSetRouter(domain: types.Domain, address: types.Address): string {
  return ethers.utils.solidityPack(
    ['bytes1', 'uint32', 'bytes32'],
    [GovernanceMessage.SETROUTER, domain, address],
  );
}

function messageHash(message: types.HexString): string {
  return ethers.utils.solidityKeccak256(['bytes'], [message]);
}

function ethersAddressToBytes32(address: types.Address): string {
  return ethers.utils
    .hexZeroPad(ethers.utils.hexStripZeros(address), 32)
    .toLowerCase();
}

function destinationAndNonce(
  destination: types.Domain,
  sequence: number,
): ethers.BigNumber {
  assert(destination < Math.pow(2, 32) - 1);
  assert(sequence < Math.pow(2, 32) - 1);

  return ethers.BigNumber.from(destination)
    .mul(ethers.BigNumber.from(2).pow(32))
    .add(ethers.BigNumber.from(sequence));
}

function domainHash(domain: Number): string {
  return ethers.utils.solidityKeccak256(
    ['uint32', 'string'],
    [domain, 'OPTICS'],
  );
}

function formatCalls(callsData: types.CallData[]): string {
  let callBody = '0x';
  const numCalls = callsData.length;

  for (let i = 0; i < numCalls; i++) {
    const { to, data } = callsData[i];
    const dataLen = getHexStringByteLength(data);

    if (!to || !data) {
      throw new Error(`Missing data in Call ${i + 1}: \n  ${callsData[i]}`);
    }

    let hexBytes = ethers.utils.solidityPack(
      ['bytes32', 'uint256', 'bytes'],
      [to, dataLen, data],
    );

    // remove 0x before appending
    callBody += hexBytes.slice(2);
  }

  return ethers.utils.solidityPack(
    ['bytes1', 'bytes1', 'bytes'],
    [GovernanceMessage.CALL, numCalls, callBody],
  );
}

export const abacus: types.HardhatAbacusHelpers = {
  deployment: AbacusDeployment,
  formatMessage,
  governance: {
    formatTransferGovernor,
    formatSetRouter,
    formatCalls,
  },
  messageHash,
  ethersAddressToBytes32,
  destinationAndNonce,
  domainHash,
};
