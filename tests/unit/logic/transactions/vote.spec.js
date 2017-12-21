const chai = require('chai');
const assertArrays = require('chai-arrays');
chai.use(assertArrays);
const expect = chai.expect;
const sinon = require('sinon');
const path = require("path");
const crypto = require("crypto");
const rootDir = path.join(__dirname, "../../../..");

const VoteModule = require(path.join(rootDir, "src/logic/transactions/vote"));
const Vote = VoteModule.VoteTransaction;
const constants = require(path.join(rootDir, "src/helpers/constants")).default;
const voteSchema = require(path.join(rootDir, "src/schema/logic/transactions/vote")).default;
//var zSchema = require('../../../helpers/z_schema').default;
//var constants = require('../../../helpers/constants').default;
//var Diff = require('../../../helpers/diff');

describe('logic/vote', function () {
    const sandbox = sinon.sandbox.create({
        injectInto: null,
        properties: ["spy", "stub", "clock"],
        useFakeTimers: true,
        useFakeServer: false
    });

    let instance;
    let library;
    let modules;

	beforeEach(() => {
        library = {
            logger : {},
            schema : {
                validate : sandbox.stub(),
                getLastErrors : sandbox.stub()
            },
            account : {
                merge : sandbox.stub()
            }
        };
        modules = {
            delegates : {
                checkUnconfirmedDelegates : sandbox.stub(),
                checkConfirmedDelegates : sandbox.stub()
            },
            rounds : {
                calcRound : sandbox.stub()
            },
            system : {
                getFees : sandbox.stub()
            }
        };

        instance = new Vote(library);
        instance.bind(modules.delegates, modules.rounds, modules.system);
	});

    afterEach(() => {
        sandbox.reset();
    });

    after(() => {
        sandbox.restore();
    });

    describe("constructor", () => {
        it('should be a function', () => {
            expect(Vote).to.be.a('function');
        });

        it("should be instance of Vote", () => {
            expect(instance).to.be.instanceof(Vote);
        });

        it("library should have props", () => {
            expect(instance.library).to.have.property("logger");
            expect(instance.library).to.have.property("schema");
            expect(instance.library).to.have.property("account");

            expect(instance.library.logger).to.be.equal(library.logger);
            expect(instance.library.schema).to.be.equal(library.schema);
            expect(instance.library.account).to.be.equal(library.account);
        });

        it("modules should have props", () => {
            expect(instance.modules).to.have.property("delegates");
            expect(instance.modules).to.have.property("rounds");
            expect(instance.modules).to.have.property("system");

            expect(instance.modules.delegates).to.be.equal(modules.delegates);
            expect(instance.modules.rounds).to.be.equal(modules.rounds);
            expect(instance.modules.system).to.be.equal(modules.system);
        });
    });

    describe("calculateFee()", () => {
        let tx;
        let sender;
        let height;
        let data;

        beforeEach(() => {
            height = 200;
            data = { fees: { vote: 100 } };

            modules.system.getFees.returns(data);
        });

        it("getFees is called", () => {
            instance.calculateFee(tx, sender, height);

            expect(modules.system.getFees.calledOnce).to.be.true;
            expect(modules.system.getFees.firstCall.args.length).to.be.equal(1);
            expect(modules.system.getFees.firstCall.args[0]).to.be.equal(height);
        });

        it("check result", () => {
            const result = instance.calculateFee(tx, sender, height);
            expect(result).to.be.equal(data.fees.vote);
        });
    });

	describe('verify()', () => {
        let tx;
        let sender;
        let result;

		beforeEach(() => {
            tx = {
                recipientId : 13,
                senderId : 13,
                asset : {
                    votes : [1,2]
                }
            };
            result = {};

            sandbox.stub(instance, "assertValidVote");
            sandbox.stub(instance, "checkConfirmedDelegates");

            instance.checkConfirmedDelegates.returns(result);
		});

		it('If recipientId is not equal to senderId', async () => {
            tx.senderId = 12;
            try {
                await instance.verify(tx, sender);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Missing recipient");
            }
		});

		it('if trs.asset is not true', async () => {
            delete tx.asset;
            try {
                await instance.verify(tx, sender);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid transaction asset");
            }
		});

		it('if trs.asset.votes is not true', async () => {
            delete tx.asset.votes;
            try {
                await instance.verify(tx, sender);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid transaction asset");
            }
		});

		it('If trs.asset.votes is not an Array', async () => {
            tx.asset.votes = true;
            try {
                await instance.verify(tx, sender);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid votes. Must be an array");
            }
		});

		it('if trs.asset.votes.length is not true', async () => {
            tx.asset.votes = [];
            try {
                await instance.verify(tx, sender);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid votes. Must not be empty");
            }
		});

		it('if trs.asset.votes is greater than maxVotesPerTransaction', async () => {
            tx.asset.votes = Array(constants.maxVotesPerTransaction + 1);
            try {
                await instance.verify(tx, sender);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal(`Voting limit exceeded. Maximum is ${constants.maxVotesPerTransaction} votes per transaction`);
            }
		});

		it('if there are duplicate votes', async () => {
            tx.asset.votes = [1,1];
            try {
                await instance.verify(tx, sender);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Multiple votes for same delegate are not allowed");
            }
		});

		it('checkConfirmedDelegates is called', async () => {
            await instance.verify(tx, sender);

            expect(instance.checkConfirmedDelegates.calledOnce).to.be.true;
            expect(instance.checkConfirmedDelegates.firstCall.args.length).to.be.equal(1);
            expect(instance.checkConfirmedDelegates.firstCall.args[0]).to.be.equal(tx);
        });

        it("check result", async () => {
            const testedResult = await instance.verify(tx, sender);

            expect(testedResult).to.be.equal(result);
        });
    });

	describe('getBytes()', function () {
        let tx;
        let skipSignature;
        let skipSecondSignature;

		beforeEach(function () {
			tx = {
				asset: {
					votes: [
						'+37b6d3fc89fb418fa5e3799e760cc2b1733a567daebb08a531d3d7e8b24f2d22',
						'+9f59d4260dcd848f71d17824f53df31f3dfb87542042590554419ff40542c55e'
					]
				}
			};
		});

		it('if tx.asset.votes is undefined', function () {
            delete tx.asset.votes;
            
			const result = instance.getBytes(tx);

			expect(result).to.equals(null);
		});

		it('success', function () {
			const result = instance.getBytes(tx);

            expect(result).to.be.instanceof(Buffer);
            expect(result).to.be.deep.equal(Buffer.from(tx.asset.votes.join(''), 'utf8'));
		});
	});

    describe('apply()', () => {
        let tx;
        let block;
        let sender;

        let round;
        let result;

        beforeEach(function () {
            tx = {
                asset : {
                    votes : [1,2]
                }
            };
            block = {
                id : "id",
                height : 200
            };
            sender = {
                address : "address"
            };

            modules.rounds.calcRound.returns(round);
            library.account.merge.returns(result);
            sandbox.stub(instance, "checkConfirmedDelegates");
        });

        it("checkConfirmedDelegates is called", async () => {
            await instance.apply(tx, block, sender);

            expect(instance.checkConfirmedDelegates.calledOnce).to.be.true;
            expect(instance.checkConfirmedDelegates.firstCall.args.length).to.be.equal(1);
            expect(instance.checkConfirmedDelegates.firstCall.args[0]).to.be.equal(tx);
        });

        it("checkConfirmedDelegates throws error", async () => {
            const error = new Error("Error");
            instance.checkConfirmedDelegates.rejects(error);

            try {
                await instance.apply(tx, block, sender);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e).to.be.equal(error);
            }
        });

        it("modules.rounds.calcRound is called", async () => {
            await instance.apply(tx, block, sender);

            expect(modules.rounds.calcRound.calledOnce).to.be.true;
            expect(modules.rounds.calcRound.firstCall.args.length).to.be.equal(1);
            expect(modules.rounds.calcRound.firstCall.args[0]).to.be.equal(block.height);
        });

        it("library.account.merge is called", async () => {
            await instance.apply(tx, block, sender);

            expect(library.account.merge.calledOnce).to.be.true;
            expect(library.account.merge.firstCall.args.length).to.be.equal(3);
            expect(library.account.merge.firstCall.args[0]).to.be.equal(sender.address);
            expect(library.account.merge.firstCall.args[1]).to.be.deep.equal({
                blockId  : block.id,
                delegates: tx.asset.votes,
                round    : round,
            });
            expect(library.account.merge.firstCall.args[2]).to.be.a("function");
        });
    });

    describe('undo()', () => {
        let tx;
        let block;
        let sender;

        let round;
        let result;

        beforeEach(function () {
            tx = {
                asset : {
                    votes : ["+123","+234"]
                }
            };
            block = {
                id : "id",
                height : 200
            };
            sender = {
                address : "address"
            };

            modules.rounds.calcRound.returns(round);
            library.account.merge.returns(result);
            sandbox.stub(instance, "objectNormalize");
        });

        it("objectNormalize is called", async () => {
            await instance.undo(tx, block, sender);

            expect(instance.objectNormalize.calledOnce).to.be.true;
            expect(instance.objectNormalize.firstCall.args.length).to.be.equal(1);
            expect(instance.objectNormalize.firstCall.args[0]).to.be.equal(tx);
        });

        it("modules.rounds.calcRound is called", async () => {
            await instance.undo(tx, block, sender);

            expect(modules.rounds.calcRound.calledOnce).to.be.true;
            expect(modules.rounds.calcRound.firstCall.args.length).to.be.equal(1);
            expect(modules.rounds.calcRound.firstCall.args[0]).to.be.equal(block.height);
        });

        it("library.account.merge is called", async () => {
            await instance.undo(tx, block, sender);

            expect(library.account.merge.calledOnce).to.be.true;
            expect(library.account.merge.firstCall.args.length).to.be.equal(3);
            expect(library.account.merge.firstCall.args[0]).to.be.equal(sender.address);
            expect(library.account.merge.firstCall.args[1]).to.be.deep.equal({
                blockId  : block.id,
                delegates: ["-123","-234"],
                round    : round,
            });
            expect(library.account.merge.firstCall.args[2]).to.be.a("function");
        });
    });

	describe('checkUnconfirmedDelegates()', () => {
        let tx;
        let result;

        beforeEach(() => {
            tx = {
                senderPublicKey : "publicKey",
                asset : {
                    votes : []
                }
            };
            result = {};

            modules.delegates.checkUnconfirmedDelegates.resolves(result);
        });

		it("should call modules.delegates.checkUnconfirmedDelegates", async () => {
            await instance.checkUnconfirmedDelegates(tx);

            expect(modules.delegates.checkUnconfirmedDelegates.calledOnce).to.be.true;
            expect(modules.delegates.checkUnconfirmedDelegates.firstCall.args.length).to.be.equal(2);
            expect(modules.delegates.checkUnconfirmedDelegates.firstCall.args[0]).to.be.equal(tx.senderPublicKey);
            expect(modules.delegates.checkUnconfirmedDelegates.firstCall.args[1]).to.be.equal(tx.asset.votes);
		});

        it("check result", async () => {
            const testedResult = await instance.checkUnconfirmedDelegates(tx);

            expect(testedResult).to.be.equal(result);
        });
	});

	describe('checkConfirmedDelegates()', () => {
        let tx;
        let result;

        beforeEach(() => {
            tx = {
                senderPublicKey : "publicKey",
                asset : {
                    votes : []
                }
            };
            result = {};

            modules.delegates.checkConfirmedDelegates.resolves(result);
        });

		it("should call modules.delegates.checkConfirmedDelegates", async () => {
            await instance.checkConfirmedDelegates(tx);

            expect(modules.delegates.checkConfirmedDelegates.calledOnce).to.be.true;
            expect(modules.delegates.checkConfirmedDelegates.firstCall.args.length).to.be.equal(2);
            expect(modules.delegates.checkConfirmedDelegates.firstCall.args[0]).to.be.equal(tx.senderPublicKey);
            expect(modules.delegates.checkConfirmedDelegates.firstCall.args[1]).to.be.equal(tx.asset.votes);
		});

        it("check result", async () => {
            const testedResult = await instance.checkConfirmedDelegates(tx);

            expect(testedResult).to.be.equal(result);
        });
	});

    describe("applyUnconfirmed()", () => {
        let tx;
        let sender;
        let result;

        beforeEach(() => {
            tx = {
                asset : {
                    votes : []
                }
            };
            sender = {
                address : "address"
            };
            result = {};

            sandbox.stub(instance, "checkUnconfirmedDelegates");

            instance.checkUnconfirmedDelegates.resolves();
            library.account.merge.resolves(result);
        });

        it("checkUnconfirmedDelegates is called", async () => {
            await instance.applyUnconfirmed(tx, sender);

            expect(instance.checkUnconfirmedDelegates.calledOnce).to.be.true;
            expect(instance.checkUnconfirmedDelegates.firstCall.args.length).to.be.equal(1);
            expect(instance.checkUnconfirmedDelegates.firstCall.args[0]).to.be.equal(tx);
        });

        it("library.account.merge is called", async () => {
            await instance.applyUnconfirmed(tx, sender);

            expect(library.account.merge.calledOnce).to.be.true;
            expect(library.account.merge.firstCall.args.length).to.be.equal(3);
            expect(library.account.merge.firstCall.args[0]).to.be.equal(sender.address);
            expect(library.account.merge.firstCall.args[1]).to.be.deep.equal({ u_delegates: tx.asset.votes });
            expect(library.account.merge.firstCall.args[2]).to.be.a("function");
        });

        it("check result", async () => {
            const checkedResult = await instance.applyUnconfirmed(tx, sender);

            expect(result).to.be.equal(checkedResult);
        });
    });

    describe("undoUnconfirmed()", () => {
        let tx;
        let sender;
        let result;

        beforeEach(() => {
            tx = {
                asset : {
                    votes : ["-123", "-234"]
                }
            };
            sender = {
                address : "address"
            };
            result = {};

            sandbox.stub(instance, "objectNormalize");

            library.account.merge.resolves(result);
        });

        it("objectNormalize is called", async () => {
            await instance.undoUnconfirmed(tx, sender);

            expect(instance.objectNormalize.calledOnce).to.be.true;
            expect(instance.objectNormalize.firstCall.args.length).to.be.equal(1);
            expect(instance.objectNormalize.firstCall.args[0]).to.be.equal(tx);
        });

        it("library.account.merge is called", async () => {
            await instance.undoUnconfirmed(tx, sender);

            expect(library.account.merge.calledOnce).to.be.true;
            expect(library.account.merge.firstCall.args.length).to.be.equal(3);
            expect(library.account.merge.firstCall.args[0]).to.be.equal(sender.address);
            expect(library.account.merge.firstCall.args[1]).to.be.deep.equal({ u_delegates: ["+123","+234"] });
            expect(library.account.merge.firstCall.args[2]).to.be.a("function");
        });

        it("check result", async () => {
            const checkedResult = await instance.undoUnconfirmed(tx, sender);

            expect(result).to.be.equal(checkedResult);
        });
    });

	describe('objectNormalize()', () => {
        let tx;

        beforeEach(() => {
            tx = {
                asset : {}
            };
            library.schema.validate.returns(true);
        });

        it("library.schema.validate is called", () => {
            instance.objectNormalize(tx);

            expect(library.schema.validate.calledOnce).to.be.true;
            expect(library.schema.validate.firstCall.args.length).to.be.equal(2);
            expect(library.schema.validate.firstCall.args[0]).to.be.equal(tx.asset);
            expect(library.schema.validate.firstCall.args[1]).to.be.equal(voteSchema);
        });

        it("validation error", () => {
            const errors = [new Error('first'), new Error('second')];
            library.schema.validate.returns(false);
            library.schema.getLastErrors.returns(errors);
            try {
                instance.objectNormalize(tx);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Failed to validate vote schema: first, second");
            }
        });

        it("check result", () => {
            const resultToTest = instance.objectNormalize(tx);

            expect(resultToTest).to.be.equal(tx);
        });
	});

    describe("dbRead()", () => {
        it("v_votes is not set", () => {
            const result = instance.dbRead({});

            expect(result).to.be.equal(null);
        });

        it("v_votes is a string", () => {
            const result = instance.dbRead({ v_votes : "first,second" });

            expect(result).to.be.deep.equal({
                votes : ["first","second"]
            });
        });
    });

    describe("dbSave()", () => {
        let tx;
        beforeEach(() => {
            tx = {
                id : "id",
                asset : {
                    votes : ["+123","-234"]
                }
            };
        });

        it("if votes is array", () => {
            const result = instance.dbSave(tx);

            expect(result).to.be.deep.equal({
                fields: instance.dbFields,
                table : instance.dbTable,
                values: {
                    transactionId: tx.id,
                    votes        : "+123,-234",
                },
            });
        });

        it("if votes is not an array", () => {
            delete tx.asset.votes;

            const result = instance.dbSave(tx);

            expect(result).to.be.deep.equal({
                fields: instance.dbFields,
                table : instance.dbTable,
                values: {
                    transactionId: tx.id,
                    votes        : null,
                },
            });
        });
    });

    describe("assertValidVote()", () => {
        let vote;

        beforeEach(() => {
            vote = "+123";

            library.schema.validate.returns(true);
        });

        it("invalid vote type", () => {
            vote = null;
            expect(() => instance.assertValidVote(vote)).to.throw("Invalid vote type");
        });

        it("invalid vote format", () => {
            vote = "123";
            expect(() => instance.assertValidVote(vote)).to.throw("Invalid vote format");
        });

        it("library.schema.validate should be called", () => {
            instance.assertValidVote(vote);

            expect(library.schema.validate.calledOnce).to.be.true;
            expect(library.schema.validate.firstCall.args.length).to.be.equal(2);
            expect(library.schema.validate.firstCall.args[0]).to.be.equal("123");
            expect(library.schema.validate.firstCall.args[1]).to.be.deep.equal({ format : "publicKey" });
        });

        it("invalid vote public key", () => {
            library.schema.validate.returns(false);
            expect(() => instance.assertValidVote(vote)).to.throw("Invalid vote publicKey");
        });

        it("should not throw error", () => {
            expect(() => instance.assertValidVote(vote)).to.not.throw();
        });
    });
});
