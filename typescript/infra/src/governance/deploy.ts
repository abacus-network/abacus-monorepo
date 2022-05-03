import { ethers } from 'ethers';

import {
  GovernanceRouter,
  GovernanceRouter__factory,
} from '@abacus-network/apps';
import { UpgradeBeaconController__factory } from '@abacus-network/core';
import { AbacusRouterDeployer } from '@abacus-network/deploy';
import { GovernanceContractAddresses } from '@abacus-network/sdk';
import { types } from '@abacus-network/utils';

import { GovernanceConfig } from './types';

export class AbacusGovernanceDeployer extends AbacusRouterDeployer<
  GovernanceContractAddresses,
  GovernanceConfig
> {
  async deployContracts(
    domain: types.Domain,
    config: GovernanceConfig,
  ): Promise<GovernanceContractAddresses> {
    const signer = this.mustGetSigner(domain);
    const overrides = this.getOverrides(domain);

    const abacusConnectionManager =
      await this.deployConnectionManagerIfNotConfigured(domain, config);

    const upgradeBeaconController = await this.deployContract(
      domain,
      'UpgradeBeaconController',
      new UpgradeBeaconController__factory(signer),
    );

    const router = await this.deployProxiedContract(
      domain,
      'GovernanceRouter',
      new GovernanceRouter__factory(signer),
      upgradeBeaconController.address,
      [config.recoveryTimelock],
      [abacusConnectionManager.address],
    );

    // Only transfer ownership if a new ACM was deployed.
    if (abacusConnectionManager.deployTransaction) {
      await abacusConnectionManager.transferOwnership(
        router.address,
        overrides,
      );
    }
    await upgradeBeaconController.transferOwnership(router.address, overrides);

    return {
      router: router.addresses,
      upgradeBeaconController: upgradeBeaconController.address,
      abacusConnectionManager: abacusConnectionManager.address,
    };
  }

  async deploy(config: GovernanceConfig) {
    await super.deploy(config);

    // Transfer ownership of routers to governor and recovery manager.
    for (const local of this.domainNumbers) {
      const router = this.mustGetRouter(local);
      const name = this.mustResolveDomainName(local);
      const addresses = config.addresses[name];
      if (!addresses) throw new Error('could not find addresses');
      await router.transferOwnership(addresses.recoveryManager);
      if (addresses.governor !== undefined) {
        await router.setGovernor(addresses.governor);
      } else {
        await router.setGovernor(ethers.constants.AddressZero);
      }
    }
  }

  mustGetRouter(domain: number): GovernanceRouter {
    return GovernanceRouter__factory.connect(
      this.mustGetAddresses(domain).router.proxy,
      this.mustGetSigner(domain),
    );
  }
}
