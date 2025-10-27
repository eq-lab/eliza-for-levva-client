import {
  erc20Abi,
  encodeFunctionData,
  keccak256,
  PublicClient,
  encodeAbiParameters,
  fromHex,
  toHex,
  formatUnits,
} from "viem";
import type { CalldataWithDescription } from "../../types/tx";

export async function getAllowance({
  sender,
  spender,
  symbol,
  token,
  amount,
  client,
  decimals,
}: {
  amount: bigint;
  client: PublicClient;
  decimals: number;
  sender: `0x${string}`;
  spender: `0x${string}`;
  symbol: string;
  token: `0x${string}`;
}): Promise<{ allowance: bigint; approve?: CalldataWithDescription }> {
  const allowance = await client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [sender, spender],
  });

  if (allowance < amount) {
    const call: CalldataWithDescription = {
      to: token,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, amount],
      }),
      title: `Approve ${formatUnits(amount, decimals)} ${symbol}`,
      description: `Approve spending ${formatUnits(amount, decimals)} ${symbol} to ${spender}`,
    };

    return { approve: call, allowance };
  }

  return { allowance };
}

/**
 * Get the storage slot for a given ERC20 token approval
 * @param client - The PublicClient instance
 * @param erc20Address - The address of the ERC20 token
 * @param ownerAddress - The address of the owner, used to find the approval slot
 * @param spenderAddress - The address of the spender, used to find the approval slot
 * @param maxSlots - The maximum number of slots to search
 * @returns The slot for the approval
 *
 * - This uses a brute force approach similar to the balance slot search. See the balance slot search comment for more details.
 */
export const getErc20ApprovalStorageSlot = async (
  allowance: bigint,
  client: PublicClient,
  erc20Address: `0x${string}`,
  ownerAddress: `0x${string}`,
  spenderAddress: `0x${string}`,
  maxSlots: number,
  // we are just going to assume the slot is at the slot which is most common for erc20 tokens. for approvals, this is slot #10
  fallbackSlot: bigint | undefined = BigInt(10)
): Promise<{
  slot: string;
  storageSlot: `0x${string}`;
  slotHash: `0x${string}`;
  isVyper: boolean;
}> => {
  // Get the approval for the spender, that we can use to find the slot

  if (allowance > BigInt(0)) {
    for (let i = BigInt(0); i < BigInt(maxSlots); i++) {
      const { storageSlot, slotHash } = calculateApprovalSolidityStorageSlot(
        ownerAddress,
        spenderAddress,
        i
      );

      // Get the value at the storage slot
      const storageValue = await client.getStorageAt({
        address: erc20Address,
        slot: storageSlot,
      });

      // If the value at the storage slot is equal to the approval, return the slot as we have found the correct slot for approvals
      if (fromHex(storageValue, "bigint") === allowance) {
        return {
          slot: i.toString(),
          slotHash: slotHash,
          storageSlot: storageSlot,
          isVyper: false,
        };
      }

      const { vyperStorageSlot, vyperSlotHash } =
        calculateApprovalVyperStorageSlot(ownerAddress, spenderAddress, i);

      const vyperStorageValue = await client.getStorageAt({
        address: erc20Address,
        slot: vyperStorageSlot,
      });

      if (fromHex(vyperStorageValue, "bigint") === allowance) {
        return {
          slot: toHex(i),
          storageSlot: vyperStorageSlot,
          slotHash: vyperSlotHash,
          isVyper: true,
        };
      }
    }

    if (typeof fallbackSlot === "undefined") {
      throw new Error("Approval does not exist");
    }
  }

  if (typeof fallbackSlot !== "undefined") {
    // check solidity, then check vyper.
    // (dont have an easy way to check if a contract is solidity/vyper)
    const { storageSlot, slotHash } = calculateApprovalSolidityStorageSlot(
      ownerAddress,
      spenderAddress,
      fallbackSlot
    );
    // Get the value at the storage slot
    const storageValue = await client.getStorageAt({
      address: erc20Address,
      slot: storageSlot,
    });
    // If the value at the storage slot is equal to the approval, return the slot as we have found the correct slot for approvals
    if (fromHex(storageValue, "bigint") === allowance) {
      return {
        slot: toHex(fallbackSlot),
        slotHash: slotHash,
        storageSlot: storageSlot,
        isVyper: false,
      };
    }

    // check vyper
    const { vyperStorageSlot, vyperSlotHash } =
      calculateApprovalVyperStorageSlot(
        ownerAddress,
        spenderAddress,
        fallbackSlot
      );
    const vyperStorageValue = await client.getStorageAt({
      address: erc20Address,
      slot: vyperStorageSlot,
    });
    if (fromHex(vyperStorageValue, "bigint") === allowance) {
      return {
        slot: toHex(fallbackSlot),
        slotHash: vyperSlotHash,
        storageSlot: vyperStorageSlot,
        isVyper: true,
      };
    }
  }

  throw new Error("Unable to find approval slot");
};

// Generates approval solidity storage slot data
const calculateApprovalSolidityStorageSlot = (
  sender: `0x${string}`,
  spender: `0x${string}`,
  slotNumber: bigint
) => {
  // Calculate the slot hash, using the owner address and the slot index
  const slotHash = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [sender, slotNumber]
    )
  );
  // Calculate the storage slot, using the spender address and the slot hash
  const storageSlot = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }],
      [spender, slotHash]
    )
  );

  return { storageSlot, slotHash };
};

// Generates approval vyper storage slot data
const calculateApprovalVyperStorageSlot = (
  sender: `0x${string}`,
  spender: `0x${string}`,
  slotNumber: bigint
) => {
  // create via vyper storage layout, which uses keccak256(abi.encode(slot, address(this))) instead of keccak256(abi.encode(address(this), slot))
  const vyperSlotHash = keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }],
      [slotNumber, sender]
    )
  );

  const vyperStorageSlot = keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }],
      [vyperSlotHash, spender]
    )
  );

  return { vyperStorageSlot, vyperSlotHash };
};
