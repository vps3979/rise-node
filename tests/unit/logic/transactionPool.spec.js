var chai             = require('chai');
var expect           = chai.expect;
var sinon            = require('sinon');
var rewire           = require('rewire');
var path = require("path");

var rootDir = path.join(__dirname, "../../..");

var TransactionPoolModule  = rewire(path.join(rootDir, 'src/logic/transactionPool.ts'));
var TransactionPool = TransactionPoolModule.TransactionPool;
var InnerTXQueue = TransactionPoolModule.InnerTXQueue;

var transactionTypes = require(path.join(rootDir, 'src/helpers/transactionTypes')).TransactionType;
var jobsQueue        = require(path.join(rootDir, 'src/helpers/jobsQueue')).JobsQueue;
var constants        = require(path.join(rootDir, 'src/helpers/constants')).default;
const chaiAsPromised = require('chai-as-promised');

describe('logic/transactionPool', function () {
    var sandbox;
    var instance;
    var library;
    var modules;
    var jobsQueueStub;

    var logger;
    var broadcastInterval;
    var releaseLimit;
    var transaction;
    var bus;

    before(function() {
        sandbox = sinon.sandbox.create({
            injectInto: null,
            properties: ["spy", "stub", "clock"],
            useFakeTimers: true,
            useFakeServer: false
        });

        sandbox.stub(jobsQueue, "register");
    });

    beforeEach(function () {
        library = {
            bus : {
                message : sandbox.stub().resolves()
            },
            config : {
                broadcasts : {
                    broadcastInterval : 1,
                    releaseLimit : 2
                },
                transactions : {
                    maxTxsPerQueue : 500
                }
            },
            logger : {
                error: sandbox.stub(),
                info : sandbox.stub(),
                log  : sandbox.stub(),
                debug: sandbox.stub()

            },
            logic : {
                transaction : {
                    process : sandbox.stub(),
                    objectNormalize : sandbox.stub(),
                    verify : sandbox.stub(),
                }
            }
        };

        modules = {
            accounts : {
                setAccountAndGet : sandbox.stub(),
                getAccount : sandbox.stub()
            },
            transactions : {
                getUnconfirmedTransactionList : sandbox.stub(),
                getQueuedTransactionList : sandbox.stub(),
                applyUnconfirmed : sandbox.stub(),
                undoUnconfirmed : sandbox.stub()
            },
            loader : {
                isSyncing : false
            }
        };

        instance = new TransactionPool(
            library.logic.transaction,
            library.bus,
            library.logger,
            library.config
        );

        instance.bind(
            modules.accounts,
            modules.transactions,
            modules.loader
        );
    });

    afterEach(function () {
        sandbox.reset();
    });

    after(function() {
        sandbox.restore();
    });

    describe('constructor', function () {
        it('should be a function', function () {
            expect(TransactionPool).to.be.a('function');
        });

        it('should be an instance of TransactionPool', function () {
            expect(instance).to.be.an.instanceof(TransactionPool);
        });

        it('should initialize library properly', function () {
            expect(instance.library.logger).to.equal(library.logger);
            expect(instance.library.bus).to.equal(library.bus);
            expect(instance.library.logic.transaction).to.equal(library.logic.transaction);
            expect(instance.library.config).to.equal(library.config);
        });

        it('should initialize some local properties', function () {
            expect(instance.unconfirmed).to.be.an.instanceOf(InnerTXQueue);
            expect(instance.bundled).to.be.an.instanceOf(InnerTXQueue);
            expect(instance.queued).to.be.an.instanceOf(InnerTXQueue);
            expect(instance.multisignature).to.be.an.instanceOf(InnerTXQueue);

            expect(instance.expiryInterval).to.equal(30000);
            expect(instance.bundledInterval).to.equal(library.config.broadcasts.broadcastInterval);
            expect(instance.bundleLimit).to.equal(library.config.broadcasts.releaseLimit);
            expect(instance.processed).to.equal(0);
        });

        it("jobsQueue.register called", function() {
            expect(jobsQueue.register.calledTwice).to.be.true;
            expect(jobsQueue.register.firstCall.args.length).to.equal(3);
            expect(jobsQueue.register.firstCall.args[0]).to.equal("transactionPoolNextBundle");
            expect(jobsQueue.register.firstCall.args[1]).to.be.a("function");
            expect(jobsQueue.register.firstCall.args[2]).to.equal(instance.bundledInterval);

            expect(jobsQueue.register.secondCall.args[0]).to.equal("transactionPoolNextExpiry");
            expect(jobsQueue.register.secondCall.args[1]).to.be.a("function");
            expect(jobsQueue.register.secondCall.args[2]).to.equal(instance.expiryInterval);
        });
    });

    describe('bind()', function () {
        it('should initialize modules properly', function () {
            expect(instance.modules.accounts).to.equal(modules.accounts);
            expect(instance.modules.transactions).to.equal(modules.transactions);
            expect(instance.modules.loader).to.equal(modules.loader);
        });
    });


    describe('queueTransaction()', function () {
        var tx;
        var bundled;

        beforeEach(function () {
            tx = {
                type : transactionTypes.MULTI,
                signatures : [1,2]
            };
            bundled = false;

            sandbox.stub(instance.bundled, "add");
            sandbox.stub(instance.multisignature, "add");
            sandbox.stub(instance.queued, "add");
        });

        it("bundled; error", function() {
            bundled = true;
            instance.bundled.index = new Array(library.config.transactions.maxTxsPerQueue + 1).fill(0);
            expect(() => instance.queueTransaction(tx, bundled)).to.throw('Transaction pool is full');
        });

        it("bundled; add called", function() {
            bundled = true;
            instance.bundled.index = new Array(library.config.transactions.maxTxsPerQueue - 1).fill(0);
            expect(() => instance.queueTransaction(tx, bundled)).to.not.throw('Transaction pool is full');

            expect(instance.bundled.add.calledOnce).to.be.true;
            expect(instance.bundled.add.firstCall.args.length).to.equal(2);
            expect(instance.bundled.add.firstCall.args[0]).to.equal(tx);
            expect(instance.bundled.add.firstCall.args[1]).to.be.an("Object");
            expect(instance.bundled.add.firstCall.args[1]).to.have.property("receivedAt");
            expect(instance.bundled.add.firstCall.args[1].receivedAt).to.be.instanceof(Date);
        });

        it("multisignature; by type; error", function() {
            tx.signatures = undefined;
            instance.multisignature.index = new Array(library.config.transactions.maxTxsPerQueue + 1).fill(0);
            expect(() => instance.queueTransaction(tx, bundled)).to.throw('Transaction pool is full');
        });

        it("multisignature; by type; add called", function() {
            tx.signatures = undefined;
            instance.multisignature.index = new Array(library.config.transactions.maxTxsPerQueue - 1).fill(0);
            expect(() => instance.queueTransaction(tx, bundled)).to.not.throw('Transaction pool is full');

            expect(instance.multisignature.add.calledOnce).to.be.true;
            expect(instance.multisignature.add.firstCall.args.length).to.equal(2);
            expect(instance.multisignature.add.firstCall.args[0]).to.equal(tx);
            expect(instance.multisignature.add.firstCall.args[1]).to.be.an("Object");
            expect(instance.multisignature.add.firstCall.args[1]).to.have.property("receivedAt");
            expect(instance.multisignature.add.firstCall.args[1].receivedAt).to.be.instanceof(Date);
        });

        it("multisignature; by signature; error", function() {
            tx.type = undefined;
            instance.multisignature.index = new Array(library.config.transactions.maxTxsPerQueue + 1).fill(0);
            expect(() => instance.queueTransaction(tx, bundled)).to.throw('Transaction pool is full');
        });

        it("multisignature; by signature; add called", function() {
            tx.type = undefined;
            instance.multisignature.index = new Array(library.config.transactions.maxTxsPerQueue - 1).fill(0);
            expect(() => instance.queueTransaction(tx, bundled)).to.not.throw('Transaction pool is full');

            expect(instance.multisignature.add.calledOnce).to.be.true;
            expect(instance.multisignature.add.firstCall.args.length).to.equal(2);
            expect(instance.multisignature.add.firstCall.args[0]).to.equal(tx);
            expect(instance.multisignature.add.firstCall.args[1]).to.be.an("Object");
            expect(instance.multisignature.add.firstCall.args[1]).to.have.property("receivedAt");
            expect(instance.multisignature.add.firstCall.args[1].receivedAt).to.be.instanceof(Date);
        });

        it("queued; error", function() {
            tx.type = undefined;
            tx.signatures = undefined;
            instance.queued.index = new Array(library.config.transactions.maxTxsPerQueue + 1).fill(0);
            expect(() => instance.queueTransaction(tx, bundled)).to.throw('Transaction pool is full');
        });

        it("queued; add called", function() {
            tx.type = undefined;
            tx.signatures = undefined;
            instance.queued.index = new Array(library.config.transactions.maxTxsPerQueue - 1).fill(0);
            expect(() => instance.queueTransaction(tx, bundled)).to.not.throw('Transaction pool is full');

            expect(instance.queued.add.calledOnce).to.be.true;
            expect(instance.queued.add.firstCall.args.length).to.equal(2);
            expect(instance.queued.add.firstCall.args[0]).to.equal(tx);
            expect(instance.queued.add.firstCall.args[1]).to.be.an("Object");
            expect(instance.queued.add.firstCall.args[1]).to.have.property("receivedAt");
            expect(instance.queued.add.firstCall.args[1].receivedAt).to.be.instanceof(Date);
        });
    });

    describe('fillPool()', function () {

        var addUnconfirmedList;

        beforeEach(function() {
            modules.loader.isSyncing = false;
            sandbox.stub(instance, "applyUnconfirmedList").resolves();
            sandbox.spy(instance.multisignature, "list");
            sandbox.spy(instance.queued, "list")
            sandbox.spy(instance.unconfirmed, "add");
        });

        it('should call modules.loader.syncing and not process any further (logger)', function() {
            modules.loader.isSyncing = true;

            var result = instance.fillPool();

            expect(result).to.be.instanceof(Promise);
            expect(library.logger.debug.called).to.be.false;
        });

        it('should call logger.debug', function() {
            var count = instance.unconfirmed.count;

            instance.fillPool();

            expect(library.logger.debug.calledOnce).to.be.true;
            expect(library.logger.debug.firstCall.args.length).to.equal(1);
            expect(library.logger.debug.firstCall.args[0]).to.equal(`Transaction pool size: ${count}`);
        });

        it('should do nothing if pool is already filled (unconfirmedcount == maxTxsPerBlock)', function() {
            instance.unconfirmed.index = new Array(constants.maxTxsPerBlock).fill(0);

            var result = instance.fillPool();

            expect(result).to.be.instanceof(Promise);
            expect(instance.multisignature.list.called).to.be.false;
        });

        it('should fill with multisignature', function() {
            instance.fillPool();

            expect(instance.multisignature.list.calledOnce).to.be.true;
            expect(instance.multisignature.list.firstCall.args.length).to.equal(3);
            expect(instance.multisignature.list.firstCall.args[0]).to.be.true;
            expect(instance.multisignature.list.firstCall.args[1]).to.equal(5);
            expect(instance.multisignature.list.firstCall.args[2]).to.be.a("function");
        });

        it('should fill with queued', function() {
            var unconfirmedCount = instance.unconfirmed.count;
            var spareCount = constants.maxTxsPerBlock - unconfirmedCount;
            var multisignatureCount = Math.min(5, instance.multisignature.count);

            var count = Math.max(0, spareCount - multisignatureCount);

            instance.fillPool();

            expect(instance.queued.list.calledOnce).to.be.true;
            expect(instance.queued.list.firstCall.args.length).to.equal(2);
            expect(instance.queued.list.firstCall.args[0]).to.be.true;
            expect(instance.queued.list.firstCall.args[1]).to.equal(count);
        });

        it('should enqueue returned txs to `unconfirmed` queue', function() {
            var unconfirmedCount = instance.unconfirmed.count;
            var spareCount = constants.maxTxsPerBlock - unconfirmedCount;
            var multisignatureCount = Math.min(5, instance.multisignature.count);
            var spareCount = Math.max(0, spareCount - multisignatureCount);
            var queuedCount = spareCount > instance.queued.count > spareCount ? spareCount : instance.queued.count;
            var txCount = multisignatureCount + queuedCount;

            instance.fillPool();

            expect(instance.unconfirmed.add.callCount).to.equal(txCount);
            expect(instance.unconfirmed.count).to.equal(unconfirmedCount + txCount);
        });

        it('should call applyUncofirmedList with new enqueued txs', function() {
            var multisignatures = instance.multisignature.list(true, 5);
            var txs = multisignatures.concat(instance.queued.list(true, 20));

            instance.fillPool();

            expect(instance.applyUnconfirmedList.calledOnce).to.be.true;
            expect(instance.applyUnconfirmedList.firstCall.args.length).to.equal(1);
            expect(instance.applyUnconfirmedList.firstCall.args[0]).to.deep.equal(txs);
        });
    });

    describe('transactionInPool()', function () {
        it('should call queue.has for the queues', () => {
            const stubs = instance.allQueues.map(queue => sinon.stub(queue, 'has').returns(false));

            instance.transactionInPool('1');

            expect(stubs.map(s => s.calledOnce)).to.be.deep.eq([true, true, true, true]);
            expect(stubs.map(s => s.firstCall.args[0])).to.be.deep.eq(['1', '1', '1', '1']);
        });

        it('should return true if one queue has it', () => {
            sinon.stub(instance.unconfirmed, 'has').returns(true);

            expect(instance.transactionInPool('1')).to.be.eq(true);
        });
        it('should return false if all does not have it', () => {
            instance.allQueues.map(queue => sinon.stub(queue, 'has').returns(false));

            expect(instance.transactionInPool('1')).to.be.eq(false);
        });
    });

    describe("getMergedTransactionList()", function() {
        var limit;
        var unconfirmed;
        var multisignatures;
        var queued;

        beforeEach(function() {
            limit = constants.maxSharedTxs;
            unconfirmed = [1,2,3];
            multisignatures = [4,5];
            queued = [6,7,8,9];

            sandbox.stub(instance.multisignature, "list");

            modules.transactions.getUnconfirmedTransactionList.returns(unconfirmed);
            instance.multisignature.list.returns(multisignatures);
            modules.transactions.getQueuedTransactionList.returns(queued);
        });

        it("getUnconfirmedTransactionList called", function() {
            var result = instance.getMergedTransactionList(false, limit);

            expect(modules.transactions.getUnconfirmedTransactionList.calledOnce).to.be.true;
            expect(modules.transactions.getUnconfirmedTransactionList.firstCall.args.length).to.equal(2);
            expect(modules.transactions.getUnconfirmedTransactionList.firstCall.args[0]).to.equal(false);
            expect(modules.transactions.getUnconfirmedTransactionList.firstCall.args[1]).to.equal(constants.maxTxsPerBlock);
        });

        it("instance.multisignature.list called", function() {
            var result = instance.getMergedTransactionList(false, limit);

            expect(instance.multisignature.list.calledOnce).to.be.true;
            expect(instance.multisignature.list.firstCall.args.length).to.equal(3);
            expect(instance.multisignature.list.firstCall.args[0]).to.equal(false);
            expect(instance.multisignature.list.firstCall.args[1]).to.equal(constants.maxTxsPerBlock);
            expect(instance.multisignature.list.firstCall.args[2]).to.be.a("function");
        });

        it("getQueuedTransactionList called", function() {
            var tempLimit = limit;
            var result = instance.getMergedTransactionList(false, limit);

            tempLimit -= unconfirmed.length;
            tempLimit -= multisignatures.length;

            expect(modules.transactions.getQueuedTransactionList.calledOnce).to.be.true;
            expect(modules.transactions.getQueuedTransactionList.firstCall.args.length).to.equal(2);
            expect(modules.transactions.getQueuedTransactionList.firstCall.args[0]).to.equal(false);
            expect(modules.transactions.getQueuedTransactionList.firstCall.args[1]).to.equal(tempLimit);
        });

        it("check result", function() {
            var result = instance.getMergedTransactionList(false, limit);
            expect(result).to.deep.equal(unconfirmed.concat(multisignatures).concat(queued));
        });
    });

    describe('expireTransactions()', function () {

        beforeEach(function() {
            sandbox.stub(instance.unconfirmed, "listWithPayload");
            sandbox.stub(instance.queued, "listWithPayload");
            sandbox.stub(instance.multisignature, "listWithPayload");
            sandbox.stub(instance, "txTimeout");
            sandbox.stub(instance, "removeUnconfirmedTransaction");

            function tx(id){
                return {
                    tx : { id : `${id}` },
                    payload : {
                        receivedAt : {
                            getTime(){
                                return Date.now() - 1000;
                            },
                            toUTCString(){
                                return `utc ${id}`;
                            }
                        }
                    }
                };
            };

            instance.unconfirmed.listWithPayload.returns([tx(1),tx(2)]);
            instance.queued.listWithPayload.returns([tx(3),tx(4),tx(5),tx(6)]);
            instance.multisignature.listWithPayload.returns([tx(7),tx(8),tx(9)]);
            instance.txTimeout.returns(2);
        });

        it('should return empty array if no txs in queues', function() {
            instance.unconfirmed.listWithPayload.returns([]);
            instance.queued.listWithPayload.returns([]);
            instance.multisignature.listWithPayload.returns([]);

            var result = instance.expireTransactions();

            expect(result).to.deep.equal([]);
        });

        it('should call removeUnconfirmed for each tx that has expired', function() {
            instance.txTimeout.returns(0);

            instance.expireTransactions();

            expect(instance.removeUnconfirmedTransaction.callCount).to.equal(9);
            expect(library.logger.info.callCount).to.equal(9);
            for(var i = 1; i <= 9; i++) {
                expect(instance.removeUnconfirmedTransaction.getCall(i - 1).args.length).to.equal(1);
                expect(instance.removeUnconfirmedTransaction.getCall(i - 1).args[0]).to.equal(`${i}`);
            }
        });

        it('should log the expired tx', function() {
            instance.txTimeout.returns(0);

            instance.expireTransactions();

            expect(library.logger.info.callCount).to.equal(9);
            for(var i = 1; i <= 9; i++) {
                expect(library.logger.info.getCall(i-1).args.length).to.equal(1);
                expect(library.logger.info.getCall(i-1).args[0]).to.equal(`Expired transaction: ${i} received at: utc ${i}`);
            }
        });

        it('should return all the expired ids', function() {
            instance.txTimeout.returns(0);

            var result = instance.expireTransactions();

            expect(result).to.deep.equal(['1','2','3','4','5','6','7','8','9']);
        });
    });

    describe('processBundled()', function () {
        var trs;

        beforeEach(function() {
            sandbox.stub(instance.bundled, "list");
            sandbox.stub(instance.bundled, "remove");
            sandbox.stub(instance, "processVerifyTransaction");
            sandbox.stub(instance, "queueTransaction");
            sandbox.stub(instance.unconfirmed, "remove");

            trs = [{id:'1'}, {id:'2'}, {id:'3'}];
            instance.bundled.list.returns(trs);
            instance.processVerifyTransaction.resolves();
        });

        it('should call bundle.list', function(done) {
            instance.processBundled().then(function() {
                expect(instance.bundled.list.callCount).to.equal(1);
                expect(instance.bundled.list.firstCall.args.length).to.equal(2);
                expect(instance.bundled.list.firstCall.args[0]).to.equal(true);
                expect(instance.bundled.list.firstCall.args[1]).to.equal(instance.bundleLimit);

                done();
            });
        });

        it('should call bundle.remove', function(done) {
            instance.processBundled().then(function() {
                expect(instance.bundled.remove.callCount).to.equal(3);
                trs.forEach(function(tx, index) {
                    expect(instance.bundled.remove.getCall(index).args.length).to.equal(1);
                    expect(instance.bundled.remove.getCall(index).args[0]).to.equal(tx.id);
                });

                done();
            });
        });

        it('should call processVerifyTransaction', function(done) {
            instance.processBundled().then(function() {
                expect(instance.processVerifyTransaction.callCount).to.equal(3);
                trs.forEach(function(tx, index) {
                    expect(instance.processVerifyTransaction.getCall(index).args.length).to.equal(2);
                    expect(instance.processVerifyTransaction.getCall(index).args[0]).to.equal(tx);
                    expect(instance.processVerifyTransaction.getCall(index).args[1]).to.equal(true);
                });

                done();
            });
        });

        it('should call processVerifyTransaction', function(done) {
            instance.processBundled().then(function() {
                expect(instance.queueTransaction.callCount).to.equal(3);
                trs.forEach(function(tx, index) {
                    expect(instance.queueTransaction.getCall(index).args.length).to.equal(2);
                    expect(instance.queueTransaction.getCall(index).args[0]).to.equal(tx);
                    expect(instance.queueTransaction.getCall(index).args[1]).to.equal(true);
                });

                done();
            });
        });

        it('should return promise', () => {
            expect(instance.processBundled()).to.be.an.instanceOf(Promise);
        });

        it('should call 2 times (filter one) processVerifyTransaction and QueueTransaction if all good', (done) => {
            instance.bundled.list.returns([trs[0], null, trs[1]]);

            instance.processBundled().then(() => {
                expect(instance.processVerifyTransaction.callCount).to.be.eq(2);
                expect(instance.queueTransaction.callCount).to.be.eq(2);

                done();
            })
        });

        it('should not call queue if verify Fails and swallow the error', (done) => {
            var error = "error";

            instance.processVerifyTransaction.rejects(error);

            instance.processBundled().then(() => {
                expect(instance.queueTransaction.called).to.be.false;

                expect(library.logger.debug.callCount).to.equal(3);
                expect(instance.unconfirmed.remove.callCount).to.equal(3);

                trs.forEach(function(tx, index) {
                    expect(library.logger.debug.getCall(index).args.length).to.equal(2);
                    expect(library.logger.debug.getCall(index).args[0]).to.equal(`Failed to process / verify bundled transaction: ${tx.id}`);
                    expect(library.logger.debug.getCall(index).args[1]).to.be.instanceof(Error);

                    expect(instance.unconfirmed.remove.getCall(index).args.length).to.equal(1);
                    expect(instance.unconfirmed.remove.getCall(index).args[0]).to.equal(tx.id);
                });

                done();
            });
        });

        it('should log error if queueTransaction throw error', function(done) {
            var error = "error";

            instance.queueTransaction.throws(error);

            instance.processBundled().then(() => {
                expect(instance.queueTransaction.called).to.be.true;
                expect(library.logger.debug.callCount).to.equal(3);
                trs.forEach(function(tx, index) {
                    expect(library.logger.debug.getCall(index).args.length).to.equal(2);
                    expect(library.logger.debug.getCall(index).args[0]).to.equal(`Failed to queue bundled transaction: ${tx.id}`);
                    expect(library.logger.debug.getCall(index).args[1]).to.be.instanceof(Error);
                });
                done();
            });
        });
    });

    describe('receiveTransactions()', function () {
        var txs;
        var broadcast;
        var bundled;

        beforeEach(function () {
            txs = [{}, {}];
            broadcast = false;
            bundled = true;

            sinon.stub(instance, 'processNewTransaction').resolves();
        });

        it('should return a promise', () => {
            var result = instance.receiveTransactions(txs, broadcast, bundled);

            expect(result).to.be.instanceOf(Promise);
        });

        it('should throw if processNewTransaction throws', (done) => {
            var error = new Error("error");
            instance.processNewTransaction.rejects(error);

            var result = instance.receiveTransactions(txs, broadcast, bundled);

            result.then(function() {
                done("Should be rejected");
            }).catch(function(e) {
                expect(e).to.be.instanceof(Error);
                expect(e).to.be.equal(error);
                done();
            });
        });

        it('should call processNewTransaction as many times as the txs and propagate variables.', () => {
            var result = instance.receiveTransactions(txs, broadcast, bundled);

            result.then(function() {
                expect(instance.processNewTransaction.callCount).to.equal(2);
                expect(instance.processNewTransaction.firstCall.args.length).to.equal(3);
                expect(instance.processNewTransaction.firstCall.args[0]).to.equal(txs[0]);
                expect(instance.processNewTransaction.firstCall.args[1]).to.equal(broadcast);
                expect(instance.processNewTransaction.firstCall.args[2]).to.equal(bundled);

                expect(instance.processNewTransaction.secondCall.args.length).to.equal(3);
                expect(instance.processNewTransaction.secondCall.args[0]).to.equal(txs[1]);
                expect(instance.processNewTransaction.secondCall.args[1]).to.equal(broadcast);
                expect(instance.processNewTransaction.secondCall.args[2]).to.equal(bundled);
            }).catch(function(e) {
                done(e);
            });
        });
    });

    describe('processNewTransaction()', function () {
        var broadcast = true;
        var bundled = true;

        it('rejects if transaction is already in pool', function (done) {
            instance.queued.add({ id: 'already_processed' });
            instance.processNewTransaction({ id: 'already_processed' },true,false).catch(function(err) {
                expect(err).to.contain('Transaction is already processed');

                done();
            });
        });

        it('should call to self.reindexQueues() and self.processed should be equal to 1 ', function (done) {
            const stub = sandbox.stub(instance, 'reindexAllQueues');
            instance.processed = 1000;
            instance.processNewTransaction({ id: 'unprocessed' },broadcast,bundled).then(function() {
                expect(stub.calledOnce).to.be.true;
                expect(stub.firstCall.args.length).to.equal(0);
                expect(instance.processed).to.be.eq(1);

                done();
            });
        });

        it('should call to self.queueTransaction() if bundle = true', function (done) {
            const tx = { id: 'unprocessed' };
            const spy = sandbox.stub(instance, 'queueTransaction');
            const verSpy = sandbox.stub(instance, 'processVerifyTransaction');

            instance.processNewTransaction(tx,broadcast,true).then(function() {
                expect(spy.calledOnce).is.true;
                expect(spy.firstCall.args.length).to.equal(2);
                expect(spy.firstCall.args[0]).to.equal(tx);
                expect(spy.firstCall.args[1]).to.equal(true);

                expect(verSpy.calledOnce).is.false;

                done();
            });
        });

        it('should not call to self.queueTransaction() if bundle = false', function (done) {
            const tx = { id: 'unprocessed' };
            const spy = sandbox.stub(instance, 'queueTransaction');
            const verSpy = sandbox.stub(instance, 'processVerifyTransaction');

            instance.processNewTransaction(tx,broadcast,false).then(function() {
                expect(verSpy.calledOnce).is.true;
                expect(verSpy.firstCall.args.length).to.equal(2);
                expect(verSpy.firstCall.args[0]).to.equal(tx);
                expect(verSpy.firstCall.args[1]).to.equal(broadcast);

                expect(spy.calledOnce).is.true;
                expect(spy.firstCall.args.length).to.equal(2);
                expect(spy.firstCall.args[0]).to.equal(tx);
                expect(spy.firstCall.args[1]).to.equal(false);

                done();
            });
        });
    });

    describe('applyUnconfirmedList()', function () {
        var txs;
        var sender = "sender";

        beforeEach(function() {
            txs = [
                {id : '1'},
                {id : '2'},
                {id : '3'}
            ];

            sandbox.stub(instance.unconfirmed, "get");
            sandbox.stub(instance.unconfirmed, "remove");
            sandbox.stub(instance, "processVerifyTransaction");

            instance.unconfirmed.get.onCall(0).returns(txs[0]);
            instance.unconfirmed.get.onCall(1).returns(txs[1]);
            instance.unconfirmed.get.onCall(2).returns(txs[2]);

            instance.processVerifyTransaction.resolves(sender);
            modules.transactions.applyUnconfirmed.resolves();
        });

        it('should convert tx from string by calling unconfirmed.get', function(done) {
            instance.applyUnconfirmedList([txs[0]['id'], txs[1]['id'], txs[2]['id']]).then(function() {
                expect(instance.unconfirmed.get.callCount).to.equal(txs.length);
                txs.forEach(function(tx, index) {
                    expect(instance.unconfirmed.get.getCall(index).args.length).to.equal(1);
                    expect(instance.unconfirmed.get.getCall(index).args[0]).to.equal(tx.id);
                });
                done();
            }); 
        });

        it('should skip empty tx', function(done) {
            instance.applyUnconfirmedList([]).then(function() {
                expect(instance.processVerifyTransaction.called).to.be.false;
                done();
            }).catch(function(error) {
                done(error);
            }); 
        });

        it('should call processVerifyTransaction and remove the tx if error is thrown', function(done) {
            var error = "error";

            instance.processVerifyTransaction.rejects(error);

            instance.applyUnconfirmedList(txs).then(function() {
                expect(instance.processVerifyTransaction.callCount).to.equal(txs.length);
                expect(library.logger.error.callCount).to.equal(txs.length);
                expect(instance.unconfirmed.remove.callCount).to.equal(txs.length);

                txs.forEach(function(tx, index) {
                    expect(instance.processVerifyTransaction.getCall(index).args.length).to.equal(2);
                    expect(instance.processVerifyTransaction.getCall(index).args[0]).to.equal(tx);
                    expect(instance.processVerifyTransaction.getCall(index).args[1]).to.equal(false);
                    expect(library.logger.error.getCall(index).args.length).to.equal(2);
                    expect(library.logger.error.getCall(index).args[0]).to.equal(`Failed to process / verify unconfirmed transaction: ${tx.id}`);
                    expect(library.logger.error.getCall(index).args[1]).to.be.instanceof(Error);
                    expect(instance.unconfirmed.remove.getCall(index).args.length).to.equal(1);
                    expect(instance.unconfirmed.remove.getCall(index).args[0]).to.equal(tx.id);
                });
                done();
            }); 
        });

        it('should call mod.tx.applyUnconfirmed with sender from processVerifyTx', function(done) {
            instance.applyUnconfirmedList(txs).then(function() {
                expect(modules.transactions.applyUnconfirmed.callCount).to.equal(txs.length);
                txs.forEach(function(tx, index) {
                    expect(modules.transactions.applyUnconfirmed.getCall(index).args.length).to.equal(2);
                    expect(modules.transactions.applyUnconfirmed.getCall(index).args[0]).to.equal(tx);
                    expect(modules.transactions.applyUnconfirmed.getCall(index).args[1]).to.equal(sender);
                });
                done();
            }); 
        });

        it('should log error from applyUnconfirmed', function(done) {
            var error = new Error("error");

            modules.transactions.applyUnconfirmed.rejects(error);

            instance.applyUnconfirmedList(txs).then(function() {
                expect(modules.transactions.applyUnconfirmed.callCount).to.equal(txs.length);
                txs.forEach(function(tx, index) {
                    expect(modules.transactions.applyUnconfirmed.getCall(index).args.length).to.equal(2);
                    expect(modules.transactions.applyUnconfirmed.getCall(index).args[0]).to.equal(tx);
                    expect(modules.transactions.applyUnconfirmed.getCall(index).args[1]).to.equal(sender);
                    expect(library.logger.error.getCall(index).args.length).to.equal(2);
                    expect(library.logger.error.getCall(index).args[0]).to.equal(`Failed to apply unconfirmed transaction ${tx.id}`);
                    expect(library.logger.error.getCall(index).args[1]).to.equal(error);
                });
                done();
            }); 
        });

        it('should remove tx if error from applyUnconfirmed', function(done) {
            var error = new Error("error");

            modules.transactions.applyUnconfirmed.rejects(error);

            instance.applyUnconfirmedList(txs).then(function() {
                expect(modules.transactions.applyUnconfirmed.callCount).to.equal(txs.length);
                txs.forEach(function(tx, index) {
                    expect(modules.transactions.applyUnconfirmed.getCall(index).args.length).to.equal(2);
                    expect(modules.transactions.applyUnconfirmed.getCall(index).args[0]).to.equal(tx);
                    expect(modules.transactions.applyUnconfirmed.getCall(index).args[1]).to.equal(sender);

                    expect(instance.unconfirmed.remove.getCall(index).args.length).to.equal(1);
                    expect(instance.unconfirmed.remove.getCall(index).args[0]).to.equal(tx.id);
                });
                done();
            }); 
        });
    });

    describe('undoUnconfirmedList()', function () {
        var txs;

        beforeEach(function() {
            txs = [
                {id : '1'},
                {id : '2'},
                {id : '3'}
            ];
            sandbox.stub(instance.unconfirmed, "list");
            instance.unconfirmed.list.returns(txs);
            modules.transactions.undoUnconfirmed.resolves();
            sandbox.stub(instance, "removeUnconfirmedTransaction");
        });

        it('should call modules.tx.undoUnconfirmed for each tx', function(done) {
            instance.undoUnconfirmedList().then(function() {
                expect(modules.transactions.undoUnconfirmed.callCount).to.equal(txs.length);
                txs.forEach(function(tx, index) {
                    expect(modules.transactions.undoUnconfirmed.getCall(index).args.length).to.equal(1);
                    expect(modules.transactions.undoUnconfirmed.getCall(index).args[0]).to.equal(tx);
                });
                done();
            });
        });

        it('should skip empty txs', function(done) {
            instance.unconfirmed.list.returns([]);

            var result = instance.undoUnconfirmedList().then(function(result) {
                expect(result).to.deep.equal([]);
                expect(modules.transactions.undoUnconfirmed.callCount).to.equal(0);
                done();
            });
        });

        it('should call removeUnconfirmedTransaction if tx errored', function(done) {
            var error = new Error("error");

            modules.transactions.undoUnconfirmed.rejects(error);

            instance.undoUnconfirmedList().then(function() {
                expect(instance.removeUnconfirmedTransaction.callCount).to.equal(txs.length);
                txs.forEach(function(tx, index) {
                    expect(instance.removeUnconfirmedTransaction.getCall(index).args.length).to.equal(1);
                    expect(instance.removeUnconfirmedTransaction.getCall(index).args[0]).to.equal(tx.id);

                    expect(library.logger.error.getCall(index).args.length).to.equal(2);
                    expect(library.logger.error.getCall(index).args[0]).to.equal(`Failed to undo unconfirmed transaction: ${tx.id}`);
                    expect(library.logger.error.getCall(index).args[1]).to.equal(error);
                });
                done();
            });
        });

        it('should return processed ids', function(done) {
            var result = instance.undoUnconfirmedList().then(function(result) {
                expect(result).to.deep.equal(['1','2','3']);
                done();
            });
        });
    });

    describe('reindexQueues()', function () {
        it('should call reindex on all queues', () => {
            const spies = instance.allQueues.map((queue) => sinon.spy(queue, 'reindex'));

            instance.reindexAllQueues();

            expect(spies.map((s) => s.calledOnce)).is.deep.eq(spies.map(() => true));
        });

    });

    describe('removeUnconfirmedTransaction()', function () {
        beforeEach(function () {
            sandbox.stub(instance.unconfirmed, 'remove');
            sandbox.stub(instance.queued, 'remove');
            sandbox.stub(instance.multisignature, 'remove');
            sandbox.stub(instance.bundled, 'remove');
        });

        it('should call queues ', function () {
            instance.removeUnconfirmedTransaction('123');

            expect(instance.bundled.remove.calledOnce).is.false;

            expect(instance.unconfirmed.remove.calledOnce).is.true;
            expect(instance.queued.remove.calledOnce).is.true;
            expect(instance.multisignature.remove.calledOnce).is.true;

            expect(instance.unconfirmed.remove.firstCall.args[0]).to.be.eq('123');
            expect(instance.queued.remove.firstCall.args[0]).to.be.eq('123');
            expect(instance.multisignature.remove.firstCall.args[0]).to.be.eq('123');
        });
    });

    describe('processVerifyTransaction()', function() {
        var transaction;
        var normalizedTx;
        var broadcast;
        var sender;
        var requester;

        beforeEach(function() {
            transaction = {
                senderPublicKey : "publicKey",
                requesterPublicKey : "publicKey",
                signatures : [] 
            };
            normalizedTx = {};
            broadcast = false;
            sender = {
                multisignatures : [1,2]
            };
            requester = {};

            modules.accounts.setAccountAndGet.resolves(sender);
            modules.accounts.getAccount.resolves(requester);
            library.logic.transaction.process.resolves();
            library.logic.transaction.objectNormalize.returns(normalizedTx);
            library.logic.transaction.verify.resolves();
        });

        it('should throw if give tx is not defined', function(done) {
            instance.processVerifyTransaction(null, broadcast).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.equal("Missing transaction");
                done();
            });
        });

        it('should call setAccountAndGet', function(done) {
            instance.processVerifyTransaction(transaction, broadcast).then(function() {
                expect(modules.accounts.setAccountAndGet.calledOnce).to.be.true;
                expect(modules.accounts.setAccountAndGet.firstCall.args.length).to.equal(1);
                expect(modules.accounts.setAccountAndGet.firstCall.args[0]).to.deep.equal({ publicKey : transaction.senderPublicKey });
                done();
            });
        });

        it('should call getAccount if multisignature', function(done) {
            instance.processVerifyTransaction(transaction, broadcast).then(function() {
                expect(modules.accounts.getAccount.calledOnce).to.be.true;
                expect(modules.accounts.getAccount.firstCall.args.length).to.equal(1);
                expect(modules.accounts.getAccount.firstCall.args[0]).to.deep.equal({ publicKey : transaction.requesterPublicKey });
                done();
            });
        });

        it('should call transaction.process with correct data', function(done) {
            instance.processVerifyTransaction(transaction, broadcast).then(function() {
                expect(library.logic.transaction.process.calledOnce).to.be.true;
                expect(library.logic.transaction.process.firstCall.args.length).to.equal(3);
                expect(library.logic.transaction.process.firstCall.args[0]).to.equal(transaction);
                expect(library.logic.transaction.process.firstCall.args[1]).to.equal(sender);
                expect(library.logic.transaction.process.firstCall.args[2]).to.equal(requester);
                done();
            });
        });

        it('should call objectNormalize on the transaction', function(done) {
            instance.processVerifyTransaction(transaction, broadcast).then(function() {
                expect(library.logic.transaction.objectNormalize.calledOnce).to.be.true;
                expect(library.logic.transaction.objectNormalize.firstCall.args.length).to.equal(1);
                expect(library.logic.transaction.objectNormalize.firstCall.args[0]).to.equal(transaction);
                done();
            });
        });

        it('should call transaction.verify with the correct data', function(done) {
            instance.processVerifyTransaction(transaction, broadcast).then(function() {
                expect(library.logic.transaction.verify.calledOnce).to.be.true;
                expect(library.logic.transaction.verify.firstCall.args.length).to.equal(4);
                expect(library.logic.transaction.verify.firstCall.args[0]).to.equal(normalizedTx);
                expect(library.logic.transaction.verify.firstCall.args[1]).to.equal(sender);
                expect(library.logic.transaction.verify.firstCall.args[2]).to.equal(requester);
                expect(library.logic.transaction.verify.firstCall.args[3]).to.equal(null);
                done();
            });
        });

        it("should call bus.message", function(done) {
            instance.processVerifyTransaction(transaction, broadcast).then(function() {
                expect(library.bus.message.calledOnce).to.be.true;
                expect(library.bus.message.firstCall.args.length).to.equal(3);
                expect(library.bus.message.firstCall.args[0]).to.equal("unconfirmedTransaction");
                expect(library.bus.message.firstCall.args[1]).to.equal(normalizedTx);
                expect(library.bus.message.firstCall.args[2]).to.equal(broadcast);
                done();
            });
        });

        it('should return sender', function(done) {
            instance.processVerifyTransaction(transaction, broadcast).then(function(resSender) {
                expect(resSender).to.equal(sender);
                done();
            });
        });
    });
});
