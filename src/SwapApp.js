import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js';

// Yes, via require: https://github.com/webpack/webpack/issues/12040
const { TokenSwap } = require("@solana/spl-token-swap")


function useSplTokenBalance(token) {
    const { connection } = useConnection();
    const { publicKey } = useWallet();

    const [balance, setBalance] = useState()

    useEffect(() => {
        if (connection && publicKey && token) {
            const usersTokenAccount = getAssociatedTokenAddressSync(token, publicKey, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
            connection.getAccountInfo(usersTokenAccount)
            connection.getTokenAccountBalance(usersTokenAccount).then(
                result => setBalance(result.value.uiAmountString),
                error => {
                    if (error.code === -32602) {
                        setBalance(0)
                    }
                }
            )
        }
    }, [publicKey ? publicKey.toBase58() : null, token?.toBase58(), connection.rpcEndpoint])

    return balance
}

function useSwapIxArrBuilder(swapper, sparksToSwap) {
    const { publicKey: userPubkey } = useWallet();
    if (!swapper || !sparksToSwap || !userPubkey)
        return null;

    const quoteMintPubkey = swapper.mintB;
    const sparkMintPubkey = swapper.mintA;

    const usersAccountForQuote = getAssociatedTokenAddressSync(quoteMintPubkey, userPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const ix1 = createAssociatedTokenAccountIdempotentInstruction(
        userPubkey,
        usersAccountForQuote,
        userPubkey,
        quoteMintPubkey,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const usersAccountForSpark = getAssociatedTokenAddressSync(sparkMintPubkey, userPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const ix2 = createAssociatedTokenAccountIdempotentInstruction(
        userPubkey,
        usersAccountForSpark,
        userPubkey,
        sparkMintPubkey,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const poolsQuoteTokenAccount = getAssociatedTokenAddressSync(quoteMintPubkey, swapper.authority, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const poolsSparkTokenAccount = getAssociatedTokenAddressSync(sparkMintPubkey, swapper.authority, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const path = [usersAccountForSpark, poolsSparkTokenAccount, poolsQuoteTokenAccount, usersAccountForQuote];
    const mints = [sparkMintPubkey, quoteMintPubkey];

    const ixSwap = TokenSwap.swapInstruction(
        swapper.tokenSwap,
        swapper.authority,
        userPubkey,
        ...path,
        swapper.poolToken,
        swapper.feeAccount,
        null,
        ...mints,
        swapper.swapProgramId,
        TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        swapper.poolTokenProgramId,
        Math.floor(parseFloat(sparksToSwap) * 1000000000),
        0n
    );

    return [ix1, ix2, ixSwap]
}

function parseBalance(acc, div) {
    const raw = Buffer.from(...acc.data)
    console.log(raw)

    // TODO: parse using spl structs.
    const balance = raw.readBigUInt64LE(64)
    return parseInt(balance.toString()) / div
}

function useSwapSimulationResults(swapper, sparkBalanceIn, ixs) {
    const { connection } = useConnection();
    const { publicKey: userPubkey } = useWallet();
    const [simulationResults, setSimulationResults] = useState();

    useEffect(() => {
        if (swapper && connection && ixs) {
            let active = true
            load()
            return () => { active = false }

            async function load() {
                const quoteMintPubkey = swapper.mintB;
                const sparkMintPubkey = swapper.mintA;

                const usersAccountForQuote = getAssociatedTokenAddressSync(quoteMintPubkey, userPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
                const usersAccountForSpark = getAssociatedTokenAddressSync(sparkMintPubkey, userPubkey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

                const blockhash = await connection.getLatestBlockhash();
                const messageV0 = new TransactionMessage({
                    payerKey: userPubkey,
                    recentBlockhash: blockhash.blockhash,
                    instructions: ixs,
                }).compileToV0Message();

                const transactionV0 = new VersionedTransaction(messageV0);
                const result = await connection.simulateTransaction(transactionV0,
                    {
                        accounts: {
                            addresses: [usersAccountForQuote, usersAccountForSpark],
                            encoding: "base64"
                        }
                    })
                if (!active) { return }
                console.log("Got simulation", result)
                if (result.value.err) {
                    setSimulationResults({ ok: false })
                } else {
                    setSimulationResults({
                        ok: true,
                        newBalances: [
                            // TODO: get rid of hardcoded values
                            parseBalance(result.value.accounts[0], 1000000),
                            parseBalance(result.value.accounts[1], 1000000000)
                        ]
                    })
                }
            }
        }
    }, [connection?.rpcEndpoint, !!swapper, sparkBalanceIn, userPubkey?.toBase58()])

    console.log("Simulation ready")
    console.log(simulationResults)
    return simulationResults
}


function SwapApp() {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();

    const swapInfoPubkey = new PublicKey(process.env.REACT_APP_SWAP_INFO_PUBKEY)
    const exchangeProgramId = new PublicKey(process.env.REACT_APP_EXCHANGE_PROGRAM_ID)

    const [usdtMint, setUsdtMint] = useState();
    const [sparkMint, setSparkMint] = useState();
    const [swapper, setSwapper] = useState();
    useEffect(() => {
        let active = true
        load()
        return () => { active = false }

        async function load() {
            const res = await TokenSwap.loadTokenSwap(
                connection,
                swapInfoPubkey,
                exchangeProgramId,
                publicKey
            )
            if (!active) { return }
            setSwapper(res)
            setUsdtMint(res.mintB);
            setSparkMint(res.mintA);
        }
    }, [swapInfoPubkey.toBase58(), exchangeProgramId.toBase58(), publicKey?.toBase58(), connection?.rpcEndpoint])

    const usdtBalance = useSplTokenBalance(usdtMint)
    const sparkBalance = useSplTokenBalance(sparkMint)

    const [sparkBalanceIn, setSparkBalanceIn] = useState("0.0")

    const swapIxArr = useSwapIxArrBuilder(swapper, sparkBalanceIn)
    const swapSimulationResults = useSwapSimulationResults(swapper, sparkBalanceIn, swapIxArr)

    const swapButtonCallback = useCallback(async () => {
        const {
            context: { slot: minContextSlot },
            value: { blockhash, lastValidBlockHeight }
        } = await connection.getLatestBlockhashAndContext();
        console.log("Compiling...", publicKey.toBase58(), blockhash, swapIxArr)
        const messageV0 = new TransactionMessage({
            payerKey: publicKey,
            recentBlockhash: blockhash,
            instructions: swapIxArr,
        }).compileToV0Message();

        const transactionV0 = new VersionedTransaction(messageV0);
        const signature = await sendTransaction(transactionV0, connection, { minContextSlot });
        await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature });
        // setTxResult...
    }, [publicKey, sendTransaction, connection, swapIxArr]);

    return (
        <div>
            {!publicKey ? "Please, connect your Solana Wallet first" :
                <>
                    <p>Your USDT balance: {usdtBalance === null ? "..." : usdtBalance}</p>
                    <p>Your SPARK balance: {sparkBalance === null ? "..." : sparkBalance}</p>
                    {!swapper ? "Preparing..." :
                        <p>
                            <label>SPARKS to exchange: <input type="text" value={sparkBalanceIn} onChange={e => setSparkBalanceIn(e.target.value)}></input></label>
                            <button disabled={!swapIxArr || !swapSimulationResults?.ok}
                                title={swapIxArr ? "Click to sign the tx" : "Something went wrong preparing the transaction"}
                                onClick={swapButtonCallback}
                            > : : S W A P : :</button>
                            <p>Simulation results:
                                {swapSimulationResults && !swapSimulationResults.ok && "Error"}
                                {swapSimulationResults && swapSimulationResults.ok && `Success: usdt balance after swap ${swapSimulationResults.newBalances[0]}, spark balance after swap ${swapSimulationResults.newBalances[1]}`}
                            </p>
                        </p>
                    }
                </>
            }
        </div>
    )
}

export default SwapApp;