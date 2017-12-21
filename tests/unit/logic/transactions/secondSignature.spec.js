const chai = require("chai");
const expect = chai.expect;
const sinon = require("sinon");
const path = require("path");

const rootDir = path.join(__dirname, "../../../../src");

const secondSignatureSchema = require(path.join(rootDir, "schema/logic/transactions/secondSignature")).default;
const SignatureModule = require(path.join(rootDir, "logic/transactions/secondSignature"));
const Signature = SignatureModule.SecondSignatureTransaction;

describe("logic/transactions/secondSignature", () => {
    const sandbox = sinon.sandbox.create({
        injectInto: null,
        properties: ["spy", "stub", "clock"],
        useFakeTimers: true,
        useFakeServer: false
    });
    
    let instance;
    let library;
    let modules;
    let tx;

	beforeEach(() => {
        library = {
            logger : {},
            schema : {
                validate : sandbox.stub(),
                getLastErrors : sandbox.stub()
            }
        };
        modules = {
            accounts : {
                setAccountAndGet : sandbox.stub()
            },
            system : {
                getFees : sandbox.stub()
            }
        };

        instance = new Signature(library);
        instance.bind(modules.accounts, modules.system);
		tx = {
            id : "id",
            amount : 0,
			asset: {
				delegate : {
					username : "username"
				},
				signature : {
					publicKey : "bf4809a1a08c9dffbba741f0c7b9f49145602341d5fa306fb3cd592d3e1058b3"
				}
			}
		};
	});

	afterEach(() => {
        sandbox.reset();
	});

    after(() => {
        sandbox.restore();
    });

	describe("constructor()", () => {
		it("should be a function", () => {
			expect(Signature).to.be.a("function");
		});

		it("should be an instance of Signature", () => {
			expect(instance).to.be.an.instanceOf(Signature);
		});

        it("check library", () => {
            expect(instance.library).to.have.property("logger");
            expect(instance.library.logger).to.equal(library.logger);
            expect(instance.library).to.have.property("schema");
            expect(instance.library.schema).to.equal(library.schema);
        });

        it("check modules", () => {
            expect(instance.modules).to.have.property("accounts");
            expect(instance.modules.accounts).to.equal(modules.accounts);
            expect(instance.modules).to.have.property("system");
            expect(instance.modules.system).to.equal(modules.system);
        });
	});

	describe("calculateFee()", () => {
        let sender;
        let height;
        let result;

        beforeEach(() => {
            result = {
                fees : {
                    secondsignature : 123
                }
            };

            modules.system.getFees.returns(result);
        });

        it("modules.system.getFees is called", () => {
            instance.calculateFee(tx, sender, height);

            expect(modules.system.getFees.calledOnce).to.be.true;
            expect(modules.system.getFees.firstCall.args.length).to.be.equal(1);
            expect(modules.system.getFees.firstCall.args[0]).to.be.equal(height);
        });

        it("check result", () => {
            const testedResult = instance.calculateFee(tx, sender, height);
            expect(testedResult).to.be.equal(result.fees.secondsignature);
        });
	});

	describe("getBytes()", () => {
        it("check result", () => {
            const testedResult = instance.getBytes(tx, false, false);
            expect(testedResult).to.be.deep.equal(Buffer.from(tx.asset.signature.publicKey, "hex"));
        });
	});

	describe("verify()", () => {

        beforeEach(() => {
            library.schema.validate.returns(true);
        });

        it("no tx.asset", async () => {
            delete tx.asset;
            try {
                await instance.verify(tx);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid transaction asset");
            }
        });

        it("no tx.asset.signature", async () => {
            delete tx.asset.signature;
            try {
                await instance.verify(tx);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid transaction asset");
            }
        });

        it("no tx.recipientId", async () => {
            tx.recipientId = "recipientId";
            try {
                await instance.verify(tx);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid recipient");
            }
        });
        
        it("no tx.amount", async () => {
            tx.amount = 100;
            try {
                await instance.verify(tx);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid transaction amount");
            }
        });

        it("no tx.asset.signature.publicKey", async () => {
            delete tx.asset.signature.publicKey;
            try {
                await instance.verify(tx);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid public key");
            }
        });

        it("library.schema.validate is called", async () => {
            await instance.verify(tx);

            expect(library.schema.validate.calledOnce).to.be.true;
            expect(library.schema.validate.firstCall.args.length).to.be.equal(2);
            expect(library.schema.validate.firstCall.args[0]).to.be.equal(tx.asset.signature.publicKey);
            expect(library.schema.validate.firstCall.args[1]).to.be.deep.equal({ format : "publicKey" });
        });

        it("validation error", async () => {
            library.schema.validate.returns(false);
            try {
                await instance.verify(tx);
                throw new Error("Should be rejected");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid public key");
            }
        });
	});

	describe("apply()", () => {
        let block = {};
		let sender = {
			address: "12929291r"
		};

        beforeEach(() => {
            modules.accounts.setAccountAndGet.resolves();
        });

		it("setAccountAndGet is called", async () => {
            await instance.apply(tx, block, sender);

            expect(modules.accounts.setAccountAndGet.calledOnce).to.be.true;
            expect(modules.accounts.setAccountAndGet.firstCall.args.length).to.be.equal(1);
            expect(modules.accounts.setAccountAndGet.firstCall.args[0]).to.be.deep.equal({
                address          : sender.address,
                secondPublicKey  : tx.asset.signature.publicKey,
                secondSignature  : 1,
                u_secondSignature: 0,
            });
        });

        it("check result", async () => {
            const result = await instance.apply(tx, block, sender);
            expect(result).to.be.undefined;
        });
	});

	describe("undo()", () => {
        let block = {};
		let sender = {
			address: "12929291r"
		};

        beforeEach(() => {
            modules.accounts.setAccountAndGet.resolves();
        });

		it("setAccountAndGet is called", async () => {
            await instance.undo(tx, block, sender);

            expect(modules.accounts.setAccountAndGet.calledOnce).to.be.true;
            expect(modules.accounts.setAccountAndGet.firstCall.args.length).to.be.equal(1);
            expect(modules.accounts.setAccountAndGet.firstCall.args[0]).to.be.deep.equal({
                address          : sender.address,
                secondPublicKey  : null,
                secondSignature  : 0,
                u_secondSignature: 1,
            });
        });

        it("check result", async () => {
            const result = await instance.undo(tx, block, sender);
            expect(result).to.be.undefined;
        });
	});

	describe("applyUnconfirmed()", () => {
		let sender = {
			address: "12929291r"
		};

        beforeEach(() => {
            modules.accounts.setAccountAndGet.resolves();
        });

		it("setAccountAndGet is called", async () => {
            await instance.applyUnconfirmed(tx, sender);

            expect(modules.accounts.setAccountAndGet.calledOnce).to.be.true;
            expect(modules.accounts.setAccountAndGet.firstCall.args.length).to.be.equal(1);
            expect(modules.accounts.setAccountAndGet.firstCall.args[0]).to.be.deep.equal({
                address          : sender.address,
                u_secondSignature: 0,
            });
        });

        it("check result", async () => {
            const result = await instance.applyUnconfirmed(tx, sender);
            expect(result).to.be.undefined;
        });
	});

	describe("undoUnconfirmed()", () => {
		let sender;

        beforeEach(() => {
            sender = {
                address: "12929291r"
            };

            modules.accounts.setAccountAndGet.resolves();
        });

		it("setAccountAndGet is called", async () => {
            await instance.undoUnconfirmed(tx, sender);

            expect(modules.accounts.setAccountAndGet.calledOnce).to.be.true;
            expect(modules.accounts.setAccountAndGet.firstCall.args.length).to.be.equal(1);
            expect(modules.accounts.setAccountAndGet.firstCall.args[0]).to.be.deep.equal({
                address          : sender.address,
                u_secondSignature: 1,
            });
        });

        it("throws error", async () => {
            sender.secondSignature = {};
            sender.u_secondSignature = {};
            try {
                await instance.undoUnconfirmed(tx, sender);
                throw new Error("Should be rejected");
            } catch(error) {
                expect(error).to.be.equal("Second signature already enabled");
            }
        });

        it("check result", async () => {
            const result = await instance.applyUnconfirmed(tx, sender);
            expect(result).to.be.undefined;
        });
	});

	describe("objectNormalize()", () => {

        beforeEach(() => {
            library.schema.validate.returns(true);
        });

        it("library.schema.validate is called", () => {
            instance.objectNormalize(tx);

            expect(library.schema.validate.calledOnce).to.be.true;
            expect(library.schema.validate.firstCall.args.length).to.be.equal(2);
            expect(library.schema.validate.firstCall.args[0]).to.be.equal(tx.asset.signature);
            expect(library.schema.validate.firstCall.args[1]).to.be.equal(secondSignatureSchema);
        });
        
        it("throws error", () => {
            const errors = [new Error("first"),new Error("second")];
            library.schema.getLastErrors.returns(errors);
            library.schema.validate.returns(false);
            try {
                instance.objectNormalize(tx);
                throw new Error("Should throws error");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Failed to validate signature schema: first, second");
            }
        });

        it("check result", () => {
            const result = instance.objectNormalize(tx);
            expect(result).to.be.equal(tx);
        });
	});

    describe("dbRead", () => {
        let raw;

        it("should return null", () => {
            raw = {};
            const result = instance.dbRead(raw);
            expect(result).to.be.null;
        });

        it("should return object with signature", () => {
            raw = {
                s_publicKey : "publicKey"
            };
            const result = instance.dbRead(raw);
            expect(result).to.be.deep.equal({ signature : { publicKey : raw.s_publicKey } });
        });
    });

    describe("dbSave", () => {
        it("compare result", () => {
            const result = instance.dbSave(tx); 
            expect(result).to.be.deep.equal({
                table : instance.dbTable,
                fields: instance.dbFields,
                values: {
                    publicKey    : Buffer.from(tx.asset.signature.publicKey, 'hex'),
                    transactionId: tx.id,
                },
            });
        });
    });
});
