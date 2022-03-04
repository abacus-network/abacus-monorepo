import { assert } from 'chai';
import * as ethers from 'ethers';

import { addressToBytes32 } from './utils';
import * as types from './types';

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

export const formatMessage = (
  localDomain: types.Domain,
  senderAddr: types.Address,
  sequence: number,
  destinationDomain: types.Domain,
  recipientAddr: types.Address,
  body: types.HexString,
): string => {
  senderAddr = addressToBytes32(senderAddr);
  recipientAddr = addressToBytes32(recipientAddr);

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

export enum MessageStatus {
  NONE = 0,
  PENDING,
  PROCESSED,
}

export function messageHash(message: types.HexString): string {
  return ethers.utils.solidityKeccak256(['bytes'], [message]);
}

export function destinationAndNonce(
  destination: types.Domain,
  sequence: number,
): ethers.BigNumber {
  assert(destination < Math.pow(2, 32) - 1);
  assert(sequence < Math.pow(2, 32) - 1);

  return ethers.BigNumber.from(destination)
    .mul(ethers.BigNumber.from(2).pow(32))
    .add(ethers.BigNumber.from(sequence));
}

export function domainHash(domain: Number): string {
  return ethers.utils.solidityKeccak256(
    ['uint32', 'string'],
    [domain, 'OPTICS'],
  );
}
