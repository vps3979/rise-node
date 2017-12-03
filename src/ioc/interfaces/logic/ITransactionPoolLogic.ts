import { IBaseTransaction } from '../../../logic/transactions';
import { InnerTXQueue } from '../../../logic';

export interface ITransactionPoolLogic {
  readonly unconfirmed: InnerTXQueue;
  readonly bundled: InnerTXQueue;
  readonly queued: InnerTXQueue;
  readonly multisignature: InnerTXQueue;

  /**
   * Queue a transaction or throws an error if it couldnt
   */
  queueTransaction(tx: IBaseTransaction<any>, bundled: boolean): void;

  fillPool(): Promise<void>;

  transactionInPool(txID: string): boolean;

  /**
   * Gets unconfirmed, multisig and queued txs based on limit and reverse opts
   * FIXME Parameters are not taken into account!
   */
  getMergedTransactionList(reverse: boolean, limit: number): Array<IBaseTransaction<any>>;

  expireTransactions(): string[];

  /**
   * Picks bundled transactions, verifies them and then enqueue them
   */
  processBundled(): Promise<void>;

  /**
   * Cycles through the transactions and calls processNewTransaction.
   * It will fail at the first not valid tx
   * @param {Array<IBaseTransaction<any>>} txs
   * @param {boolean} broadcast
   * @param {boolean} bundled
   */
  receiveTransactions(txs: Array<IBaseTransaction<any>>,
                      broadcast: boolean, bundled: boolean): Promise<void>;

  /**
   * process a new incoming transaction. It may reject in case  the tx is not valid.
   */
  processNewTransaction(tx: IBaseTransaction<any>, broadcast: boolean, bundled: boolean): Promise<void>;

  /**
   * Calls processVerifyTransaction for each transaction and applies
   * unconfirmed transaction.
   */
  // tslint:disable-next-line
  applyUnconfirmedList(txs?: Array<IBaseTransaction<any> | string>): Promise<void>;

  undoUnconfirmedList(): Promise<string[]>;

}
