import { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { UnsafeBurnerWalletAdapter } from '@solana/wallet-adapter-wallets';
import { SnowflakeSafeWalletAdapter } from '@snowflake-so/wallet-adapter-snowflake';
import {
  WalletModalProvider,
  WalletDisconnectButton,
  WalletMultiButton
} from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import SwapApp from "./SwapApp"
import AdminApp from "./AdminApp"

require('@solana/wallet-adapter-react-ui/styles.css');

function App() {
  // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'.
  const network = process.env.REACT_APP_SOLANA_CLUSTER;

  // You can also provide a custom RPC endpoint.
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  const isAdminView = window.location.href.indexOf("/admin") >= 0;
  const wallets = useMemo(
    () => {
      const result = [
      /**
       * Wallets that implement either of these standards will be available automatically.
       *
       *   - Solana Mobile Stack Mobile Wallet Adapter Protocol
       *     (https://github.com/solana-mobile/mobile-wallet-adapter)
       *   - Solana Wallet Standard
       *     (https://github.com/solana-labs/wallet-standard)
       *
       * If you wish to support a wallet that supports neither of those standards,
       * instantiate its legacy wallet adapter here. Common legacy adapters can be found
       * in the npm package `@solana/wallet-adapter-wallets`.
       */
      new UnsafeBurnerWalletAdapter(),
      ];
      if (isAdminView) {
        result.push(
          new SnowflakeSafeWalletAdapter()
        )
      }
      return result;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [network, isAdminView]
  );
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletMultiButton />
          <WalletDisconnectButton />
          <div className="App">
            { isAdminView ? <AdminApp /> : <SwapApp /> }
          </div>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export default App;
