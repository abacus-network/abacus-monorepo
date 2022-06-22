import { ethers } from 'ethers';

import { Router } from '@abacus-network/app';

import { AbacusContracts, AbacusFactories } from './contracts';

export type RouterContracts<RouterContract extends Router = Router> =
  AbacusContracts & {
    router: RouterContract;
  };

type RouterFactory<RouterContract extends Router = Router> =
  ethers.ContractFactory & {
    deploy: (...args: any[]) => Promise<RouterContract>;
  };

export type RouterFactories<RouterContract extends Router = Router> =
  AbacusFactories & {
    router: RouterFactory<RouterContract>;
  };

export { Router } from '@abacus-network/app';
