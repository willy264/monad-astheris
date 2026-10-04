//! x402 v2 exact/EIP-3009 transport and Graph Tally v2 receipt verification.
//! Graph Tally's escrow/aggregation adapter below is an explicit Aetheris HTTP integration,
//! not an official Graph Tally endpoint or an assertion of Graph deployment on Monad.
use crate::{
    config::{number, required},
    router::unix_seconds,
    AppState,
};
use alloy::{
    primitives::{keccak256, Address, Signature, B256, U256},
    sol,
    sol_types::{Eip712Domain, SolStruct},
};
use anyhow::{bail, ensure, Context, Result};
use axum::{
    extract::{Request, State},
    http::{HeaderMap, HeaderValue, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{borrow::Cow, env};

sol! {
    // Exact Graph Tally v2 EIP712 type from graphprotocol/graph-tally crates/graph/src/receipt.rs.
    struct Receipt {
        bytes32 collection_id;
        address payer;
        address data_service;
        address service_provider;
        uint64 timestamp_ns;
        uint64 nonce;
        uint128 value;
    }
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TallyMessage {
    pub collection_id: B256,
    pub payer: Address,
    pub data_service: Address,
    pub service_provider: Address,
    pub timestamp_ns: String,
    pub nonce: String,
    pub value: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SignedTallyReceipt {
    pub message: TallyMessage,
    pub signature: String,
}

impl SignedTallyReceipt {
    fn typed(&self) -> Result<Receipt> {
        Ok(Receipt {
            collection_id: self.message.collection_id,
            payer: self.message.payer,
            data_service: self.message.data_service,
            service_provider: self.message.service_provider,
            timestamp_ns: self.message.timestamp_ns.parse()?,
            nonce: self.message.nonce.parse()?,
            value: self.message.value.parse()?,
        })
    }

    fn verify(&self, config: &TallyConfig, client: Address, now: u64) -> Result<(B256, Address)> {
        let receipt = self.typed()?;
        ensure!(
            receipt.collection_id == config.collection && receipt.data_service == config.service,
            "wrong Graph Tally collection/data service"
        );
        ensure!(
            receipt.service_provider == config.receiver,
            "Graph Tally receiver mismatch"
        );
        ensure!(
            receipt.payer == client,
            "Graph Tally payer must authorize this task"
        );
        ensure!(
            receipt.value >= config.amount,
            "Graph Tally receipt underpayment"
        );
        let issued = receipt.timestamp_ns / 1_000_000_000;
        ensure!(
            issued <= now.saturating_add(5) && now.saturating_sub(issued) <= config.max_age,
            "Graph Tally timestamp expired or in future"
        );
        let signature: Signature = self
            .signature
            .parse()
            .context("invalid Graph Tally signature")?;
        ensure!(
            signature.normalize_s().is_none(),
            "noncanonical Graph Tally signature"
        );
        let hash = receipt.eip712_signing_hash(&config.domain);
        let signer = signature.recover_address_from_prehash(&hash)?;
        Ok((hash, signer))
    }
}

pub struct TallyConfig {
    pub collection: B256,
    pub service: Address,
    pub receiver: Address,
    pub amount: u128,
    pub max_age: u64,
    pub domain: Eip712Domain,
}

impl TallyConfig {
    fn domain_json(&self) -> Value {
        json!({"name":self.domain.name,"version":self.domain.version,"chainId":self.domain.chain_id.map(|id|id.to_string()),"verifyingContract":self.domain.verifying_contract})
    }
}

pub enum Mode {
    X402,
    GraphTally(Box<TallyConfig>),
}

pub struct Payments {
    mode: Mode,
    client: reqwest::Client,
    endpoint: String,
    bearer: Option<String>,
    requirements: Value,
    resource_url: String,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct PaymentContext {
    pub id: B256,
    pub payer: Address,
    pub body: Value,
    pub graph_tally: bool,
}

impl Payments {
    pub async fn from_env(client: reqwest::Client) -> Result<Self> {
        let mode_name = env::var("PAYMENT_MODE").unwrap_or_else(|_| "x402".into());
        let resource_url = required("PUBLIC_TASK_URL")?;
        let (mode, endpoint, bearer, requirements) = match mode_name.as_str() {
            "x402" => {
                let endpoint = secure_endpoint(&required("X402_FACILITATOR_URL")?)?;
                let amount = required("PAYMENT_AMOUNT")?;
                ensure!(amount.parse::<u128>()? > 0, "PAYMENT_AMOUNT must be positive base units");
                let asset: Address = required("PAYMENT_ASSET")?.parse()?;
                let receiver: Address = required("PAYMENT_RECEIVER")?.parse()?;
                ensure!(asset != Address::ZERO && receiver != Address::ZERO, "payment asset/receiver cannot be zero");
                let requirements = json!({"scheme":"exact","network":"eip155:10143","amount":amount,"asset":asset,"payTo":receiver,"maxTimeoutSeconds":120,"extra":{"name":required("PAYMENT_ASSET_NAME")?,"version":required("PAYMENT_ASSET_VERSION")?}});
                let bearer = env::var("X402_FACILITATOR_TOKEN").ok().filter(|token| !token.is_empty());
                let mut request = client.get(format!("{endpoint}/supported"));
                if let Some(token) = &bearer { request = request.bearer_auth(token); }
                let supported: Value = request.send().await?.error_for_status()?.json().await?;
                ensure!(supported["kinds"].as_array().is_some_and(|kinds| kinds.iter().any(|kind| kind["x402Version"] == 2 && kind["scheme"] == "exact" && kind["network"] == "eip155:10143")), "facilitator does not advertise x402 v2 exact on Monad Testnet");
                (Mode::X402, endpoint, bearer, requirements)
            }
            "graph-tally" => {
                let endpoint = secure_endpoint(&required("GRAPH_TALLY_ADAPTER_URL")?)?;
                let chain_id = required("GRAPH_TALLY_CHAIN_ID")?.parse::<u64>()?;
                let receiver: Address = required("PAYMENT_RECEIVER")?.parse()?;
                let amount: u128 = required("PAYMENT_AMOUNT")?.parse()?;
                ensure!(amount > 0 && receiver != Address::ZERO, "invalid Graph Tally price/receiver");
                let verifier: Address = required("GRAPH_TALLY_VERIFYING_CONTRACT")?.parse()?;
                let domain = Eip712Domain { name:Some(Cow::Owned(required("GRAPH_TALLY_DOMAIN_NAME")?)), version:Some(Cow::Owned(required("GRAPH_TALLY_DOMAIN_VERSION")?)), chain_id:Some(U256::from(chain_id)), verifying_contract:Some(verifier), salt:None };
                let config = TallyConfig { collection:required("GRAPH_TALLY_COLLECTION_ID")?.parse()?, service:required("GRAPH_TALLY_DATA_SERVICE")?.parse()?, receiver, amount, max_age:number("GRAPH_TALLY_MAX_AGE_SECONDS", 300)?, domain };
                let requirements = json!({"scheme":"graph-tally","network":format!("eip155:{chain_id}"),"amount":amount.to_string(),"asset":"GRT","payTo":receiver,"maxTimeoutSeconds":config.max_age,"extra":{"adapter":"aetheris-graph-tally-v1","collectionId":config.collection,"dataService":config.service,"domain":config.domain_json()}});
                (Mode::GraphTally(Box::new(config)), endpoint, env::var("GRAPH_TALLY_ADAPTER_TOKEN").ok().filter(|token| !token.is_empty()), requirements)
            }
            _ => bail!("PAYMENT_MODE must be x402 or graph-tally; unpaid mode is intentionally unavailable"),
        };
        Ok(Self {
            mode,
            client,
            endpoint,
            bearer,
            requirements,
            resource_url,
        })
    }

    pub fn required_payload(&self) -> Value {
        json!({"x402Version":2,"resource":{"url":self.resource_url,"description":"Create isolated agent shard and commit caller-supplied output hashes","mimeType":"application/json"},"accepts":[self.requirements]})
    }

    pub fn challenge(&self, error: &str) -> Response {
        let mut payload = self.required_payload();
        payload["error"] = json!(error);
        let encoded = STANDARD.encode(serde_json::to_vec(&payload).expect("JSON values serialize"));
        let mut response = (StatusCode::PAYMENT_REQUIRED, Json(payload)).into_response();
        if let Ok(value) = HeaderValue::from_str(&encoded) {
            response.headers_mut().insert("payment-required", value);
        }
        response
    }

    fn header_name(&self) -> &'static str {
        match self.mode {
            Mode::X402 => "payment-signature",
            Mode::GraphTally(_) => "x-graph-tally-receipt",
        }
    }

    async fn post(&self, route: &str, body: &Value) -> Result<Value> {
        let mut request = self
            .client
            .post(format!("{}/{route}", self.endpoint))
            .json(body);
        if let Some(token) = &self.bearer {
            request = request.bearer_auth(token);
        }
        Ok(request.send().await?.error_for_status()?.json().await?)
    }

    pub async fn verify(&self, headers: &HeaderMap, client: Address) -> Result<PaymentContext> {
        let header = headers
            .get(self.header_name())
            .context("payment proof required")?
            .to_str()?;
        ensure!(header.len() <= 16_384, "payment proof too large");
        let decoded = STANDARD
            .decode(header)
            .context("payment proof must be base64 JSON")?;
        match &self.mode {
            Mode::X402 => {
                let payload: Value = serde_json::from_slice(&decoded)?;
                ensure!(
                    payload["x402Version"] == 2 && payload["accepted"] == self.requirements,
                    "payment requirements do not match"
                );
                // This service supports EIP-3009 exact payments only, never arbitrary permits.
                let authorization = &payload["payload"]["authorization"];
                let from: Address = authorization["from"]
                    .as_str()
                    .context("missing EIP3009 from")?
                    .parse()?;
                ensure!(from == client, "payment sender must authorize this task");
                let nonce: B256 = authorization["nonce"]
                    .as_str()
                    .context("missing EIP3009 nonce")?
                    .parse()?;
                let id = payment_id(&self.requirements, from, nonce);
                let body = json!({"x402Version":2,"paymentPayload":payload,"paymentRequirements":self.requirements});
                let response = self.post("verify", &body).await?;
                ensure!(response["isValid"] == true, "facilitator rejected payment");
                let payer: Address = response["payer"]
                    .as_str()
                    .context("facilitator omitted payer")?
                    .parse()?;
                ensure!(payer == client, "facilitator payer mismatch");
                Ok(PaymentContext {
                    id,
                    payer,
                    body,
                    graph_tally: false,
                })
            }
            Mode::GraphTally(config) => {
                let receipt: SignedTallyReceipt = serde_json::from_slice(&decoded)?;
                let (id, signer) = receipt.verify(config, client, unix_seconds()?)?;
                let body = json!({"adapterVersion":1,"signedReceipt":receipt,"receiptHash":id,"domain":config.domain_json(),"minimumValue":config.amount.to_string()});
                // The adapter must query actual escrow + payer-authorized signer + collection state.
                let response = self.post("verify", &body).await?;
                ensure!(
                    response["isValid"] == true,
                    "Graph Tally escrow adapter rejected receipt"
                );
                let verified_signer: Address = response["authorizedSigner"]
                    .as_str()
                    .context("adapter omitted signer")?
                    .parse()?;
                let verified_payer: Address = response["payer"]
                    .as_str()
                    .context("adapter omitted payer")?
                    .parse()?;
                ensure!(
                    verified_signer == signer && verified_payer == client,
                    "Graph Tally adapter signer/payer mismatch"
                );
                Ok(PaymentContext {
                    id,
                    payer: client,
                    body,
                    graph_tally: true,
                })
            }
        }
    }

    pub async fn settle(&self, context: &PaymentContext) -> Result<Value> {
        let receipt = self.post("settle", &context.body).await?;
        ensure!(
            receipt["success"] == true,
            "payment settlement failed; operator reconciliation required"
        );
        if !context.graph_tally {
            ensure!(
                receipt["network"] == "eip155:10143",
                "settlement chain mismatch"
            );
            let payer: Address = receipt["payer"]
                .as_str()
                .context("settlement omitted payer")?
                .parse()?;
            ensure!(payer == context.payer, "settlement payer mismatch");
            let _: B256 = receipt["transaction"]
                .as_str()
                .context("settlement omitted transaction")?
                .parse()?;
        } else {
            ensure!(
                receipt["receiptHash"] == json!(context.id),
                "adapter settlement receipt mismatch"
            );
        }
        Ok(receipt)
    }
}

pub async fn require_payment(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Response {
    if request
        .headers()
        .get(state.payments.header_name())
        .is_none()
    {
        return state.payments.challenge("payment proof required");
    }
    next.run(request).await
}

fn secure_endpoint(input: &str) -> Result<String> {
    let url = reqwest::Url::parse(input)?;
    ensure!(
        url.scheme() == "https"
            || (url.scheme() == "http"
                && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))),
        "payment endpoints require HTTPS except localhost"
    );
    ensure!(
        url.username().is_empty()
            && url.password().is_none()
            && url.query().is_none()
            && url.fragment().is_none(),
        "payment endpoint cannot contain credentials/query/fragment"
    );
    Ok(input.trim_end_matches('/').to_owned())
}

fn payment_id(requirements: &Value, payer: Address, nonce: B256) -> B256 {
    // Independent of JSON field order, signature malleability and request body serialization.
    keccak256(format!(
        "{}:{}:{payer}:{nonce}",
        requirements["network"], requirements["asset"]
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use alloy::{
        signers::{local::PrivateKeySigner, SignerSync},
        sol_types::eip712_domain,
    };

    #[test]
    fn receipt_checks_signature_receiver_payer_age_and_value() {
        let signer: PrivateKeySigner =
            "0000000000000000000000000000000000000000000000000000000000000001"
                .parse()
                .unwrap();
        let config = TallyConfig {
            collection: B256::repeat_byte(1),
            service: Address::repeat_byte(2),
            receiver: Address::repeat_byte(3),
            amount: 100,
            max_age: 60,
            domain: eip712_domain! { name:"GraphTally", version:"2", chain_id:42161, verifying_contract:Address::repeat_byte(4), },
        };
        let mut receipt = SignedTallyReceipt {
            message: TallyMessage {
                collection_id: config.collection,
                payer: signer.address(),
                data_service: config.service,
                service_provider: config.receiver,
                timestamp_ns: "100000000000".into(),
                nonce: "1".into(),
                value: "100".into(),
            },
            signature: String::new(),
        };
        receipt.signature = signer
            .sign_hash_sync(&receipt.typed().unwrap().eip712_signing_hash(&config.domain))
            .unwrap()
            .to_string();
        assert_eq!(
            receipt.verify(&config, signer.address(), 101).unwrap().1,
            signer.address()
        );
        assert!(receipt.verify(&config, signer.address(), 161).is_err());
        assert!(receipt.verify(&config, Address::ZERO, 101).is_err());
        receipt.message.value = "99".into();
        assert!(receipt.verify(&config, signer.address(), 101).is_err());
        receipt.message.value = "100".into();
        receipt.message.service_provider = Address::ZERO;
        assert!(receipt.verify(&config, signer.address(), 101).is_err());
    }

    #[test]
    fn remote_payment_endpoints_require_tls() {
        assert!(secure_endpoint("http://example.com").is_err());
        assert!(secure_endpoint("https://example.com").is_ok());
        assert!(secure_endpoint("http://localhost:8081").is_ok());
        assert!(secure_endpoint("https://user:pass@example.com").is_err());
    }
}
