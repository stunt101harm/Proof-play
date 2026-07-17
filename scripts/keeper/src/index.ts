import { PRODUCT } from "@proof-play/domain";
import { CONDITION_COMPILER_VERSION } from "@proof-play/condition-engine";
import { getTxlineNetworkConfig } from "@proof-play/txline";

const txline = getTxlineNetworkConfig("devnet");

console.log(
  `${PRODUCT.name} keeper scaffold ready (compiler v${CONDITION_COMPILER_VERSION}, ${txline.apiOrigin}).`,
);
