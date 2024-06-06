import { FC } from 'react';

// import { Metadata, TokenStandard } from "@metaplex-foundation/mpl-token-metadata";
// import { AccountLayout, MintLayout, NATIVE_MINT, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, createCloseAccountInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'
// import { BaseSpl } from "./base/baseSpl";
// import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
// import { bundle } from "jito-ts";
// import { Liquidity, LiquidityPoolInfo, Percent, Token, TokenAmount } from "@raydium-io/raydium-sdk";
import BN from 'bn.js';
import fs from 'fs';

import { web3 } from '@project-serum/anchor';

import { BaseRay } from './base/baseRay';
// import { BaseMpl } from "./base/baseMpl";
import { Result } from './base/types';
import {
  ENV,
  RPC_ENDPOINT_DEV,
  RPC_ENDPOINT_MAIN,
} from './constants';
import { CreatePoolInput } from './types';
import {
  getKeypairFromEnv,
  sleep,
} from './utils';

// import { bull_dozer } from "./jito_bundle/send-bundle";
const log = console.log;



type CreatePoolInput = {
    marketId: web3.PublicKey,
    baseMintAmount: number,
    quoteMintAmount: number,
    url: 'mainnet' | 'devnet',
}

export const CreatePool: FC = () => {

    async function createPool(input: CreatePoolInput): Promise<Result<{ poolId: string, txSignature: string, baseAmount: BN, quoteAmount: BN, baseDecimals: number, quoteDecimals: number }, string>> {
        // let { baseMintAmount, quoteMintAmount, marketId } = input
        const { baseMintAmount, quoteMintAmount, marketId } = input

        const keypair = getKeypairFromEnv();
        const connection = new web3.Connection(input.url == 'mainnet' ? RPC_ENDPOINT_MAIN : RPC_ENDPOINT_DEV, { commitment: "confirmed", confirmTransactionInitialTimeout: 60000 })
        const baseRay = new BaseRay({ rpcEndpointUrl: connection.rpcEndpoint })
        const marketState = await baseRay.getMarketInfo(marketId).catch((getMarketInfoError) => { log({ getMarketInfoError }); return null })
        // log({marketState})
        if (!marketState) {
            return { Err: "market not found" }
        }
        const { baseMint, quoteMint } = marketState
        log({
            baseToken: baseMint.toBase58(),
            quoteToken: quoteMint.toBase58(),
        })
        const txInfo = await baseRay.createPool({ baseMint, quoteMint, marketId, baseMintAmount, quoteMintAmount }, keypair.publicKey).catch((innerCreatePoolError) => { log({ innerCreatePoolError }); return null })
        if (!txInfo) return { Err: "Failed to prepare create pool transaction" }
        // speedup
        const updateCuIx = web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: ENV.COMPUTE_UNIT_PRICE })
        const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const txMsg = new web3.TransactionMessage({
            instructions: [updateCuIx, ...txInfo.ixs],
            payerKey: keypair.publicKey,
            recentBlockhash,
        }).compileToV0Message()
        const tx = new web3.VersionedTransaction(txMsg)
        tx.sign([keypair, ...txInfo.signers])
        const rawTx = tx.serialize()
        console.log("PoolId: ", txInfo.poolId.toBase58())
        console.log("SENDING CREATE POOL TX")
        const simRes = (await connection.simulateTransaction(tx)).value
        fs.writeFileSync('./poolCreateTxSim.json', JSON.stringify(simRes))
        const txSignature = (await web3.sendAndConfirmRawTransaction(connection, Buffer.from(rawTx), { commitment: 'confirmed' })
            .catch(async () => {
                await sleep(500)
                return await web3.sendAndConfirmRawTransaction(connection, Buffer.from(rawTx), { commitment: 'confirmed' })
                    .catch((createPoolAndBuyTxFail) => {
                        log({ createPoolAndBuyTxFail })
                        return null
                    })
            }))
        console.log("CONFIRMED CREATE POOL TX")
        if (!txSignature) log("Tx failed")
        // const txSignature = await connection.sendTransaction(tx).catch((error) => { log({ createPoolTxError: error }); return null });
        if (!txSignature) {
            return { Err: "Failed to send transaction" }
        }
        return {
            Ok: {
                poolId: txInfo.poolId.toBase58(),
                txSignature,
                baseAmount: txInfo.baseAmount,
                quoteAmount: txInfo.quoteAmount,
                baseDecimals: txInfo.baseDecimals,
                quoteDecimals: txInfo.quoteDecimals,
            }
        }
    }
    
    return(
        <div>Create Pool</div>
    )
}