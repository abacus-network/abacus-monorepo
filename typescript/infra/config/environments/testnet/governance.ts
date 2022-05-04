import { GovernanceConfig } from '../../../src/governance';

export const governance: GovernanceConfig = {
  recoveryTimelock: 180,
  addresses: {
    alfajores: {
      recoveryManager: '0xfaD1C94469700833717Fa8a3017278BC1cA8031C',
      governor: '0xfaD1C94469700833717Fa8a3017278BC1cA8031C',
    },
    kovan: {
      recoveryManager: '0xfaD1C94469700833717Fa8a3017278BC1cA8031C',
    },
    fuji: {
      recoveryManager: '0xfaD1C94469700833717Fa8a3017278BC1cA8031C',
    },
    mumbai: {
      recoveryManager: '0xfaD1C94469700833717Fa8a3017278BC1cA8031C',
    },
    bsctestnet: {
      recoveryManager: '0xfaD1C94469700833717Fa8a3017278BC1cA8031C',
    },
    arbitrumrinkeby: {
      recoveryManager: '0xfaD1C94469700833717Fa8a3017278BC1cA8031C',
    },
    optimismkovan: {
      recoveryManager: '0xfaD1C94469700833717Fa8a3017278BC1cA8031C',
    },
    auroratestnet: {
      recoveryManager: '0xfaD1C94469700833717Fa8a3017278BC1cA8031C',
    },
  },
};
