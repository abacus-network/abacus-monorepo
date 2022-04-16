import { utils } from '@abacus-network/deploy';
import { AbacusCore } from '@abacus-network/sdk';
import { types } from '@abacus-network/utils';
import '@nomiclabs/hardhat-waffle';
import { ethers } from 'hardhat';
import path from 'path';
import { environment } from '../config/environments/test';
import { AbacusCoreChecker, AbacusCoreDeployer } from '../src/core';

describe('core', async () => {
  const deployer = new AbacusCoreDeployer();
  let core: AbacusCore;

  const owners: Record<types.Domain, types.Address> = {};
  before(async () => {
    const [signer, owner] = await ethers.getSigners();
    utils.registerHardhatEnvironment(deployer, environment, signer);
    deployer.domainNumbers.map((d) => {
      owners[d] = owner.address;
    });
  });

  it('deploys', async () => {
    await deployer.deploy(environment.core as any); // TODO: fix types
  });

  it('writes', async () => {
    const base = './test/outputs/core';
    deployer.writeVerification(path.join(base, 'verification'));
    deployer.writeContracts(path.join(base, 'contracts.ts'));
    deployer.writeRustConfigs('test', path.join(base, 'rust'));
  });

  it('transfers ownership', async () => {
    core = new AbacusCore(deployer.addressesRecord as any); // TODO: fix types
    const [signer] = await ethers.getSigners();
    utils.registerHardhatEnvironment(core, environment, signer);
    await AbacusCoreDeployer.transferOwnership(core, owners);
  });

  it('checks', async () => {
    const checker = new AbacusCoreChecker(core, environment.core);
    await checker.check(owners);
  });
});
