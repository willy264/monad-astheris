use alloy::primitives::Address;
use anyhow::{ensure, Context, Result};
use std::{env, net::SocketAddr, str::FromStr};

#[derive(Clone)]
pub struct Config {
    pub rpc_url: String,
    pub router: Address,
    pub private_keys: Vec<String>,
    pub listen: SocketAddr,
    pub database: String,
    pub cors_origin: String,
    pub confirmations: u64,
    pub deployment_block: u64,
    pub batch_enabled: bool,
    pub max_inflight: usize,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let rpc_url = required("MONAD_RPC_URL")?;
        let url = reqwest::Url::parse(&rpc_url)?;
        ensure!(
            matches!(url.scheme(), "http" | "https"),
            "MONAD_RPC_URL must use HTTP(S)"
        );
        let router = Address::from_str(&required("AETHERIS_ROUTER_ADDRESS")?)?;
        ensure!(
            router != Address::ZERO,
            "router address must be deployed, not zero"
        );
        let private_keys: Vec<String> = required("RELAYER_PRIVATE_KEYS")?
            .split(',')
            .map(|v| v.trim().to_owned())
            .collect();
        ensure!(
            !private_keys.is_empty() && private_keys.len() <= 32,
            "configure 1..32 relayers"
        );
        let confirmations = number("CONFIRMATIONS", 12)?;
        ensure!(confirmations > 0, "CONFIRMATIONS must be positive");
        let max_inflight = number("MAX_INFLIGHT", 32)? as usize;
        ensure!(
            (1..=256).contains(&max_inflight),
            "MAX_INFLIGHT must be 1..256"
        );
        Ok(Self {
            rpc_url,
            router,
            private_keys,
            listen: env::var("LISTEN_ADDR")
                .unwrap_or_else(|_| "127.0.0.1:8080".into())
                .parse()?,
            database: env::var("DATABASE_PATH").unwrap_or_else(|_| "aetheris.redb".into()),
            cors_origin: env::var("CORS_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".into()),
            deployment_block: required("DEPLOYMENT_BLOCK")?
                .parse()
                .context("DEPLOYMENT_BLOCK is a decimal block number")?,
            batch_enabled: env::var("BATCH_ENABLED").unwrap_or_else(|_| "false".into()) == "true",
            confirmations,
            max_inflight,
        })
    }
}

pub fn required(name: &str) -> Result<String> {
    env::var(name)
        .with_context(|| format!("{name} is required"))
        .and_then(|v| {
            ensure!(!v.trim().is_empty(), "{name} cannot be empty");
            Ok(v)
        })
}
pub fn number(name: &str, fallback: u64) -> Result<u64> {
    env::var(name).map_or(Ok(fallback), |v| {
        v.parse().with_context(|| format!("invalid {name}"))
    })
}
