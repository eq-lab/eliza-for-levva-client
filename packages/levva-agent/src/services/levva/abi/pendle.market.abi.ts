export default [
  {
    inputs: [],
    name: "readTokens",
    outputs: [
      {
        internalType: "contract IStandardizedYield",
        name: "_SY",
        type: "address",
      },
      {
        internalType: "contract IPPrincipalToken",
        name: "_PT",
        type: "address",
      },
      {
        internalType: "contract IPYieldToken",
        name: "_YT",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
