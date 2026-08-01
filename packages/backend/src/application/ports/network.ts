export interface INetwork {
  getUtxos(address: string): Promise<Array<{ txid: string; vout: number; satoshis: bigint }>>;
  getBlockHeight(): Promise<number>;
}
