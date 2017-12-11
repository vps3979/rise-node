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
var TransactionLogic = TransactionModule.TransactionLogic;

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
            db : {},
            ed : {
                sign : sandbox.stub()
            },
            schema : {},
            genesisblock : {},
            account : {},
            logger : {}
        };
        modules = {
            rounds : {}
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
});


