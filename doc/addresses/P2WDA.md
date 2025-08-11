# Pay-to-Witness-Data-Authentication (P2WDA)

## Executive Summary

Bitcoin makes arbitrary authenticated data inclusion expensive unless you exploit the SegWit witness discount, where
every witness byte weighs 1 unit instead of 4. P2WDA is a spend template that deliberately carries authenticated
application data in witness stack items and then drops them before a standard signature check. This preserves standard
Bitcoin validation while letting applications verify the attached data out-of-band.

In this implementation, the witness stack reserves **10 data slots** per P2WDA input, each **≤80 bytes** to respect
default relay policy. The data (after compression) is prefixed by a **BIP340 Schnorr** signature over
`(tx_signature || uncompressed_data)`, then split across those slots. Applications reassemble and verify the signed
data, making any miner tampering detectable. On-chain validation remains standard and cheap thanks to the witness
discount.

## 1. Problem Space

### 1.1 The Traditional Dilemma

OP_RETURN is simple but tiny: **80 bytes max** per output under standard policy. Anything larger forces many outputs and
multiple transactions, compounding base (non-witness) bytes that weigh 4× witness bytes. For realistic payloads (
airdrops, rich metadata), this is cost-prohibitive.

Importantly, even if OP_RETURN size limits were completely removed, it would not solve the fundamental economic problem.
OP_RETURN data is stored in the transaction's output section, which means every byte counts as non-witness data and
incurs the full 4× weight penalty. A hypothetical uncapped OP_RETURN storing 800 bytes would cost 3,200 weight units,
while P2WDA achieves the same data storage for only 800 weight units in the witness section. The economic disadvantage
of OP_RETURN is architectural, not merely a policy limitation.

Commit-reveal styles fix integrity but double touches the chain (commit tx, reveal tx) and fragment UX.

### 1.2 The Witness Discount Opportunity

SegWit introduced **weight**: non-witness bytes weigh 4 units each; witness bytes weigh **1**. Fees are proportional to
weight (vbytes ≈ weight/4). Packing authenticated data into witness can be ~75% cheaper than encoding the same data in
base tx bytes.

## 2. Technical Architecture

### 2.1 Spend Template

P2WDA uses a **P2WSH** spend whose script pre-drops a fixed number of stack items (the data slots), then performs a
standard single-sig check.

The witness script consists of:

- 5 consecutive `OP_2DROP` operations (dropping 10 items total)
- A 33-byte compressed public key
- An `OP_CHECKSIG` operation

This creates a script of approximately 40 bytes that validates like any standard single-signature P2WSH spend, but with
space for our data payload in the witness stack.

### 2.2 Authentication & Packing

The authentication and packing process ensures data integrity while maximizing compression efficiency. Here's how it
works:

**Step 1: Prepare the data**

- Start with your uncompressed payload data (application bytes)
- Get the transaction signature (the DER signature that authorizes spending this input)

**Step 2: Create authentication signature**

- Compute a BIP340 Schnorr signature over the hash of (transaction_signature || payload_data)
- This signature proves authorship and binds the data to this specific spend

**Step 3: Combine and compress**

```ts
// Combine the authentication signature with the payload
const combined_bytes = data_signature + payload_data;

// Compress everything using DEFLATE or similar
const compressed_bytes = COMPRESS(combined_bytes);

// Split into chunks of max 80 bytes each
const chunks = SPLIT_INTO_80_BYTE_CHUNKS(compressed_bytes);

// Ensure we don't exceed 10 chunks
if (chunks.length > 10) {
    throw Error("Payload too large")
}
```

**Step 4: Build the witness stack**
The witness stack must contain exactly 12 items in this order:

1. Data slot 0 (up to 80 bytes, or empty)
2. Data slot 1 (up to 80 bytes, or empty)
3. ... through Data slot 9
4. Transaction signature (DER encoded, ~72 bytes)
5. Witness script (~40 bytes)

Any unused data slots are filled with empty byte arrays (length 0) to maintain the expected stack structure.

**Verification Process for Indexers:**

When an indexer encounters a P2WDA spend, it:

1. Extracts and concatenates the first 10 witness items
2. Decompresses the result to get (data_signature || original_data)
3. Verifies the Schnorr signature against hash(tx_signature || original_data)
4. If valid, passes the original_data to the application layer

This design ensures that while Bitcoin consensus never inspects the data, any tampering is cryptographically detectable
by applications.

### 2.3 Input Placement Rules

To simplify parsing and minimize duplication:

* **All application data must be injected in the first P2WDA input by index** (the lowest-index input spending a P2WDA
  UTXO)
* Any **additional P2WDA inputs** in the same tx must supply **10 empty data items** (length=0) in their witness
* Non-P2WDA inputs are unaffected
* If a transaction flagged as `InteractionTransactionP2WDA` spends **no** P2WDA UTXOs, **throw an error**

## 3. Economics

### 3.1 OP_RETURN Baseline

Standard OP_RETURN script is ≤83 bytes total, allowing ≤80 bytes data. All bytes are non-witness, costing **1 vbyte per
byte**. For 80 bytes of data you typically consume ~91 vbytes including script overhead and output framing.

### 3.2 P2WDA Spend

The witness bytes calculation for a P2WDA input includes:

- 1 byte for item count
- 10 bytes for length prefixes (one per data slot)
- The actual compressed data bytes
- ~73 bytes for the transaction signature (including length prefix)
- ~41 bytes for the witness script (including length prefix)

Since all of this is witness data, it costs only 1/4 the weight of equivalent non-witness bytes.

**Example with 512 bytes of incompressible data:**

- Data + signature = 576 bytes total
- Split across 8 slots (72 bytes each)
- Total witness bytes ≈ 701
- Cost in vbytes ≈ 175

Compare to OP_RETURN which would need 7 outputs at ~91 vbytes each ≈ 637 vbytes.
**Result: ~72% savings** while keeping everything in a single transaction.

## 4. Security Model

The security model separates on-chain authorization from off-chain data authentication:

* **On-chain authorization**: The transaction signature proves spend authorization exactly like any P2WSH single-sig
  spend
* **Off-chain authorship**: The Schnorr signature authenticates the data and binds it to this spend via the transaction
  signature
* **Malleability handling**: SegWit allows witness data modification without changing the txid. The Schnorr signature
  ensures any tampering is detectable

Practical outcomes:

- Funds cannot be redirected (protected by transaction signature)
- Data forgery is detectable at the application layer (Schnorr signature fails)
- Miners could theoretically replace data with garbage, but applications will reject it

## 5. Operational Capabilities

P2WDA works well for:

* Mints
* Airdrops
* NFTs
* Batch updates and state checkpoints
* Governance votes and attestations
* Swap listings (like nativeswap) but **NOT TRADES**, a miner could cancel your transaction!
* etc.

The 10 slots serve as a transport layer; keep application formats versioned and compact.

## 6. Advanced Considerations

### 6.1 Why 10 Slots of ≤80 Bytes?

Default relay policy limits:

- Maximum 100 stack items for P2WSH
- Maximum 80 bytes per non-script witness item
- Maximum 3600 bytes for the witness script itself

Ten slots provides headroom while keeping scripts simple (5 * OP_2DROP). You can scale by using multiple P2WDA inputs,
keeping data only in the first P2WDA input and zeros in the rest.

### 6.2 Domain Separation (Recommended)

To harden against cross-protocol attacks, consider using domain separation:

```
message = Hash("P2WDA/v1" || txid || input_index || tx_signature || data)
data_signature = Schnorr.Sign(auth_private_key, message)
```

This prevents signatures from being reused across different protocols or transactions.

### 6.3 Compression

Use a standard compression algorithm like DEFLATE to maximize data packing efficiency. Ensure your application layer
can handle decompression and verify the integrity of the decompressed data.

### 6.4 Why SegWit Instead of Taproot?

A common question is why P2WDA uses SegWit's P2WSH instead of the newer Taproot technology. This decision is deliberate
and based on fundamental economics of block space usage. Understanding this choice illuminates the elegant design of
P2WDA.

#### The Block Space Reality

When people first hear about P2WDA, they might assume it should use Taproot since it's Bitcoin's newest upgrade.
However, Taproot would actually consume more block space for our use case, making it less efficient. This
counterintuitive reality stems from how these technologies were designed for different purposes.

Taproot offers two spending paths. The key path is remarkably efficient, requiring only a 64-byte Schnorr signature, but
it cannot carry arbitrary data. To include data, you must use the script path, which requires a control block containing
the internal public key, parity information, and Merkle proof of your script's inclusion in the taproot tree. Even with
the simplest possible tree structure, this control block adds approximately 65 bytes of pure overhead.

Let's examine the concrete numbers for storing 500 bytes of authenticated data:

With P2WSH (what P2WDA uses), the witness contains the transaction signature (~72 bytes), your data (500 bytes), and the
witness script (~40 bytes), totaling approximately 612 bytes, which equals 612 weight units.

With Taproot's script path, you would need a Schnorr signature (64 bytes), your data (500 bytes), the tapscript (~40
bytes), and the control block (~65 bytes), totaling approximately 669 bytes, which equals 669 weight units.

This represents about 10% more block space consumption for identical functionality. When your goal is cost-efficient
data storage, every byte matters, and this overhead directly translates to higher fees for users.

### 6.4 Future Extensions

- Use annexes (BIP490) to carry larger payloads if needed and stop requiring another signature in the witness stack
- Explore multi-signature variants for collaborative data signing
