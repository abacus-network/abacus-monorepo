import path from 'path';
import { ethers } from 'ethers';
import { xapps } from '@abacus-network/ts-interface';
import { types } from '@abacus-network/utils';

import { DeployType } from '../common';
import { RouterDeploy } from '../router';
import { ChainConfig } from '../config';
import { BridgeContracts } from './BridgeContracts';
import { BridgeInstance } from './BridgeInstance';
import { BridgeConfig } from './types';

export class BridgeDeploy extends RouterDeploy<BridgeInstance, BridgeConfig> {
  deployType = DeployType.BRIDGE;

  async deployInstance(
    domain: types.Domain,
    config: BridgeConfig,
  ): Promise<BridgeInstance> {
    return BridgeInstance.deploy(domain, this.chains, config);
  }

  static readContracts(
    chains: Record<types.Domain, ChainConfig>,
    directory: string,
  ): BridgeDeploy {
    const deploy = new BridgeDeploy();
    const domains = Object.keys(chains).map((d) => parseInt(d));
    for (const domain of domains) {
      const chain = chains[domain];
      const contracts = BridgeContracts.readJson(
        path.join(directory, 'bridge', 'contracts', `${chain.name}.json`),
        chain.signer.provider! as ethers.providers.JsonRpcProvider,
      );
      deploy.chains[domain] = chain;
      deploy.instances[domain] = new BridgeInstance(chain, contracts);
    }
    return deploy;
  }

  token(domain: types.Domain): xapps.BridgeToken {
    return this.instances[domain].token;
  }

  router(domain: types.Domain): xapps.BridgeRouter {
    return this.instances[domain].router;
  }

  helper(domain: types.Domain): xapps.ETHHelper | undefined {
    return this.instances[domain].helper;
  }
}
