use async_trait::async_trait;
use color_eyre::{
    eyre::{bail, eyre},
    Result,
};
use ethers::prelude::H256;
use futures_util::future::select_all;
use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::Duration,
};
use tokio::{sync::RwLock, task::JoinHandle, time::sleep};
use tracing::{debug, error, info, info_span, instrument, instrument::Instrumented, Instrument};

use abacus_base::{cancel_task, decl_agent, AgentCore, CachingHome, CachingReplica, AbacusAgent};
use abacus_core::{
    accumulator::merkle::Proof, db::AbacusDB, CommittedMessage, Common, Home, HomeEvents,
    MessageStatus,
};

use crate::{
    prover_sync::ProverSync,
    push::Pusher,
    settings::{ProcessorSettings as Settings, S3Config},
};

const AGENT_NAME: &str = "processor";
static CURRENT_NONCE: &str = "current_nonce_";

enum Flow {
    Advance,
    Repeat,
}

/// The replica processor is responsible for polling messages and waiting until they validate
/// before proving/processing them.
#[derive(Debug)]
pub(crate) struct Replica {
    interval: u64,
    replica: Arc<CachingReplica>,
    home: Arc<CachingHome>,
    db: AbacusDB,
    allowed: Option<Arc<HashSet<H256>>>,
    denied: Option<Arc<HashSet<H256>>>,
    next_message_nonce: Arc<prometheus::IntGaugeVec>,
    message_leaf_index_gauge: prometheus::IntGauge,
}

impl std::fmt::Display for Replica {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "ReplicaProcessor: {{ home: {:?}, replica: {:?}, allowed: {:?}, denied: {:?} }}",
            self.home, self.replica, self.allowed, self.denied
        )
    }
}

impl Replica {
    #[instrument(skip(self), fields(self = %self))]
    fn main(self) -> JoinHandle<Result<()>> {
        tokio::spawn(
            async move {
                use abacus_core::Replica;

                let replica_domain = self.replica.local_domain();

                // The basic structure of this loop is as follows:
                // 1. Get the last processed index
                // 2. Check if the Home knows of a message above that index
                //      - If not, wait and poll again
                // 3. Check if we have a proof for that message
                //      - If not, wait and poll again
                // 4. Check if the proof is valid under the replica
                // 5. Submit the proof to the replica
                let mut next_message_nonce: u32 = self
                    .db
                    .retrieve_keyed_decodable(CURRENT_NONCE, &replica_domain)?
                    .map(|n: u32| n + 1)
                    .unwrap_or_default();

                self.next_message_nonce
                    .with_label_values(&[self.home.name(), self.replica.name(), AGENT_NAME])
                    .set(next_message_nonce as i64);

                info!(
                    replica_domain,
                    nonce = next_message_nonce,
                    replica = self.replica.name(),
                    "Starting processor for {}:{} at nonce {}",
                    self.replica.name(),
                    replica_domain,
                    next_message_nonce
                );

                let last_processed_message_leaf = self.get_last_processed_message_leaf(replica_domain, next_message_nonce).await;
                self.message_leaf_index_gauge.set(last_processed_message_leaf);

                loop {
                    let seq_span = tracing::trace_span!(
                        "ReplicaProcessor",
                        name = self.replica.name(),
                        nonce = next_message_nonce,
                        replica_domain = replica_domain,
                        home_domain = self.home.local_domain(),
                    );

                    match self
                        .try_msg_by_domain_and_nonce(replica_domain, next_message_nonce)
                        .instrument(seq_span)
                        .await
                    {
                        Ok(Flow::Advance) => {
                            self.db
                            .store_keyed_encodable(CURRENT_NONCE, &replica_domain, &next_message_nonce)?;

                            next_message_nonce += 1;
                            self.next_message_nonce
                                .with_label_values(&[
                                    self.home.name(),
                                    self.replica.name(),
                                    AGENT_NAME,
                                ])
                                .set(next_message_nonce as i64);
                        }
                        Ok(Flow::Repeat) => {
                            // there was some fault, let's wait and then try again later when state may have moved
                            debug!(
                                replica_domain,
                                nonce = next_message_nonce,
                                replica = self.replica.name(),
                                "Trying message failed, retrying. Replica: {}. Nonce: {}. Domain: {}.",
                                self.replica.name(),
                                next_message_nonce,
                                replica_domain,
                            );
                            sleep(Duration::from_secs(self.interval)).await
                        }
                        Err(e) => {
                            error!("fatal error in processor::Replica: {}", e);
                            bail!(e)
                        }
                    }
                }
            }
            .in_current_span(),
        )
    }

    // Attempt to get the leaf index of the previously processed message
    async fn get_last_processed_message_leaf(&self, domain: u32, next_nonce: u32) -> i64 {
        if next_nonce == 0 {
            return 0;
        }

        match self.home.message_by_nonce(domain, next_nonce - 1).await {
            Ok(Some(m)) => m.leaf_index as i64,
            Ok(None) => 0,
            Err(_) => 0,
        }
    }

    /// Attempt to process a message.
    ///
    /// Postcondition: ```match retval? {
    ///   Advance => message skipped ⊻ message was processed
    ///   Repeat => try again later
    /// }```
    ///
    /// In case of error: send help?
    #[instrument(err, skip(self), fields(self = %self))]
    async fn try_msg_by_domain_and_nonce(&self, domain: u32, nonce: u32) -> Result<Flow> {
        use abacus_core::Replica;

        let message = match self.home.message_by_nonce(domain, nonce).await {
            Ok(Some(m)) => m,
            Ok(None) => {
                info!(
                    domain = domain,
                    sequence = nonce,
                    "Message not yet found {}:{}",
                    domain,
                    nonce,
                );
                return Ok(Flow::Repeat);
            }
            Err(e) => bail!(e),
        };

        info!(target: "seen_committed_messages", leaf_index = message.leaf_index);
        let sender = message.message.sender;

        // if we have an allow list, filter senders not on it
        if let Some(false) = self.allowed.as_ref().map(|set| set.contains(&sender)) {
            info!(
                sender = ?sender,
                nonce = nonce,
                "Skipping message because sender not on allow list. Sender: {}. Domain: {}. Nonce: {}",
                sender,
                domain,
                nonce
            );
            return Ok(Flow::Advance);
        }

        // if we have a deny list, filter senders on it
        if let Some(true) = self.denied.as_ref().map(|set| set.contains(&sender)) {
            info!(
                sender = ?sender,
                nonce = nonce,
                "Skipping message because sender on deny list. Sender: {}. Domain: {}. Nonce: {}",
                sender,
                domain,
                nonce
            );
            return Ok(Flow::Advance);
        }

        let proof = match self.db.proof_by_leaf_index(message.leaf_index) {
            Ok(Some(p)) => p,
            Ok(None) => {
                info!(
                    leaf_hash = ?message.to_leaf(),
                    leaf_index = message.leaf_index,
                    "Proof not yet found"
                );
                return Ok(Flow::Repeat);
            }
            Err(e) => bail!(e),
        };

        if proof.leaf != message.to_leaf() {
            let msg =
                eyre!("Leaf in prover does not match retrieved message. Index: {}. Calculated: {}. Prover: {}.", message.leaf_index, message.to_leaf(), proof.leaf);
            error!("{}", msg);
            bail!(msg);
        }

        while !self.replica.acceptable_root(proof.root()).await? {
            info!(
                leaf_hash = ?message.to_leaf(),
                leaf_index = message.leaf_index,
                "Proof under {root} not yet valid here, waiting until Replica confirms",
                root = proof.root(),
            );
            sleep(Duration::from_secs(self.interval)).await;
        }

        info!(
            leaf_hash = ?message.to_leaf(),
            leaf_index = message.leaf_index,
            "Dispatching a message for processing {}:{}",
            domain,
            nonce
        );

        let leaf_index = message.leaf_index;
        let process_outcome = self.process(message, proof).await;
        match process_outcome {
            Ok(()) => (),
            Err(_) => return Ok(Flow::Repeat),
        }

        self.message_leaf_index_gauge.set(leaf_index as i64);

        Ok(Flow::Advance)
    }

    #[instrument(err, level = "trace", skip(self), fields(self = %self))]
    /// Dispatch a message for processing. If the message is already proven, process only.
    async fn process(&self, message: CommittedMessage, proof: Proof) -> Result<()> {
        use abacus_core::Replica;
        let status = self.replica.message_status(message.to_leaf()).await?;
        let tx_outcome;
        match status {
            MessageStatus::None => {
                tx_outcome = self
                    .replica
                    .prove_and_process(message.as_ref(), &proof)
                    .await?;
            }
            MessageStatus::Proven => {
                tx_outcome = self.replica.process(message.as_ref()).await?;
            }
            MessageStatus::Processed => {
                info!(
                    domain = message.message.destination,
                    nonce = message.message.nonce,
                    leaf_index = message.leaf_index,
                    leaf = ?message.message.to_leaf(),
                    "Message {}:{} already processed",
                    message.message.destination,
                    message.message.nonce
                );
                return Ok(());
            }
        }

        info!(
            domain = message.message.destination,
            nonce = message.message.nonce,
            leaf_index = message.leaf_index,
            leaf = ?message.message.to_leaf(),
            "Processed message with tx hash {} and outcome {}. Destination: {}. Nonce: {}. Leaf index: {}.",
            tx_outcome.txid,
            tx_outcome.executed,
            message.message.destination,
            message.message.nonce,
            message.leaf_index,
        );

        if !tx_outcome.executed {
            let msg = eyre!("Process tx was not successful");
            bail!(msg);
        }

        Ok(())
    }
}

decl_agent!(
    /// A processor agent
    Processor {
        interval: u64,
        replica_tasks: RwLock<HashMap<String, JoinHandle<Result<()>>>>,
        allowed: Option<Arc<HashSet<H256>>>,
        denied: Option<Arc<HashSet<H256>>>,
        index_only: HashMap<String, bool>,
        next_message_nonce: Arc<prometheus::IntGaugeVec>,
        config: Option<S3Config>,
    }
);

impl Processor {
    /// Instantiate a new processor
    pub fn new(
        interval: u64,
        core: AgentCore,
        allowed: Option<HashSet<H256>>,
        denied: Option<HashSet<H256>>,
        index_only: HashMap<String, bool>,
        config: Option<S3Config>,
    ) -> Self {
        let next_message_nonce = Arc::new(
            core.metrics
                .new_int_gauge(
                    "next_message_nonce",
                    "Index of the next message to inspect",
                    &["home", "replica", "agent"],
                )
                .expect("processor metric already registered -- should have be a singleton"),
        );

        Self {
            interval,
            core,
            replica_tasks: Default::default(),
            allowed: allowed.map(Arc::new),
            denied: denied.map(Arc::new),
            next_message_nonce,
            index_only,
            config,
        }
    }
}

#[async_trait]
#[allow(clippy::unit_arg)]
impl AbacusAgent for Processor {
    const AGENT_NAME: &'static str = AGENT_NAME;

    type Settings = Settings;

    async fn from_settings(settings: Self::Settings) -> Result<Self>
    where
        Self: Sized,
    {
        let empty_map = HashMap::new();
        Ok(Self::new(
            settings.interval.parse().expect("invalid integer"),
            settings.as_ref().try_into_core(AGENT_NAME).await?,
            settings.allowed,
            settings.denied,
            settings.indexon.unwrap_or(empty_map),
            settings.s3,
        ))
    }

    fn run(&self, name: &str) -> Instrumented<JoinHandle<Result<()>>> {
        let home = self.home();
        let next_message_nonce = self.next_message_nonce.clone();
        let message_leaf_index_gauge = self
            .core
            .metrics
            .last_known_message_leaf_index()
            .with_label_values(&["process", self.home().name(), name]);
        let interval = self.interval;
        let db = AbacusDB::new(home.name(), self.db());

        let replica_opt = self.replica_by_name(name);
        let name = name.to_owned();

        let allowed = self.allowed.clone();
        let denied = self.denied.clone();

        tokio::spawn(async move {
            let replica = replica_opt.ok_or_else(|| eyre!("No replica named {}", name))?;

            Replica {
                interval,
                replica,
                home,
                db,
                allowed,
                denied,
                next_message_nonce,
                message_leaf_index_gauge,
            }
            .main()
            .await?
        })
        .in_current_span()
    }

    fn run_all(self) -> Instrumented<JoinHandle<Result<()>>>
    where
        Self: Sized + 'static,
    {
        tokio::spawn(async move {
            info!("Starting Processor tasks");

            // tree sync
            info!("Starting ProverSync");
            let db = AbacusDB::new(self.home().name().to_owned(), self.db());
            let sync = ProverSync::from_disk(db.clone());
            let prover_sync_task = sync.spawn();

            info!("Starting indexer");
            // indexer setup
            let block_height = self
                .as_ref()
                .metrics
                .new_int_gauge(
                    "block_height",
                    "Height of a recently observed block",
                    &["network", "agent"],
                )
                .expect("failed to register block_height metric")
                .with_label_values(&[self.home().name(), Self::AGENT_NAME]);
            let indexer = &self.as_ref().indexer;
            let home_sync_task = self.home().sync(
                indexer.from(),
                indexer.chunk_size(),
                block_height,
                Some(
                    self.as_ref()
                        .metrics
                        .last_known_message_leaf_index()
                        .with_label_values(&["dispatch", self.home().name(), "unknown"]),
                ),
            );

            info!("started indexer and sync");

            // instantiate task array here so we can optionally push run_task
            let mut tasks = vec![home_sync_task, prover_sync_task];

            // Filter out the index_only replicas
            let names: Vec<&str> = self
                .replicas()
                .keys()
                .filter(|k| !self.index_only.contains_key(k.as_str()))
                .map(|k| k.as_str())
                .collect();

            info!(
                "Starting Processor tasks {:?}, config is {:?}",
                &names, self.index_only
            );
            tasks.push(self.run_many(&names));

            // if we have a bucket, add a task to push to it
            if let Some(config) = &self.config {
                info!(bucket = %config.bucket, "Starting S3 push tasks");
                tasks.push(
                    Pusher::new(
                        self.core.home.name(),
                        &config.bucket,
                        config.region.parse().expect("invalid s3 region"),
                        db.clone(),
                        self.core
                            .metrics
                            .last_known_message_leaf_index()
                            .with_label_values(&["proving", self.core.home.name(), "unknown"]),
                    )
                    .spawn(),
                )
            }

            // find the first task to shut down. Then cancel all others
            debug!(tasks = tasks.len(), "Selecting across Processor tasks");
            let (res, _, remaining) = select_all(tasks).await;
            for task in remaining.into_iter() {
                cancel_task!(task);
            }

            res?
        })
        .instrument(info_span!("Processor::run_all"))
    }
}
