var chai = require("chai");
var expect = chai.expect;
var sinon = require("sinon");
var rewire = require("rewire");
var path = require("path");

var rootDir = path.join(__dirname, "../../..");

var RoundModule = rewire(path.join(rootDir, "src/logic/round"));
var Round = RoundModule.RoundLogic;
var roundSQL = require(path.join(rootDir, "sql/logic/rounds")).default;

describe("logic/round", function() {
	var instance, scope, task;

	beforeEach(function() {
		scope = {
			library: {
				logger: {
					debug: sinon.stub(),
					trace: sinon.stub()
				}
			},
			modules: {
				accounts: {
					mergeAccountAndGet: sinon.stub().resolves(),
					generateAddressByPublicKey: sinon.stub().returns(1),
                    mergeAccountAndGetSQL : sinon.stub()
                }
			},
			block: {
				generatorPublicKey: "carbonara",
				id: "was",
				height: "here"
			},
			round: {},
			backwards: false,

            finishRound : true,

			roundFees: {},
			roundDelegates: [{}],
			roundRewards: {},
			roundOutsiders: ["1", "2", "3"]
		};
		task = {
			none: sinon.stub().resolves(),
			query: sinon.stub().resolves()
		};
		instance = new Round(scope, task);
	});

	describe("constructor", function() {
		it("should be a function", function() {
			expect(Round).to.be.a("function");
		});

		it("finishRound = false; throws error when a property is missed", function() {
            scope.finishRound = false;

			var requiredProperties = [
				"library",
				"modules",
				"block",
				"round",
				"backwards"
			];

			requiredProperties.forEach(function(prop) {
				var newScope = Object.assign({}, scope);
				delete newScope[prop];
				var throwError = function() {
					new Round.RoundLogic(newScope);
				};
				expect(throwError).to.throw();
			});
		});

		it("finishRound = true; throws error when a property is missed", function() {
			var requiredProperties = [
				"library",
				"modules",
				"block",
				"round",
				"backwards",
				"roundFees",
				"roundRewards",
				"roundDelegates",
				"roundOutsiders"
			];

			requiredProperties.forEach(function(prop) {
				var newScope = Object.assign({}, scope);
				delete newScope[prop];
				var throwError = function() {
					new Round.RoundLogic(newScope);
				};
				expect(throwError).to.throw();
			});
		});

		it("success", function() {
			expect(instance.scope).to.deep.equal(scope);
			expect(instance.task).to.deep.equal(task);
		});
	});

	describe("mergeBlockGenerator", function() {
		it("none and mergeAccountAndGet are called", function(done) {
			instance.mergeBlockGenerator().then(function() {
                expect(scope.modules.accounts.mergeAccountAndGet.calledOnce).to.be.true;
                expect(scope.modules.accounts.mergeAccountAndGet.firstCall.args[0]).to.deep.equal({
                    publicKey: scope.block.generatorPublicKey,
                    producedblocks: scope.backwards ? -1 : 1,
                    blockId: scope.block.id,
                    round: scope.round
                });
                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
		});
	});

	describe("updateMissedBlocks", function() {
		it("returns promise", function(done) {
			scope.roundOutsiders = [];

            instance.updateMissedBlocks().then(result => {
                expect(result).to.be.undefined;
                expect(task.none.notCalled).to.be.true;
                done();
            }).catch((error) => {
                done(new Error("Should be resolved"));
            });
        });

		it("returns response from updateMissedBlocks", function(done) {
            var sql = {};
			sinon.stub(roundSQL, "updateMissedBlocks").returns(sql);
			instance.updateMissedBlocks().then(function() {
                expect(roundSQL.updateMissedBlocks.calledOnce).to.equal(true);
                expect(roundSQL.updateMissedBlocks.firstCall.args.length).to.equal(1);
                expect(roundSQL.updateMissedBlocks.firstCall.args[0]).to.deep.equal(scope.backwards);

                expect(task.none.calledOnce).to.equal(true);
                expect(task.none.firstCall.args.length).to.equal(2);
                expect(task.none.firstCall.args[0]).to.equal(sql);
                expect(task.none.firstCall.args[1]).to.deep.equal([scope.roundOutsiders]);
                roundSQL.updateMissedBlocks.restore();
                done();
            }).catch(function(error) {
                roundSQL.updateMissedBlocks.restore();
                done(new Error("Should be resolved"));
            });
		});
	});

	describe("getVotes", function() {
        it("success", function(done) {
            instance.getVotes().then(function() {
                expect(task.query.calledOnce).to.equal(true);
                expect(task.query.firstCall.args.length).to.equal(2);
                expect(task.query.firstCall.args[0]).to.equal(roundSQL.getVotes);
                expect(task.query.firstCall.args[1]).to.deep.equal({ round: scope.round });
                done();
            }).catch(function() {
                done(new Error("Should be resolved"));
            });
        });
	});

	describe("updateVotes", function() {
        var votes;
        var voteQueries;
        var address;
        var pgp;
        var fakePgp;

        before(function() {
            pgp = RoundModule.__get__("pgp");
            fakePgp = {
                as : {
                    format : sinon.stub()
                }
            };
            RoundModule.__set__("pgp", fakePgp);
        });

        beforeEach(function() {
            votes = [{
                delegate : "delegate",
                amount : 321
            },{
                delegate : "delegate",
                amount : 123
            }];
            voteQueries = [
                "query1",
                "query2"
            ];
            address = "address";

            sinon.stub(instance, "getVotes");
            instance.getVotes.resolves(votes);
            scope.modules.accounts.generateAddressByPublicKey.reset();
            scope.modules.accounts.generateAddressByPublicKey.returns(address);
            fakePgp.as.format.reset();
            fakePgp.as.format.onCall(0).returns(voteQueries[0]);
            fakePgp.as.format.onCall(1).returns(voteQueries[1]);
        });

        after(function() {
            RoundModule.__set__("pgp", pgp);
        });

        it("getVotes is called", function(done) {
            instance.updateVotes().then(function() {
                expect(instance.getVotes.calledOnce).to.be.true;
                done();
            }).catch(function() {
                done(new Error("Should be resolved"));
            });
        });

        it("pgp.as.format ia called", function(done) {
            instance.updateVotes().then(function() {
                expect(fakePgp.as.format.callCount).to.equal(votes.length);
                expect(scope.modules.accounts.generateAddressByPublicKey.callCount).to.equal(votes.length);

                votes.forEach(function(vote, index) {
                    expect(fakePgp.as.format.getCall(index).args.length).to.equal(2); 
                    expect(fakePgp.as.format.getCall(index).args[0]).to.equal(roundSQL.updateVotes); 
                    expect(fakePgp.as.format.getCall(index).args[1]).to.deep.equal({
                        address : address,
                        amount : votes[index].amount
                    }); 

                    expect(scope.modules.accounts.generateAddressByPublicKey.getCall(index).args.length).to.equal(1);
                    expect(scope.modules.accounts.generateAddressByPublicKey.getCall(index).args[0]).to.equal(votes[index].delegate);
                });
                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
        });

        it("task.none is called", function(done) {
            instance.updateVotes().then(function() {
                expect(instance.task.none.calledOnce).to.be.true;
                expect(instance.task.none.firstCall.args.length).to.equal(1);
                expect(instance.task.none.firstCall.args[0]).to.equal(voteQueries.join(""));
                done();
            }).catch(function(done) {
                done(new Error("Should be resolved"));
            });
        });


        it("success", function(done) {
            votes = [];
            instance.updateVotes().then(function(result) {
                expect(result).to.be.undefined;
                done();
            }).catch(function(done) {
                done(new Error("Should be resolved"));
            });
        });
	});

	describe("markBlockId", function() {
		it("calls task.none", function(done) {
            scope.backwards = true;
            instance.markBlockId().then(function() {
                expect(instance.task.none.calledOnce).to.be.true;
                expect(instance.task.none.firstCall.args.length).to.equal(2);
                expect(instance.task.none.firstCall.args[0]).to.equal(roundSQL.updateBlockId);
                expect(instance.task.none.firstCall.args[1]).to.deep.equal({
                    newId : "0",
                    oldId : scope.block.id
                });
                done();
            }).catch(function() {
                done(new Error("Should be resolved"));
            });
		});

		it("returns empty data and does not call task.none if scope.backwars is false ", function(done) {
			scope.backwards = false;
            instance.markBlockId().then(() => {
                expect(task.none.notCalled).to.be.true;
                done();
            }).catch(() => {
                done(new Error("Should be resolved"));
            })
        });
    });

    describe("flushRound", function() {
        it("task.none is called", function(done) {
            instance.flushRound().then(function() {
                expect(instance.task.none.calledOnce).to.be.true;
                expect(instance.task.none.firstCall.args.length).to.equal(2);
                expect(instance.task.none.firstCall.args[0]).to.equal(roundSQL.flush);
                expect(instance.task.none.firstCall.args[1]).to.deep.equal({
                    round : scope.round
                });
                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
        });
    });

    describe("truncateBlocks", function() {
        it("calls task.none", function(done) {
            instance.truncateBlocks().then(function() {
                expect(task.none.calledOnce).to.be.true;
                expect(task.none.firstCall.args.length).to.equal(2);
                expect(task.none.firstCall.args[0]).to.equal(roundSQL.truncateBlocks);
                expect(task.none.firstCall.args[1]).to.deep.equal({
                    height: scope.block.height
                });

                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
        });
	});

	describe("restoreRoundSnapshot", function() {
		it("calls task.none", function(done) {
			instance.restoreRoundSnapshot().then(function() {
                expect(scope.library.logger.debug.calledOnce).to.be.true;
                expect(scope.library.logger.debug.firstCall.args.length).to.equal(1);
                expect(scope.library.logger.debug.firstCall.args[0]).to.equal(
                    "Restoring mem_round snapshot..."
                );

                expect(task.none.calledOnce).to.be.true;
                expect(task.none.firstCall.args.length).to.equal(1);
                expect(task.none.firstCall.args[0]).to.equal(roundSQL.restoreRoundSnapshot);

                done();
            }).catch(function(error) {
                done(new Error("Should be resolved"));
            });
        });
	});

	describe("restoreVotesSnapshot", function() {
		it("calls task.none", function(done) {
			instance.restoreVotesSnapshot().then(function() {
                expect(scope.library.logger.debug.calledOnce).to.be.true;
                expect(scope.library.logger.debug.firstCall.args.length).to.equal(1);
                expect(scope.library.logger.debug.firstCall.args[0]).to.equal(
                    "Restoring mem_accounts.vote snapshot..."
                );

                expect(task.none.calledOnce).to.be.true;
                expect(task.none.firstCall.args.length).to.equal(1);
                expect(task.none.firstCall.args[0]).to.equal(roundSQL.restoreVotesSnapshot);

                done();
            }).catch(function(error) {
                done(error);
            });
		});
	});

	describe("applyRound", function() {
        var helpers;
        var RoundChanges;
        var RoundChangesStub;
        var RoundChangesClassStub;
        var changes;

        before(function() {
            RoundChangesStub = {
                at : sinon.stub()
            };
            RoundChangesClassStub = sinon.stub();
            helpers = RoundModule.__get__("_1");
            RoundChanges = helpers.RoundChanges;
            helpers.RoundChanges = RoundChangesClassStub;
        });

        beforeEach(function() {
            RoundChangesClassStub.reset();
            RoundChangesClassStub.returns(RoundChangesStub);
            scope.roundDelegates = [1,2,3];
            changes = [
                {balance:1,fees:2,rewards:3,balance:4,feesRemaining:10},
                {balance:5,fees:6,rewards:7,balance:8,feesRemaining:10},
                {balance:9,fees:10,rewards:11,balance:12,feesRemaining:10}
            ];
            RoundChangesStub.at.reset();
            RoundChangesStub.at.withArgs(0).returns(changes[0]);
            RoundChangesStub.at.withArgs(1).returns(changes[1]);
            RoundChangesStub.at.withArgs(2).returns(changes[2]);
            scope.modules.accounts.mergeAccountAndGetSQL.reset();
            scope.modules.accounts.mergeAccountAndGetSQL.returns("query");
        });

        after(function() {
            helpers.RoundChanges = RoundChanges;
        });

        it("RoundChanges called as constructor", function(done) {
            instance.applyRound().then(function() {
                expect(RoundChangesClassStub.calledOnce).to.be.true;
                expect(RoundChangesClassStub.calledWithNew()).to.be.true;
                expect(RoundChangesClassStub.firstCall.args.length).to.equal(1);
                expect(RoundChangesClassStub.firstCall.args[0]).to.equal(instance.scope);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("roundCahnges.at called on changes index", function(done) {
            instance.applyRound().then(function() {
                expect(RoundChangesStub.at.callCount).to.equal(4);
                changes.forEach(function(change, index) {
                    expect(RoundChangesStub.at.getCall(index).args.length).to.equal(1);
                    expect(RoundChangesStub.at.getCall(index).args[0]).to.equal(index);
                });
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("logger.trace Delegate changes", function(done) {
            instance.applyRound().then(function() {
                expect(scope.library.logger.trace.callCount).to.equal(5);
                changes.forEach(function(change, index) {
                    expect(scope.library.logger.trace.getCall(index).args.length).to.equal(2);
                    expect(scope.library.logger.trace.getCall(index).args[0]).to.equal("Delegate changes");
                    expect(scope.library.logger.trace.getCall(index).args[1]).to.deep.equal({
                        delegate : scope.roundDelegates[index],
                        changes  : changes[index]
                    });
                });
                done();
            }).catch(function(error) {
                done(error);
            });
        });
        it("modules.accounts.mergeAccountAndGetSQL called with changes", function(done) {
            instance.applyRound().then(function() {
                expect(scope.modules.accounts.mergeAccountAndGetSQL.callCount).to.equal(4);
                changes.forEach(function(change, index) {
                    expect(scope.modules.accounts.mergeAccountAndGetSQL.getCall(index).args.length).to.equal(1);
                    expect(scope.modules.accounts.mergeAccountAndGetSQL.getCall(index).args[0]).to.deep.equal({
                        balance : changes[index].balance,
                        blockId : instance.scope.block.id,
                        fees    : changes[index].fees,
                        publicKey: scope.roundDelegates[index],
                        rewards : changes[index].rewards,
                        round   : instance.scope.round,
                        u_balance : changes[index].balance
                    });
                });
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("roundCahnges.at called on reminder index", function(done) {
            instance.applyRound().then(function() {
                expect(RoundChangesStub.at.callCount).to.equal(4);
                expect(RoundChangesStub.at.getCall(2).args.length).to.equal(1);
                expect(RoundChangesStub.at.getCall(2).args[0]).to.equal(2);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("logger.trace Fees remaining", function(done) {
            instance.applyRound().then(function() {
                expect(scope.library.logger.trace.callCount).to.equal(5);
                expect(scope.library.logger.trace.getCall(3).args.length).to.equal(2);
                expect(scope.library.logger.trace.getCall(3).args[0]).to.equal("Fees remaining");
                expect(scope.library.logger.trace.getCall(3).args[1]).to.deep.equal({
                    delegate : scope.roundDelegates[2],
                    fees  : changes[2].feesRemaining,
                    index : 2
                });
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("modules.accounts.mergeAccountAndGetSQL called with remaining", function(done) {
            instance.applyRound().then(function() {
                expect(scope.modules.accounts.mergeAccountAndGetSQL.callCount).to.equal(4);
                expect(scope.modules.accounts.mergeAccountAndGetSQL.getCall(3).args.length).to.equal(1);
                expect(scope.modules.accounts.mergeAccountAndGetSQL.getCall(3).args[0]).to.deep.equal({
                    balance : changes[2].feesRemaining,
                    blockId : instance.scope.block.id,
                    fees    : changes[2].fees,
                    publicKey: scope.roundDelegates[2],
                    round   : instance.scope.round,
                    u_balance : changes[2].feesRemaining
                });
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("logger.trace Applying round", function(done) {
            instance.applyRound().then(function() {
                expect(scope.library.logger.trace.callCount).to.equal(5);
                expect(scope.library.logger.trace.getCall(4).args.length).to.equal(2);
                expect(scope.library.logger.trace.getCall(4).args[0]).to.equal("Applying round");
                expect(scope.library.logger.trace.getCall(4).args[1]).to.deep.equal(["query","query","query","query"]);
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("task.none called", function(done) {
            instance.applyRound().then(function() {
                expect(instance.task.none.calledOnce).to.be.true;
                expect(instance.task.none.firstCall.args.length).to.equal(1);
                expect(instance.task.none.firstCall.args[0]).to.equal("queryqueryqueryquery");
                done();
            }).catch(function(error) {
                done(error);
            });
        });

        it("queries.length = 0", function(done) {
            instance.scope.roundDelegates = [];

            instance.applyRound().then(function() {
                expect(scope.modules.accounts.mergeAccountAndGetSQL.called).to.be.false;
                expect(RoundChangesStub.at.calledOnce).to.be.true;
                expect(scope.library.logger.trace.calledOnce).to.be.true;
                expect(scope.library.logger.trace.firstCall.args.length).to.equal(2);
                expect(scope.library.logger.trace.firstCall.args[0]).to.equal("Applying round");
                expect(scope.library.logger.trace.firstCall.args[1]).to.deep.equal([]);
                expect(instance.task.none.called).to.be.false;
                done();
            }).catch(function(error) {
                done(error);
            });
        });
	});

	describe("land", function() {
		it("call correct methods", function() {
			var updateVotes = sinon.stub(instance, "updateVotes").resolves(true);
			var updateMissedBlocks = sinon.stub(instance, "updateMissedBlocks").resolves(true);
			var flushRound = sinon.stub(instance, "flushRound").resolves(true);
			var applyRound = sinon.stub(instance, "applyRound").resolves(true);

			return instance.land().then(function(){
				expect(updateVotes.calledTwice).to.equal.true;
				expect(updateMissedBlocks.calledOnce).to.equal.true;
				expect(flushRound.calledTwice).to.equal.true;
				expect(applyRound.calledOnce).to.equal.true;
			});
		});
	});

	describe("backwardLand", function() {
        it("call correct methods", function() {
            var updateVotes = sinon.stub(instance, "updateVotes").resolves(true);
            var updateMissedBlocks = sinon.stub(instance, "updateMissedBlocks").resolves(true);
            var flushRound = sinon.stub(instance, "flushRound").resolves(true);
            var applyRound = sinon.stub(instance, "applyRound").resolves(true);
            var restoreRoundSnapshot = sinon.stub(instance, "restoreRoundSnapshot").resolves(true);

            return instance.backwardLand().then(function(){
                expect(updateVotes.calledTwice).to.equal.true;
                expect(updateMissedBlocks.calledOnce).to.equal.true;
                expect(flushRound.calledTwice).to.equal.true;
                expect(applyRound.calledOnce).to.equal.true;
                expect(restoreRoundSnapshot.calledTwice).to.equal.true;

                updateVotes.restore();
                updateMissedBlocks.restore();
                flushRound.restore();
                applyRound.restore();
                restoreRoundSnapshot.restore();
            });
        });
    });
});
