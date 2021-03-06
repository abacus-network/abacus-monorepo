import { RelayerFunderConfig } from '../../../src/config/funding';

import { environment } from './chains';

export const relayerFunderConfig: RelayerFunderConfig = {
  docker: {
    repo: 'gcr.io/abacus-labs-dev/abacus-monorepo',
    tag: 'sha-d24eaa4',
  },
  cronSchedule: '*/10 * * * *', // Every 10 minutes
  namespace: environment,
  prometheusPushGateway:
    'http://prometheus-pushgateway.monitoring.svc.cluster.local:9091',
};
