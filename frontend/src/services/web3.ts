declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

export function isMetaMaskInstalled(): boolean {
  return typeof window.ethereum !== 'undefined' && !!window.ethereum.isMetaMask;
}

export async function connectWallet(): Promise<string> {
  if (!window.ethereum) {
    throw new Error('MetaMask not installed');
  }
  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[];
  return accounts[0];
}

export async function signMessage(message: string): Promise<string> {
  if (!window.ethereum) {
    throw new Error('MetaMask not installed');
  }
  // Lazy load ethers (~330KB) — only when wallet signing is needed
  const { BrowserProvider } = await import('ethers');
  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return signer.signMessage(message);
}
