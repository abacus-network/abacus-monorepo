import { ethers } from 'ethers';
import { core } from '@abacus-network/ts-interface';
import { Contracts } from '../../contracts';
import { ReplicaInfo } from '../domains/domain';
import { CallBatch } from '../govern';

type Address = string;

interface Core {
  id: number;
  home: Address;
  replicas: ReplicaInfo[];
  governanceRouter: Address;
  xAppConnectionManager: Address;
}

export type Governor = {
  local: boolean;
  domain: number;
  identifier: string;
};

export class CoreContracts extends Contracts {
  readonly domain: number;
  readonly _home: Address;
  readonly _replicas: Map<number, ReplicaInfo>;
  readonly _governanceRouter: Address;
  readonly _xAppConnectionManager: Address;
  private providerOrSigner?: ethers.providers.Provider | ethers.Signer;
  private _governor?: Governor;

  constructor(
    domain: number,
    home: Address,
    replicas: ReplicaInfo[],
    governanceRouter: Address,
    xAppConnectionManager: Address,
    providerOrSigner?: ethers.providers.Provider | ethers.Signer,
  ) {
    super(domain, home, replicas, providerOrSigner);
    this.providerOrSigner = providerOrSigner;
    this.domain = domain;
    this._home = home;
    this._governanceRouter = governanceRouter;
    this._xAppConnectionManager = xAppConnectionManager;

    this._replicas = new Map();
    replicas.forEach((replica) => {
      this._replicas.set(replica.domain, {
        address: replica.address,
        domain: replica.domain,
      });
    });
  }

  getReplica(domain: number): core.Replica | undefined {
    if (!this.providerOrSigner) {
      throw new Error('No provider or signer. Call `connect` first.');
    }
    const replica = this._replicas.get(domain);
    if (!replica) return;
    return core.Replica__factory.connect(
      replica.address,
      this.providerOrSigner,
    );
  }

  get home(): core.Home {
    if (!this.providerOrSigner) {
      throw new Error('No provider or signer. Call `connect` first.');
    }
    return core.Home__factory.connect(this._home, this.providerOrSigner);
  }

  get governanceRouter(): core.GovernanceRouter {
    if (!this.providerOrSigner) {
      throw new Error('No provider or signer. Call `connect` first.');
    }
    return core.GovernanceRouter__factory.connect(
      this._governanceRouter,
      this.providerOrSigner,
    );
  }

  get xAppConnectionManager(): core.XAppConnectionManager {
    if (!this.providerOrSigner) {
      throw new Error('No provider or signer. Call `connect` first.');
    }
    return core.XAppConnectionManager__factory.connect(
      this._xAppConnectionManager,
      this.providerOrSigner,
    );
  }

  async governor(): Promise<Governor> {
    if (this._governor) {
      return this._governor;
    }
    const [domain, identifier] = await Promise.all([
      this.governanceRouter.governorDomain(),
      this.governanceRouter.governor(),
    ]);
    const local = identifier !== ethers.constants.AddressZero;
    this._governor = { local, domain, identifier };
    return this._governor;
  }

  async newGovernanceBatch(): Promise<CallBatch> {
    return CallBatch.fromCore(this);
  }

  connect(providerOrSigner: ethers.providers.Provider | ethers.Signer): void {
    this.providerOrSigner = providerOrSigner;
  }

  toObject(): Core {
    const replicas: ReplicaInfo[] = Array.from(this._replicas.values());
    return {
      id: this.domain,
      home: this._home,
      replicas: replicas,
      governanceRouter: this._governanceRouter,
      xAppConnectionManager: this._xAppConnectionManager,
    };
  }

  static fromObject(data: Core, signer?: ethers.Signer): CoreContracts {
    const { id, home, replicas, governanceRouter, xAppConnectionManager } =
      data;
    if (
      !id ||
      !home ||
      !replicas ||
      !governanceRouter ||
      !xAppConnectionManager
    ) {
      throw new Error('Missing key');
    }
    return new CoreContracts(
      id,
      home,
      replicas,
      governanceRouter,
      xAppConnectionManager,
      signer,
    );
  }
}
