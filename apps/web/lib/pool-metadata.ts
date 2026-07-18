export type PoolUrlMetadata = {
  fixtureId: string;
  canonicalJson: string;
  title: string;
  description?: string;
  transactionSignature?: string;
};

export function poolHref(poolAddress: string, metadata: PoolUrlMetadata) {
  const query = new URLSearchParams({
    fixture: metadata.fixtureId,
    condition: metadata.canonicalJson,
    title: metadata.title,
  });
  if (metadata.description) query.set("description", metadata.description);
  if (metadata.transactionSignature) {
    query.set("tx", metadata.transactionSignature);
  }
  return `/pools/${poolAddress}?${query.toString()}`;
}
