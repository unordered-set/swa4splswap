import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, VersionedTransaction, TransactionMessage, Transaction } from "@solana/web3.js";
import { useState, useEffect, useCallback, useMemo } from "react";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Yes, via require: https://github.com/webpack/webpack/issues/12040
const { TokenSwap } = require("@solana/spl-token-swap")

function AdminApp() {
    const { connection } = useConnection();
    const { publicKey, sendTransaction, wallet } = useWallet();
    const adapter = useMemo(() => wallet?.adapter, [wallet]);

    const swapInfoPubkey = new PublicKey(process.env.REACT_APP_SWAP_INFO_PUBKEY)
    const exchangeProgramId = new PublicKey(process.env.REACT_APP_EXCHANGE_PROGRAM_ID)

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
        }
    }, [swapInfoPubkey.toBase58(), exchangeProgramId.toBase58(), publicKey?.toBase58(), connection?.rpcEndpoint])

    const [usdtToAddAmount, setUsdtToAddAmount] = useState("0.0")
    const addUsdtHandler = useCallback(async () => {
        const quoteMintPubkey = swapper.mintB;
        const depositorUsdtAccount = getAssociatedTokenAddressSync(quoteMintPubkey, publicKey, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        const depositorLPAccount = getAssociatedTokenAddressSync(swapper.poolToken, publicKey, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        const poolsSparkTokenAccount = getAssociatedTokenAddressSync(swapper.mintA, swapper.authority, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
        const poolsQuoteTokenAccount = getAssociatedTokenAddressSync(quoteMintPubkey, swapper.authority, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);

        const ix = TokenSwap.depositSingleTokenTypeExactAmountInInstruction(
            swapInfoPubkey, swapper.authority, publicKey,
            depositorUsdtAccount, poolsSparkTokenAccount, poolsQuoteTokenAccount,
            swapper.poolToken, depositorLPAccount, quoteMintPubkey,
            exchangeProgramId, TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID,
            Math.floor(usdtToAddAmount * 1000000), 0
        );

        const {
            context: { slot: minContextSlot },
            value: { blockhash, lastValidBlockHeight }
        } = await connection.getLatestBlockhashAndContext();
        // const messageV0 = new TransactionMessage({
        //     payerKey: publicKey,
        //     recentBlockhash: blockhash,
        //     instructions: [ix],
        // }).compileToV0Message();

        // const transactionV0 = new VersionedTransaction(messageV0);
        const tx = new Transaction()
        tx.blockhash = blockhash;
        tx.feePayer = publicKey;
        tx.add(ix)

        await sendTransaction(
            tx,
            null,
            {
                name: `Add ${usdtToAddAmount} USDT to exchange`
            }
        )
        // const signature = await sendTransaction(transactionV0, connection, { minContextSlot });
        //await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature });
    }, [swapper, usdtToAddAmount, publicKey, connection])

    return (<>
        <h1>Hello, Admin!</h1>
        <p>Swapper is {swapper ? "ready" : "not ready"}</p>
        <h2>Add USDT to exchange</h2>
        <p>
            <input type="text" value={usdtToAddAmount} onChange={e => setUsdtToAddAmount(e.target.value)} />
            <button disabled={!swapper} onClick={addUsdtHandler}>OK</button>
        </p>
    </>
    )
}

export default AdminApp