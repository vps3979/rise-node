'use strict';

const chai                = require("chai");
const chaiAsPromised      = require("chai-as-promised");
chai.use(chaiAsPromised);
const expect              = chai.expect;
const sinon               = require("sinon");
const path                = require("path");
const rootDir             = path.join(__dirname, "../../../..");

const SendTransaction     = require(path.join(rootDir, "src/logic/transactions/send")).SendTransaction;
const BaseTransactionType = require(path.join(rootDir, "src/logic/transactions/baseTransactionType")).BaseTransactionType;

describe("logic/transactions/send", () => {
    const sandbox = sinon.sandbox.create({
        injectInto: null,
        properties: ["spy", "stub", "clock"],
        useFakeTimers: true,
        useFakeServer: false
    });

    let instance;
    let modules;

    beforeEach(() => {
        modules = {
            accounts : {
                setAccountAndGet  : sandbox.stub(),
                mergeAccountAndGet: sandbox.stub()
            },
            rounds : {
                calcRound: sandbox.stub()
            },
            system : {
                getFees: sandbox.stub()
            }
        };

        instance = new SendTransaction();
        instance.bind(modules.accounts, modules.rounds, modules.system);
    });

    describe("constructor", () => {
        it("should be a function", () => {
            expect(SendTransaction).to.be.a("function");
        });

        it("should be instance of SendTransaction", () => {
            expect(instance).to.be.instanceof(SendTransaction);
        });

        it("should be instance of SendTransaction", () => {
            expect(instance).to.be.instanceof(BaseTransactionType);
        });
    });

    describe("bind", () => {
        it("modules are correctly set up", () => {
            expect(instance.modules).to.have.property("accounts");
            expect(instance.modules).to.have.property("rounds");
            expect(instance.modules).to.have.property("system");

            expect(instance.modules.accounts).to.be.equal(modules.accounts);
            expect(instance.modules.rounds).to.be.equal(modules.rounds);
            expect(instance.modules.system).to.be.equal(modules.system);
        });
    });

    describe("calculateFee", () => {
        it("calls getFees", () => {
            let height = "height";
            let fee = { fees : { send : 10 } };
            modules.system.getFees.returns(fee);

            const result = instance.calculateFee({}, {}, height);

            expect(modules.system.getFees.calledOnce).to.be.true;
            expect(modules.system.getFees.firstCall.args.length).to.equal(1);
            expect(modules.system.getFees.firstCall.args[0]).to.equal(height);

            expect(result).to.be.equal(fee.fees.send);
        });
    });

    describe("verify", () => {
        const tx = {
            recipientId : "id"
        };
        const sender;

        it("throws Missing recipient when !tx.recipientId", (done) => {
            expect(instance.verify({}, sender)).to.be.rejectedWith('Missing recipient').notify(done);
        });

        it("throws Invalid transaction amount when tx.amount <= 0", (done) => {
            tx.amount = 0;
            expect(instance.verify(tx, sender)).to.be.rejectedWith('Invalid transaction amount').notify(done);
        });
        it("executes successfully", (done) => {
            tx.amount = 100;
            expect(instance.verify(tx, sender)).to.be.fulfilled.notify(done);
        });
    });

    describe("apply", () => {
        let tx;
        let block;
        let sender;
        let round;

        beforeEach(() => {
            tx = {
                recipientId : "id",
                amount : 100
            };
            block = {
                id : "someId",
                height : "height"
            };
            sender = {};
            round = {};

            modules.accounts.setAccountAndGet.resolves();
            modules.accounts.mergeAccountAndGet.resolves();
            modules.rounds.calcRound.returns(round);
        });

        it("setAccountAndGet is called and throws error", (done) => {
            const error = new Error("error");
            modules.accounts.setAccountAndGet.rejects(error);

            expect(instance.apply(tx, block, sender)).to.be.rejectedWith(error).notify(done);
        });

        it("setAccountAndGet is called and executes successfully", (done) => {
            instance.apply(tx, block, sender).then(() => {
                expect(modules.accounts.setAccountAndGet.calledOnce).to.be.true;
                expect(modules.accounts.setAccountAndGet.firstCall.args.length).to.equal(1);
                expect(modules.accounts.setAccountAndGet.firstCall.args[0]).to.deep.equal({ address: tx.recipientId });
                done();
            }).catch(done);
        });

        it("mergeAccountAndGet is called and rejected the promise", (done) => {
            const error = new Error("error");
            modules.accounts.mergeAccountAndGet.rejects(error);

            expect(instance.apply(tx, block, sender)).to.be.rejectedWith(error).notify(done);
        });

        it("mergeAccountAndGet is called and executes successfully", (done) => {
            instance.apply(tx, block, sender).then(() => {
                expect(modules.rounds.calcRound.calledOnce).to.be.true;
                expect(modules.rounds.calcRound.firstCall.args.length).to.equal(1);
                expect(modules.rounds.calcRound.firstCall.args[0]).to.equal(block.height);

                expect(modules.accounts.mergeAccountAndGet.calledOnce).to.be.true;
                expect(modules.accounts.mergeAccountAndGet.firstCall.args.length).to.equal(1);
                expect(modules.accounts.mergeAccountAndGet.firstCall.args[0]).to.deep.equal({
                    address  : tx.recipientId,
                    balance  : tx.amount,
                    blockId  : block.id,
                    round    : round,
                    u_balance: tx.amount,
                });
                done();
            }).catch(done);
        });

        it("check result", done => {
            instance.apply(tx, block, sender).then(result => {
                expect(result).to.be.undefined;
                done();
            }).catch(done);
        });
    });

    describe("undo", () => {
        let tx;
        let block;
        let sender;
        let round;

        beforeEach(() => {
            tx = {
                recipientId : "id",
                amount : 100
            };
            block = {
                id : "someId",
                height : "height"
            };
            sender = {};
            round = {};

            modules.accounts.setAccountAndGet.resolves();
            modules.accounts.mergeAccountAndGet.resolves();
            modules.rounds.calcRound.returns(round);
        });

        it("setAccountAndGet is called and throws error", (done) => {
            const error = new Error("error");
            modules.accounts.setAccountAndGet.rejects(error);

            expect(instance.undo(tx, block, sender)).to.be.rejectedWith(error).notify(done);
        });

        it("setAccountAndGet is called and executes successfully", (done) => {
            instance.undo(tx, block, sender).then(() => {
                expect(modules.accounts.setAccountAndGet.calledOnce).to.be.true;
                expect(modules.accounts.setAccountAndGet.firstCall.args.length).to.equal(1);
                expect(modules.accounts.setAccountAndGet.firstCall.args[0]).to.deep.equal({ address: tx.recipientId });
                done();
            }).catch(done);
        });

        it("mergeAccountAndGet is called and rejects the promise", done => {
            const error = new Error("error");
            modules.accounts.mergeAccountAndGet.rejects(error);

            expect(instance.undo(tx, block, sender)).to.be.rejectedWith(error).notify(done);
        });

        it("mergeAccountAndGet is called and executes successfully", (done) => {
            instance.undo(tx, block, sender).then(() => {
                expect(modules.rounds.calcRound.calledOnce).to.be.true;
                expect(modules.rounds.calcRound.firstCall.args.length).to.equal(1);
                expect(modules.rounds.calcRound.firstCall.args[0]).to.equal(block.height);

                expect(modules.accounts.mergeAccountAndGet.calledOnce).to.be.true;
                expect(modules.accounts.mergeAccountAndGet.firstCall.args.length).to.equal(1);
                expect(modules.accounts.mergeAccountAndGet.firstCall.args[0]).to.deep.equal({
                    address  : tx.recipientId,
                    balance  : -tx.amount,
                    blockId  : block.id,
                    round    : round,
                    u_balance: -tx.amount,
                });
                done();
            }).catch(done);
        });

        it("check result", done => {
            instance.undo(tx, block, sender).then(result => {
                expect(result).to.be.undefined;
                done();
            }).catch(done);
        });
    });

    describe("objectNormalize", () => {
        const tx = {};
        it("returns the tx", () => {
            expect(instance.objectNormalize(tx)).to.equal(tx);
        });
    });

    describe("dbRead", () => {
        it("returns null", () => {
            expect(instance.dbRead()).to.deep.equal(null);
        });
    });

    describe("dbSave", () => {
        it("returns null", () => {
            expect(instance.dbSave()).to.deep.equal(null);
        });
    });


});
