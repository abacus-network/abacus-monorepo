import { expect } from 'chai';
import { Contract, ethers } from 'ethers';

import { Deploy } from '../deploy';
import { CoreDeploy } from './CoreDeploy';
import { BeaconProxy } from '../proxyUtils';
import { UpgradeBeaconController } from '@optics-xyz/ts-interface/dist/optics-core';
import {
  assertInvariantViolation,
  InvariantViolationHandler,
  InvariantViolationType,
} from '../checks';

const emptyAddr = '0x' + '00'.repeat(20);

export function assertBeaconProxy(beaconProxy: BeaconProxy<Contract>) {
  expect(beaconProxy.beacon).to.not.be.undefined;
  expect(beaconProxy.proxy).to.not.be.undefined;
  expect(beaconProxy.implementation).to.not.be.undefined;
}

export async function checkBeaconProxyImplementation(
  domain: number,
  upgradeBeaconController: UpgradeBeaconController,
  beaconProxy: BeaconProxy<Contract>,
  invariantViolationHandler: InvariantViolationHandler,
) {
  assertBeaconProxy(beaconProxy)

  // Assert that the implementation is actually set
  const provider = beaconProxy.beacon.provider;
  const storageValue = await provider.getStorageAt(
    beaconProxy.beacon.address,
    0,
  );
  const actualImplementationAddress = ethers.utils.getAddress(
    storageValue.slice(26),
  );

  if (actualImplementationAddress != beaconProxy.implementation.address) {
    invariantViolationHandler({
      type: InvariantViolationType.UpgradeBeacon,
      domain,
      upgradeBeaconController,
      beacon: beaconProxy.beacon,
      actualImplementationAddress,
      expectedImplementationAddress: beaconProxy.implementation.address,
    });
  }
}

export function checkVerificationInput(
  deploy: Deploy<any>,
  name: string,
  addr: string,
) {
  const inputAddr = deploy.verificationInput.filter(
    (contract: any) => contract.name == name,
  )[0].address;
  expect(inputAddr).to.equal(addr);
}

export async function checkCoreDeploy(
  deploy: CoreDeploy,
  remoteDomains: number[],
  governorDomain: number,
  invariantViolationHandler: InvariantViolationHandler = assertInvariantViolation,
  _checkVerificationInput = true
) {
  // Home upgrade setup contracts are defined
  await checkBeaconProxyImplementation(
    deploy.chain.domain,
    deploy.contracts.upgradeBeaconController!,
    deploy.contracts.home!,
    invariantViolationHandler,
  );

  // updaterManager is set on Home
  const updaterManager = await deploy.contracts.home?.proxy.updaterManager();
  expect(updaterManager).to.equal(deploy.contracts.updaterManager?.address);

  // GovernanceRouter upgrade setup contracts are defined
  await checkBeaconProxyImplementation(
    deploy.chain.domain,
    deploy.contracts.upgradeBeaconController!,
    deploy.contracts.governance!,
    invariantViolationHandler,
  );

  for (const domain of remoteDomains) {
    // Replica upgrade setup contracts are defined
    await checkBeaconProxyImplementation(
      deploy.chain.domain,
      deploy.contracts.upgradeBeaconController!,
      deploy.contracts.replicas[domain]!,
      invariantViolationHandler,
    );
    // governanceRouter for remote domain is registered
    const registeredRouter = await deploy.contracts.governance?.proxy.routers(
      domain,
    );
    expect(registeredRouter).to.not.equal(emptyAddr);
    // replica is enrolled in xAppConnectionManager
    const enrolledReplica =
      await deploy.contracts.xAppConnectionManager?.domainToReplica(domain);
    expect(enrolledReplica).to.not.equal(emptyAddr);
    //watchers have permission in xAppConnectionManager
    await Promise.all(
      deploy.config.watchers.map(async (watcher) => {
        const watcherPermissions =
          await deploy.contracts.xAppConnectionManager?.watcherPermission(
            watcher,
            domain,
          );
        expect(watcherPermissions).to.be.true;
      }),
    );
  }

  if (remoteDomains.length > 0) {
    // expect all replicas to have to same implementation and upgradeBeacon
    const firstReplica = deploy.contracts.replicas[remoteDomains[0]]!;
    const replicaImpl = firstReplica.implementation.address;
    const replicaBeacon = firstReplica.beacon.address;
    // check every other implementation/beacon matches the first
    remoteDomains.slice(1).forEach((remoteDomain) => {
      const replica = deploy.contracts.replicas[remoteDomain]!;
      const implementation = replica.implementation.address;
      const beacon = replica.beacon.address;
      expect(implementation).to.equal(replicaImpl);
      expect(beacon).to.equal(replicaBeacon);
    });
  }

  // contracts are defined
  expect(deploy.contracts.updaterManager).to.not.be.undefined;
  expect(deploy.contracts.upgradeBeaconController).to.not.be.undefined;
  expect(deploy.contracts.xAppConnectionManager).to.not.be.undefined;

  // governor is set on governor chain, empty on others
  const gov = await deploy.contracts.governance?.proxy.governor();
  const localDomain = await deploy.contracts.home?.proxy.localDomain();
  if (governorDomain == localDomain) {
    expect(gov).to.not.equal(emptyAddr);
  } else {
    expect(gov).to.equal(emptyAddr);
  }
  // governor domain is correct
  expect(await deploy.contracts.governance?.proxy.governorDomain()).to.equal(
    governorDomain,
  );

  // Home is set on xAppConnectionManager
  const xAppManagerHome = await deploy.contracts.xAppConnectionManager?.home();
  const homeAddress = deploy.contracts.home?.proxy.address;
  expect(xAppManagerHome).to.equal(homeAddress);

  // governor has ownership over following contracts
  const updaterManagerOwner = await deploy.contracts.updaterManager?.owner();
  const xAppManagerOwner =
    await deploy.contracts.xAppConnectionManager?.owner();
  const beaconOwner = await deploy.contracts.upgradeBeaconController?.owner();
  const homeOwner = await deploy.contracts.home?.proxy.owner();
  const governorAddr = deploy.contracts.governance?.proxy.address;
  expect(updaterManagerOwner).to.equal(governorAddr);
  expect(xAppManagerOwner).to.equal(governorAddr);
  expect(beaconOwner).to.equal(governorAddr);
  expect(homeOwner).to.equal(governorAddr);

  if (_checkVerificationInput) {
    checkCoreVerificationInput(deploy, remoteDomains)
  }
}

function checkCoreVerificationInput(
  deploy: CoreDeploy,
  remoteDomains: number[],
) {
  // Checks that verification input is consistent with deployed contracts.
  checkVerificationInput(
    deploy,
    'UpgradeBeaconController',
    deploy.contracts.upgradeBeaconController?.address!,
  );
  checkVerificationInput(
    deploy,
    'XAppConnectionManager',
    deploy.contracts.xAppConnectionManager?.address!,
  );
  checkVerificationInput(
    deploy,
    'UpdaterManager',
    deploy.contracts.updaterManager?.address!,
  );
  checkVerificationInput(
    deploy,
    'Home Implementation',
    deploy.contracts.home?.implementation.address!,
  );
  checkVerificationInput(
    deploy,
    'Home UpgradeBeacon',
    deploy.contracts.home?.beacon.address!,
  );
  checkVerificationInput(
    deploy,
    'Home Proxy',
    deploy.contracts.home?.proxy.address!,
  );
  checkVerificationInput(
    deploy,
    'Governance Implementation',
    deploy.contracts.governance?.implementation.address!,
  );
  checkVerificationInput(
    deploy,
    'Governance UpgradeBeacon',
    deploy.contracts.governance?.beacon.address!,
  );
  checkVerificationInput(
    deploy,
    'Governance Proxy',
    deploy.contracts.governance?.proxy.address!,
  );

  if (remoteDomains.length > 0) {
    checkVerificationInput(
      deploy,
      'Replica Implementation',
      deploy.contracts.replicas[remoteDomains[0]]?.implementation.address!,
    );
    checkVerificationInput(
      deploy,
      'Replica UpgradeBeacon',
      deploy.contracts.replicas[remoteDomains[0]]?.beacon.address!,
    );

    const replicaProxies = deploy.verificationInput.filter(
      (contract) => contract.name == 'Replica Proxy',
    );
    remoteDomains.forEach((domain) => {
      const replicaProxy = replicaProxies.find((proxy) => {
        return (proxy.address =
          deploy.contracts.replicas[domain]?.proxy.address);
      });
      expect(replicaProxy).to.not.be.undefined;
    });
  }
}
