const express = require("express");
const app = express();
const { client } = require("./utils/Covalent/covalent");
const { config } = require("dotenv");
const cors = require("cors");
config();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://farmix-web3bytes.vercel.app",
      "https://main.d1mk2y9g4ss2pn.amplifyapp.com",
    ],
    methods: ["POST", "GET", "HEAD", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

app.use(express.json());
const PORT = process.env.PORT || 8081;

let similarityScores = {};

const getUserAddressFromFID = async (fid) => {
  const query = `query MyQuery {
    Socials(
      input: {filter: {dappName: {_eq: farcaster}, userId: {_eq: "${fid}"}}, blockchain: ethereum}
    ) {
      Social {
        profileName
        connectedAddresses {
          address
        }
      }
    }
  }`;
  const response = await fetch("https://api.airstack.xyz/gql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.AIRSTACK_API_KEY,
    },
    body: JSON.stringify({ query }),
  });

  const { data } = await response.json();
  if (
    data.Socials &&
    data.Socials.Social.length > 0 &&
    data.Socials.Social[0].connectedAddresses.length > 0
  ) {
    return data.Socials.Social[0].connectedAddresses[0].address;
  }
  return null;
};

// Calculate similarity between two arrays of objects as a percentage and collect common elements.
const calculateObjectArraySimilarity = (array1, array2, key) => {
    if (!array1.length || !array2.length) return { similarity: 0, common: [] }; // Return 0 if either array is empty

    const map1 = new Map(array1.map((item) => [item[key], item]));
    const map2 = new Map(array2.map((item) => [item[key], item]));

    const commonKeys = [...map1.keys()].filter((key) => map2.has(key));
    const common = commonKeys.map((key) => map1.get(key));

    return {
        similarity:
            (commonKeys.length / Math.max(array1.length, array2.length)) * 100,
        common: common,
    };
};

const getUserAddressFromFCUsername = async (username) => {
  const query = `query {
    Socials(input: { filter: { dappName: { _eq: farcaster }, profileName: { _eq: "${username}" } }, blockchain: ethereum }) {
      Social {
        connectedAddresses {
          address
          blockchain
          chainId
          timestamp
        }
      }
    }
  }`;

  const response = await fetch("https://api.airstack.xyz/gql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.AIRSTACK_API_KEY,
    },
    body: JSON.stringify({ query }),
  });

  const { data } = await response.json();
  if (
    data.Socials &&
    data.Socials.Social.length > 0 &&
    data.Socials.Social[0].connectedAddresses.length > 0
  ) {
    return data.Socials.Social[0].connectedAddresses[0].address;
  }
  return null;
};

const getChannelFollowingsForAddress = async (address) => {
    const query = `query MyQuery {
        FarcasterChannelParticipants(
        input: {filter: {channelActions: {_eq: follow}, participant: {_in: ["${address}"]}}, blockchain: ALL}
        ) 
            {
                FarcasterChannelParticipant {
                channelId
                channelName
                channel {
                    imageUrl
                }
            }
        }
    }`;

    const response = await fetch("https://api.airstack.xyz/gql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: process.env.AIRSTACK_API_KEY,
        },
        body: JSON.stringify({ query }),
    });

    const { data } = await response.json();
    return data.FarcasterChannelParticipants.FarcasterChannelParticipant || [];
}

const getUserFollowingsForAddress = async (address) => {
  const query = `query {
    Farcaster: SocialFollowings(input: { filter: { identity: { _in: ["${address}"] }, dappName: { _eq: farcaster } }, blockchain: ALL }) {
      Following {
        followingAddress {
          socials(input: { filter: { dappName: { _eq: farcaster } } }) {
            profileName
            dappName
          }
        }
      }
    }
  }`;

  const response = await fetch("https://api.airstack.xyz/gql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.AIRSTACK_API_KEY,
    },
    body: JSON.stringify({ query }),
  });

  const { data } = await response.json();
  return data.Farcaster.Following || [];
};

const getAllNFTsForAddress = async (address, client) => {
  const resp = await client.NftService.getNftsForAddress(
    "base-mainnet",
    address,
    { withUncached: true }
  );
  return resp.data?.items || [];
};

const getAllTokensForAddress = async (address, client) => {
  const resp = await client.BalanceService.getTokenBalancesForWalletAddress(
    "base-mainnet",
    address
  );
  return resp.data?.items || [];
};

const calculateArraySimilarity = (array1, array2) => {
  if (!array1.length || !array2.length) return { similarity: 0, common: [] };
  const set1 = new Set(array1);
  const set2 = new Set(array2);
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const intersectionArray = Array.from(intersection);
  return {
    similarity:
      (intersectionArray.length / Math.max(set1.size, set2.size)) * 100,
    common: intersectionArray,
  };
};

const calculateSimilarity = async (fid, secondaryUsername) => {
  if (similarityScores[fid] !== undefined) {
    similarityScores[fid] = null;
    console.log(`Similarity score set to null for fid: ${fid}`);
  }

  const primaryAddressPromise = getUserAddressFromFID(fid);
  const secondaryAddressPromise =
    getUserAddressFromFCUsername(secondaryUsername);

  const [primaryAddress, secondaryAddress] = await Promise.all([
    primaryAddressPromise,
    secondaryAddressPromise,
  ]);

  console.log(primaryAddress, secondaryAddress);

  if (!primaryAddress || !secondaryAddress) {
    console.error("One or both usernames did not resolve to addresses.");
    return 0;
  }

  const primaryDataPromises = [
    getAllNFTsForAddress(primaryAddress, client),
    getAllTokensForAddress(primaryAddress, client),
    getUserFollowingsForAddress(primaryAddress),
    getChannelFollowingsForAddress(primaryAddress)
  ];

  const secondaryDataPromises = [
    getAllNFTsForAddress(secondaryAddress, client),
    getAllTokensForAddress(secondaryAddress, client),
    getUserFollowingsForAddress(secondaryAddress),
    getChannelFollowingsForAddress(secondaryAddress)
  ];

  const [
    [primaryNftData, primaryTokenData, primaryFollowingData, primaryChannelFollowingData],
    [secondaryNftData, secondaryTokenData, secondaryFollowingData, secondaryChannelFollowingData],
  ] = await Promise.all([
    Promise.all(primaryDataPromises),
    Promise.all(secondaryDataPromises),
  ]);

  const primaryNfts = primaryNftData
    .map((item) => item.nft_data?.[0]?.external_data?.image)
    .filter((image) => image);
  const secondaryNfts = secondaryNftData
    .map((item) => item.nft_data?.[0]?.external_data?.image)
    .filter((image) => image);

  const primaryTokens = primaryTokenData.map(
    (item) => item.contract_ticker_symbol
  );
  const secondaryTokens = secondaryTokenData.map(
    (item) => item.contract_ticker_symbol
  );

  const primaryFollowings = primaryFollowingData
    .map((following) => {
      if ("followingAddress" in following && following.followingAddress) {
        return following.followingAddress.socials[0]?.profileName;
      }
      return null;
    })
    .filter((name) => name);
  const secondaryFollowings = secondaryFollowingData
    .map((following) => {
      if ("followingAddress" in following && following.followingAddress) {
        return following.followingAddress.socials[0]?.profileName;
      }
      return null;
    })
    .filter((name) => name);

  const nftSimilarityResult = calculateArraySimilarity(
    primaryNfts,
    secondaryNfts
  );
  console.log(`NFT similarity: ${nftSimilarityResult.similarity}`);

  const tokenSimilarityResult = calculateArraySimilarity(
    primaryTokens,
    secondaryTokens
  );
  console.log(`Token similarity: ${tokenSimilarityResult.similarity}`);

  const followingSimilarityResult = calculateArraySimilarity(
    primaryFollowings,
    secondaryFollowings
  );
  console.log(`Following similarity: ${followingSimilarityResult.similarity}`);

  const channelSimilarityResult = calculateObjectArraySimilarity(
    primaryChannelFollowingData, 
    secondaryChannelFollowingData, 
    "channelId"
);

  const similarities = [
    nftSimilarityResult.similarity,
    tokenSimilarityResult.similarity,
    followingSimilarityResult.similarity,
    channelSimilarityResult.similarity
  ];

  const similarityScore =
    similarities.reduce((a, b) => a + b, 0) / similarities.length;

  console.log(`Similarity score: ${similarityScore}`);

  similarityScores[fid] = similarityScore;

  return similarityScore;
};

const getSimilarityScore = async (fid) => {
  return similarityScores[fid] !== undefined ? similarityScores[fid] : null;
};

app.post("/calculateSimilarity", async (req, res) => {
  try {
    const { fid, secondaryUsername } = req.body;

    console.log(fid, secondaryUsername);

    const response = await calculateSimilarity(fid, secondaryUsername);

    console.log(response);
    return res.status(200).json(response);
  } catch (err) {
    console.log(err);
  }
});

app.post("/getSimilarityScore", async (req, res) => {
  try {
    const { fid } = req.body;

    const similarityScore =
      similarityScores[fid] !== undefined ? similarityScores[fid] : null;
    return res.status(200).json(similarityScore);
  } catch (err) {
    console.log(err);
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
