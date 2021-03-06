use std::collections::HashMap;
use std::fmt::{Debug, Formatter};
use std::sync::Arc;
use std::time::Duration;

use eyre::Result;
use once_cell::sync::OnceCell;
use prometheus::{
    histogram_opts, labels, opts, register_counter_vec_with_registry,
    register_gauge_vec_with_registry, register_histogram_vec_with_registry,
    register_int_counter_vec_with_registry, register_int_gauge_vec_with_registry, CounterVec,
    Encoder, GaugeVec, HistogramVec, IntCounterVec, IntGaugeVec, Registry,
};
use tokio::task::JoinHandle;

use ethers_prometheus::ProviderMetrics;

use crate::metrics::provider::create_provider_metrics;

use super::NAMESPACE;

/// Recommended default histogram buckets for network communication.
pub const NETWORK_HISTOGRAM_BUCKETS: &[f64] = &[0.005, 0.01, 0.05, 0.1, 0.5, 1., 5., 10.];
/// Recommended default histogram buckets for internal process logic.
pub const PROCESS_HISTOGRAM_BUCKETS: &[f64] = &[
    0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1., 5., 10.,
];
/// Macro to prefix a string with the namespace.
macro_rules! namespaced {
    ($name:expr) => {
        format!("{NAMESPACE}_{}", $name)
    };
}

/// Metrics for a particular domain
pub struct CoreMetrics {
    /// Metrics registry for adding new metrics and gathering reports
    registry: Registry,
    const_labels: HashMap<String, String>,
    listen_port: Option<u16>,
    agent_name: String,

    rpc_latencies: HistogramVec,
    span_durations: HistogramVec,
    span_events: IntCounterVec,
    last_known_message_leaf_index: IntGaugeVec,
    submitter_queue_length: IntGaugeVec,
    submitter_queue_duration_histogram: HistogramVec,

    messages_processed_count: IntCounterVec,

    outbox_state: IntGaugeVec,
    latest_checkpoint: IntGaugeVec,

    /// Set of provider-specific metrics. These only need to get created once.
    provider_metrics: OnceCell<ProviderMetrics>,
}

impl CoreMetrics {
    /// Track metrics for a particular agent name.
    ///
    /// - `for_agent` name of the agent these metrics are tracking.
    /// - `listen_port` port to start the HTTP server on. If None the server will not be started.
    /// - `registry` prometheus registry to attach the metrics to
    pub fn new(
        for_agent: &str,
        listen_port: Option<u16>,
        registry: Registry,
    ) -> prometheus::Result<Self> {
        let const_labels: HashMap<String, String> = labels! {
            namespaced!("baselib_version") => env!("CARGO_PKG_VERSION").into(),
            "agent".into() => for_agent.into(),
        };
        let const_labels_ref = const_labels
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect::<HashMap<_, _>>();

        let rpc_latencies = register_histogram_vec_with_registry!(
            histogram_opts!(
                namespaced!("rpc_duration_seconds"),
                "Duration from dispatch to receipt-of-response for RPC calls",
                NETWORK_HISTOGRAM_BUCKETS.into(),
                const_labels.clone()
            ),
            &["chain", "method"],
            registry
        )?;

        let span_durations = register_histogram_vec_with_registry!(
            histogram_opts!(
                namespaced!("span_duration_seconds"),
                "Duration from tracing span creation to span destruction",
                PROCESS_HISTOGRAM_BUCKETS.into(),
                const_labels.clone()
            ),
            &["span_name", "span_target"],
            registry
        )?;

        // Tracking the number of events emitted helps us verify logs are not being dropped and
        // provides a quick way to query error and warning counts.
        let span_events = register_int_counter_vec_with_registry!(
            opts!(
                namespaced!("span_events_total"),
                "Number of span events (logs and time metrics) emitted by level",
                const_labels_ref
            ),
            &["event_level"],
            registry
        )?;

        // "remote is unknown where remote is unavailable"
        // The following phases are implemented:
        // - `dispatch`: When a message is indexed and stored in the DB
        // - `signed_offchain_checkpoint`: When a leaf index is known to be signed by a validator
        // - `processor_loop`: The current leaf index in the MessageProcessor loop
        // - `message_processed`: When a leaf index was processed as part of the MessageProcessor loop
        let last_known_message_leaf_index = register_int_gauge_vec_with_registry!(
            opts!(
                namespaced!("last_known_message_leaf_index"),
                "Last known message leaf index",
                const_labels_ref
            ),
            &["phase", "origin", "remote"],
            registry
        )?;

        let submitter_queue_length = register_int_gauge_vec_with_registry!(
            opts!(
                namespaced!("submitter_queue_length"),
                "Submitter queue length",
                const_labels_ref
            ),
            &["origin", "remote", "queue_name"],
            registry
        )?;

        let submitter_queue_duration_histogram = register_histogram_vec_with_registry!(
            histogram_opts!(
                namespaced!("submitter_queue_duration_seconds"),
                concat!(
                    "Time a message spends queued in the serial submitter measured from ",
                    "insertion into channel from processor, ending after successful delivery ",
                    "to provider."
                ),
                prometheus::exponential_buckets(0.5, 2., 19).unwrap(),
                const_labels.clone()
            ),
            &["origin", "remote"],
            registry
        )?;

        let outbox_state = register_int_gauge_vec_with_registry!(
            opts!(
                namespaced!("outbox_state"),
                "Outbox contract state value",
                const_labels_ref
            ),
            &["chain"],
            registry
        )?;

        // Latest checkpoint that has been observed.
        // Phase:
        // - `validator_observed`: When the validator has begun processing this checkpoint.
        // - `validator_processed`: When the validator has written this checkpoint.
        let latest_checkpoint = register_int_gauge_vec_with_registry!(
            opts!(
                namespaced!("latest_checkpoint"),
                "Outbox latest checkpoint",
                const_labels_ref
            ),
            &["phase", "chain"],
            registry
        )?;

        // The value of `abacus_last_known_message_leaf_index{phase=message_processed}` should refer
        // to the maximum leaf index value we ever successfully delivered. Since deliveries can
        // happen out-of-index-order, we separately track this counter referring to the number of
        // successfully delivered messages.
        let messages_processed_count = register_int_counter_vec_with_registry!(
            opts!(
                namespaced!("messages_processed_count"),
                "Number of messages processed",
                const_labels_ref
            ),
            &["origin", "remote"],
            registry
        )?;

        Ok(Self {
            agent_name: for_agent.into(),
            registry,
            listen_port,
            const_labels,

            rpc_latencies,
            span_durations,
            span_events,
            last_known_message_leaf_index,

            submitter_queue_length,
            submitter_queue_duration_histogram,

            messages_processed_count,

            outbox_state,
            latest_checkpoint,

            provider_metrics: OnceCell::new(),
        })
    }

    /// Create the provider metrics attached to this core metrics instance.
    pub fn provider_metrics(&self) -> ProviderMetrics {
        self.provider_metrics
            .get_or_init(|| {
                create_provider_metrics(self).expect("Failed to create provider metrics!")
            })
            .clone()
    }

    /// Create and register a new int gauge.
    pub fn new_int_gauge(
        &self,
        metric_name: &str,
        help: &str,
        labels: &[&str],
    ) -> Result<IntGaugeVec> {
        Ok(register_int_gauge_vec_with_registry!(
            opts!(namespaced!(metric_name), help, self.const_labels_str()),
            labels,
            self.registry
        )?)
    }

    /// Create and register a new gauge.
    pub fn new_gauge(&self, metric_name: &str, help: &str, labels: &[&str]) -> Result<GaugeVec> {
        Ok(register_gauge_vec_with_registry!(
            opts!(namespaced!(metric_name), help, self.const_labels_str()),
            labels,
            self.registry
        )?)
    }

    /// Create and register a new counter.
    pub fn new_counter(
        &self,
        metric_name: &str,
        help: &str,
        labels: &[&str],
    ) -> Result<CounterVec> {
        Ok(register_counter_vec_with_registry!(
            opts!(namespaced!(metric_name), help, self.const_labels_str()),
            labels,
            self.registry
        )?)
    }

    /// Create and register a new int counter.
    pub fn new_int_counter(
        &self,
        metric_name: &str,
        help: &str,
        labels: &[&str],
    ) -> Result<IntCounterVec> {
        Ok(register_int_counter_vec_with_registry!(
            opts!(namespaced!(metric_name), help, self.const_labels_str()),
            labels,
            self.registry
        )?)
    }

    /// Create and register a new histogram.
    pub fn new_histogram(
        &self,
        metric_name: &str,
        help: &str,
        labels: &[&str],
        buckets: Vec<f64>,
    ) -> Result<HistogramVec> {
        Ok(register_histogram_vec_with_registry!(
            histogram_opts!(
                namespaced!(metric_name),
                help,
                buckets,
                self.const_labels.clone()
            ),
            labels,
            self.registry
        )?)
    }

    /// Call with RPC duration after it is complete
    pub fn rpc_complete(&self, chain: &str, method: &str, duration: Duration) {
        self.rpc_latencies
            .with_label_values(&[chain, method, &self.agent_name])
            .observe(duration.as_secs_f64())
    }

    /// Gauge for measuring the last known message leaf index
    pub fn last_known_message_leaf_index(&self) -> IntGaugeVec {
        self.last_known_message_leaf_index.clone()
    }

    /// Gauge for reporting the current outbox state.
    pub fn outbox_state(&self) -> IntGaugeVec {
        self.outbox_state.clone()
    }

    /// Gauge for the latest checkpoint at various phases.
    pub fn latest_checkpoint(&self) -> IntGaugeVec {
        self.latest_checkpoint.clone()
    }

    /// Gauge for measuring the queue lengths in Submitter instances
    pub fn submitter_queue_length(&self) -> IntGaugeVec {
        self.submitter_queue_length.clone()
    }

    /// Histogram for measuring time spent until message submission, starting from the moment
    /// that the message was discovered as "sendable" from AbacusDB and being enqueued with the
    /// relevant `submitter`.
    pub fn submitter_queue_duration_histogram(&self) -> HistogramVec {
        self.submitter_queue_duration_histogram.clone()
    }

    /// Counter for the number of messages successfully submitted by
    /// this process during its lifetime.
    pub fn messages_processed_count(&self) -> IntCounterVec {
        self.messages_processed_count.clone()
    }

    /// Histogram for measuring span durations.
    ///
    /// Labels needed:
    /// - `span_name`: name of the span. e.g. the function name.
    /// - `span_target`: a string that categorizes part of the system where the span or event occurred. e.g. module path.
    pub fn span_duration(&self) -> HistogramVec {
        self.span_durations.clone()
    }

    /// Counts of span events.
    ///
    /// Labels needed:
    /// - `event_level`: level of the event, i.e. trace, debug, info, warn, error.
    ///
    pub fn span_events(&self) -> IntCounterVec {
        self.span_events.clone()
    }

    /// Gather available metrics into an encoded (plaintext, OpenMetrics format) report.
    pub fn gather(&self) -> prometheus::Result<Vec<u8>> {
        let collected_metrics = self.registry.gather();
        let mut out_buf = Vec::with_capacity(1024 * 64);
        let encoder = prometheus::TextEncoder::new();
        encoder.encode(&collected_metrics, &mut out_buf)?;
        Ok(out_buf)
    }

    /// Run an HTTP server serving OpenMetrics format reports on `/metrics`
    ///
    /// This is compatible with Prometheus, which ought to be configured to scrape me!
    pub fn run_http_server(self: Arc<Self>) -> JoinHandle<()> {
        use warp::Filter;
        if let Some(port) = self.listen_port {
            tracing::info!(port, "starting prometheus server on 0.0.0.0:{port}");
            tokio::spawn(async move {
                warp::serve(
                    warp::path!("metrics")
                        .map(move || {
                            warp::reply::with_header(
                                self.gather().expect("failed to encode metrics"),
                                "Content-Type",
                                // OpenMetrics specs demands "application/openmetrics-text; version=1.0.0; charset=utf-8"
                                // but the prometheus scraper itself doesn't seem to care?
                                // try text/plain to make web browsers happy.
                                "text/plain; charset=utf-8",
                            )
                        })
                        .or(warp::any().map(|| {
                            warp::reply::with_status(
                                "go look at /metrics",
                                warp::http::StatusCode::NOT_FOUND,
                            )
                        })),
                )
                .run(([0, 0, 0, 0], port))
                .await;
            })
        } else {
            tracing::info!("not starting prometheus server");
            tokio::spawn(std::future::ready(()))
        }
    }

    /// Get the name of this agent, e.g. "relayer"
    pub fn agent_name(&self) -> &str {
        &self.agent_name
    }

    fn const_labels_str(&self) -> HashMap<&str, &str> {
        self.const_labels
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect()
    }
}

impl Debug for CoreMetrics {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "CoreMetrics {{ agent_name: {}, listen_port: {:?} }}",
            self.agent_name, self.listen_port
        )
    }
}
