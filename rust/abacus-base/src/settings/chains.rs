use eyre::Report;
use serde::Deserialize;

use abacus_core::{ContractLocator, Signers};
use abacus_ethereum::{
    Connection, InboxBuilder, InboxValidatorManagerBuilder, InterchainGasPaymasterBuilder,
    MakeableWithProvider, OutboxBuilder,
};
use ethers_prometheus::{ContractInfo, PrometheusMiddlewareConf};

use crate::{
    CoreMetrics, InboxValidatorManagerVariants, InboxValidatorManagers, InboxVariants, Inboxes,
    InterchainGasPaymasterVariants, InterchainGasPaymasters, OutboxVariants, Outboxes,
};

/// A connection to _some_ blockchain.
///
/// Specify the chain name (enum variant) in toml under the `chain` key
/// Specify the connection details as a toml object under the `connection` key.
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "rpcStyle", content = "connection", rename_all = "camelCase")]
pub enum ChainConf {
    /// Ethereum configuration
    Ethereum(Connection),
}

impl Default for ChainConf {
    fn default() -> Self {
        Self::Ethereum(Default::default())
    }
}

/// Addresses for outbox chain contracts
#[derive(Clone, Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OutboxAddresses {
    /// Address of the Outbox contract
    pub outbox: String,
    /// Address of the InterchainGasPaymaster contract
    pub interchain_gas_paymaster: String,
}

/// Addresses for inbox chain contracts
#[derive(Clone, Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InboxAddresses {
    /// Address of the Inbox contract
    pub inbox: String,
    /// Address of the InboxValidatorManager contract
    pub validator_manager: String,
}

/// A chain setup is a domain ID, an address on that chain (where the outbox or
/// inbox is deployed) and details for connecting to the chain API.
#[derive(Clone, Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChainSetup<T> {
    /// Chain name
    pub name: String,
    /// Chain domain identifier
    pub domain: String,
    /// Number of blocks until finality
    pub finality_blocks: String,
    /// Addresses of contracts on the chain
    pub addresses: T,
    /// The chain connection details
    #[serde(flatten)]
    pub chain: ChainConf,
    /// Set this key to disable the inbox. Does nothing for outboxes.
    #[serde(default)]
    pub disabled: Option<String>,
    /// Configure chain-specific metrics information. This will automatically add all contract
    /// addresses but will not override any set explicitly.
    /// Use `metrics_conf()` to get the metrics.
    #[serde(default)]
    pub metrics_conf: PrometheusMiddlewareConf,
}

impl<T> ChainSetup<T> {
    /// Get the number of blocks until finality
    pub fn finality_blocks(&self) -> u32 {
        self.finality_blocks
            .parse::<u32>()
            .expect("could not parse finality_blocks")
    }
}

impl ChainSetup<OutboxAddresses> {
    /// Try to convert the chain setting into an Outbox contract
    pub async fn try_into_outbox(
        &self,
        signer: Option<Signers>,
        metrics: &CoreMetrics,
    ) -> Result<Outboxes, Report> {
        match &self.chain {
            ChainConf::Ethereum(conf) => Ok(OutboxVariants::Ethereum(
                OutboxBuilder {}
                    .make_with_connection(
                        conf.clone(),
                        &ContractLocator {
                            chain_name: self.name.clone(),
                            domain: self.domain.parse().expect("invalid uint"),
                            address: self
                                .addresses
                                .outbox
                                .parse::<ethers::types::Address>()?
                                .into(),
                        },
                        signer,
                        Some((metrics.provider_metrics(), self.metrics_conf())),
                    )
                    .await?,
            )
            .into()),
        }
    }

    /// Try to convert the chain setting into an InterchainGasPaymaster contract
    pub async fn try_into_interchain_gas_paymaster(
        &self,
        signer: Option<Signers>,
        metrics: &CoreMetrics,
    ) -> Result<InterchainGasPaymasters, Report> {
        match &self.chain {
            ChainConf::Ethereum(conf) => Ok(InterchainGasPaymasterVariants::Ethereum(
                InterchainGasPaymasterBuilder {}
                    .make_with_connection(
                        conf.clone(),
                        &ContractLocator {
                            chain_name: self.name.clone(),
                            domain: self.domain.parse().expect("invalid uint"),
                            address: self
                                .addresses
                                .interchain_gas_paymaster
                                .parse::<ethers::types::Address>()?
                                .into(),
                        },
                        signer,
                        Some((metrics.provider_metrics(), self.metrics_conf())),
                    )
                    .await?,
            )
            .into()),
        }
    }

    /// Get a clone of the metrics conf with correctly configured contract information.
    pub fn metrics_conf(&self) -> PrometheusMiddlewareConf {
        let mut cfg = self.metrics_conf.clone();
        if let Ok(addr) = self.addresses.outbox.parse() {
            cfg.contracts.entry(addr).or_insert_with(|| ContractInfo {
                name: Some("outbox".into()),
            });
        }
        cfg
    }
}

impl ChainSetup<InboxAddresses> {
    /// Try to convert the chain setting into an inbox contract
    pub async fn try_into_inbox(
        &self,
        signer: Option<Signers>,
        metrics: &CoreMetrics,
    ) -> Result<Inboxes, Report> {
        match &self.chain {
            ChainConf::Ethereum(conf) => Ok(InboxVariants::Ethereum(
                InboxBuilder {}
                    .make_with_connection(
                        conf.clone(),
                        &ContractLocator {
                            chain_name: self.name.clone(),
                            domain: self.domain.parse().expect("invalid uint"),
                            address: self
                                .addresses
                                .inbox
                                .parse::<ethers::types::Address>()?
                                .into(),
                        },
                        signer,
                        Some((metrics.provider_metrics(), self.metrics_conf.clone())),
                    )
                    .await?,
            )
            .into()),
        }
    }

    /// Try to convert the chain setting into an InboxValidatorManager contract
    pub async fn try_into_inbox_validator_manager(
        &self,
        signer: Option<Signers>,
        metrics: &CoreMetrics,
    ) -> Result<InboxValidatorManagers, Report> {
        let inbox_address = self.addresses.inbox.parse::<ethers::types::Address>()?;
        match &self.chain {
            ChainConf::Ethereum(conf) => Ok(InboxValidatorManagerVariants::Ethereum(
                InboxValidatorManagerBuilder { inbox_address }
                    .make_with_connection(
                        conf.clone(),
                        &ContractLocator {
                            chain_name: self.name.clone(),
                            domain: self.domain.parse().expect("invalid uint"),
                            address: self
                                .addresses
                                .validator_manager
                                .parse::<ethers::types::Address>()?
                                .into(),
                        },
                        signer,
                        Some((metrics.provider_metrics(), self.metrics_conf.clone())),
                    )
                    .await?,
            )
            .into()),
        }
    }

    /// Get a clone of the metrics conf with correctly configured contract information.
    pub fn metrics_conf(&self) -> PrometheusMiddlewareConf {
        let mut cfg = self.metrics_conf.clone();
        if let Ok(addr) = self.addresses.inbox.parse() {
            cfg.contracts.entry(addr).or_insert_with(|| ContractInfo {
                name: Some("inbox".into()),
            });
        }
        if let Ok(addr) = self.addresses.validator_manager.parse() {
            cfg.contracts.entry(addr).or_insert_with(|| ContractInfo {
                name: Some("validator_manager".into()),
            });
        }
        cfg
    }
}
