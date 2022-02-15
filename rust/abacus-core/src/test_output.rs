use crate::{
    accumulator::{
        merkle::{merkle_root_from_branch, MerkleTree},
        TREE_DEPTH,
    },
    test_utils::find_vector,
    utils::{destination_and_nonce, home_domain_hash},
    FailureNotification, AbacusMessage, Update,
};
use ethers::{
    core::types::{H160, H256},
    signers::Signer,
};
use hex::FromHex;

use serde_json::{json, Value};
use std::{fs::OpenOptions, io::Write};

/// Test functions that output json files
#[cfg(feature = "output")]
pub mod output_functions {
    use std::str::FromStr;

    use super::*;

    /// Output proof to /vector/message.json
    pub fn output_message_and_leaf() {
        let abacus_message = AbacusMessage {
            origin: 1000,
            sender: H256::from(
                H160::from_str("0x1111111111111111111111111111111111111111").unwrap(),
            ),
            nonce: 1,
            destination: 2000,
            recipient: H256::from(
                H160::from_str("0x2222222222222222222222222222222222222222").unwrap(),
            ),
            body: Vec::from_hex("1234").unwrap(),
        };

        let message_json = json!({
            "origin": abacus_message.origin,
            "sender": abacus_message.sender,
            "destination": abacus_message.destination,
            "recipient": abacus_message.recipient,
            "nonce": abacus_message.nonce,
            "body": abacus_message.body,
            "messageHash": abacus_message.to_leaf(),
        });
        let json = json!([message_json]).to_string();

        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(find_vector("message.json"))
            .expect("Failed to open/create file");

        file.write_all(json.as_bytes())
            .expect("Failed to write to file");
    }

    /// Output merkle proof test vectors
    pub fn output_merkle_proof() {
        let mut tree = MerkleTree::create(&[], TREE_DEPTH);

        let index = 1;

        // kludge. this is a manual entry of the hash of the messages sent by the cross-chain governance upgrade tests
        tree.push_leaf(
            "0xd89959d277019eee21f1c3c270a125964d63b71876880724d287fbb8b8de55f1"
                .parse()
                .unwrap(),
            TREE_DEPTH,
        )
        .unwrap();
        tree.push_leaf(
            "0x5068ac60cb6f9c5202bbe8e7a1babdd972133ea3ad37d7e0e753c7e4ddd7ffbd"
                .parse()
                .unwrap(),
            TREE_DEPTH,
        )
        .unwrap();
        let proof = tree.generate_proof(index, TREE_DEPTH);

        let proof_json = json!({ "leaf": proof.0, "path": proof.1, "index": index});
        let json = json!({ "proof": proof_json, "root": merkle_root_from_branch(proof.0, &proof.1, 32, index)}).to_string();

        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(find_vector("proof.json"))
            .expect("Failed to open/create file");

        file.write_all(json.as_bytes())
            .expect("Failed to write to file");
    }

    /// Outputs domain hash test cases in /vector/domainHash.json
    pub fn output_home_domain_hashes() {
        let test_cases: Vec<Value> = (1..=3)
            .map(|i| {
                json!({
                    "homeDomain": i,
                    "expectedDomainHash": home_domain_hash(i)
                })
            })
            .collect();

        let json = json!(test_cases).to_string();

        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(find_vector("homeDomainHash.json"))
            .expect("Failed to open/create file");

        file.write_all(json.as_bytes())
            .expect("Failed to write to file");
    }

    /// Outputs combined destination and nonce test cases in /vector/
    /// destinationNonce.json
    pub fn output_destination_and_nonces() {
        let test_cases: Vec<Value> = (1..=5)
            .map(|i| {
                json!({
                    "destination": i,
                    "nonce": i + 1,
                    "expectedDestinationAndNonce": destination_and_nonce(i, i + 1)
                })
            })
            .collect();

        let json = json!(test_cases).to_string();

        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(find_vector("destinationNonce.json"))
            .expect("Failed to open/create file");

        file.write_all(json.as_bytes())
            .expect("Failed to write to file");
    }

    /// Outputs signed update test cases in /vector/signedUpdate.json
    pub fn output_signed_updates() {
        let t = async {
            let signer: ethers::signers::LocalWallet =
                "1111111111111111111111111111111111111111111111111111111111111111"
                    .parse()
                    .unwrap();

            let mut test_cases: Vec<Value> = Vec::new();

            // test suite
            for i in 1..=3 {
                let signed_update = Update {
                    home_domain: 1000,
                    new_root: H256::repeat_byte(i + 1),
                    previous_root: H256::repeat_byte(i),
                }
                .sign_with(&signer)
                .await
                .expect("!sign_with");

                test_cases.push(json!({
                    "homeDomain": signed_update.update.home_domain,
                    "oldRoot": signed_update.update.previous_root,
                    "newRoot": signed_update.update.new_root,
                    "signature": signed_update.signature,
                    "signer": signer.address(),
                }))
            }

            let json = json!(test_cases).to_string();

            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(find_vector("signedUpdate.json"))
                .expect("Failed to open/create file");

            file.write_all(json.as_bytes())
                .expect("Failed to write to file");
        };

        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(t)
    }

    /// Outputs signed update test cases in /vector/signedFailure.json
    pub fn output_signed_failure_notifications() {
        let t = async {
            let signer: ethers::signers::LocalWallet =
                "1111111111111111111111111111111111111111111111111111111111111111"
                    .parse()
                    .unwrap();

            let updater: ethers::signers::LocalWallet =
                "2222222222222222222222222222222222222222222222222222222222222222"
                    .parse()
                    .unwrap();

            // `home_domain` MUST BE 2000 to match home_domain domain of
            // XAppConnectionManager test suite
            let signed_failure = FailureNotification {
                home_domain: 2000,
                updater: updater.address().into(),
            }
            .sign_with(&signer)
            .await
            .expect("!sign_with");

            let signed_json = json!({
                "domain": signed_failure.notification.home_domain,
                "updater": signed_failure.notification.updater.as_ethereum_address(),
                "signature": signed_failure.signature,
                "signer": signer.address()
            });

            let json = json!(vec!(signed_json)).to_string();

            let mut file = OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .open(find_vector("signedFailure.json"))
                .expect("Failed to open/create file");

            file.write_all(json.as_bytes())
                .expect("Failed to write to file");
        };

        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(t)
    }
}
