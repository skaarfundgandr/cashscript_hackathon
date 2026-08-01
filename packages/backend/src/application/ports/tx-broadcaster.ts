export interface ITxBroadcaster {
  broadcast(rawTx: string): Promise<string>;
}
