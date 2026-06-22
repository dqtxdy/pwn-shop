import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntApp } from 'antd';
import { Connector, ConnectButton } from '@ant-design/web3';
import { MetaMask, WagmiWeb3ConfigProvider } from '@ant-design/web3-wagmi';
import { createConfig, http } from 'wagmi';
import { defineChain } from 'viem';
import { injected } from 'wagmi/connectors';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import '@cloudscape-design/global-styles/index.css';
import './styles.css';

const queryClient = new QueryClient();

const localhost = defineChain({
  id: 31337,
  name: 'Localhost',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: ['http://127.0.0.1:8545'] },
  },
});

const config = createConfig({
  chains: [localhost],
  connectors: [injected()],
  transports: {
    [localhost.id]: http(),
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary:       '#1d6f68',
            colorInfo:          '#2764c5',
            colorSuccess:       '#2a7a30',
            colorWarning:       '#b7791f',
            colorError:         '#c0392b',
            borderRadius:       10,
            borderRadiusSM:     6,
            borderRadiusLG:     14,
            colorBgContainer:   '#ffffff',
            colorBgLayout:      '#f4f7f6',
            colorBorder:        '#d8e2e0',
            colorBorderSecondary: '#e8eeec',
            colorTextSecondary: '#4a6260',
            colorTextTertiary:  '#6b807e',
            fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: 14,
          }
        }}
      >
        <AntApp>
          <WagmiWeb3ConfigProvider config={config} eip6963={{ autoAddInjectedWallets: true }} wallets={[MetaMask()]}>
            <App walletButton={
              <Connector>
                <ConnectButton />
              </Connector>
            } />
          </WagmiWeb3ConfigProvider>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
