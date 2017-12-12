var chai = require('chai');
var expect = chai.expect;
var sinon = require('sinon');
var rewire = require('rewire');
var path = require("path");
var crypto = require("crypto");

var rootDir = path.join(__dirname, "../../..");

var TransactionModule  = rewire(path.join(rootDir, 'src/logic/transaction.ts'));
var SendTransaction = require(path.join(rootDir, 'src/logic/transactions/send.ts')).SendTransaction;
var TransactionType = require(path.join(rootDir, 'src/helpers/transactionTypes.ts')).TransactionType;
var BaseTransactionTypeModule  = require(path.join(rootDir, 'src/logic/transactions/baseTransactionType.ts'));
var BigNum = require(path.join(rootDir, 'src/helpers/bignum.ts')).default;
var Slots = require(path.join(rootDir, 'src/helpers/slots.ts')).Slots;
var TransactionLogic = TransactionModule.TransactionLogic;
var sql = require(path.join(rootDir, 'sql/logic/transactions')).default;

describe("logic/transaction.ts", function() {
    var sandbox;

    var instance;
    var scope;
    var modules;

    var BTType;
    var BTTypeStub;

    before(function() {
        sandbox = sinon.sandbox.create({
            injectInto: null,
            properties: ["spy", "stub", "clock"],
            useFakeTimers: true,
            useFakeServer: false
        });
    });

    beforeEach(function() {
        scope = {
            db : {
                one : sandbox.stub()
            },
            ed : {
                sign : sandbox.stub(),
                verify : sandbox.stub()
            },
            schema : {},
            genesisblock : {
                id : 123
            },
            account : {
                merge : sandbox.stub()
            },
            logger : {
                error : sandbox.stub(),
                trace : sandbox.stub()
            }
        };
        modules = {
            rounds : {
                calcRound : sandbox.stub()
            }
        };

        instance = new TransactionLogic(scope);
        instance.bindModules(modules);
    });

    afterEach(function() {
        sandbox.reset();
    });

    after(function() {
        sandbox.restore();
    });

    describe("constructor", function() {
        it("should be a function", function() {
            expect(TransactionLogic).to.be.a("function");
        });

        it("check instance", function() {
            expect(instance).to.be.instanceof(TransactionLogic);
        });

        it("check scope", function() {
            expect(instance.scope).to.equal(scope);
        });

        it("check modules", function() {
            expect(instance.modules).to.equal(modules);
        });
    });

    describe("attachAssetType", function() {
        it("should throw error", function() {
            expect(() => {instance.attachAssetType(TransactionType.SEND, null);}).to.throw("Invalid instance interface");
        });

        it("check types", function() {
            var sendInstance = new SendTransaction();
            instance.attachAssetType(TransactionType.SEND, sendInstance);

            expect(instance.types).to.have.property(TransactionType.SEND);
            expect(instance.types[TransactionType.SEND]).to.equal(sendInstance);
        });

        it("should return instance", function() {
            var sendInstance = new SendTransaction();
            var result = instance.attachAssetType(TransactionType.SEND, sendInstance);

            expect(result).to.be.equal(sendInstance);
        });
    });

    describe("sign", function() {
        var keypair;
        var tx;
        var hash;
        var sign;

        beforeEach(function() {
            keypair = {};
            tx = {};
            hash = {};
            sign = {
                toString : sandbox.stub()
            };
            sandbox.stub(instance, "getHash").returns(hash);
            scope.ed.sign.returns(sign);
        });

        it("getHash called", function() {
            instance.sign(keypair, tx);

            expect(instance.getHash.calledOnce).to.be.true;
            expect(instance.getHash.firstCall.args.length).to.equal(1);
            expect(instance.getHash.firstCall.args[0]).to.equal(tx);
        });

        it("scope.ed.sign called", function() {
            instance.sign(keypair, tx);

            expect(instance.scope.ed.sign.calledOnce).to.be.true;
            expect(instance.scope.ed.sign.firstCall.args.length).to.equal(2);
            expect(instance.scope.ed.sign.firstCall.args[0]).to.equal(hash);
            expect(instance.scope.ed.sign.firstCall.args[1]).to.equal(keypair);
        });

        it("sign.toString('hex') called", function() {
            instance.sign(keypair, tx);

            expect(sign.toString.calledOnce).to.be.true;
            expect(sign.toString.firstCall.args.length).to.equal(1);
            expect(sign.toString.firstCall.args[0]).to.equal("hex");
        });
    });


    describe("multiSign", function() {
        var keypair;
        var tx;
        var hash;
        var sign;

        beforeEach(function() {
            keypair = {};
            tx = {};
            hash = {};
            sign = {
                toString : sandbox.stub()
            };
            sandbox.stub(instance, "getHash").returns(hash);
            scope.ed.sign.returns(sign);
        });

        it("getHash called", function() {
            instance.multiSign(keypair, tx);

            expect(instance.getHash.calledOnce).to.be.true;
            expect(instance.getHash.firstCall.args.length).to.equal(3);
            expect(instance.getHash.firstCall.args[0]).to.equal(tx);
            expect(instance.getHash.firstCall.args[1]).to.equal(true);
            expect(instance.getHash.firstCall.args[2]).to.equal(true);
        });

        it("scope.ed.sign called", function() {
            instance.multiSign(keypair, tx);

            expect(instance.scope.ed.sign.calledOnce).to.be.true;
            expect(instance.scope.ed.sign.firstCall.args.length).to.equal(2);
            expect(instance.scope.ed.sign.firstCall.args[0]).to.equal(hash);
            expect(instance.scope.ed.sign.firstCall.args[1]).to.equal(keypair);
        });

        it("sign.toString('hex') called", function() {
            instance.multiSign(keypair, tx);

            expect(sign.toString.calledOnce).to.be.true;
            expect(sign.toString.firstCall.args.length).to.equal(1);
            expect(sign.toString.firstCall.args[0]).to.equal("hex");
        });
    });

    describe("getId", function() {
        var tx;
        var hash;

        before(function() {
            sandbox.spy(BigNum, "fromBuffer");
        });

        beforeEach(function() {
            tx = {};
            hash = new Buffer("abcdefgh");

            sandbox.stub(instance, "getHash").returns(hash);
        });

        after(function() {
            BigNum.fromBuffer.restore();
        });

        it("getHash called", function() {
            instance.getId(tx);

            expect(instance.getHash.calledOnce).to.be.true;
            expect(instance.getHash.firstCall.args.length).to.equal(1);
            expect(instance.getHash.firstCall.args[0]).to.equal(tx);
        });

        it("BigNum.fromBuffer called", function() {
            var temp = Buffer.alloc(8);
            for (let i = 0; i < 8; i++) {
                temp[i] = hash[7 - i];
            }

            instance.getId(tx);

            expect(BigNum.fromBuffer.calledOnce).to.be.true;
            expect(BigNum.fromBuffer.firstCall.args.length).to.equal(1);
            expect(BigNum.fromBuffer.firstCall.args[0]).to.deep.equal(temp);
        });

        it("check result", function() {
            var result = instance.getId(tx);

            expect(result).to.equal("7523094288207667809");
        });
    });

    describe("getHash", function() {
        var tx;
        var skipSign;
        var skipSecondSign;
        var bytes;

        var hash;
        var updatedHash;
        var digest;

        before(function() {
            bytes = new Buffer("abcdefgh");
            hash = crypto.createHash('sha256')
            updatedHash = hash.update(bytes);
            digest = updatedHash.digest();

            sandbox.stub(crypto, "createHash");
            sandbox.stub(hash, "update");
            sandbox.stub(updatedHash, "digest");
        });

        beforeEach(function() {
            tx = {};
            skipSign = true;
            skipSecondSign = true;

            sandbox.stub(instance, "getBytes").returns(bytes);

            crypto.createHash.returns(hash);
            hash.update.returns(updatedHash);
            updatedHash.digest.returns(digest);
        });

        after(function() {
            crypto.createHash.restore();
            hash.update.restore();
            updatedHash.digest.restore();
        });

        it("getBytes called", function() {
            instance.getHash(tx, skipSign, skipSecondSign);

            expect(instance.getBytes.calledOnce).to.be.true;
            expect(instance.getBytes.firstCall.args.length).to.equal(3);
            expect(instance.getBytes.firstCall.args[0]).to.equal(tx);
            expect(instance.getBytes.firstCall.args[1]).to.equal(skipSign);
            expect(instance.getBytes.firstCall.args[2]).to.equal(skipSecondSign);
        });

        it("createHash called", function() {
            instance.getHash(tx, skipSign, skipSecondSign);

            expect(crypto.createHash.calledOnce).to.be.true;
            expect(crypto.createHash.firstCall.args.length).to.equal(1);
            expect(crypto.createHash.firstCall.args[0]).to.equal('sha256');
        });

        it("hash.update called", function() {
            instance.getHash(tx, skipSign, skipSecondSign);

            expect(hash.update.calledOnce).to.be.true;
            expect(hash.update.firstCall.args.length).to.equal(1);
            expect(hash.update.firstCall.args[0]).to.deep.equal(bytes);
        });

        it("updatedHash.digest", function() {
            instance.getHash(tx, skipSign, skipSecondSign);

            expect(updatedHash.digest.calledOnce).to.be.true;
            expect(updatedHash.digest.firstCall.args.length).to.equal(0);
        });
    });

    describe("getBytes", function() {
        var tx;
        var skipSignature;
        var skipSecondSignature;

        var TTInstance;
        var assetBytes;
        var bb;

        var bytebufferTemp;
        var bytebufferStub;

        var countSender;
        var countRequester;
        var countAsset;
        var countSignature;
        var countSignSignature;

        before(function() {
            bb = {
                writeByte : sandbox.stub(),
                writeInt : sandbox.stub(),
                writeLong : sandbox.stub(),
                flip : sandbox.stub(),
                toBuffer : sandbox.stub()
            };

            bytebufferTemp = TransactionModule.__get__("ByteBuffer");
            bytebufferStub = sandbox.stub();
            TransactionModule.__set__("ByteBuffer", bytebufferStub);

            sandbox.spy(Buffer, "from");
        });

        beforeEach(function() {
            tx = {
                type : TransactionType.SEND,
                senderPublicKey : "123qwe123qwe123qwe123qwe",
                requesterPublicKey : "qwe123qwe123qwe123qwe123",
                recipientId : "12341234",
                amount : 1000,
                signature : "a1b2",
                signSignature : "c3d4",
                timestamp : 1000
            };

            assetBytes = new Buffer("abcdefgh");

            countSender = Buffer.from(tx.senderPublicKey, "hex").length;
            countRequester = Buffer.from(tx.requesterPublicKey, "hex").length;
            countAsset = assetBytes.length;
            countSignature = Buffer.from(tx.signature, "hex").length;
            countSignSignature = Buffer.from(tx.signSignature, "hex").length;

            skipSignature = false;
            skipSecondSignature = false;

            TTInstance = {
                getBytes : sandbox.stub().returns(assetBytes)
            };
            bytebufferStub.returns(bb);

            instance.types[TransactionType.SEND] = TTInstance;
        });

        after(function() {
            Buffer.from.restore();
            TransactionModule.__set__("ByteBuffer", bytebufferTemp);
        });

        it("unknown transaction type", function() {
            tx.type = TransactionType.VOTE;

            expect(() => instance.getBytes(tx, skipSignature, skipSecondSignature)).to.throw(`Unknown transaction type ${tx.type}`);
        });

        it("txType.getBytes called", function() {
            instance.getBytes(tx, skipSignature, skipSecondSignature);

            expect(TTInstance.getBytes.calledOnce).to.be.true;
            expect(TTInstance.getBytes.firstCall.args.length).to.equal(3);
            expect(TTInstance.getBytes.firstCall.args[0]).to.equal(tx);
            expect(TTInstance.getBytes.firstCall.args[1]).to.equal(skipSignature);
            expect(TTInstance.getBytes.firstCall.args[2]).to.equal(skipSecondSignature);
        });

        it("ByteBuffer called with new", function() {
            instance.getBytes(tx, skipSignature, skipSecondSignature);

            expect(bytebufferStub.calledOnce).to.be.true;
            expect(bytebufferStub.calledWithNew()).to.be.true;
            expect(bytebufferStub.firstCall.args.length).to.equal(2);
            expect(bytebufferStub.firstCall.args[0]).to.equal(1 + 4 + 32 + 32 + 8 + 8 + 64 + 64 + assetBytes.length);
            expect(bytebufferStub.firstCall.args[1]).to.equal(true);
        });

        it("bb.writeByte call count", function() {
            instance.getBytes(tx, skipSignature, skipSecondSignature);

            var count = 1;
            count += countSender;
            count += countRequester;
            count += 8;
            count += countAsset;
            count += countSignature;
            count += countSignSignature;

            expect(bb.writeByte.callCount).to.equal(count);
        });

        it("bb.writeByte called on tx.type", function() {
            instance.getBytes(tx, skipSignature, skipSecondSignature);

            expect(bb.writeByte.called).to.be.true;
            expect(bb.writeByte.getCall(0).args.length).to.equal(1);
            expect(bb.writeByte.getCall(0).args[0]).to.equal(tx.type);
        });

        it("bb.writeInt called on tx.timestamp", function() {
            instance.getBytes(tx, skipSignature, skipSecondSignature);

            expect(bb.writeInt.calledOnce).to.be.true;
            expect(bb.writeInt.getCall(0).args.length).to.equal(1);
            expect(bb.writeInt.getCall(0).args[0]).to.equal(tx.timestamp);
        });

        it("bb.writeByte called on senderPublicKey", function() {
            var buffer = Buffer.from(tx.senderPublicKey, "hex");

            instance.getBytes(tx, skipSignature, skipSecondSignature);

            expect(bb.writeByte.called).to.be.true;
            for(var i = 0; i < buffer.length; i++){
                expect(bb.writeByte.getCall(1 + i).args.length).to.equal(1);
                expect(bb.writeByte.getCall(1 + i).args[0]).to.deep.equal(buffer[i]);
            }
        });

        it("bb.writeByte called on requesterPublicKey", function() {
            var buffer = Buffer.from(tx.requesterPublicKey, "hex");

            instance.getBytes(tx, skipSignature, skipSecondSignature);

            expect(bb.writeByte.called).to.be.true;
            for(var i = 0; i < buffer.length; i++){
                expect(bb.writeByte.getCall(1 + countSender + i).args.length).to.equal(1);
                expect(bb.writeByte.getCall(1 + countSender + i).args[0]).to.deep.equal(buffer[i]);
            }
        });

        it("bb.writeByte called on recipientId", function() {
            var buffer = new BigNum(tx.recipientId.slice(0, -1)).toBuffer({ size: 8 })

            instance.getBytes(tx, skipSignature, skipSecondSignature);

            expect(bb.writeByte.called).to.be.true;
            for(var i = 0; i < 8; i++){
                expect(bb.writeByte.getCall(1 + countSender + countRequester + i).args.length).to.equal(1);
                expect(bb.writeByte.getCall(1 + countSender + countRequester + i).args[0]).to.deep.equal(buffer[i] || 0);
            }
        });

        it("bb.writeLong called on tx.amount", function() {
            instance.getBytes(tx, skipSignature, skipSecondSignature);

            expect(bb.writeLong.calledOnce).to.be.true;
            expect(bb.writeLong.firstCall.args.length).to.equal(1);
            expect(bb.writeLong.firstCall.args.length).to.equal(1);
            expect(bb.writeLong.firstCall.args[0]).to.equal(tx.amount);
        });

        it("bb.writeByte called on assetBytes", function() {
            var buffer = assetBytes;

            instance.getBytes(tx, skipSignature, skipSecondSignature);

            expect(bb.writeByte.called).to.be.true;
            for(var i = 0; i < buffer.length; i++){
                expect(bb.writeByte.getCall(1 + countSender + countRequester + 8 + i).args.length).to.equal(1);
                expect(bb.writeByte.getCall(1 + countSender + countRequester + 8 + i).args[0]).to.deep.equal(buffer[i]);
            }
        });

        it("bb.writeByte called on signature", function() {
            var buffer = Buffer.from(tx.signature, "hex");

            instance.getBytes(tx, skipSignature, skipSecondSignature);

            expect(bb.writeByte.called).to.be.true;
            for(var i = 0; i < buffer.length; i++){
                expect(bb.writeByte.getCall(1 + countSender + countRequester + 8 + assetBytes.length + i).args.length).to.equal(1);
                expect(bb.writeByte.getCall(1 + countSender + countRequester + 8 + assetBytes.length + i).args[0]).to.deep.equal(buffer[i]);
            }
        });

        it("bb.writeByte called on singSignature", function() {
            var buffer = Buffer.from(tx.signSignature, "hex");

            instance.getBytes(tx, skipSignature, skipSecondSignature);

            expect(bb.writeByte.called).to.be.true;
            for(var i = 0; i < buffer.length; i++){
                expect(bb.writeByte.getCall(1 + countSender + countRequester + 8 + assetBytes.length + countSignature + i).args.length).to.equal(1);
                expect(bb.writeByte.getCall(1 + countSender + countRequester + 8 + assetBytes.length + countSignature + i).args[0]).to.deep.equal(buffer[i]);
            }
        });

        it("bb.flip called", function() {
            instance.getBytes(tx, skipSignature, skipSecondSignature);

            expect(bb.flip.calledOnce).to.be.true;
            expect(bb.flip.firstCall.args.length).to.equal(0);
        });

        it("bb.toBuffer called", function() {
            instance.getBytes(tx, skipSignature, skipSecondSignature);

            expect(bb.toBuffer.calledOnce).to.be.true;
        });
    });

    describe("ready", function() {
        var tx;
        var sender;

        var TTInstnace;
        var ready;

        beforeEach(function() {
            tx = {
                type : TransactionType.SEND
            };
            sender = {};
            ready = true;
            sandbox.stub(instance, "assertKnownTransactionType");
            TTInstance = {
                ready : sandbox.stub().returns(ready)
            };
            instance.types[TransactionType.SEND] = TTInstance;

        });

        it("assertKnownTransactionType called", function() {
            instance.ready(tx, sender);

            expect(instance.assertKnownTransactionType.calledOnce).to.be.true;
            expect(instance.assertKnownTransactionType.firstCall.args.length).to.equal(1);
            expect(instance.assertKnownTransactionType.firstCall.args[0]).to.equal(tx);
        });

        it("false if no sender", function() {
            var result = instance.ready(tx);

            expect(result).to.be.false;
        });

        it("transactionTypeInstance.ready called", function() {
            instance.ready(tx, sender);

            expect(TTInstance.ready.calledOnce).to.be.true;
            expect(TTInstance.ready.firstCall.args.length).to.equal(2);
            expect(TTInstance.ready.firstCall.args[0]).to.equal(tx);
            expect(TTInstance.ready.firstCall.args[1]).to.equal(sender);
        });

        it("returns transactionTypeInstance.ready", function() {
            var result = instance.ready(tx, sender);

            expect(result).to.be.true;
        });
    });

    describe("assertKnownTransactionType", function() {
        var tx;

        beforeEach(function() {
            tx = {
                type : TransactionType.SEND
            };
        });

        it("exists", function() {
            instance.types[TransactionType.SEND] = {};
            expect(() => instance.assertKnownTransactionType(tx)).to.not.throw(`Unknown transaction type ${tx.type}`);
        });

        it("not exists", function() {
            expect(() => instance.assertKnownTransactionType(tx)).to.throw(`Unknown transaction type ${tx.type}`);
        });
    });

    describe("countById", function() {
        var tx = {
            id : "id"
        };

        it("scope.db.one called", function(done) {
            var result = { count : 10 };
            scope.db.one.resolves(result);

            instance.countById(tx).then(function() {
                expect(scope.db.one.calledOnce).to.be.true;
                expect(scope.db.one.firstCall.args.length).to.equal(2);
                expect(scope.db.one.firstCall.args[0]).to.equal(sql.countById);
                expect(scope.db.one.firstCall.args[1]).to.deep.equal({ id : tx.id });
                done();
            }).catch(function(err) {
                done(new Error("Should resolves"));
            });
        });

        it("scope.db.one throws error", function(done) {
            var error = new Error("error");
            scope.db.one.rejects(error);

            instance.countById(tx).then(function() {
                done(new Error("Should rejects"));
            }).catch(function(err) {
                expect(scope.logger.error.calledOnce).to.be.true;
                expect(scope.logger.error.firstCall.args.length).to.equal(1);
                expect(scope.logger.error.firstCall.args[0]).to.equal(error.stack);
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.be.equal('Transaction#countById error');
                done();
            });
        });

        it("check result", function(done) {
            var result = { count : 10 };
            scope.db.one.resolves(result);

            instance.countById(tx).then(function(count) {
                expect(count).to.be.equal(result.count);
                done();
            }).catch(function(err) {
                done(new Error("Should resolves"));
            });
        });
    });

    describe("assertNonConfirmed", function() {
        var tx = {
            id : "id"
        };

        beforeEach(function() {
            sandbox.stub(instance, "countById");
        });

        it("resolves", function(done) {
            instance.countById.resolves(0);
            instance.assertNonConfirmed(tx).then(function() {
                expect(instance.countById.calledOnce).to.be.true;
                expect(instance.countById.firstCall.args.length).to.equal(1);
                expect(instance.countById.firstCall.args[0]).to.equal(tx);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("rejects", function(done) {
            instance.countById.resolves(10);
            instance.assertNonConfirmed(tx).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal(`Transaction is already confirmed ${tx.id}`);
                done();
            });
        });
    });

    describe("checkBalance", function() {
        var number;
        var balanceKey;
        var tx;
        var sender;

        beforeEach(function() {
            number = 100;
            balanceKey = "balance";
            tx = {
                blockId : 200 
            };
            sender = {
                address : "address",
                balance : 200,
                u_balance : 300
            };
        });

        it("check balance; success", function() {
            var result = instance.checkBalance(number, balanceKey, tx, sender);

            expect(result).to.have.property("error");
            expect(result).to.have.property("exceeded");
            expect(result.error).to.be.null;
            expect(result.exceeded).to.be.false;
        });

        it("check balance; exceeded", function() {
            var bal = (new BigNum(sender.balance.toString()) || new BigNum(0)).div(Math.pow(10, 8));
            var error = `Account does not have enough currency: ${sender.address} balance: ${bal}`;
            
            number = 201;
            var result = instance.checkBalance(number, balanceKey, tx, sender);

            expect(result).to.have.property("error");
            expect(result).to.have.property("exceeded");
            expect(result.error).to.be.equal(error);
            expect(result.exceeded).to.be.true;
        });

        it("check u_balance; success", function() {
            balanceKey = "u_balance";
            var result = instance.checkBalance(number, balanceKey, tx, sender);

            expect(result).to.have.property("error");
            expect(result).to.have.property("exceeded");
            expect(result.error).to.be.null;
            expect(result.exceeded).to.be.false;
        });

        it("check u_balance; exceeded", function() {
            balanceKey = "u_balance";
            var bal = (new BigNum(sender.u_balance.toString()) || new BigNum(0)).div(Math.pow(10, 8));
            var error = `Account does not have enough currency: ${sender.address} balance: ${bal}`;
            
            number = 301;
            var result = instance.checkBalance(number, balanceKey, tx, sender);

            expect(result).to.have.property("error");
            expect(result).to.have.property("exceeded");
            expect(result.error).to.be.equal(error);
            expect(result.exceeded).to.be.true;
        });
    });

    describe("process", function() {
        var tx;
        var sender;
        var requster;
        var txId;
        var typeInstance;

        beforeEach(function() {
            tx = {
                id : 1,
                type : TransactionType.SEND
            };
            sender = {
                address : "address"
            };
            requester = {};
            txId = 1;
            typeInstance = {
                process : sandbox.stub().resolves()
            };

            sandbox.stub(instance, "getId").returns(txId);
            sandbox.stub(instance, "assertKnownTransactionType");
            instance.types[TransactionType.SEND] = typeInstance;
        });

        it("assertKnownTransactionType called", function(done) {
            instance.process(tx, sender, requester).then(function() {
                expect(instance.assertKnownTransactionType.calledOnce).to.be.true;
                expect(instance.assertKnownTransactionType.firstCall.args.length).to.equal(1);
                expect(instance.assertKnownTransactionType.firstCall.args[0]).to.equal(tx);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("throws 'missing sender'", function(done) {
            sender = null;
            instance.process(tx, sender, requester).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Missing sender");
                done();
            });
        });

        it("getId called", function(done) {
            instance.process(tx, sender, requester).then(function() {
                expect(instance.getId.calledOnce).to.be.true;
                expect(instance.getId.firstCall.args.length).to.equal(1);
                expect(instance.getId.firstCall.args[0]).to.equal(tx);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("throws 'invalid transaction id'", function(done) {
            instance.getId.returns(null);
            instance.process(tx, sender, requester).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Invalid transaction id");
                done();
            });
        });

        it("type.process called", function(done) {
            instance.process(tx, sender, requester).then(function() {
                expect(typeInstance.process.calledOnce).to.be.true;
                expect(typeInstance.process.firstCall.args.length).to.equal(2);
                expect(typeInstance.process.firstCall.args[0]).to.equal(tx);
                expect(typeInstance.process.firstCall.args[1]).to.equal(sender);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("check result", function(done) {
            instance.process(tx, sender, requester).then(function(newTx) {
                expect(tx).to.equal(newTx);
                expect(tx).to.have.property("senderId");
                expect(tx.senderId).to.be.equal(sender.address);
                done();
            }).catch(function(error) {
                done(error);
            });
        });
    });

    describe("verify", function() {
        var tx;
        var sender;
        var requester;
        var height;

        var typeInstance;
        var fee;
        var balanceCheck;

        before(function() {
            sandbox.stub(Slots, "getSlotNumber");
        });

        beforeEach(function() {
            requester = {
                publicKey : "requesterPublicKey",
                secondSignature : "secondSignature"
            };
            sender = {
                address : "address",
                publicKey : "senderPublicKey",
                secondSignature : "secondSignature",
                multisignatures : [
                    requester.publicKey,
                    "testFirst",
                    "testSecond"
                ]
            };
            tx = {
                type : TransactionType.SEND,
                senderPublicKey : sender.publicKey,
                senderId : sender.address,
                requesterPublicKey : requester.publicKey,
                signature : "signature",
                signSignature : "signature",
                blockId : 124,
                asset : {
                    multisignature : {
                        keysgroup : []
                    }
                },
                signatures : [
                    "checkFirst",
                    "checkSecond"
                ],
                amount : 12,
                fee : 5,
                timestamp : 112341234
            };
            height = 100;

            fee = 5;
            typeInstance = {
                calculateFee : sandbox.stub().returns(fee),
                verify : sandbox.stub().resolves()
            };
            balanceCheck = {
                exceeded : false,
                error : null
            };

            instance.types[TransactionType.SEND] = typeInstance;

            sandbox.stub(instance, "assertKnownTransactionType");
            sandbox.stub(instance, "verifySignature");
            sandbox.stub(instance, "checkBalance");
            sandbox.stub(instance, "assertNonConfirmed");

            instance.verifySignature.withArgs(tx, tx.requesterPublicKey, tx.signature).returns(true);
            instance.verifySignature.withArgs(tx, sender.secondPublicKey, tx.signSignature, true).returns(true);
            instance.verifySignature.withArgs(tx, "testFirst", "checkFirst").returns(true);
            instance.verifySignature.withArgs(tx, "testSecond", "checkSecond").returns(true);
            instance.verifySignature.returns(false);
            instance.checkBalance.returns(balanceCheck);
            instance.assertNonConfirmed.resolves();
            Slots.getSlotNumber.returns(0);
        });

        after(function() {
            Slots.getSlotNumber.restore();
        });

        it("assertKnownTransactionType called", function(done) {
            instance.verify(tx, sender, requester, height).then(function() {
                expect(instance.assertKnownTransactionType.calledOnce).to.be.true;
                expect(instance.assertKnownTransactionType.firstCall.args.length).to.be.equal(1);
                expect(instance.assertKnownTransactionType.firstCall.args[0]).to.be.equal(tx);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("sender is missed", function(done) {
            delete tx.signSignature;
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Missing sender second signature");
                done();
            });
        });

        it("sender second signature missed", function(done) {
            delete tx.requesterPublicKey;
            delete sender.secondSignature;
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Sender does not have a second signature");
                done();
            });
        });

        it("sender second signature is not necessary", function(done) {
            delete sender.secondSignature;
            delete tx.signSignature;
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Missing requester second signature");
                done();
            });
        });

        it("requester second signature missed", function(done) {
            delete requester.secondSignature;
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Requester does not have a second signature");
                done();
            });
        });

        it("requester second signature is not necessary", function(done) {
            delete requester.secondSignature;
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Requester does not have a second signature");
                done();
            });
        });

        it("incorrect sender public key", function(done) {
            tx.senderPublicKey = "xINCORRECTx";
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal(`Invalid sender public key: ${tx.senderPublicKey} expected ${sender.publicKey}`);
                done();
            });
        });

        it("unable to send from genesis account", function(done) {
            instance.scope.genesisblock.generatorPublicKey = sender.publicKey;
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Invalid sender. Can not send from genesis account");
                done();
            });
        });

        it("invalid sender address", function(done) {
            tx.senderId = "xINCORRECTx";
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Invalid sender address");
                done();
            });
        });

        it("invalid member in keygroup", function(done) {
            sender.multisignatures = [];
            tx.asset.multisignature.keysgroup.push(0);
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Invalid member in keysgroup");
                done();
            });
        });

        it("account does not belong to signature group", function(done) {
            sender.multisignatures = [];
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Account does not belong to multisignature group");
                done();
            });
        });

        it("signature verification has failed", function(done) {
            instance.verifySignature.withArgs(tx, tx.requesterPublicKey, tx.signature).returns(false);
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(instance.verifySignature.calledOnce).to.be.true;
                expect(instance.verifySignature.firstCall.args.length).to.be.equal(3);
                expect(instance.verifySignature.firstCall.args[0]).to.be.equal(tx);
                expect(instance.verifySignature.firstCall.args[1]).to.be.equal(tx.requesterPublicKey);
                expect(instance.verifySignature.firstCall.args[2]).to.be.equal(tx.signature);
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Failed to verify signature");
                done();
            });
        });

        it("second signature verification has failed", function(done) {
            instance.verifySignature.withArgs(tx, sender.secondPublicKey, tx.signSignature).returns(false);
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(instance.verifySignature.calledTwice).to.be.true;
                expect(instance.verifySignature.secondCall.args.length).to.be.equal(4);
                expect(instance.verifySignature.secondCall.args[0]).to.be.equal(tx);
                expect(instance.verifySignature.secondCall.args[1]).to.be.equal(sender.secondPublicKey);
                expect(instance.verifySignature.secondCall.args[2]).to.be.equal(tx.signSignature);
                expect(instance.verifySignature.secondCall.args[3]).to.be.equal(true);
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Failed to verify second signature");
                done();
            });
        });

        it("duplicate in transaction", function(done) {
            tx.signatures.push(tx.signatures[0]);
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Encountered duplicate signature in transaction");
                done();
            });
        });

        it("failed to verify multisignature", function(done) {
            instance.verifySignature.withArgs(tx, "testFirst", "checkFirst").returns(false);
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Failed to verify multisignature");
                done();
            });
        });

        it("types.calculateFee called", function(done) {
            instance.verify(tx, sender, requester, height).then(function() {
                expect(typeInstance.calculateFee.calledOnce).to.be.true;
                expect(typeInstance.calculateFee.firstCall.args.length).to.be.equal(3);
                expect(typeInstance.calculateFee.firstCall.args[0]).to.be.equal(tx);
                expect(typeInstance.calculateFee.firstCall.args[1]).to.be.equal(sender);
                expect(typeInstance.calculateFee.firstCall.args[2]).to.be.equal(height);
                done();
            }).catch(function(error) {
                done(error);
            });
        });
        
        it("invalid transaction fee", function(done) {
            tx.fee = 9;
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Invalid transaction fee");
                done();
            });
        });

        it("invalid transaction amount", function(done) {
            tx.amount = -1;
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Invalid transaction amount");
                done();
            });
        });

        it("checkBalance called", function(done) {
            var amount = new BigNum(tx.amount.toString()).plus(tx.fee.toString());
            instance.verify(tx, sender, requester, height).then(function() {
                expect(instance.checkBalance.calledOnce).to.be.true;
                expect(instance.checkBalance.firstCall.args.length).to.be.equal(4);
                expect(instance.checkBalance.firstCall.args[0]).to.be.deep.equal(amount);
                expect(instance.checkBalance.firstCall.args[1]).to.be.deep.equal("balance");
                expect(instance.checkBalance.firstCall.args[2]).to.be.deep.equal(tx);
                expect(instance.checkBalance.firstCall.args[3]).to.be.deep.equal(sender);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("balance exceeded", function(done) {
            balanceCheck.error = "error";
            balanceCheck.exceeded = true;
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal(balanceCheck.error);
                done();
            });
        });

        it("Slots.getSlotNumber called", function(done) {
            instance.verify(tx, sender, requester, height).then(function() {
                expect(Slots.getSlotNumber.calledTwice).to.be.true;
                expect(Slots.getSlotNumber.firstCall.args.length).to.be.equal(1);
                expect(Slots.getSlotNumber.firstCall.args[0]).to.be.equal(tx.timestamp);
                expect(Slots.getSlotNumber.secondCall.args.length).to.be.equal(0);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("invalid timestamp", function(done) {
            Slots.getSlotNumber.onCall(0).returns(10);
            Slots.getSlotNumber.onCall(1).returns(2);
            instance.verify(tx, sender, requester, height).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Invalid transaction timestamp. Timestamp is in the future");
                done();
            });
        });

        it("types.verify called", function(done){
            instance.verify(tx, sender, requester, height).then(function() {
                expect(typeInstance.verify.calledOnce).to.be.true;
                expect(typeInstance.verify.firstCall.args.length).to.be.equal(2);
                expect(typeInstance.verify.firstCall.args[0]).to.be.equal(tx);
                expect(typeInstance.verify.firstCall.args[1]).to.be.equal(sender);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("assertNonConfirmed called", function(done) {
            instance.verify(tx, sender, requester, height).then(function() {
                expect(instance.assertNonConfirmed.calledOnce).to.be.true;
                expect(instance.assertNonConfirmed.firstCall.args.length).to.be.equal(1);
                expect(instance.assertNonConfirmed.firstCall.args[0]).to.be.equal(tx);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("success", function(done) {
            instance.verify(tx, sender, requester, height).then(function(result) {
                expect(result).to.be.undefined;
                done();
            }).catch(function(error) {
                done(error);
            });
        });
    });

    describe("verifySignature", function() {
        var tx;
        var publicKey;
        var signature;
        var secondSignature;

        var hash;
        var expectedResult;

        beforeEach(function() {
            tx = {};
            publicKey = "1a2b";
            signature = "3c4d";
            secondSignature = true;
            expectedResult = {};
            hash = {};

            sandbox.stub(instance, "assertKnownTransactionType");
            sandbox.stub(instance, "getHash").returns(hash);
            instance.scope.ed.verify.returns(expectedResult);
        });

        it("assertKnownTransactionType called", function() {
            instance.verifySignature(tx, publicKey, signature, secondSignature);

            expect(instance.assertKnownTransactionType.calledOnce).to.be.true;
            expect(instance.assertKnownTransactionType.firstCall.args.length).to.be.equal(1);
            expect(instance.assertKnownTransactionType.firstCall.args[0]).to.be.equal(tx);
        });

        it("signature is not set", function() {
            signature = null;
            var result = instance.verifySignature(tx, publicKey, signature, secondSignature);
            expect(result).to.be.false;
        });

        it("getHash called", function() {
            instance.verifySignature(tx, publicKey, signature, secondSignature);

            expect(instance.getHash.calledOnce).to.be.true;
            expect(instance.getHash.firstCall.args.length).to.be.equal(3);
            expect(instance.getHash.firstCall.args[0]).to.be.equal(tx);
            expect(instance.getHash.firstCall.args[1]).to.be.equal(!secondSignature);
            expect(instance.getHash.firstCall.args[2]).to.be.equal(true);
        });

        it("scope.ed.verify called", function() {
            instance.verifySignature(tx, publicKey, signature, secondSignature);

            expect(instance.scope.ed.verify.calledOnce).to.be.true;
            expect(instance.scope.ed.verify.firstCall.args.length).to.be.equal(3);
            expect(instance.scope.ed.verify.firstCall.args[0]).to.be.equal(hash);
            expect(instance.scope.ed.verify.firstCall.args[1]).to.be.deep.equal(Buffer.from(signature, 'hex'));
            expect(instance.scope.ed.verify.firstCall.args[2]).to.be.deep.equal(Buffer.from(publicKey, 'hex'));
        });

        it("compare return", function() {
            var result = instance.verifySignature(tx, publicKey, signature, secondSignature);
            expect(result).to.be.equal(expectedResult);
        });
    });

    describe("apply", function() {
        var tx;
        var block;
        var sender;

        var balanceCheck;
        var amountNumber;
        var round;
        var typeInstance;

        beforeEach(function() {
            tx = {
                type : TransactionType.SEND,
                amount : 200,
                fee : 2
            };
            block = {
                id : "id",
                height : 1200
            };
            sender = {
                address : "address"
            };

            balanceCheck = {
                exceeded : false,
                error : null
            };
            amountNumber = new BigNum(tx.amount.toString()).plus(tx.fee.toString());
            round = {};
            typeInstance = {
                apply : sandbox.stub().resolves()
            };

            sandbox.stub(instance, "ready").returns(true);
            sandbox.stub(instance, "checkBalance").returns(balanceCheck);
            modules.rounds.calcRound.returns(round);
            scope.account.merge.resolves();

            instance.types[TransactionType.SEND] = typeInstance;
        });

        it("ready called", function(done) {
            instance.apply(tx, block, sender).then(function() {
                expect(instance.ready.calledOnce).to.be.true;
                expect(instance.ready.firstCall.args.length).to.be.equal(2);
                expect(instance.ready.firstCall.args[0]).to.be.equal(tx);
                expect(instance.ready.firstCall.args[1]).to.be.equal(sender);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("throws 'Transaction is not ready'", function(done) {
            instance.ready.returns(false);
            instance.apply(tx, block, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Transaction is not ready");
                done();
            });
        });

        it("checkBalance called", function(done) {
            instance.apply(tx, block, sender).then(function() {
                expect(instance.checkBalance.calledOnce).to.be.true;
                expect(instance.checkBalance.firstCall.args.length).to.be.equal(4);
                expect(instance.checkBalance.firstCall.args[0]).to.be.deep.equal(amountNumber);
                expect(instance.checkBalance.firstCall.args[1]).to.be.equal("balance");
                expect(instance.checkBalance.firstCall.args[2]).to.be.equal(tx);
                expect(instance.checkBalance.firstCall.args[3]).to.be.equal(sender);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("checkBalance throws error", function(done) {
            balanceCheck.exceeded = true;
            balanceCheck.error = "error";
            instance.apply(tx, block, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal(balanceCheck.error);
                done();
            });
        });

        it("modules.rounds.calcRound called 1", function(done) {
            instance.apply(tx, block, sender).then(function() {
                expect(modules.rounds.calcRound.calledTwice).to.be.true;
                expect(modules.rounds.calcRound.firstCall.args.length).to.be.equal(1);
                expect(modules.rounds.calcRound.firstCall.args[0]).to.be.equal(block.height);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("scope.logger.trace called", function(done) {
            instance.apply(tx, block, sender).then(function() {
                expect(scope.logger.trace.calledOnce).to.be.true;
                expect(scope.logger.trace.firstCall.args.length).to.be.equal(2);
                expect(scope.logger.trace.firstCall.args[0]).to.be.equal("Logic/Transaction->apply");
                expect(scope.logger.trace.firstCall.args[1]).to.be.deep.equal({
                    balance : -amountNumber.toNumber(),
                    blockId : block.id,
                    round : round,
                    sender : sender.address
                });
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("modules.rounds.calcRound called 2", function(done) {
            instance.apply(tx, block, sender).then(function() {
                expect(modules.rounds.calcRound.calledTwice).to.be.true;
                expect(modules.rounds.calcRound.secondCall.args.length).to.be.equal(1);
                expect(modules.rounds.calcRound.secondCall.args[0]).to.be.equal(block.height);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("scope.account.merge called", function(done) {
            instance.apply(tx, block, sender).then(function() {
                expect(scope.account.merge.calledOnce).to.be.true;
                expect(scope.account.merge.firstCall.args.length).to.be.equal(3);
                expect(scope.account.merge.firstCall.args[0]).to.be.equal(sender.address);
                expect(scope.account.merge.firstCall.args[1]).to.be.deep.equal({
                    balance : -amountNumber.toNumber(),
                    blockId : block.id,
                    round : round
                });
                expect(scope.account.merge.firstCall.args[2]).to.be.a("function");
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("typeInstance.apply called", function(done) {
            instance.apply(tx, block, sender).then(function() {
                expect(typeInstance.apply.calledOnce).to.be.true;
                expect(typeInstance.apply.firstCall.args.length).to.be.equal(3);
                expect(typeInstance.apply.firstCall.args[0]).to.be.equal(tx);
                expect(typeInstance.apply.firstCall.args[1]).to.be.equal(block);
                expect(typeInstance.apply.firstCall.args[2]).to.be.equal(sender);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("apply failed; modules.rounds.calcRound called 3", function(done) {
            var error = new Error("error");
            typeInstance.apply.rejects(error);
            instance.apply(tx, block, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(modules.rounds.calcRound.calledThrice).to.be.true;
                expect(modules.rounds.calcRound.thirdCall.args.length).to.be.equal(1);
                expect(modules.rounds.calcRound.thirdCall.args[0]).to.be.equal(block.height);
                done();
            });
        });

        it("apply failed; scope.account.merge called second time", function(done) {
            var error = new Error("error");
            typeInstance.apply.rejects(error);
            instance.apply(tx, block, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(scope.account.merge.calledTwice).to.be.true;
                expect(scope.account.merge.secondCall.args.length).to.be.equal(3);
                expect(scope.account.merge.secondCall.args[0]).to.be.equal(sender.address);
                expect(scope.account.merge.secondCall.args[1]).to.be.deep.equal({
                    balance : amountNumber.toNumber(),
                    blockId : block.id,
                    round : round
                });
                expect(scope.account.merge.firstCall.args[2]).to.be.a("function");
                done();
            });
        });

        it("apply failed; check error", function(done) {
            var error = new Error("error");
            typeInstance.apply.rejects(error);
            instance.apply(tx, block, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error).to.be.equal(error);
                done();
            });
        });
    });
});
