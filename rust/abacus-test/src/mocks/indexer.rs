#![allow(non_snake_case)]

use async_trait::async_trait;
use color_eyre::Result;
use mockall::*;

use abacus_core::{AbacusCommonIndexer, OutboxIndexer, *};

mock! {
    pub Indexer {
        pub fn _get_block_number(&self) -> Result<u32> {}

        pub fn _fetch_sorted_updates(&self, from: u32, to: u32) -> Result<Vec<SignedUpdateWithMeta>> {}

        pub fn _fetch_sorted_messages(&self, from: u32, to: u32) -> Result<Vec<RawCommittedMessage>> {}
    }
}

impl std::fmt::Debug for MockIndexer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "MockIndexer")
    }
}

#[async_trait]
impl CommonIndexer for MockIndexer {
    async fn get_block_number(&self) -> Result<u32> {
        self._get_block_number()
    }

    async fn fetch_sorted_updates(&self, from: u32, to: u32) -> Result<Vec<SignedUpdateWithMeta>> {
        self._fetch_sorted_updates(from, to)
    }
}

#[async_trait]
impl HomeIndexer for MockIndexer {
    async fn fetch_sorted_messages(&self, from: u32, to: u32) -> Result<Vec<RawCommittedMessage>> {
        self._fetch_sorted_messages(from, to)
    }
}

mock! {
    pub AbacusIndexer {
        pub fn _get_block_number(&self) -> Result<u32> {}

        pub fn _fetch_sorted_checkpoints(&self, from: u32, to: u32) -> Result<Vec<CheckpointWithMeta>> {}

        pub fn _fetch_sorted_messages(&self, from: u32, to: u32) -> Result<Vec<RawCommittedMessage>> {}
    }
}

impl std::fmt::Debug for MockAbacusIndexer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "MockAbacusIndexer")
    }
}

#[async_trait]
impl AbacusCommonIndexer for MockAbacusIndexer {
    async fn get_block_number(&self) -> Result<u32> {
        self._get_block_number()
    }

    async fn fetch_sorted_checkpoints(
        &self,
        from: u32,
        to: u32,
    ) -> Result<Vec<CheckpointWithMeta>> {
        self._fetch_sorted_checkpoints(from, to)
    }
}

#[async_trait]
impl OutboxIndexer for MockAbacusIndexer {
    async fn fetch_sorted_messages(&self, from: u32, to: u32) -> Result<Vec<RawCommittedMessage>> {
        self._fetch_sorted_messages(from, to)
    }
}
