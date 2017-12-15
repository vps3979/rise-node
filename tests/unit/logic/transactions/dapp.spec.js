var chai = require("chai");
var expect = chai.expect;
var sinon = require("sinon");
var rewire = require("rewire");
var path = require("path");
var valid_url = require("valid-url");

var rootDir = path.join(__dirname, "../../../..");

var sql = require(path.join(rootDir, "sql/logic/transactions/dapps")).default;
var dappSchema = require(path.join(rootDir, "src/schema/logic/transactions/dapp")).default;
var constants = require(path.join(rootDir, "src/helpers/constants")).default;
var exceptions = require(path.join(rootDir, "src/helpers/exceptions"));
var DappModule = rewire(path.join(rootDir, "src/logic/transactions/dapp"));
var Dapp = DappModule.DappTransaction;
var DappCategory = require(path.join(rootDir, "src/helpers/dappCategories")).DappCategory;

describe("modules/dapp", function() {
    var sandbox;
    var library;
    var modules;
    var instance;

    var trs;
    var sender;

    before(function() {
        sandbox = sinon.sandbox.create({
            injectInto: null,
            properties: ["spy", "stub", "clock"],
            useFakeTimers: true,
            useFakeServer: false
        });
    });

    beforeEach(function() {
        library = {
            db : {
                query: sandbox.stub().resolves(true)
            },
            logger : {
                error: sandbox.stub()
            },
            schema : {
                validate : sandbox.stub(),
                getLastErrors : sandbox.stub()
            },
            network : {
                io: {
                    sockets: {
                        emit: sandbox.stub()
                    }
                }
            }
        };
        modules = {
            system : {
                getFees : sandbox.stub()
            }
        };
/*
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
        */
		instance = new Dapp(library);
        instance.bind(modules.system);
	});

    afterEach(function() {
        sandbox.reset();
    });

    after(function() {
        sandbox.restore();
    });

	describe("constructor", function() {
		it("should be a function", function() {
			expect(Dapp).to.be.a("function");
		});

		it("check library", function() {
			expect(instance.library).to.deep.equal(library);
		});
	});

	describe("bind", function() {
		it("binds modules", function() {
			expect(instance.modules).to.deep.equal(modules);
		});
	});

	describe("calculateFee", function() {
        var tx;
        var sender;
        var height;
        var response;

        beforeEach(function() {
            height = "height";
            response = {
                fees : {
                    dapp : {}
                }
            };

            modules.system.getFees.returns(response);
        });

        it("modules.system.getFees is called", function() {
            instance.calculateFee(tx, sender, height);

            expect(modules.system.getFees.calledOnce).to.be.true;
            expect(modules.system.getFees.firstCall.args.length).to.be.equal(1);
            expect(modules.system.getFees.firstCall.args[0]).to.be.equal(height);
        });

		it("returns correct trs", function() {
			var result = instance.calculateFee(tx, sender, height);

			expect(result).to.equal(response.fees.dapp);
		});
	});

	describe("getBytes", function() {
        var tx;

        var BBTemp;
        var BBStub;
        var BBInstance;
        var BBBuffer;

        before(function() {
            BBTemp = DappModule.__get__("ByteBuffer");
            BBStub = sandbox.stub();
            DappModule.__set__("ByteBuffer", BBStub);

            sandbox.spy(Buffer, "from");
            sandbox.spy(Buffer, "concat");
        });

		beforeEach(function() {
            tx = {
                asset : {
                    dapp : {
                        name : "name",
                        description : "description",
                        tags : "tags",
                        link : "link",
                        icon : "icon",
                        type : "type",
                        category : "category",
                    }
                }
            };

            BBBuffer = new Buffer("temp");
            BBInstance = {
                writeInt : sandbox.stub(),
                flip : sandbox.stub(),
                toBuffer : sandbox.stub().returns(BBBuffer)
            };
            Buffer.from.reset();
            BBStub.returns(BBInstance);
		});

		after(function() {
            DappModule.__set__("ByteBuffer", BBTemp);
			Buffer.from.restore();
            Buffer.concat.restore();
		});

        it("Buffer.from called", function() {
            instance.getBytes(tx);

            expect(Buffer.from.callCount).to.be.equal(5);
            expect(Buffer.from.getCall(0).args.length).to.be.equal(2);
            expect(Buffer.from.getCall(0).args.length).to.be.equal(2);
            expect(Buffer.from.getCall(0).args[0]).to.be.equal(tx.asset.dapp.name);
            expect(Buffer.from.getCall(0).args[1]).to.be.equal("utf8");
            expect(Buffer.from.getCall(1).args[0]).to.be.equal(tx.asset.dapp.description);
            expect(Buffer.from.getCall(1).args[1]).to.be.equal("utf8");
            expect(Buffer.from.getCall(2).args[0]).to.be.equal(tx.asset.dapp.tags);
            expect(Buffer.from.getCall(2).args[1]).to.be.equal("utf8");
            expect(Buffer.from.getCall(3).args[0]).to.be.equal(tx.asset.dapp.link);
            expect(Buffer.from.getCall(3).args[1]).to.be.equal("utf8");
            expect(Buffer.from.getCall(4).args[0]).to.be.equal(tx.asset.dapp.icon);
            expect(Buffer.from.getCall(4).args[1]).to.be.equal("utf8");
        });

        it("ByteBuffer created", function() {
            instance.getBytes(tx);
        
            expect(BBStub.calledOnce).to.be.true;
            expect(BBStub.firstCall.calledWithNew()).to.be.true;
            expect(BBStub.firstCall.args.length).to.be.equal(2);
            expect(BBStub.firstCall.args[0]).to.be.equal(8);
            expect(BBStub.firstCall.args[1]).to.be.equal(true);

            expect(BBInstance.writeInt.calledTwice).to.be.true;
            expect(BBInstance.writeInt.firstCall.args.length).to.be.equal(1);
            expect(BBInstance.writeInt.firstCall.args[0]).to.be.equal(tx.asset.dapp.type);
            expect(BBInstance.writeInt.secondCall.args.length).to.be.equal(1);
            expect(BBInstance.writeInt.secondCall.args[0]).to.be.equal(tx.asset.dapp.category);

            expect(BBInstance.flip.calledOnce).to.be.true;
            expect(BBInstance.flip.firstCall.args.length).to.be.equal(0);

            expect(BBInstance.toBuffer.calledOnce).to.be.true;
            expect(BBInstance.toBuffer.firstCall.args.length).to.be.equal(0);
        });

		it("returns buffer", function() {
            var buffer = Buffer.from(tx.asset.dapp.name, 'utf8');
            buffer = Buffer.concat([buffer, Buffer.from(tx.asset.dapp.description, 'utf8')]);
            buffer = Buffer.concat([buffer, Buffer.from(tx.asset.dapp.tags, 'utf8')]);
            buffer = Buffer.concat([buffer, Buffer.from(tx.asset.dapp.link, 'utf8')]);
            buffer = Buffer.concat([buffer, Buffer.from(tx.asset.dapp.icon, 'utf8')]);

            var result = instance.getBytes(tx);

            expect(result).to.be.deep.equal(Buffer.concat([buffer, BBBuffer]));
		});
	});

	describe("verify", function() {
		var tx;
        var sender;

		beforeEach(function() {
            tx = {
                id : "id",
                amount : 0,
                asset : {
                    dapp : {
                        category : 0,
                        type : 1,
                        link : "https://alessio.rocks/archive.zip",
                        name : "Some name",
                        description : "Some description"
                    }
                }
            };
            sender = {};
		});

		it("returns 'Invalid recipient'", function(done) {
            tx.recipientId = "recipientId";
            instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid recipient");
                done();
            });
		});

		it("returns 'Invalid transaction amount'", function(done) {
			tx.amount = 1;
			instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid transaction amount");
                done();
            });
		});

		it("returns 'Invalid transaction asset'", function(done) {
            delete tx.asset;
            instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid transaction asset");
                done();
            });
		});

		it("returns 'Invalid application category'", function(done) {
            tx.asset.dapp.category = null;
            instance.verify(tx, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid application category");
                done();
            });
		});

		it("returns 'Application category not found'", function(done) {
			tx.asset.dapp.category = 99;
            instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application category not found");
                done();
            });
		});

		it("returns 'Invalid application icon link'", function(done) {
			tx.asset.dapp.icon = "alessio.rocks";
		    instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid application icon link");
                done();
            });
		});

		it("returns 'Invalid application icon file type'", function(done) {
			tx.asset.dapp.icon = "https://alessio.rocks/img";
            instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid application icon file type");
                done();
            });
		});

		it("returns 'Invalid application type'", function(done) {
			tx.asset.dapp.type = 10;
            instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid application type");
                done();
            });
		});

		it("returns 'Invalid application link'", function(done) {
			tx.asset.dapp.link = "carbonara";
		    instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid application link");
                done();
            });
		});

		it("returns 'Invalid application file type'", function(done) {
			tx.asset.dapp.link = "https://alessio.rocks/img/carbonara_bro.jpeg";
		    instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Invalid application file type");
                done();
            });
		});

		it("returns 'Application name must not be blank'", function(done) {
			tx.asset.dapp.name = undefined;
		    instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application name must not be blank or contain leading or trailing space");
                done();
            });
		});

		it("returns 'Application name must not contain leading or trailing space'", function(done) {
			tx.asset.dapp.name = " Name ";
		    instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application name must not contain leading or trailing space");
                done();
            });
		});

		it("returns 'Application name is too long. Maximum is 32 characters'", function(done) {
			tx.asset.dapp.name = "CarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonara";
            instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application name is too long. Maximum is 32 characters");
                done();
            });
        });

		it("returns 'Application description is too long. Maximum is 160 characters'", function(done) {
			tx.asset.dapp.description =
				"CarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonara";
            instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application description is too long. Maximum is 160 characters");
                done();
            });
        });

		it("returns 'Application tags is too long. Maximum is 160 characters'", function(done) {
			tx.asset.dapp.tags =
				"CarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonaraCarbonara";
		    instance.verify(tx, sender).then(() => {
                done(new Error("Should rejects"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application tags is too long. Maximum is 160 characters");
                done();
            });
		});

		it("returns 'Encountered duplicate tag: Carbonara in application'", function(done) {
			tx.asset.dapp.tags = "Carbonara, Carbonara";
		    instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Encountered duplicated tags: Carbonara in application");
                done();
            });
		});

        it("library.db.query is called", function(done) {
            library.db.query.resolves([]);
		    instance.verify(tx, sender).then(() => {
                expect(library.db.query.calledOnce).to.be.true;
                expect(library.db.query.firstCall.args.length).to.equal(2);
                expect(library.db.query.firstCall.args[0]).to.equal(sql.getExisting);
                expect(library.db.query.firstCall.args[1]).to.deep.equal({
                    name: tx.asset.dapp.name,
                    link: tx.asset.dapp.link,
                    transactionId: tx.id
                });
                done();
            }).catch(error => {
                done(error);
            });
        });

		it("catches the rejection from db.query", function(done) {
            var error = new Error("error");
			library.db.query.rejects(error);

		    instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err).to.equal(error);
                done();
            });
        });

        it("Dapp exists with the same name", function(done) {
            library.db.query.resolves([{
                name : tx.asset.dapp.name
            }]);

		    instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application name already exists");
                done();
            });
		});

		it("Dapp exists with the same link", function(done) {
            library.db.query.resolves([{
                link : tx.asset.dapp.link
            }]);

		    instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application link already exists");
                done();
            });
		});

        it("Dapp exists", function(done) {
            library.db.query.resolves([{}]);

			instance.verify(tx, sender).then(() => {
                done(new Error("Should be rejected"));
            }).catch(err => {
                expect(err).to.be.instanceof(Error);
                expect(err.message).to.equal("Application already exists");
                done();
            });
		});

		it("Success no dapp, db.query resolved, call cb", function(done) {
			library.db.query.resolves([]);
			instance.verify(tx, sender).then(function(testResult) {
                expect(testResult).to.be.undefined;
                done();
            }).catch(function(err) {
                done(new Error("Should resolves"));
            });
		});
	});


	describe("applyUnconfirmed", function() {
        var tx;
        var sender;

        beforeEach(function() {
            tx = {
                asset : {
                    dapp : {
                        name : "name",
                        link : "link"
                    }
                }
            };
            sender = {};
        });

		it("returns error Application name already exists", function(done) {
            instance.unconfirmedNames[tx.asset.dapp.name] = true;

			instance.applyUnconfirmed(tx, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.equal("Application name already exists");
                done();
            });
		});

		it("Application link already exists", function(done) {
            instance.unconfirmedLinks[tx.asset.dapp.link] = true;

			instance.applyUnconfirmed(tx, sender).then(function() {
                done(new Error("Should be rejected"));
            }).catch(function(error) {
                expect(error).to.be.instanceof(Error);
                expect(error.message).to.equal("Application link already exists");
                done();
            });
		});

		it("success", function(done) {
			instance.applyUnconfirmed(tx, sender).then(function() {
                expect(instance.unconfirmedNames).to.have.property(tx.asset.dapp.name);
                expect(instance.unconfirmedLinks).to.have.property(tx.asset.dapp.link);
                done();
            }).catch(function(error) {
                done(error);
            });
		});
	});

	describe("undoUnconfirmed", function() {
        var tx = { asset : { dapp : {} } };

		it("check props", function(done) {
            tx.asset.dapp.name = "testName";
            tx.asset.dapp.link = "testName";
            instance.unconfirmedNames["testName"] = true;
            instance.unconfirmedLinks["testName"] = true;

            instance.undoUnconfirmed(tx).then(function() {
                expect(instance.unconfirmedNames["testName"]).to.be.undefined;
                expect(instance.unconfirmedLinks["testName"]).to.be.undefined;
                done();
            }).catch(function(error) {
                done(error);
            });
		});
	});

    describe("objectNormalize", function() {
        var tx;

        beforeEach(function() {
            tx = {
                asset : {
                    dapp : {
                        name : "name",
                        empty : undefined
                    }
                }
            };

            library.schema.validate.returns(true);
        });

        it("check removed empty props", function() {
            var result = instance.objectNormalize(tx);

            expect(result).to.have.property("asset");
            expect(result.asset).to.have.property("dapp");
            expect(result.asset.dapp).to.not.have.property("empty");
        });

        it("validation is called", function() {
            instance.objectNormalize(tx);
			expect(library.schema.validate.calledOnce).to.be.true;
			expect(library.schema.validate.getCall(0).args.length).to.equal(2);
			expect(library.schema.validate.getCall(0).args[0]).to.equal(tx.asset.dapp);
			expect(library.schema.validate.getCall(0).args[1]).to.equal(dappSchema);
        });

        it("throws error", function() {
            var errors = [new Error("error")];
            library.schema.validate.returns(false);
            library.schema.getLastErrors.returns(errors);

            var throwError = function() {
                instance.objectNormalize(tx);
            };

            expect(throwError).to.throw(`Failed to validate dapp schema: ${errors.map((err) => err.message).join(', ')}`);
        });

		it("success", function() {
            var result = instance.objectNormalize(tx);
			expect(result).to.equal(tx);
		});
	});

	describe("dbRead", function() {
        var raw;

        beforeEach(function() {
            raw = {
                dapp_name       : "some1",
                dapp_description: "some2",
                dapp_tags       : "some3",
                dapp_type       : "some4",
                dapp_link       : "some5",
                dapp_category   : "some6",
                dapp_icon       : "some7",
            };
        });

        it("returns null if there is no name", function() {
            delete raw.dapp_name;
			var result = instance.dbRead(raw);
			expect(result).to.equal(null);
		});

		it("success keysgroup array split", function() {
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

			var result = instance.dbRead(raw);
			expect(result).to.deep.equal(expectedResult);
		});
	});

	describe("dbSave", function() {
		it("returns correct query", function() {
            var tx = {
                asset : {
                    dapp : {
                        type : "type",
                        name : "name",
                        description : "description",
                        tags : "tags",
                        link : "link",
                        icon : "icon",
                        category : "category",
                        id : "id"
                    }
                }
            };
			expect(instance.dbSave(tx)).to.deep.equal({
				table: instance.dbTable,
				fields: instance.dbFields,
				values: {
					type: tx.asset.dapp.type,
					name: tx.asset.dapp.name,
					description: tx.asset.dapp.description || null,
					tags: tx.asset.dapp.tags || null,
					link: tx.asset.dapp.link || null,
					icon: tx.asset.dapp.icon || null,
					category: tx.asset.dapp.category,
					transactionId: tx.id
				}
			});
		});
	});

	describe("afterSave", function() {
		it("sockets.emit called and called cb", function(done) {
            instance.afterSave({}).then(function() {
                expect(library.network.io.sockets.emit.calledOnce).to.be.true;
                expect(library.network.io.sockets.emit.firstCall.args.length).to.equal(2);
                expect(library.network.io.sockets.emit.firstCall.args[0]).to.equal("dapps/change");
                expect(library.network.io.sockets.emit.firstCall.args[1]).to.deep.equal({});
                done();
            }).catch(function(error) {
                done(error);
            });
		});
	});
});
