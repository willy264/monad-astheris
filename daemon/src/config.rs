use alloy::primitives::Address;
use alloy::signers::local::PrivateKeySigner;
use anyhow::{anyhow, ensure, Context, Result};
use std::{env, net::SocketAddr, str::FromStr};

#[derive(Clone)]
pub struct Config {
    pub rpc_url: String,
    pub router: Address,
    pub private_keys: Vec<String>,
    pub listen: SocketAddr,
    pub database: String,
    pub database_require_existing: bool,
    pub database_mount_path: Option<String>,
    pub testnet_ephemeral_storage: bool,
    pub cors_origin: String,
    pub confirmations: u64,
    pub deployment_block: u64,
    pub batch_enabled: bool,
    pub task_submission_enabled: bool,
    pub envio_graphql_url: Option<String>,
    pub max_inflight: usize,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let rpc_url = required("MONAD_RPC_URL")?;
        let url = reqwest::Url::parse(&rpc_url)
            .map_err(|_| anyhow!("MONAD_RPC_URL must be a valid HTTP(S) URL"))?;
        ensure!(
            matches!(url.scheme(), "http" | "https"),
            "MONAD_RPC_URL must use HTTP(S)"
        );
        let router = parse_router_address(&required("AETHERIS_ROUTER_ADDRESS")?)?;
        let private_keys = parse_relayer_keys(&required("RELAYER_PRIVATE_KEYS")?)?;
        let confirmations = number("CONFIRMATIONS", 12)?;
        ensure!(confirmations > 0, "CONFIRMATIONS must be positive");
        let max_inflight = number("MAX_INFLIGHT", 32)? as usize;
        ensure!(
            (1..=256).contains(&max_inflight),
            "MAX_INFLIGHT must be 1..256"
        );
        let on_render = env::var("RENDER").as_deref() == Ok("true");
        let database_mount_path = env::var("DATABASE_MOUNT_PATH")
            .ok()
            .filter(|path| !path.trim().is_empty());
        let testnet_ephemeral_storage = parse_switch(
            "TESTNET_EPHEMERAL_STORAGE",
            env::var("TESTNET_EPHEMERAL_STORAGE").ok(),
            false,
        )?;
        let database_require_existing = storage_policy(
            on_render,
            testnet_ephemeral_storage,
            database_mount_path.is_some(),
            env::var("DATABASE_REQUIRE_EXISTING").ok(),
            &env::var("PAYMENT_MODE").unwrap_or_else(|_| "x402".into()),
        )?;
        Ok(Self {
            rpc_url,
            router,
            private_keys,
            listen: listen_address(
                env::var("LISTEN_ADDR").ok().as_deref(),
                env::var("PORT").ok().as_deref(),
            )?,
            database: env::var("DATABASE_PATH").unwrap_or_else(|_| "aetheris.redb".into()),
            database_require_existing,
            database_mount_path,
            testnet_ephemeral_storage,
            cors_origin: env::var("CORS_ORIGIN").unwrap_or_else(|_| "http://localhost:3000".into()),
            deployment_block: required("DEPLOYMENT_BLOCK")?
                .parse()
                .context("DEPLOYMENT_BLOCK is a decimal block number")?,
            batch_enabled: env::var("BATCH_ENABLED").unwrap_or_else(|_| "false".into()) == "true",
            task_submission_enabled: parse_switch(
                "TASK_SUBMISSION_ENABLED",
                env::var("TASK_SUBMISSION_ENABLED").ok(),
                true,
            )?,
            envio_graphql_url: optional_indexer_url(env::var("ENVIO_GRAPHQL_URL").ok())?,
            confirmations,
            max_inflight,
        })
    }
}

fn storage_policy(
    on_render: bool,
    testnet_ephemeral: bool,
    has_mount: bool,
    require_existing: Option<String>,
    payment_mode: &str,
) -> Result<bool> {
    ensure!(
        !testnet_ephemeral || payment_mode == "x402",
        "TESTNET_EPHEMERAL_STORAGE only supports x402 payments on Monad Testnet"
    );
    ensure!(
        !on_render || testnet_ephemeral || has_mount,
        "Render requires DATABASE_MOUNT_PATH pointing to an attached persistent disk; temporary Monad Testnet storage requires explicit TESTNET_EPHEMERAL_STORAGE=true"
    );
    // Explicit retention settings still apply in temporary mode. In particular,
    // a configured mount is validated by Store and a missing required file fails.
    let require_existing = parse_switch(
        "DATABASE_REQUIRE_EXISTING",
        require_existing,
        on_render && !testnet_ephemeral,
    )?;
    ensure!(
        !on_render || testnet_ephemeral || require_existing,
        "Render requires DATABASE_REQUIRE_EXISTING=true; restore the retained journal before starting the service"
    );
    Ok(require_existing)
}

fn parse_switch(name: &str, value: Option<String>, default: bool) -> Result<bool> {
    match value.as_deref().map(str::trim) {
        None => Ok(default),
        Some("true") => Ok(true),
        Some("false") => Ok(false),
        _ => Err(anyhow!("{name} must be true or false")),
    }
}

fn optional_indexer_url(value: Option<String>) -> Result<Option<String>> {
    let Some(value) = value.filter(|value| !value.trim().is_empty()) else {
        return Ok(None);
    };
    let url = reqwest::Url::parse(value.trim())
        .map_err(|_| anyhow!("ENVIO_GRAPHQL_URL must be an HTTP(S) GraphQL endpoint"))?;
    ensure!(matches!(url.scheme(), "http" | "https") && url.username().is_empty() && url.password().is_none() && url.fragment().is_none(), "ENVIO_GRAPHQL_URL must be an HTTP(S) GraphQL endpoint without embedded credentials or fragments");
    Ok(Some(url.to_string()))
}

fn parse_router_address(value: &str) -> Result<Address> {
    let router = Address::from_str(value.trim()).map_err(|_| {
        anyhow!("AETHERIS_ROUTER_ADDRESS must be the deployed router address: 0x followed by 40 hexadecimal digits (42 characters total); remove quotes and replace placeholders")
    })?;
    ensure!(
        router != Address::ZERO,
        "AETHERIS_ROUTER_ADDRESS must be a deployed contract address, not the zero address"
    );
    Ok(router)
}

fn parse_relayer_keys(value: &str) -> Result<Vec<String>> {
    let keys: Vec<String> = value.split(',').map(|key| key.trim().to_owned()).collect();
    ensure!(
        !keys.is_empty() && keys.len() <= 32,
        "RELAYER_PRIVATE_KEYS must contain 1..32 comma-separated private keys"
    );
    for (index, key) in keys.iter().enumerate() {
        // Do not include the supplied key or the underlying parser error in logs.
        key.parse::<PrivateKeySigner>().map_err(|_| {
            anyhow!(
                "RELAYER_PRIVATE_KEYS entry {} must be a valid secp256k1 private key: 64 hexadecimal digits, optionally prefixed with 0x; remove quotes and empty entries",
                index + 1
            )
        })?;
    }
    Ok(keys)
}

fn listen_address(explicit: Option<&str>, port: Option<&str>) -> Result<SocketAddr> {
    if let Some(value) = explicit {
        return value.trim().parse().map_err(|_| {
            anyhow!("LISTEN_ADDR must be an IP address and port, for example 0.0.0.0:10000")
        });
    }
    if let Some(value) = port {
        let port: u16 = value
            .trim()
            .parse()
            .map_err(|_| anyhow!("PORT must be a decimal port number from 1 to 65535"))?;
        ensure!(
            port > 0,
            "PORT must be a decimal port number from 1 to 65535"
        );
        return Ok(SocketAddr::from(([0, 0, 0, 0], port)));
    }
    Ok(SocketAddr::from(([127, 0, 0, 1], 8080)))
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn temporary_testnet_storage_is_explicit_and_preserves_retention_settings() {
        assert!(!parse_switch("TESTNET_EPHEMERAL_STORAGE", None, false).unwrap());
        assert!(!parse_switch("TESTNET_EPHEMERAL_STORAGE", Some("false".into()), false).unwrap());
        assert!(parse_switch("TESTNET_EPHEMERAL_STORAGE", Some("true".into()), false).unwrap());
        for value in ["", "1", "True", "yes"] {
            assert!(parse_switch("TESTNET_EPHEMERAL_STORAGE", Some(value.into()), false).is_err());
        }
        assert!(storage_policy(true, false, false, None, "x402").is_err());
        assert!(storage_policy(true, false, true, None, "x402").unwrap());
        assert!(storage_policy(true, false, true, Some("false".into()), "x402").is_err());
        assert!(!storage_policy(true, true, false, None, "x402").unwrap());
        assert!(storage_policy(true, true, false, Some("true".into()), "x402").unwrap());
        assert!(storage_policy(true, true, true, Some("true".into()), "x402").unwrap());
        assert!(storage_policy(true, true, false, Some("yes".into()), "x402").is_err());
        assert!(storage_policy(true, true, false, None, "graph-tally").is_err());
    }

    #[test]
    fn submission_switch_defaults_on_but_rejects_ambiguous_values() {
        assert!(parse_switch("TASK_SUBMISSION_ENABLED", None, true).unwrap());
        assert!(!parse_switch("TASK_SUBMISSION_ENABLED", Some("false".into()), true).unwrap());
        for value in ["", "1", "False", "yes"] {
            assert!(parse_switch("TASK_SUBMISSION_ENABLED", Some(value.into()), true).is_err());
        }
    }

    #[test]
    fn malformed_router_reports_the_environment_variable() {
        for value in [
            "0x123",
            "0x<router>",
            "\"0x1111111111111111111111111111111111111111\"",
            "0x0000000000000000000000000000000000000000",
        ] {
            let error = parse_router_address(value).unwrap_err().to_string();
            assert!(error.contains("AETHERIS_ROUTER_ADDRESS"));
            assert!(
                !error.contains(value),
                "errors must not echo supplied values"
            );
        }
        assert_eq!(
            parse_router_address(" 0x1111111111111111111111111111111111111111 ").unwrap(),
            Address::repeat_byte(0x11)
        );
    }

    #[test]
    fn relayer_errors_identify_entry_without_exposing_key() {
        let valid = format!("0x{}", "11".repeat(32));
        assert_eq!(
            parse_relayer_keys(&format!(" {valid} ")).unwrap(),
            vec![valid.clone()]
        );
        for invalid in [
            "a".repeat(63),
            "00".repeat(32),
            format!("\"{valid}\""),
            String::new(),
        ] {
            let error = parse_relayer_keys(&format!("{valid},{invalid}"))
                .unwrap_err()
                .to_string();
            assert!(error.contains("RELAYER_PRIVATE_KEYS entry 2"));
            assert!(!error.contains(&valid));
            if !invalid.is_empty() {
                assert!(!error.contains(&invalid));
            }
        }
    }

    #[test]
    fn render_port_binds_publicly_and_explicit_listener_takes_precedence() {
        assert_eq!(
            listen_address(None, Some("10000")).unwrap().to_string(),
            "0.0.0.0:10000"
        );
        assert_eq!(
            listen_address(None, None).unwrap().to_string(),
            "127.0.0.1:8080"
        );
        assert_eq!(
            listen_address(Some("127.0.0.1:8088"), Some("10000"))
                .unwrap()
                .to_string(),
            "127.0.0.1:8088"
        );
    }

    #[test]
    fn invalid_listener_settings_fail_with_actionable_errors() {
        for value in ["", "0", "-1", "65536", "$PORT"] {
            assert!(listen_address(None, Some(value))
                .unwrap_err()
                .to_string()
                .contains("PORT"));
        }
        assert!(listen_address(Some("0.0.0.0:$PORT"), Some("10000"))
            .unwrap_err()
            .to_string()
            .contains("LISTEN_ADDR"));
    }
}
