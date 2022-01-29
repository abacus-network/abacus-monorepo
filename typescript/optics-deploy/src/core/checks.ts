import { expect } from 'chai';

import { BeaconProxy } from '../proxyUtils';
import { CoreDeploy } from './CoreDeploy';
import { VerificationInput, ViolationType, HomeUpdaterViolation, ReplicaUpdaterViolation, UpdaterManagerViolation, InvariantChecker } from '../checks';

const emptyAddr = '0x' + '00'.repeat(20);

export class CoreInvariantChecker extends InvariantChecker<CoreDeploy> {

  constructor(deploys: CoreDeploy[]) {
    super(deploys)
  }

  async checkDeploy(deploy: CoreDeploy): Promise<void> {
    this.checkContractsDefined(deploy)
    await this.checkBeaconProxies(deploy)
    await this.checkHome(deploy)
    await this.checkReplicas(deploy)
    await this.checkGovernance(deploy)
    await this.checkXAppConnectionManager(deploy)
    this.checkVerificationInputs(deploy)
  }

  checkContractsDefined(deploy: CoreDeploy): void {
    const contracts = deploy.contracts;
    expect(contracts.home).to.not.be.undefined;
    expect(contracts.governance).to.not.be.undefined;
    expect(contracts.upgradeBeaconController).to.not.be.undefined;
    expect(contracts.xAppConnectionManager).to.not.be.undefined;
    expect(contracts.updaterManager).to.not.be.undefined;
    for (const domain in contracts.replicas) {
      expect(contracts.replicas[domain]).to.not.be.undefined;
    }
  }

  async checkHome(deploy: CoreDeploy): Promise<void> {
    // contracts are defined
    const home = deploy.contracts.home?.proxy;
    // updaterManager is set on Home
    const actualManager = await home?.updaterManager();
    const expectedManager = deploy.contracts.updaterManager?.address;
    if (actualManager !== expectedManager) {
      const violation: UpdaterManagerViolation = {
        domain: deploy.chain.domain,
        type: ViolationType.UpdaterManager,
        actual: actualManager!,
        expected: expectedManager!,
      }
      this.addViolation(violation)
    }

    const actual = await home?.updater()!;
    expect(actual).to.not.be.undefined;
    const expected = deploy.config.updater;
    if (actual !== expected) {
      const violation: HomeUpdaterViolation = {
        domain: deploy.chain.domain,
        type: ViolationType.HomeUpdater,
        actual,
        expected,
      }
      this.addViolation(violation)
    }
  }

  async checkReplicas(deploy: CoreDeploy): Promise<void> {
    // Check if the Replicas on *remote* domains are set to the updater
    // configured on our domain.
    const domain = deploy.chain.domain
    for (const d of this._deploys) {
      if (d.chain.domain == domain) continue;
      const replica = d.contracts.replicas[domain];
      const actual = await replica.updater();
      const expected = deploy.config.updater;
      if (actual !== expected) {
        const violation: ReplicaUpdaterViolation = {
          // TODO: NAM IS THIS IDIOMATIC TO ABACUS?
          domain: d.chain.domain,
          remoteDomain: domain,
          type: ViolationType.ReplicaUpdater,
          actual,
          expected,
        }
        this.addViolation(violation)
      }
    }
    const remoteDomains = this._deploys.map((d: CoreDeploy) => d.chain.domain).filter((d: number) => d !== domain)
    if (remoteDomains.length > 0) {
      // expect all replicas to have to same implementation and upgradeBeacon
      const firstReplica = deploy.contracts.replicas[remoteDomains[0]]!;
      const replicaImpl = firstReplica.implementation.address;
      const replicaBeacon = firstReplica.beacon.address;
      // check every other implementation/beacon matches the first
      remoteDomains.slice(1).forEach((domain) => {
        const replica = deploy.contracts.replicas[domain]!;
        expect(replica).to.not.be.undefined;
        const implementation = replica.implementation.address;
        const beacon = replica.beacon.address;
        expect(implementation).to.equal(replicaImpl);
        expect(beacon).to.equal(replicaBeacon);
      });
    }
  }

  async checkGovernance(deploy: CoreDeploy): Promise<void> {
    expect(deploy.contracts.governance).to.not.be.undefined;
    for (const domain in deploy.contracts.replicas) {
      // governanceRouter for each remote domain is registered
      const registeredRouter = await deploy.contracts.governance?.proxy.routers(
        domain,
      );
      expect(registeredRouter).to.not.equal(emptyAddr);
    }

    // governor is set on governor chain, empty on others
    // TODO: assert all governance routers have the same governor domain
    const governorDomain = await deploy.contracts.governance?.proxy.governorDomain()
    const gov = await deploy.contracts.governance?.proxy.governor();
    const localDomain = await deploy.contracts.home?.proxy.localDomain();
    if (governorDomain == localDomain) {
      expect(gov).to.not.equal(emptyAddr);
    } else {
      expect(gov).to.equal(emptyAddr);
    }

    const owners = [
      deploy.contracts.updaterManager?.owner()!,
      deploy.contracts.xAppConnectionManager?.owner()!,
      deploy.contracts.upgradeBeaconController?.owner()!,
      deploy.contracts.home?.proxy.owner()!,
    ]
    // This bit fails when the replicas don't yet have the owner() function.
    for (const domain in deploy.contracts.replicas) {
      owners.push(deploy.contracts.replicas[domain].proxy.owner()!)
    }
    const expectedOwner = deploy.contracts.governance?.proxy.address;
    const expectOwnedByGovernance = async (owner: Promise<string>): Promise<void> => {
      expect(await owner).to.equal(expectedOwner);
    }
    await Promise.all(owners.map(expectOwnedByGovernance))
  }

  async checkXAppConnectionManager(deploy: CoreDeploy): Promise<void> {
    expect(deploy.contracts.xAppConnectionManager).to.not.be.undefined;
    for (const domain in deploy.contracts.replicas) {
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
    // Home is set on xAppConnectionManager
    const xAppManagerHome = await deploy.contracts.xAppConnectionManager?.home();
    const homeAddress = deploy.contracts.home?.proxy.address;
    expect(xAppManagerHome).to.equal(homeAddress);
  }

  getVerificationInputs(deploy: CoreDeploy): VerificationInput[] {
    const inputs: VerificationInput[] = [];
    const contracts = deploy.contracts;
    inputs.push(['UpgradeBeaconController', contracts.upgradeBeaconController!])
    inputs.push(['XAppConnectionManager', contracts.xAppConnectionManager!])
    inputs.push(['UpdaterManager', contracts.updaterManager!])
    const addInputsForUpgradableContract = (contract: BeaconProxy<any>, name: string) => {
      inputs.push([`${name} Implementation`, contract.implementation])
      inputs.push([`${name} UpgradeBeacon`, contract.beacon])
      inputs.push([`${name} Proxy`, contract.proxy])
    }
    addInputsForUpgradableContract(contracts.home!, 'Home')
    addInputsForUpgradableContract(contracts.governance!, 'Governance')
    for (const domain in contracts.replicas) {
      addInputsForUpgradableContract(contracts.replicas[domain], 'Replica')
    }
    return inputs
  }

  async checkBeaconProxies(deploy: CoreDeploy): Promise<void> {
    const domain = deploy.chain.domain;
    const contracts = deploy.contracts;
    // Home upgrade setup contracts are defined
    await this.checkBeaconProxyImplementation(
      domain,
      'Home',
      contracts.home!
    );

    // GovernanceRouter upgrade setup contracts are defined
    await this.checkBeaconProxyImplementation(
      domain,
      'Governance',
      contracts.governance!
    );

    for (const d in deploy.contracts.replicas) {
      // Replica upgrade setup contracts are defined
      await this.checkBeaconProxyImplementation(
        domain,
        'Replica',
        contracts.replicas[d]!
      );
    }
  }

}
