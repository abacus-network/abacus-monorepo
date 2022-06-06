#![allow(clippy::enum_variant_names)]
#![allow(missing_docs)]

use std::sync::Arc;

use abacus_core::Encode;
use async_trait::async_trait;
use ethers::contract::abigen;
use ethers::prelude::*;
use eyre::Result;

use abacus_core::{
    accumulator::merkle::Proof, AbacusMessage, ChainCommunicationError, ContractLocator,
    InboxValidatorManager, MultisigSignedCheckpoint, TxOutcome,
};

use crate::trait_builder::MakeableWithProvider;
use crate::tx::report_tx;

abigen!(
    EthereumInboxValidatorManagerInternal,
    "./chains/abacus-ethereum/abis/InboxValidatorManager.abi.json",
);

impl<M> std::fmt::Display for EthereumInboxValidatorManagerInternal<M>
where
    M: Middleware,
{
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

pub struct InboxValidatorManagerBuilder {
    pub inbox_address: Address,
}

impl MakeableWithProvider for InboxValidatorManagerBuilder {
    type Output = Box<dyn InboxValidatorManager>;

    fn make_with_provider<M: Middleware + 'static>(
        &self,
        provider: M,
        locator: &ContractLocator,
    ) -> Self::Output {
        Box::new(EthereumInboxValidatorManager::new(
            Arc::new(provider),
            locator,
            self.inbox_address,
        ))
    }
}

/// A struct that provides access to an Ethereum InboxValidatorManager contract
#[derive(Debug)]
pub struct EthereumInboxValidatorManager<M>
where
    M: Middleware,
{
    contract: Arc<EthereumInboxValidatorManagerInternal<M>>,
    #[allow(unused)]
    domain: u32,
    #[allow(unused)]
    chain_name: String,
    #[allow(unused)]
    provider: Arc<M>,
    inbox_address: Address,
}

impl<M> EthereumInboxValidatorManager<M>
where
    M: Middleware,
{
    /// Create a reference to a inbox at a specific Ethereum address on some
    /// chain
    pub fn new(provider: Arc<M>, locator: &ContractLocator, inbox_address: Address) -> Self {
        Self {
            contract: Arc::new(EthereumInboxValidatorManagerInternal::new(
                &locator.address,
                provider.clone(),
            )),
            domain: locator.domain,
            chain_name: locator.chain_name.to_owned(),
            provider,
            inbox_address,
        }
    }
}

#[async_trait]
impl<M> InboxValidatorManager for EthereumInboxValidatorManager<M>
where
    M: Middleware + 'static,
{
    #[tracing::instrument(err, skip(self))]
    async fn process(
        &self,
        multisig_signed_checkpoint: &MultisigSignedCheckpoint,
        message: &AbacusMessage,
        proof: &Proof,
    ) -> Result<TxOutcome, ChainCommunicationError> {
        let mut sol_proof: [[u8; 32]; 32] = Default::default();
        sol_proof
            .iter_mut()
            .enumerate()
            .for_each(|(i, elem)| *elem = proof.path[i].to_fixed_bytes());

        let tx = self.contract.process(
            self.inbox_address,
            multisig_signed_checkpoint.checkpoint.root.to_fixed_bytes(),
            multisig_signed_checkpoint.checkpoint.index.into(),
            multisig_signed_checkpoint
                .signatures
                .iter()
                .map(|s| s.to_vec().into())
                .collect(),
            message.to_vec().into(),
            sol_proof,
            proof.index.into(),
        );
        let gas = tx.estimate_gas().await?.saturating_add(U256::from(100000));
        let gassed = tx.gas(gas);
        let receipt = report_tx(gassed).await?;
        Ok(receipt.into())

        // let tx = self.contract.process(
        //     self.inbox_address,
        //     multisig_signed_checkpoint.checkpoint.root.to_fixed_bytes(),
        //     multisig_signed_checkpoint.checkpoint.index.into(),
        //     multisig_signed_checkpoint
        //         .signatures
        //         .iter()
        //         .map(|s| s.to_vec().into())
        //         .collect(),

        // );

        // Ok(report_tx(tx).await?.into())
    }
}
