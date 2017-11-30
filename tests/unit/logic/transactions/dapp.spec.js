var chai = require("chai");
var expect = chai.expect;
var sinon = require("sinon");
var rewire = require("rewire");
var path = require("path");
var valid_url = require("valid-url");

var rootDir = path.join(__dirname, "../../../..");

var sql = require(path.join(rootDir, "sql/logic/transactions/dapps")).default;
var dappSchema = require(path.join(rootDir, "schema/logic/transactions/dapp")).default;
var constants = require(path.join(rootDir, "helpers/constants")).default;
var exceptions = require(path.join(rootDir, "helpers/exceptions"));
var DappModule = rewire(path.join(rootDir, "logic/transactions/dapp"));
var Dapp = DappModule.DappTransaction;

describe("modules/dapp", function() {
    var callback,
        schema,
		network,
		logger,
		db,
		trs,
		sender,
		system;

	beforeEach(function() {
		schema = {
            validate : sinon.stub(),
            getLastErrors : sinon.stub()
        };
		network = {
			io: {
				sockets: {
					emit: sinon.stub()
				}
			}
		};
		logger = {
			error: sinon.stub()
		};
		db = {
			query: sinon.stub().resolves(true)
		};
		trs = {
			amount: 0,
			asset: {
				dapp: {
					name: "CarbonaraDapp",
					description: "Carbonara",
					category: 4,
					tags: "cool, dapp",
					link: "https://alessio.rocks/app.zip",
					icon: "https://alessio.rocks/img/carbonara_bro.jpeg",
					type: 0
				}
			}
		};

		sender = {
			multisignatures: ["1", "2"]
		};
		system = {};
		instance = new Dapp({ db, logger, schema, network });
	});

    afterEach(function() {
        schema.validate.reset();
        logger.error.reset();
    });

	describe("constructor", function() {
		it("should be a function", function() {
			expect(Dapp).to.be.a("function");
		});

		it("check library", function() {
			var expectedLibrary = {
				db: db,
				logger: logger,
				schema: schema,
				network: network
			};

			expect(instance.library).to.deep.equal(expectedLibrary);
		});
	});

	describe("bind", function() {
		it("binds modules", function() {
			var expectedModules;
			expectedModules = {
				system: system
			};

			instance.bind(system);

			expect(instance.modules).to.deep.equal(expectedModules);
		});
	});

	describe("calculateFee", function() {
		it("returns correct trs", function() {
			var trs, modules, getFees, height;

			height = 10;
			trs = {
				asset: {
					multisignature: {
						keysgroup: [1, 2, 3]
					}
                }
            };
            instance.modules = {
                system : {
                    getFees: sinon.stub().returns({
                        fees: {
                            dapp: 1
                        }
                    }) 
                }
            };

			var retVal = instance.calculateFee(trs, null, height);

			expect(retVal).to.deep.equal(1);
			expect(instance.modules.system.getFees.calledOnce).to.be.true;
			expect(instance.modules.system.getFees.firstCall.args.length).to.equal(1);
			expect(instance.modules.system.getFees.firstCall.args[0]).to.equal(height);
		});
	});

	describe("verify", function() {
		var ready, library, Buffer, from, isUri, tempTrs;

		beforeEach(function() {
            tempTrs = {};
			Object.assign(tempTrs, trs);
			sender = {
				multisignatures: false
			};
			ready = sinon.stub(instance, "ready").returns(true);
			Buffer = DappModule.__get__("Buffer");
			from = sinon.stub(Buffer, "from").returns([]);
			DappModule.__set__("Buffer", Buffer);
			isUri = sinon.spy(valid_url, "isUri");
		});

		afterEach(function() {
			ready.restore();
			from.restore();
			isUri.restore();
		});

		it("returns 'Invalid recipient'", function(done) {
			tempTrs.recipientId = "carbonara";
            instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid recipient");
                done();
            });
		});

		it("returns 'Invalid transaction amount'", function(done) {
			tempTrs.amount = 1;
			instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid transaction amount");
                done();
            });
		});

		it("returns 'Invalid transaction asset'", function(done) {
            delete tempTrs.asset;
            instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid transaction asset");
                done();
            });
		});

		it("returns 'Invalid application category'", function(done) {
            tempTrs.asset.dapp.category = null;
            instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid application category");
                done();
            });
		});

		it("returns 'Application category not found'", function(done) {
			tempTrs.asset.dapp.category = 99;
            instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application category not found");
                done();
            });
		});

		it("returns 'Invalid application icon link'", function(done) {
			tempTrs.asset.dapp.icon = "alessio.rocks";
		    instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid application icon link");
                done();
            });
		});

		it("returns 'Invalid application icon file type'", function(done) {
			tempTrs.asset.dapp.icon = "https://alessio.rocks/img";
            instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid application icon file type");
                done();
            });
		});

		it("returns 'Invalid application type'", function(done) {
			tempTrs.asset.dapp.type = 10;
            instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid application type");
                done();
            });
		});

		it("returns 'Invalid application link'", function(done) {
			tempTrs.asset.dapp.link = "carbonara";
		    instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid application link");
                done();
            });
		});

		it("returns 'Invalid application file type'", function(done) {
			tempTrs.asset.dapp.link = "https://alessio.rocks/img/carbonara_bro.jpeg";
		    instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid application file type");
                done();
            });
		});

		it("returns 'Application name must not be blank'", function(done) {
			tempTrs.asset.dapp.name = undefined;
		    instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application name must not be blank or contain leading or trailing space");
                done();
            });
		});

		it("returns 'Application name is too long. Maximum is 32 characters'", function(done) {
			tempTrs.asset.dapp.name =
				"CarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonara";
            instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application name is too long. Maximum is 32 characters");
                done();
            });
        });

		it("returns 'Application description is too long. Maximum is 160 characters'", function(done) {
			tempTrs.asset.dapp.description =
				"CarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonara";
            instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application description is too long. Maximum is 160 characters");
                done();
            });
        });

		it("returns 'Application tags is too long. Maximum is 160 characters'", function(done) {
			tempTrs.asset.dapp.tags =
				"CarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonara";
		    instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application tags is too long. Maximum is 160 characters");
                done();
            });
		});

		it("returns 'Encountered duplicate tag: Carbonara in application'", function(done) {
			tempTrs.asset.dapp.tags = "Carbonara, Carbonara";
		    instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Encountered duplicated tags: Carbonara in application");
                done();
            });
		});

		it("catches the rejection from db.query", function(done) {
            var error = "error";
			db.query.rejects(new Error(error));
		    instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(db.query.calledOnce).to.be.true;
                expect(db.query.firstCall.args.length).to.equal(2);
                expect(db.query.firstCall.args[0]).to.equal(sql.getExisting);
                expect(db.query.firstCall.args[1]).to.deep.equal({
                    name: trs.asset.dapp.name,
                    link: trs.asset.dapp.link,
                    transactionId: trs.id
                });

                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("error");
                done();
            });
        });

        it("Dapp exists with the same name", function(done) {
            db.query.resolves([{
                name: "CarbonaraDapp"
            }]);
		    instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(db.query.calledOnce).to.be.true;
                expect(db.query.firstCall.args.length).to.equal(2);
                expect(db.query.firstCall.args[0]).to.equal(sql.getExisting);
                expect(db.query.firstCall.args[1]).to.deep.equal({
                    name: trs.asset.dapp.name,
                    link: trs.asset.dapp.link,
                    transactionId: trs.id
                });

                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application name already exists");
                done();
            });
		});

		it("Dapp exists with the same link", function(done) {
            db.query.resolves([{
                link: "https://alessio.rocks/app.zip"
            }]);
		    instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(db.query.calledOnce).to.be.true;
                expect(db.query.firstCall.args.length).to.equal(2);
                expect(db.query.firstCall.args[0]).to.equal(sql.getExisting);
                expect(db.query.firstCall.args[1]).to.deep.equal({
                    name: trs.asset.dapp.name,
                    link: trs.asset.dapp.link,
                    transactionId: trs.id
                });

                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application link already exists");
                done();
            });
		});

        it("Dapp exists", function(done) {
            db.query.resolves([{
                itExists: true
            }]);
			instance.verify(tempTrs, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(db.query.calledOnce).to.be.true;
                expect(db.query.firstCall.args.length).to.equal(2);
                expect(db.query.firstCall.args[0]).to.equal(sql.getExisting);
                expect(db.query.firstCall.args[1]).to.deep.equal({
                    name: trs.asset.dapp.name,
                    link: trs.asset.dapp.link,
                    transactionId: trs.id
                });

                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application already exists");
                done();
            });
		});

		it("Success no dapp, db.query resolved, call cb", function(done) {
			db.query.resolves([]);
			instance.verify(tempTrs, sender).then(function(testResult) {
                expect(testResult).to.be.undefined;
                done();
            }).catch(function(err) {
                done(new Error("Should resolves"));
            });
		});
	});

	describe("getBytes", function() {
		var from;
		// var outputBuffer = Buffer.from([]);

        before(function() {
            BufferModule = DappModule.__get__("Buffer");
			from = sinon.spy(BufferModule, "from");
        });

		beforeEach(function() {
            from.reset();
		});

		after(function() {
			from.restore();
		});

		it("returns buffer", function() {
            var retVal = instance.getBytes(trs);
            expect(from.callCount).to.equal(5);
            expect(from.getCall(0).args.length).to.equal(2);
			expect(from.getCall(0).args[0]).to.equal(trs.asset.dapp.name);
			expect(from.getCall(0).args[1]).to.equal("utf8");
			expect(from.getCall(1).args.length).to.equal(2);
			expect(from.getCall(1).args[0]).to.equal(trs.asset.dapp.description);
			expect(from.getCall(1).args[1]).to.equal("utf8");
			expect(from.getCall(2).args.length).to.equal(2);
			expect(from.getCall(2).args[0]).to.equal(trs.asset.dapp.tags);
			expect(from.getCall(2).args[1]).to.equal("utf8");
			expect(from.getCall(3).args.length).to.equal(2);
			expect(from.getCall(3).args[0]).to.equal(trs.asset.dapp.link);
			expect(from.getCall(3).args[1]).to.equal("utf8");
			expect(from.getCall(4).args.length).to.equal(2);
			expect(from.getCall(4).args[0]).to.equal(trs.asset.dapp.icon);
			expect(from.getCall(4).args[1]).to.equal("utf8");
			expect(retVal).to.be.instanceOf(Buffer);
		});
	});

	describe("applyUnconfirmed", function() {
		it("returns error Application name already exists", function(done) {
            instance.unconfirmedNames.CarbonaraDapp = true;

			instance.applyUnconfirmed(trs, sender).then(function() {
                done(new Error("Should rejects"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.equal("Application name already exists");
                done();
            });
		});

		it("Application link already exists", function(done) {
            instance.unconfirmedLinks["https://alessio.rocks/app.zip"] = true;

			instance.applyUnconfirmed(trs, sender).then(function() {
                done(new Error("Should rejects"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.equal("Application link already exists");
                done();
            });
		});

		it("success", function(done) {
			instance.applyUnconfirmed(trs, sender).then(function() {
                expect(instance.unconfirmedNames).to.have.property(trs.asset.dapp.name);
                expect(instance.unconfirmedLinks).to.have.property(trs.asset.dapp.link);
                done();
            }).catch(function(error) {
                done(new Error("Should resolves"));
            });
		});
	});

	describe("undoUnconfirmed", function() {
		var modules, expectedMerge;

		it("calls diff.reverse and account.merge", function() {
            trs.asset.dapp.name = "testName";
            trs.asset.dapp.link = "testName";
            instance.unconfirmedNames["testName"] = true;
            instance.unconfirmedLinks["testName"] = true;

            instance.undoUnconfirmed(trs).then(function() {
                expect(instance.unconfirmedNames["testName"]).to.be.undefined;
                expect(instance.unconfirmedLinks["testName"]).to.be.undefined;
            });
		});
	});

    describe("objectNormalize", function() {

        it("throws error", function(done) {
            schema.validate.returns(false);
            schema.getLastErrors.returns([new Error("error")]);

            var throwError = function() {
                instance.objectNormalize(trs);
            };

            expect(throwError).to.throw();

            done();
        });

		it("success", function(done) {
			schema.validate.returns(true);

			expect(instance.objectNormalize(trs)).to.deep.equal(trs);
			expect(schema.validate.calledOnce).to.be.true;
			expect(schema.validate.getCall(0).args.length).to.equal(2);
			expect(schema.validate.getCall(0).args[0]).to.deep.equal(trs.asset.dapp);
			expect(schema.validate.getCall(0).args[1]).to.equal(dappSchema);

			done();
		});
	});

	describe("dbRead", function() {
		it("returns null when no keysgroup", function(done) {
			var raw = {};

			var retVal = instance.dbRead(raw);

			expect(retVal).to.equal(null);

			done();
		});

		it("success keysgroup array split", function(done) {
			var raw = {
				dapp_name: "carbonara",
				dapp_description: 10,
				dapp_tags: 10,
				dapp_type: 10,
				dapp_link: 10,
				dapp_category: 10,
				dapp_icon: 10
			};
			var expectedResult = {
				dapp: {
					name: raw.dapp_name,
					description: raw.dapp_description,
					tags: raw.dapp_tags,
					type: raw.dapp_type,
					link: raw.dapp_link,
					category: raw.dapp_category,
					icon: raw.dapp_icon
				}
			};

			var retVal = instance.dbRead(raw);

			expect(retVal).to.deep.equal(expectedResult);

			done();
		});
	});

	describe("dbTable", function() {
		it("it's correct", function() {
			expect(instance.dbTable).to.deep.equal("dapps");
		});
	});

	describe("dbFields", function() {
		it("it's correct", function() {
			expect(instance.dbFields).to.deep.equal([
				"type",
				"name",
				"description",
				"tags",
				"link",
				"category",
				"icon",
				"transactionId"
			]);
		});
	});

	describe("dbSave", function() {
		it("returns correct query", function() {
			expect(instance.dbSave(trs)).to.deep.equal({
				table: instance.dbTable,
				fields: instance.dbFields,
				values: {
					type: trs.asset.dapp.type,
					name: trs.asset.dapp.name,
					description: trs.asset.dapp.description || null,
					tags: trs.asset.dapp.tags || null,
					link: trs.asset.dapp.link || null,
					icon: trs.asset.dapp.icon || null,
					category: trs.asset.dapp.category,
					transactionId: trs.id
				}
			});
		});
	});

	describe("afterSave", function() {
		it("sockets.emit called and called cb", function(done) {
            instance.afterSave(trs).then(function() {
                expect(network.io.sockets.emit.calledOnce).to.be.true;
                expect(network.io.sockets.emit.firstCall.args.length).to.equal(2);
                expect(network.io.sockets.emit.firstCall.args[0]).to.equal("dapps/change");
                expect(network.io.sockets.emit.firstCall.args[1]).to.deep.equal({});
                done();
            }).catch(function(done) {
                done(new Error("Should be resolved"));
            });
		});
	});

	describe("ready", function() {
		it("returns false with no signatures", function() {
			trs.signatures = "not an array";
			var retVal = instance.ready(trs, sender);

			expect(retVal).to.equal(false);
		});

		it("returns false sender.multisignature not valid array", function() {
			var sender = {
				multisignatures: [1, 2, 3]
			};
			trs.signatures = [1, 2, 3];
			var retVal = instance.ready(trs, sender);

			expect(retVal).to.equal(false);
		});

		it("returns false when signatures >= multimin", function() {
			var sender = {
				multisignatures: [1],
				multimin: 10
			};
			trs.signatures = [1, 2, 3];
			var retVal = instance.ready(trs, sender);

			expect(retVal).to.equal(false);
		});

		it("returns true when signatures >= multimin", function() {
			var sender = {
				multisignatures: [1],
				multimin: 1
			};
			trs.signatures = [1, 2, 3];
			var retVal = instance.ready(trs, sender);

			expect(retVal).to.equal(true);
		});
	});
});
