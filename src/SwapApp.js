import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useEffect, useState } from 'react';
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';


function useSplTokenBalance(token) {
    const { connection } = useConnection();
    const { publicKey } = useWallet();

    const [balance, setBalance] = useState()

    useEffect(() => {
        if (connection && publicKey) {
            const usersTokenAccount = getAssociatedTokenAddressSync(token, publicKey, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
            console.log("Getting data for token", token.toBase58(), "ATA", usersTokenAccount.toBase58())
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
    }, [publicKey ? publicKey.toBase58() : null, connection.rpcEndpoint])

    return balance
}


function SwapApp() {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();

    const usdtMint = new PublicKey(process.env.REACT_APP_QUOTE_MINT_PUBKEY)
    const sparkMint = new PublicKey(process.env.REACT_APP_SPARK_MINT_PUBKEY)

    const usdtBalance = useSplTokenBalance(usdtMint)
    const sparkBalance = useSplTokenBalance(sparkMint)

    return (
        <div>
            {(!publicKey) ? "Please, connect your Solana Wallet first" :
                <>
                    Your USDT balance: {usdtBalance === null ? "..." : usdtBalance},
                    Your SPARK balance: {sparkBalance === null ? "..." : sparkBalance}
                </>
            }
        </div>
    )
}

export default SwapApp;