import { getTokenData } from "../src/util";

// fixme fetch markets from api

const markets = [
  // data from https://api-v2.pendle.finance/core/v1/1/markets/active
] as {
  address: string;
  pt: string;
  yt: string;
}[];

// generate sql for inserting pendle tokens into the database
async function main() {
  let sql = `
insert into "erc20"
	("address", "chain_id", "decimals", "info", "name", "symbol") 
values`;

  let first = true;
  for (const market of markets) {
    const marketAddress = market.address;
    const pt = market.pt.split("-")[1];
    const yt = market.yt.split("-")[1];

    const ptPromise = getTokenData(1, pt as `0x${string}`);
    const ytPromise = getTokenData(1, yt as `0x${string}`);

    const [ptData, ytData] = await Promise.all([ptPromise, ytPromise]);
    sql += `${first ? "" : ","}
    ('${ptData.address}', 1, ${ptData.decimals}, '{"swap":{"type":"pendle","market":"${marketAddress}"}}', '${ptData.name}', '${ptData.symbol}'),
    ('${ytData.address}', 1, ${ytData.decimals}, '{"swap":{"type":"pendle","market":"${marketAddress}"}}', '${ytData.name}', '${ytData.symbol}')`;
    first = false;
  }

  console.log(sql);
}

main().catch(console.error);
