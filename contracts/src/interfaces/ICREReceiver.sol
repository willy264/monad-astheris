// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @notice Chainlink CRE's IReceiver ABI. Interface name does not affect its ERC-165 identifier.
/// @dev Matches smartcontractkit/chainlink-evm contracts/cre/src/v1/interfaces/IReceiver.sol.
interface ICREReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
