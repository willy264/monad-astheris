#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p lib
install_dep() {
  local name="$1" url="$2" tag="$3" commit="$4"
  if [[ ! -d "lib/$name" ]]; then
    git clone --depth 1 --branch "$tag" "$url" "lib/$name"
  fi
  if [[ "$(git -C "lib/$name" rev-parse HEAD)" != "$commit" ]]; then
    echo "Unexpected dependency revision: $name" >&2
    exit 1
  fi
}
install_dep openzeppelin-contracts https://github.com/OpenZeppelin/openzeppelin-contracts.git v5.4.0 c64a1edb67b6e3f4a15cca8909c9482ad33a02b0
install_dep forge-std https://github.com/foundry-rs/forge-std.git v1.9.7 77041d2ce690e692d6e03cc812b57d1ddaa4d505
