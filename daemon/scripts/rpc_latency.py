"""Measure a real RPC endpoint; reporting a budget does not assert a chain block time."""
import argparse
import concurrent.futures
import json
import os
import statistics
import time
import urllib.request


def sample(rpc: str, index: int) -> float:
    request = urllib.request.Request(
        rpc,
        json.dumps({"jsonrpc": "2.0", "id": index, "method": "eth_blockNumber", "params": []}).encode(),
        {"Content-Type": "application/json"},
    )
    start = time.perf_counter()
    with urllib.request.urlopen(request, timeout=15) as response:
        body = json.load(response)
    if "error" in body or not isinstance(body.get("result"), str):
        raise RuntimeError(f"invalid JSON-RPC response: {body}")
    int(body["result"], 16)
    return (time.perf_counter() - start) * 1000


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rpc", default=os.getenv("MONAD_RPC_URL"))
    parser.add_argument("--samples", type=int, default=20)
    parser.add_argument("--concurrency", type=int, default=2)
    parser.add_argument("--budget-ms", type=float, default=300.0)
    args = parser.parse_args()
    if not args.rpc or not 1 <= args.samples <= 500 or not 1 <= args.concurrency <= 16:
        parser.error("set --rpc/MONAD_RPC_URL, samples 1..500 and concurrency 1..16")
    latencies, failures = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        for future in concurrent.futures.as_completed([pool.submit(sample, args.rpc, i) for i in range(args.samples)]):
            try:
                latencies.append(future.result())
            except Exception as error:
                # Provider URLs can contain credentials; report categories, not URLs/bodies.
                failures.append(type(error).__name__)
    ordered = sorted(latencies)
    print(json.dumps({
        "samples": args.samples, "successes": len(ordered), "failures": len(failures),
        "p50Ms": round(statistics.median(ordered), 2) if ordered else None,
        "p95Ms": round(ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))], 2) if ordered else None,
        "budgetMs": args.budget_ms,
        "withinBudget": sum(value <= args.budget_ms for value in ordered),
        "errors": failures[:3],
    }, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
