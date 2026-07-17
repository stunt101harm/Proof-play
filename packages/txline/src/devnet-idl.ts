export const TXLINE_DEVNET_IDL = {
  address: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
  metadata: {
    name: "txoracle",
    version: "1.5.6",
    spec: "0.1.0",
    description: "TxODDS TxLINE Data system (minimal subscription IDL)",
  },
  instructions: [
    {
      name: "subscribe",
      discriminator: [254, 28, 191, 138, 156, 179, 183, 53],
      accounts: [
        { name: "user", writable: true, signer: true },
        { name: "pricing_matrix" },
        { name: "token_mint" },
        { name: "user_token_account", writable: true },
        { name: "token_treasury_vault", writable: true },
        { name: "token_treasury_pda" },
        { name: "token_program" },
        { name: "system_program" },
        { name: "associated_token_program" },
      ],
      args: [
        { name: "service_level_id", type: "u16" },
        { name: "weeks", type: "u8" },
      ],
    },
  ],
  accounts: [
    {
      name: "PricingMatrix",
      discriminator: [173, 13, 64, 22, 248, 77, 110, 106],
    },
  ],
  types: [
    {
      name: "PricingMatrix",
      type: {
        kind: "struct",
        fields: [
          { name: "admin", type: "pubkey" },
          { name: "rows", type: { vec: { defined: { name: "ServiceRow" } } } },
        ],
      },
    },
    {
      name: "ServiceRow",
      type: {
        kind: "struct",
        fields: [
          { name: "row_id", type: "u16" },
          { name: "price_per_week_token", type: "u64" },
          { name: "sampling_interval_sec", type: "u32" },
          { name: "league_bundle_id", type: "i16" },
          { name: "market_bundle_id", type: "i16" },
        ],
      },
    },
  ],
} as const;
