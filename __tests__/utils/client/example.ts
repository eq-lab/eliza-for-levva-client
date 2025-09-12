import { randomUUID } from "crypto";

import { AgentClient } from "./client";
import { SocketIOManager } from "./socket";

SocketIOManager.config = {
  baseUrl: "http://localhost:30001",
};

const client = AgentClient.create({
  baseUrl: "http://localhost:30001",
});

const socket = SocketIOManager.getInstance();

const SECRET =
  "0x6edf00f6b2e3984835a36d12ef94b11014cd98378fc1c32d7caf5bb3614751ae1362b375d8d46175e8e953a8867142bdd8d804d7439e6a1416cba5e19821fe9b12ca053e02ae94c09cf25668ba58eaefd0cd44d9a72b5c04ee3899e9c598ffc163d3adec539fab900a8001651f212723358697521349010c094405c0300386c2c15c5a9a9976924258d0a8c5f5cf0eb031c2c32a7089b5189d35c64c89056719007069026df3bb58271a56f91df2e6a72f9f8177e96213b6088acf46ae2ef8e0d8e321c94a14717ab2a6dccccb44e199c574497eefdccb0025f08bc735022efa0590f8be4eff6b8794dc655adffe41f1f701461dd44e091bc3d83e58ecc40d9a18260240abb8c2d35400089bb228be653ee5eb85842451f09a9488388d5a55d4e6dbd61b3b67765fe306fad94569f7e338c707c45b80457ed15ec15bc46b37e173c71e0e80144ac9ede6db665063444eaf6f3837ed7421e517a0dc19dcc4b88508cf648ea7ad984930682f0116a02b52c02136cddf71cc971334f228c36b7b665b1722a4e8768b862cc96f26b115e2b613f54efa3456660967ebf138083c8678f13c695b36e18aae9bcc6524a68286a0b591ae5a562cfb97e958ef3fdfadafba74de182d6df5e117a7d8ae33da81ddd56f92866b30cd72fb0df553d9e48c045504d0ec60c9d11dc8356aa879976163943c26b27aaa66c1e3bbcb38cabfb59c27"; // your secret here
const ADDRESS = "0x40b88b09610487A26b18FB52DBe319D1268fCa22"; // your address here

async function startListening() {
  const user = await client.levva.getUserId({
    secret: SECRET,
    address: ADDRESS,
  });

  if (!user?.id) {
    throw new Error("user not created");
  }

  const agents = await client.agents.listAgents();
  const agent = agents.agents?.[0];

  if (!agent) {
    throw new Error("agent not found");
  }

  const channel = await client.messaging.getOrCreateDmChannel({
    // @ts-expect-error type mismatch, expected what's above
    currentUserId: user.id,
    targetUserId: agent.id,
  });

  const broadcast = socket.evtMessageBroadcast.attach((data) => {
    console.log("message received", data);
  });

  const complete = socket.evtMessageComplete.attach((data) => {
    console.log("agent has finished action plan", data);
  });

  const unsub = () => {
    broadcast.detach();
    complete.detach();
  };

  socket.initialize(user.id);
  socket.joinChannel(channel.id);

  const initialMessages = await client.messaging.getChannelMessages(channel.id);

  // used to clear the conversation context
  const clearChannel = () => client.messaging.clearChannelHistory(channel.id);

  const sendMessage = (message: string, metadata?: Record<string, unknown>) => {
    return socket.sendMessage(
      message.trim(),
      channel.id,
      channel.messageServerId,
      "client_chat",
      undefined,
      randomUUID(),
      {
        ...metadata,
        channelType: "DM",
        isDm: true,
        targetUserId: agent.id,
        userAddressId: user.id,
        chainId: 1, // for ethereum mainnet
      }
    );
  };

  return {
    initialMessages,
    clearChannel,
    unsub,
    sendMessage,
  };
}

startListening()
  .then(({ initialMessages, sendMessage }) => {
    console.log("messages in channel", initialMessages.messages);
    sendMessage("I want to swap 100 USDC for ETH");
  })
  .catch(console.error);
