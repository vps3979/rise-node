var chai = require('chai');
var expect = chai.expect;
var sinon = require('sinon');
var rewire = require('rewire');
var Transport = rewire('../../../modules/transport');
var Broadcaster = rewire('../../../logic/broadcaster');
var jobsQueue = require('../../../helpers/jobsQueue');
var constants = require('../../../helpers/constants');
var nock = rewire('nock');

describe('modules/transport', function () {
	var sandbox, callback, instance, __private, scope, cb1;

	before(function () {
		cb1 = function () {};

		sandbox = sinon.sandbox.create({
			injectInto: null,
			properties: ['spy', 'stub', 'clock'],
			useFakeTimers: true,
			useFakeServer: false
		});

		scope = {
			logger: {
				log: function () {},
				debug: function () {}
			},
			db: 2,
			bus: 3,
			schema: {
				validate: function () {}
			},
			network: 5,
			balancesSequence: {
				add: function () {}
			},
			logic: {
				block: 7,
				transaction: {
					objectNormalize: function (transaction) {}
				},
				peers: {
					create: function (peer) {}
				}
			},
			config: {
				broadcasts: { peerLimit: 10 },
				forging: {
					force: 11
				},
				peers: {
					options: {
						timeout: 12
					}
				}
			},
			blocks: 13,
			dapps: 14,
			peers: {
				remove: function () {},
				list: function () {}
			},
			multisignatures: {
				processSignature: function () {}
			},
			transactions: {
				processUnconfirmedTransaction: function () {}
			},
			system: {
				headers: function () {}
			},
			transport: 18
		};

		sandbox.spy(scope.logger, 'log');
		sandbox.spy(scope.logger, 'debug');
		sandbox.spy(scope.peers, 'remove');
		sandbox.stub(scope.peers, 'list');
		sandbox.stub(scope.schema, 'validate');
		sandbox.stub(scope.multisignatures, 'processSignature');
		sandbox.stub(scope.logic.transaction, 'objectNormalize');
		sandbox.stub(scope.balancesSequence, 'add');
		sandbox.stub(scope.transactions, 'processUnconfirmedTransaction');
		sandbox.stub(scope.logic.peers, 'create');
		sandbox.stub(jobsQueue, 'register').returns(true);
		Broadcaster.__set__('jobsQueue', jobsQueue);
		Transport.__set__('setImmediate', setImmediate);
		__private = Transport.__get__('__private');
		callback = sandbox.spy();
	});

	beforeEach(function () {});

	after(function () {
		sandbox.restore();
	});

	afterEach(function () {
		sandbox.reset();
	});

	describe('constructor', function () {
		it('success', function () {
			var dummyScope = JSON.parse(JSON.stringify(scope));
			instance = new Transport(callback, dummyScope);
			sandbox.clock.runAll();
			var library = Transport.__get__('library');
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.be.null;
			expect(callback.args[0][1]).to.be.instanceof(Transport);
			delete dummyScope.config.broadcasts;
			delete dummyScope.config.forging;
			delete dummyScope.multisignatures;
			delete dummyScope.peers;
			delete dummyScope.system;
			delete dummyScope.transactions;
			delete dummyScope.transport;
			delete dummyScope.dapps;
			delete dummyScope.blocks;
			expect(library).to.deep.equal(dummyScope);
		});
	});

	describe('__private.hashsum()', function () {
		it('success', function () {
			var result = __private.hashsum({ a: 1, b: 2, c: 3 });
			expect(result).to.be.a('string');
			expect(result).to.have.lengthOf(19);
		});
	});

	describe('__private.removePeer()', function () {
		it('success', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			var options = {
				code: 1,
				peer: {
					string: 2,
					port: 3,
					ip: 4
				}
			};
			__private.removePeer(options, 'Hello World!');

			expect(scope.logger.debug.calledOnce).to.be.true;
			expect(scope.logger.debug.args[0][0]).to.equal(
				'1 Removing peer 2 Hello World!'
			);
			expect(scope.peers.remove.calledOnce).to.be.true;
			expect(scope.peers.remove.args[0][0]).to.equal(options.peer.ip);
			expect(scope.peers.remove.args[0][1]).to.equal(options.peer.port);
		});
	});

	describe('__private.receiveSignatures()', function () {
		beforeEach(function () {
			sandbox.stub(__private, 'receiveSignature');
		});

		afterEach(function () {
			__private.receiveSignature.restore();
		});

		it('Invalid signatures body', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			var query = 'abc';
			scope.schema.validate.callsFake(function (query, signatures, cb) {
				setImmediate(cb, 'errorOnValidate');
			});
			__private.receiveSignatures(query, callback);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.equal('Invalid signatures body');
		});

		it('Call to logger.debug()', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			var query = { signatures: [1, 2, 3] };
			scope.schema.validate.callsFake(function (query, signatures, cb) {
				setImmediate(cb);
			});
			__private.receiveSignature.callsFake(function (signature, cb) {
				setImmediate(cb, 'errorOnReceiveSignature');
			});
			__private.receiveSignatures(query, callback);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(scope.logger.debug.calledThrice).to.be.true;
		});

		it('success', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			var query = { signatures: [1, 2, 3] };
			scope.schema.validate.callsFake(function (query, signatures, cb) {
				setImmediate(cb);
			});
			__private.receiveSignature.callsFake(function (signature, cb) {
				setImmediate(cb);
			});
			__private.receiveSignatures(query, callback);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(scope.logger.debug.called).to.be.false;
		});
	});

	describe('__private.receiveSignature()', function () {
		it('Invalid signature body', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			scope.schema.validate.callsFake(function (query, signatures, cb) {
				setImmediate(cb, 'errorOnValidate');
			});
			var signature = 1;
			__private.receiveSignature(signature, callback);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.equal('Invalid signature body');
		});

		it('Error processing signature', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			scope.schema.validate.callsFake(function (query, signatures, cb) {
				setImmediate(cb);
			});
			scope.multisignatures.processSignature.callsFake(function (signature, cb) {
				setImmediate(cb, 'errorOnProcessSignature');
			});
			var signature = 1;
			__private.receiveSignature(signature, callback);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.have.string('Error processing signature');
		});

		it('success', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			scope.schema.validate.callsFake(function (query, signatures, cb) {
				setImmediate(cb);
			});
			scope.multisignatures.processSignature.callsFake(function (signature, cb) {
				setImmediate(cb);
			});
			var signature = 1;
			__private.receiveSignature(signature, callback);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.be.a('undefined');
		});
	});

	describe('__private.receiveTransactions()', function () {
		beforeEach(function () {
			sandbox.stub(__private, 'receiveTransaction');
		});

		afterEach(function () {
			__private.receiveTransaction.restore();
		});

		it('Invalid transactions body', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			scope.schema.validate.callsFake(function (query, transactions, cb) {
				setImmediate(cb, 'errorOnValidate');
			});
			__private.receiveTransactions(1, 2, 3, callback);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.equal('Invalid transactions body');
		});

		it('Call logger.debug()', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			scope.schema.validate.callsFake(function (query, transactions, cb) {
				setImmediate(cb);
			});
			__private.receiveTransaction.callsFake(function (
				transaction,
				peer,
				extraLogMessage,
				cb
			) {
				setImmediate(cb, 'errorOnReceiveTransaction');
			});
			var query = { transactions: [{ id: 1 }, { id: 2 }] };
			__private.receiveTransactions(query, 2, 3, callback);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.be.null;
			expect(scope.logger.debug.calledTwice).to.be.true;
		});

		it('success', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			scope.schema.validate.callsFake(function (query, transactions, cb) {
				setImmediate(cb);
			});
			__private.receiveTransaction.callsFake(function (
				transaction,
				peer,
				extraLogMessage,
				cb
			) {
				setImmediate(cb);
			});
			var query = { transactions: [{ id: 1 }, { id: 2 }] };
			__private.receiveTransactions(query, 2, 3, callback);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.be.null;
			expect(scope.logger.debug.called).to.be.false;
		});
	});

	describe('__private.receiveTransaction()', function () {
		beforeEach(function () {
			sandbox.spy(__private, 'removePeer');
		});

		afterEach(function () {
			__private.removePeer.restore();
		});

		it('Invalid transaction body', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			var transaction = { id: 1 };
			var peer = 2;
			var extraLogMessage = 3;
			scope.logic.transaction.objectNormalize.throws('errorOnObjectNormalize');
			__private.receiveTransaction(
				transaction,
				peer,
				extraLogMessage,
				callback
			);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.have.string('Invalid transaction body');
			expect(scope.logger.debug.calledTwice).to.be.true;
			expect(scope.logger.debug.args[0][0]).to.have.string(
				'Transaction normalization failed'
			);
			expect(scope.logger.debug.args[1][0]).to.have.string('ETRANSACTION');
			expect(__private.removePeer.calledOnce).to.be.true;
			expect(__private.removePeer.args[0][0]).to.deep.equal({
				peer: peer,
				code: 'ETRANSACTION'
			});
			expect(__private.removePeer.args[0][1]).to.equal(extraLogMessage);
		});

		it('processUnconfirmedTransaction() returns an error', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			var transaction = { id: 1 };
			var peer = 2;
			var extraLogMessage = 3;
			scope.logic.transaction.objectNormalize.callsFake(function (transaction) {
				return transaction;
			});
			scope.balancesSequence.add.callsFake(function (cb) {
				setImmediate(cb, callback);
			});
			scope.transactions.processUnconfirmedTransaction.callsFake(function (
				transaction,
				foo,
				cb
			) {
				setImmediate(cb, new Error('processUnconfirmedTransactionError'));
			});
			__private.receiveTransaction(
				transaction,
				peer,
				extraLogMessage,
				callback
			);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.have.string(
				'processUnconfirmedTransactionError'
			);
			expect(scope.logger.debug.calledThrice).to.be.true;
			expect(scope.logger.debug.args[0][0]).to.have.string(
				'Received transaction 1 from peer undefined'
			);
			expect(scope.logger.debug.args[1][0]).to.have.string('Transaction');
			expect(scope.logger.debug.args[2][0]).to.have.string('Transaction');
			expect(__private.removePeer.called).to.be.false;
		});

		it('success', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			var transaction = { id: 1 };
			var peer = 2;
			var extraLogMessage = 3;
			scope.logic.transaction.objectNormalize.callsFake(function (transaction) {
				return transaction;
			});
			scope.balancesSequence.add.callsFake(function (cb) {
				setImmediate(cb, callback);
			});
			scope.transactions.processUnconfirmedTransaction.callsFake(function (
				transaction,
				foo,
				cb
			) {
				setImmediate(cb);
			});
			__private.receiveTransaction(
				transaction,
				peer,
				extraLogMessage,
				callback
			);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.be.null;
			expect(scope.logger.debug.calledOnce).to.be.true;
			expect(scope.logger.debug.args[0][0]).to.have.string(
				'Received transaction 1 from peer undefined'
			);
			expect(__private.removePeer.called).to.be.false;
		});
	});

	describe('headers()', function () {
		it('success', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			var result = instance.headers(123);
			expect(result).to.equal(123);
			expect(__private.headers).to.equal(123);
		});
	});

	describe('consensus()', function () {
		it('if scope.config.forging.force is true should returns undefined', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			var result = instance.consensus();
			expect(result).to.be.a('undefined');
		});

		it('if scope.config.forging.force is true should returns 100', function () {
			var dummyScope = JSON.parse(JSON.stringify(scope));
			dummyScope.config.forging.force = false;
			dummyScope.system.headers = function () {};
			instance = new Transport(cb1, dummyScope);
			instance.onBind(dummyScope);
			var result = instance.consensus();
			expect(result).to.equal(100);
		});
	});

	describe('poorConsensus()', function () {
		it('if consensus is undefined should returns false', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			var result = instance.poorConsensus();
			expect(result).to.be.false;
		});

		it('if consensus is less than minBroadhashConsensus should returns true', function () {
			var dummyScope = JSON.parse(JSON.stringify(scope));
			dummyScope.config.forging.force = false;
			dummyScope.system.headers = function () {};
			instance = new Transport(cb1, dummyScope);
			instance.onBind(dummyScope);
			var minBroadhashConsensus_original = constants.minBroadhashConsensus;
			constants.minBroadhashConsensus = 101;
			var result = instance.poorConsensus();
			expect(result).to.be.true;
			constants.minBroadhashConsensus = minBroadhashConsensus_original;
		});

		it('if consensus is greater than minBroadhashConsensus should returns false', function () {
			var dummyScope = JSON.parse(JSON.stringify(scope));
			dummyScope.config.forging.force = false;
			dummyScope.system.headers = function () {};
			instance = new Transport(cb1, dummyScope);
			instance.onBind(dummyScope);
			var result = instance.poorConsensus();
			expect(result).to.be.false;
		});
	});

	describe('getPeers()', function () {
		it('success', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			sandbox
				.stub(__private.broadcaster, 'getPeers')
				.callsFake(function (params, cb) {
					setImmediate(cb);
				});
			instance.getPeers(123, callback);
			sandbox.clock.runAll();
			expect(__private.broadcaster.getPeers.calledOnce).to.be.true;
			expect(__private.broadcaster.getPeers.args[0][0]).to.equal(123);
			expect(__private.broadcaster.getPeers.args[0][1]).to.be.a('function');
			expect(callback.calledOnce).to.be.true;
		});
	});

	describe('getFromRandomPeer()', function () {
		it('modules.peers.list() returns error \'No acceptable peers found\'', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			scope.peers.list.callsFake(function (config, cb) {
				setImmediate(cb, null, 0);
			});
			instance.getFromRandomPeer({}, callback);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.equal('No acceptable peers found');
		});

		it('modules.peers.list() returns other error', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			scope.peers.list.callsFake(function (config, cb) {
				setImmediate(cb, 'otherError', 0);
			});
			instance.getFromRandomPeer({}, callback);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.equal('otherError');
		});

		it('Success', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			scope.peers.list.callsFake(function (config, cb) {
				setImmediate(cb, null, [1, 2, 3]);
			});
			sandbox
				.stub(instance, 'getFromPeer')
				.callsFake(function (peer, options, cb) {
					return setImmediate(cb);
				});
			instance.getFromRandomPeer({}, callback);
			sandbox.clock.runAll();
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.be.a('undefined');
			expect(instance.getFromPeer.calledOnce).to.be.true;
			expect(instance.getFromPeer.args[0][0]).to.equal(1);
		});
	});

	describe('getFromPeer()', function (done) {
		it('Received bad response code', function () {
			instance = new Transport(cb1, scope);
			instance.onBind(scope);
			var options = { api: '/foo', method: 'GET', data: '123' };
			scope.logic.peers.create.callsFake(function (peer) {
				return { ip: '127.0.0.1', port: 1234 };
			});
			sandbox.spy(__private, 'removePeer');

			nock('http://127.0.0.1:1234')
				.defaultReplyHeaders({
					'Content-Type': 'application/json'
				})
				.get('/peer/foo')
				.reply(404, { error: '404 Not found' });

			instance.getFromPeer({}, options, callback);

			sandbox.clock.runAll();

			expect(__private.removePeer.calledOnce).to.be.true;
			expect(callback.calledOnce).to.be.true;
			expect(callback.args[0][0]).to.have.string('Received bad response code');
		});
	});
});
