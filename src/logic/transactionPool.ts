import { inject, injectable, postConstruct } from 'inversify';
import { Bus, constants, ILogger, TransactionType } from '../helpers/';
import { IJobsQueue } from '../ioc/interfaces/helpers';
import { IAppState, ITransactionLogic, ITransactionPoolLogic } from '../ioc/interfaces/logic/';
import { IAccountsModule, ITransactionsModule } from '../ioc/interfaces/modules';
import { Symbols } from '../ioc/symbols';
import { AppConfig } from '../types/genericTypes';
import { IBaseTransaction } from './transactions/';

// tslint:disable-next-line

export class InnerTXQueue<T = { receivedAt: Date }> {
  private transactions: Array<IBaseTransaction<any>> = [];
  private index: { [k: string]: number }             = {};
  private payload: { [k: string]: T }                = {};

  public has(id: string) {
    return id in this.index;
  }

  public get count() {
    return Object.keys(this.index).length;
  }

  public remove(id: string) {
    if (this.has(id)) {
      const index = this.index[id];
      delete this.index[id];
      delete this.transactions[index];
      delete this.payload[id];
    }
  }

  public add(tx: IBaseTransaction<any>, payload?: T) {
    if (!this.has(tx.id)) {
      this.transactions.push(tx);
      this.index[tx.id]   = this.transactions.indexOf(tx);
      this.payload[tx.id] = payload;
    }
  }

  public get(txID: string): IBaseTransaction<any> {
    if (!this.has(txID)) {
      throw new Error(`Transaction not found in this queue ${txID}`);
    }
    return this.transactions[this.index[txID]];
  }

  public reindex() {
    this.transactions = this.transactions
      .filter((tx) => typeof(tx) !== 'undefined');

    this.index = {};
    this.transactions.forEach((tx, idx) => this.index[tx.id] = idx);
  }

  public list(reverse: boolean, limit?: number,
              filterFn?: (tx: IBaseTransaction<any>) => boolean): Array<IBaseTransaction<any>> {
    let res = this.transactions
      .filter((tx) => typeof(tx) !== 'undefined');

    if (typeof(filterFn) === 'function') {
      res = res.filter(filterFn);
    }

    if (reverse) {
      res = res.reverse();
    }
    if (limit) {
      res.splice(limit);
    }
    return res;
  }

  // tslint:disable-next-line
  public listWithPayload(reverse: boolean, limit?: number, filterFn?: (tx: IBaseTransaction<any>) => boolean): Array<{ tx: IBaseTransaction<any>, payload: T }> {
    const txs   = this.list(reverse, limit, filterFn);
    const toRet = [];
    for (const tx of txs) {
      toRet.push({ tx, payload: this.payload[tx.id] });
    }
    return toRet;
  }

}

@injectable()
export class TransactionPool implements ITransactionPoolLogic {

  public unconfirmed    = new InnerTXQueue();
  public bundled        = new InnerTXQueue();
  public queued         = new InnerTXQueue();
  public multisignature = new InnerTXQueue();

  // generic
  @inject(Symbols.generic.appConfig)
  private config: AppConfig;

  // Helpers
  @inject(Symbols.helpers.bus)
  private bus: Bus;
  @inject(Symbols.helpers.jobsQueue)
  private jobsQueue: IJobsQueue;
  @inject(Symbols.helpers.logger)
  private logger: ILogger;

  // Logic
  @inject(Symbols.logic.appState)
  private appState: IAppState;
  @inject(Symbols.logic.transaction)
  private transactionLogic: ITransactionLogic;

  @inject(Symbols.modules.accounts)
  private accountsModule: IAccountsModule;

  private expiryInterval    = 30000;
  private bundledInterval: number;
  private bundleLimit: number;
  private processed: number = 0;

  @postConstruct()
  public afterConstruction() {
    this.bundledInterval = this.config.broadcasts.broadcastInterval;
    this.bundleLimit     = this.config.broadcasts.releaseLimit;
    this.jobsQueue.register(
      'transactionPoolNextBundle',
      () => this.processBundled(),
      this.bundledInterval
    );
    this.jobsQueue.register(
      'transactionPoolNextExpiry',
      () => Promise.resolve(this.expireTransactions()),
      this.expiryInterval
    );
  }

  /**
   * Queue a transaction or throws an error if it couldnt
   */
  public queueTransaction(tx: IBaseTransaction<any>, bundled: boolean): void {
    const payload = { receivedAt: new Date() };

    let queue: InnerTXQueue;
    if (bundled) {
      queue = this.bundled;
    } else if (tx.type === TransactionType.MULTI || Array.isArray(tx.signatures)) {
      queue = this.multisignature;
    } else {
      queue = this.queued;
    }

    if (queue.count >= this.config.transactions.maxTxsPerQueue) {
      throw new Error('Transaction pool is full');
    } else {
      queue.add(tx, payload);
    }
  }

  public async fillPool(): Promise<Array<IBaseTransaction<any>>> {
    if (this.appState.get('loader.isSyncing')) {
      return Promise.resolve([]);
    }

    const unconfirmedCount = this.unconfirmed.count;
    this.logger.debug(`Transaction pool size: ${unconfirmedCount}`);

    const spare = constants.maxTxsPerBlock - unconfirmedCount;
    if (spare <= 0) {
      return Promise.resolve([]);
    }

    const multignatures = this.multisignature.listWithPayload(
      true,
      5,
      // tslint:disable-next-line
      (tx) => (tx as any)['ready']);

    const inQueue = this.queued.listWithPayload(true, Math.max(0, spare - multignatures.length));

    const txsAndPayloads = multignatures.concat(inQueue);
    txsAndPayloads.forEach(({tx, payload}) => {
      // Remove the tx from either multisig or queued
      this.multisignature.remove(tx.id);
      this.queued.remove(tx.id);

      // Add to unconfirmed.
      this.unconfirmed.add(tx, payload);
    });

    return txsAndPayloads.map(({tx}) => tx);
  }

  public transactionInPool(txID: string) {
    return this.allQueues
      .map((queue) => queue.has(txID))
      .filter((isInQueue) => isInQueue)
      .length > 0;
  }

  /**
   * Gets unconfirmed, multisig and queued txs based on limit and reverse opts
   */
  public getMergedTransactionList(limit: number) {
    const minLimit = (constants.maxTxsPerBlock + 2);

    if (limit <= minLimit || limit > constants.maxSharedTxs) {
      limit = minLimit;
    }

    const unconfirmed = this.unconfirmed.list(false, constants.maxTxsPerBlock);
    limit -= unconfirmed.length;

    const multisignatures = this.multisignature.list(false, constants.maxTxsPerBlock, ((t) => (t as any).ready));
    limit -= multisignatures.length;

    const queued = this.queued.list(false, limit);
    limit -= queued.length;

    return unconfirmed.concat(multisignatures).concat(queued);
  }

  public expireTransactions(): string[] {
    const unconfirmed    = this.unconfirmed.listWithPayload(true);
    const queued         = this.queued.listWithPayload(true);
    const multisignature = this.multisignature.listWithPayload(true);

    const all = unconfirmed.concat(queued).concat(multisignature);

    const ids: string[] = [];
    for (const txP of all) {
      const { tx, payload } = txP;
      if (!tx) {
        continue;
      }
      const now     = Math.floor(Date.now() / 1000);
      const timeOut = this.txTimeout(tx);
      const seconds = now - Math.floor(payload.receivedAt.getTime() / 1000);
      if (seconds > timeOut) {
        ids.push(tx.id);
        this.removeUnconfirmedTransaction(tx.id);
        this.logger.info(`Expired transaction: ${tx.id} received at: ${payload.receivedAt.toUTCString()}`);
      }
    }
    return ids;
  }

  /**
   * Picks bundled transactions, verifies them and then enqueue them
   */
  public async processBundled() {
    const bundledTxs = this.bundled.list(true, this.bundleLimit);
    for (const tx of bundledTxs) {
      if (!tx) {
        continue;
      }
      this.bundled.remove(tx.id);
      try {
        await this.processVerifyTransaction(
          tx,
          true
        );
        try {
          this.queueTransaction(tx, true);
        } catch (e) {
          this.logger.debug(`Failed to queue bundled transaction: ${tx.id}`, e);
        }
      } catch (e) {
        this.logger.debug(`Failed to process / verify bundled transaction: ${tx.id}`, e);
        this.removeUnconfirmedTransaction(tx.id);
      }
    }
  }

  /**
   * Cycles through the transactions and calls processNewTransaction.
   * It will fail at the first not valid tx
   * @param {Array<IBaseTransaction<any>>} txs
   * @param {boolean} broadcast
   * @param {boolean} bundled
   */
  public async receiveTransactions(txs: Array<IBaseTransaction<any>>,
                                   broadcast: boolean, bundled: boolean): Promise<void> {
    for (const tx of txs) {
      await this.processNewTransaction(tx, broadcast, bundled);
    }
  }

  /**
   * process a new incoming transaction. It may reject in case  the tx is not valid.
   */
  public async processNewTransaction(tx: IBaseTransaction<any>, broadcast: boolean, bundled: boolean): Promise<void> {
    if (this.transactionInPool(tx.id)) {
      return Promise.reject(`Transaction is already processed: ${tx.id}`);
    }
    this.processed++;
    if (this.processed > 1000) {
      // Reindex queues.
      this.reindexAllQueues();
      this.processed = 1; // TODO: Maybe one day use a different counter to keep stats clean
    }

    if (bundled) {
      return this.queueTransaction(tx, bundled);
    }

    await this.processVerifyTransaction(tx, broadcast);
    // IF i'm here it means verify went through and did not throw.
    // So lets enqueue the transaction!
    this.queueTransaction(tx, bundled);

  }

  /**
   * Calls processVerifyTransaction for each transaction and applies
   * unconfirmed transaction.
   */
  // tslint:disable-next-line
  public async applyUnconfirmedList(txs: Array<IBaseTransaction<any> | string>, txModule: ITransactionsModule): Promise<void> {
    for (let theTx of txs) {
      if (!theTx) {
        continue; // move on the next item.
      }
      if (typeof(theTx) === 'string') {
        theTx = this.unconfirmed.get(theTx);
      }

      try {
        const sender = await this.processVerifyTransaction(
          theTx,
          false
        );
        try {
          await txModule.applyUnconfirmed(
            theTx,
            sender);
        } catch (e) {
          this.logger.error(`Failed to apply unconfirmed transaction ${theTx.id}`, e);
          this.removeUnconfirmedTransaction(theTx.id);
        }
      } catch (e) {
        this.logger.error(`Failed to process / verify unconfirmed transaction: ${theTx.id}`, e);
        this.removeUnconfirmedTransaction(theTx.id);
      }
    }
  }

  public async undoUnconfirmedList(txModule: ITransactionsModule): Promise<string[]> {
    const ids: string[] = [];
    const txs           = this.unconfirmed.list(false);
    for (const tx of txs) {
      if (!tx) {
        continue;
      }
      ids.push(tx.id);
      await txModule.undoUnconfirmed(tx)
        .catch((err) => {
          if (err) {
            this.logger.error(`Failed to undo unconfirmed transaction: ${tx.id}`, err);
            this.removeUnconfirmedTransaction(tx.id);
          }
        });
    }
    return ids;
  }

  /**
   * Calls reindex to each queue to clean memory
   */
  private reindexAllQueues() {
    this.allQueues
      .forEach((queue) => queue.reindex());
  }

  private get allQueues(): InnerTXQueue[] {
    return [this.unconfirmed, this.bundled, this.queued, this.multisignature];
  }

  private removeUnconfirmedTransaction(txID: string) {
    this.unconfirmed.remove(txID);
    this.queued.remove(txID);
    this.multisignature.remove(txID);
  }

  /**
   * Gets sender account verifies if its multisignature and eventually gets requester
   * process transaction and verifies it.
   */
  private async processVerifyTransaction(transaction: IBaseTransaction<any>, broadcast: boolean) {
    if (!transaction) {
      throw new Error('Missing transaction');
    }

    const sender = await this.accountsModule.setAccountAndGet({ publicKey: transaction.senderPublicKey });

    const isMultisigAccount = Array.isArray(sender.multisignatures) && sender.multisignatures.length > 0;
    if (isMultisigAccount) {
      // TODO: fixme please
      (transaction as any).signatures = (transaction as any).signatures || [];
    }
    let requester = null;
    if (sender && transaction.requesterPublicKey && isMultisigAccount) {
      // Fetch the requester
      requester = await this.accountsModule.getAccount({ publicKey: transaction.requesterPublicKey });
    }

    // Process the transaction!
    await this.transactionLogic.process(transaction, sender, requester);

    // Normalize tx.
    const normalizedTx = this.transactionLogic.objectNormalize(transaction);

    // Verify the transaction
    // TODO: check why here we've to cast to any
    await this.transactionLogic.verify(normalizedTx as any, sender, requester, null);

    await this.bus.message('unconfirmedTransaction', normalizedTx, broadcast);
    return sender;
  }

  /**
   * Returns a tx expiration timeout in seconds
   * @returns {number}
   */
  private txTimeout(tx: IBaseTransaction<any>): number {
    if (tx.type === TransactionType.MULTI) {
      return tx.asset.multisignature.lifetime * 3600;
    } else if (Array.isArray(tx.signatures)) {
      return constants.unconfirmedTransactionTimeOut * 8;
    } else {
      return constants.unconfirmedTransactionTimeOut;
    }
  }

}
