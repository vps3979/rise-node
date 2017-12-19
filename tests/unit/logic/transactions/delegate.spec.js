var chai = require("chai");
var expect = chai.expect;
var sinon = require("sinon");
var rewire = require("rewire");
var path = require("path");

var rootDir = path.join(__dirname, "../../../src");

var DelegateModule = rewire(path.join(rootDir, "logic/transactions/delegate"));
var Delegate = DelegateModule.RegisterDelegateTransaction;
var constants = require(path.join(rootDir, "helpers/constants"));
var system = {};
var trs;

describe("logic/delegate", function() {
    var instance;
    var callback;
    var clock;
    var schema;
    var accounts;

    before(function() {
        schema = { 
            validate : sinon.stub(),
            getLastErrors : sinon.stub()
        };
    });

    beforeEach(function() {
        accounts = {
            getAccount : sinon.stub(),
            setAccountAndGet : sinon.stub()
        };
        trs = {
            asset: {
                delegate: {
                    username: "carbonara"
                }
            }
        };
        callback = sinon.stub();
        instance = new Delegate({schema});
    });
    afterEach(function() {
        schema.validate.reset();
        accounts.getAccount.reset();
        accounts.setAccountAndGet.reset();
    });

    describe("constructor", function() {
        it("should be a function", function() {
            expect(Delegate).to.be.a("function");
        });

        it("should be an instance of Delegate", function() {
            expect(instance).to.be.an.instanceOf(Delegate);
        });
    });

    describe("bind", function() {
        it("binds correct modules", function() {
            instance.bind(accounts, system);

            expect(instance.modules).to.be.deep.equal({
                accounts: accounts,
                system: system
            });
        });
    });

    describe("calculateFee", function() {
        it("calls getFees", function() {
            instance.bind(accounts, system);
            instance.modules.system = { getFees: function() {} };
            var getFees = sinon.stub(instance.modules.system, "getFees").returns({
                fees: {
                    delegate: 1
                }
            });

            instance.calculateFee(null, null, 1);

            expect(getFees.calledOnce).to.be.true;
            expect(getFees.args.length).to.equal(1);
            expect(getFees.getCall(0).args[0]).to.equal(1);

            getFees.restore();
        });
    });

    describe("verify", function() {
        var sender;

        beforeEach(function() {
            sender = {
                isDelegate: false
            };
            trs = {
                amount: 0,
                asset: {
                    delegate: {
                        username: "carbonara"
                    }
                }
            };
        });

        it("Error invalid recipient", function(done) {
            instance.verify({recipientId: "1"}, null).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.equal("Invalid recipient");
                done();
            });
        });

        it("Error invalid recipient", function(done) {
            instance.verify({amount: 1},null).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.equal("Invalid transaction amount");
                done();
            });
        });

        it("Error invalid recipient", function(done) {
            instance.verify({amount: 1},null).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Invalid transaction amount");
                done();
            });
        });

        it("Error Account is already a delegate", function(done) {
            sender.isDelegate = true;
            instance.verify(trs, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Account is already a delegate");
                done();
            });
        });

        it("Error Invalid transaction asset", function(done) {
            delete trs.asset;
            instance.verify(trs, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Invalid transaction asset");
                done();
            });
        });

        it("Error Invalid transaction asset", function(done) {
            trs.asset = {};
            instance.verify(trs, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Invalid transaction asset");
                done();
            });
        });


        it("Error Username is undefined", function(done) {
            trs.asset.delegate.username = undefined;
            instance.verify(trs, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Username is undefined");
                done();
            });
        });

        it("Error Username must be lowercase", function(done) {
            trs.asset.delegate.username = "CARBONARA";
            instance.verify(trs, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Username must be lowercase");
                done();
            });
        });

        it("Error Empty username", function(done) {
            trs.asset.delegate.username = " ";
            instance.verify(trs, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Empty username");
                done();
            });
        });

        it("Error Empty username", function(done) {
            trs.asset.delegate.username =
                "carbonaracarbonaracarbonaracarbonaracarbonaracarbonaracarbonara";
            instance.verify(trs, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Username is too long. Maximum is 20 characters");
                done();
            });
        });

        it("Error Username can not be a potential address", function(done) {
            schema.validate.returns(true);
            trs.asset.delegate.username = "1234444r";
            instance.verify(trs, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Username can not be a potential address");
                done();
            });
        });

        it("Error Username can only contain alphanumeric characters with the exception of !@$&_.", function(
            done
        ) {
            schema.validate.returns(false);
            trs.asset.delegate.username = "carßonara";
            instance.verify(trs, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Username can only contain alphanumeric characters with the exception of !@$&_.");
                done();
            });
        });

        it("Error from getAccount", function(done) {
            schema.validate.onFirstCall().returns(false);
            schema.validate.onSecondCall().returns(true);
            accounts.getAccount.rejects(new Error("Error message"));

            instance.bind(accounts, system);
            instance.verify(trs, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal("Error message");
                done();
            });
        });

        it("Error Username already exists", function(done) {
            schema.validate.onFirstCall().returns(false);
            schema.validate.onSecondCall().returns(true);
            accounts.getAccount.resolves("Username");

            instance.bind(accounts, system);
            instance.verify(trs, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.be.equal(`Username already exists: ${trs.asset.delegate.username}`);
                done();
            });
        });

        it("success", function(done) {
            schema.validate.onFirstCall().returns(false);
            schema.validate.onSecondCall().returns(true);
            accounts.getAccount.resolves(null);

            instance.bind(accounts, system);
            instance.verify(trs, sender).then(function(response) {
                expect(response).to.be.undefined;
                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
        });
    });

    describe("getBytes", function() {
        it("returns null with no username", function(done) {
            trs.asset.delegate.username = false;
            var retVall = instance.getBytes(trs);

            expect(retVall).to.equal(null);

            done();
        });

        it("catches the error", function(done) {
            var Buffer = DelegateModule.__get__("Buffer");
            var from = sinon.stub(Buffer, "from").callsFake(function() {
                throw new Error("Error");
            });

            var throwError = function() {
                instance.getBytes(trs);
            };

            expect(throwError).to.throw("Error");
            DelegateModule.__get__("Buffer").from.restore();

            from.restore();
            done();
        });

        it("success", function(done) {
            var Buffer = DelegateModule.__get__("Buffer");
            var from = sinon.stub(Buffer, "from").returns(1);

            DelegateModule.__set__("Buffer", Buffer);

            var retval = instance.getBytes(trs);

            expect(retval).to.equal(1);
            DelegateModule.__get__("Buffer").from.restore();

            from.restore();
            done();
        });
    });

    describe("apply", function() {
        var sender = {
            address: "12929291r"
        };

        it("calls setAccountAndGet without username", function(done) {
            accounts.setAccountAndGet.resolves();
            var expectedData = {
                address: "12929291r",
                isDelegate: 1,
                u_isDelegate: 0,
                vote: 0
            };
            trs.asset.delegate.username = false;
            instance.bind(accounts, system);
            instance.apply(trs, null, sender).then(function(result) {
                expect(accounts.setAccountAndGet.calledOnce).to.be.true;
                expect(accounts.setAccountAndGet.getCall(0).args.length).to.equal(1);
                expect(accounts.setAccountAndGet.getCall(0).args[0]).to.deep.equal(expectedData);
                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
        });

        it("calls setAccountAndGet with username", function(done) {
            accounts.setAccountAndGet.resolves();
            trs.asset.delegate.username = "carbonara";
            var expectedData = {
                address: "12929291r",
                isDelegate: 1,
                u_isDelegate: 0,
                u_username: "carbonara",
                username: null,
                vote: 0
            };
            instance.bind(accounts, system);
            instance.apply(trs, null, sender).then(function() {
                expect(accounts.setAccountAndGet.calledOnce).to.be.true;
                expect(accounts.setAccountAndGet.getCall(0).args.length).to.equal(1);
                expect(accounts.setAccountAndGet.getCall(0).args[0]).to.deep.equal(expectedData);
                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
        });
    });

    describe("undo", function() {
        var sender = {
            address: "12929291r"
        };
        var modules, setAccountAndGet, expectedData;

        beforeEach(function() {
            expectedData = {
                address: "12929291r",
                isDelegate: 0,
                u_isDelegate: 1,
                vote: 0
            };
            instance.bind(accounts, system);
            accounts.setAccountAndGet.resolves();
        });

        it("calls setAccountAndGet without nameexist and without username", function(done) {
            sender.nameexist = false;
            trs.asset.delegate.username = null;

            instance.undo(trs, null, sender).then(function() {
                expect(accounts.setAccountAndGet.calledOnce).to.be.true;
                expect(accounts.setAccountAndGet.getCall(0).args.length).to.equal(1);
                expect(accounts.setAccountAndGet.getCall(0).args[0]).to.deep.equal(expectedData);
                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
        });

        it("calls setAccountAndGet without nameexist and with username", function(done) {
            sender.nameexist = false;
            trs.asset.delegate.username = "carbonara";

            expectedData.username = null;
            expectedData.u_username = trs.asset.delegate.username;

            instance.undo(trs, null, sender).then(function() {
                expect(accounts.setAccountAndGet.calledOnce).to.be.true;
                expect(accounts.setAccountAndGet.getCall(0).args.length).to.equal(1);
                expect(accounts.setAccountAndGet.getCall(0).args[0]).to.deep.equal(expectedData);
                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
        });

        it("calls setAccountAndGet with nameexist and without username", function(done) {
            sender.nameexist = true;
            trs.asset.delegate.username = null;

            instance.undo(trs, null, sender).then(function() {
                expect(accounts.setAccountAndGet.calledOnce).to.be.true;
                expect(accounts.setAccountAndGet.getCall(0).args.length).to.equal(1);
                expect(accounts.setAccountAndGet.getCall(0).args[0]).to.deep.equal(expectedData);
                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
        });

        it("calls setAccountAndGet with nameexist and with username", function(done) {
            sender.nameexist = true;
            trs.asset.delegate.username = "carbonara";

            instance.undo(trs, null, sender).then(function() {
                expect(accounts.setAccountAndGet.calledOnce).to.be.true;
                expect(accounts.setAccountAndGet.getCall(0).args.length).to.equal(1);
                expect(accounts.setAccountAndGet.getCall(0).args[0]).to.deep.equal(expectedData);
                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
        });
    });

    describe("applyUnconfirmed", function() {
        var sender = {
            address: "12929291r"
        };
        var modules, setAccountAndGet, expectedData;

        beforeEach(function() {
            sender.nameexist = false;
            expectedData = {
                address: "12929291r",
                isDelegate: 0,
                u_isDelegate: 1
            };
            accounts.setAccountAndGet.resolves();
        });

        it("calls setAccountAndGet without username", function(done) {
            trs.asset.delegate.username = false;

            instance.bind(accounts, system);
            instance.applyUnconfirmed(trs, sender).then(function() {
                expect(accounts.setAccountAndGet.calledOnce).to.be.true;
                expect(accounts.setAccountAndGet.getCall(0).args.length).to.equal(1);
                expect(accounts.setAccountAndGet.getCall(0).args[0]).to.deep.equal(expectedData);
                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
        });

        it("calls setAccountAndGet with username", function(done) {
            trs.asset.delegate.username = "carbonara";
            expectedData.username = null;
            expectedData.u_username = trs.asset.delegate.username;

            instance.bind(accounts, system);
            instance.applyUnconfirmed(trs, sender).then(function() {
                expect(accounts.setAccountAndGet.calledOnce).to.be.true;
                expect(accounts.setAccountAndGet.getCall(0).args.length).to.equal(1);
                expect(accounts.setAccountAndGet.getCall(0).args[0]).to.deep.equal(expectedData);
                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
        });
    });

    describe("undoUnconfirmed", function() {
        var sender = {
            address: "12929291r"
        };
        var modules, expectedData;

        beforeEach(function() {
            expectedData = {
                address: "12929291r",
                isDelegate: 0,
                u_isDelegate: 0
            };
            accounts.setAccountAndGet.resolves();
        });


        it("calls setAccountAndGet without username", function(done) {
            trs.asset.delegate.username = false;

            instance.bind(accounts, system);
            instance.undoUnconfirmed(trs, sender).then(function() {
                expect(accounts.setAccountAndGet.calledOnce).to.be.true;
                expect(accounts.setAccountAndGet.getCall(0).args.length).to.equal(1);
                expect(accounts.setAccountAndGet.getCall(0).args[0]).to.deep.equal(expectedData);
                done();
            }).catch(function(error) {
                console.log("error", error);
                done(new Error("Should be resolved"));
            });
        });

        it("calls setAccountAndGet with username", function(done) {
            trs.asset.delegate.username = "carbonara";

            expectedData.username = null;
            expectedData.u_username = null;

            instance.bind(accounts, system);
            instance.undoUnconfirmed(trs, sender).then(function() {
                done();
            }).catch(function(error) {
                console.log("error", error);
                done(new Error("Should be resolved"));
            });
        });
    });

    describe("objectNormalize", function() {
        beforeEach(function() {
            trs.asset.delegate.username = "carbonara";
        });

        it("throws error", function() {
            schema.validate.returns(false);
            schema.getLastErrors.returns([new Error("Error")]);

            expect(() => { instance.objectNormalize(trs); }).to.throw();
        });

        it("success", function() {
            schema.validate.returns(true);

            expect(instance.objectNormalize(trs)).to.deep.equal(trs);

            expect(schema.validate.calledOnce).to.be.true;
            expect(schema.validate.getCall(0).args.length).to.equal(2);
            expect(schema.validate.getCall(0).args[0]).to.deep.equal({
                username: "carbonara"
            });
        });
    });

    describe("dbRead", function() {
        it("returns null with no username", function(done) {
            var raw = {
                t_senderPublicKey: "0123",
                t_senderId: "0123"
            };

            var retVal = instance.dbRead(raw);

            expect(retVal).to.equal(null);

            done();
        });

        it("success", function(done) {
            var raw = {
                d_username: "carbonara",
                t_senderPublicKey: "0123",
                t_senderId: "0123"
            };
            var expectedResult = {
                delegate: {
                    address: "0123",
                    publicKey: "0123",
                    username: "carbonara"
                }
            };

            var retVal = instance.dbRead(raw);

            expect(retVal).to.deep.equal(expectedResult);

            done();
        });
    });

    describe("dbTable", function() {
        it("correct table", function(done) {
            expect(instance.dbTable).to.equal("delegates");

            done();
        });
    });

    describe("dbFields", function() {
        it("correct fields", function(done) {
            var expectedFields = ["username", "transactionId"];

            expect(instance.dbFields).to.deep.equal(expectedFields);

            done();
        });
    });

    describe("dbSave", function() {
        it("returns correct value", function(done) {
            var context = {
                dbTable: "delegates",
                dbFields: ["username", "transactionId"]
            };
            var expectedObj = {
                table: context.dbTable,
                fields: context.dbFields,
                values: {
                    username: trs.asset.delegate.username,
                    transactionId: trs.id
                }
            };

            var retVal = instance.dbSave.call(context, trs);

            expect(retVal).to.deep.equal(expectedObj);

            done();
        });
    });

    describe("ready", function() {
        it("returns null", function(done) {
            var retVal = instance.ready(trs, {});

            expect(retVal).to.deep.equal(true);

            done();
        });

        it("returns false with no signatures", function(done) {
            var sender = {
                multisignatures: [1]
            };
            var retVal = instance.ready(trs, sender);

            expect(retVal).to.equal(false);

            done();
        });

        it("returns ready when signatures < multimin", function(done) {
            var sender = {
                multisignatures: [1],
                multimin: 2
            };
            trs.signatures = [1, 2, 3];
            var retVal = instance.ready(trs, sender);

            expect(retVal).to.equal(true);

            done();
        });

        it("returns not ready when signatures > multimin", function(done) {
            var sender = {
                multisignatures: [1],
                multimin: 10
            };
            trs.signatures = [1, 2, 3];
            var retVal = instance.ready(trs, sender);

            expect(retVal).to.equal(false);

            done();
        });
    });
});
