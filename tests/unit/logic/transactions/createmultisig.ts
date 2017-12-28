import * as sinon from "sinon";
import {expect} from "chai";
import * as ByteBuffer from "bytebuffer";
import {MultiSignatureTransaction} from "../../../../src/logic/transactions/createmultisig"; 
import multiSigSchema from "../../../../src/schema/logic/transactions/multisignature";
import {constants, Diff} from "../../../../src/helpers/";

describe("logic/transactions/createmultisig", () => {
    const sandbox = sinon.sandbox.create({
        injectInto: null,
        properties: ["spy", "stub", "clock"],
        useFakeTimers: true,
        useFakeServer: false
    });

    let instance : any;
    let library : any;
    let modules : any;

    beforeEach(() => {
        library = {
            account : {
                merge : sandbox.stub(),
                generateAddressByPublicKey : sandbox.stub()
            },
            logger : {},
            schema : {
                validate : sandbox.stub(),
                getLastErrors : sandbox.stub()
            },
            network : {
                io : {
                    sockets : {
                        emit : sandbox.stub()
                    }
                }
            },
            transaction : {
                verifySignature : sandbox.stub()
            }
        };
        modules = {
            accounts : {
                setAccountAndGet : sandbox.stub()
            },
            rounds : {
                calcRound : sandbox.stub()
            },
            sharedApi : {},
            system : {
                getFees : sandbox.stub()
            }
        };

        instance = new MultiSignatureTransaction(library);
        instance.bind(modules.accounts, modules.rounds, modules.sharedApi, modules.system);
    });

    afterEach(() => {
        sandbox.reset();
    });

    after(() => {
        sandbox.restore();
    });

    describe("constructor()", () => {
        it("should be a function", () => {
            expect(MultiSignatureTransaction).to.be.a("function");
        });

        it("should be an instance", () => {
            expect(instance).to.be.instanceof(MultiSignatureTransaction);
        });

        it("check library property", () => {
            expect(instance.library).to.have.property("account");
            expect(instance.library).to.have.property("logger");
            expect(instance.library.account).to.be.equal(library.account);
            expect(instance.library.logger).to.be.equal(library.logger);
        });
    });

    describe("bind()", () => {
        it("check accounts property", () => {
            expect(instance.modules).to.have.property("accounts");
            expect(instance.modules.accounts).to.be.equal(modules.accounts);
        });

        it("check rounds property", () => {
            expect(instance.modules).to.have.property("rounds");
            expect(instance.modules.rounds).to.be.equal(modules.rounds);
        });

        it("check sharedApi property", () => {
            expect(instance.modules).to.have.property("sharedApi");
            expect(instance.modules.sharedApi).to.be.equal(modules.sharedApi);
        });

        it("check system property", () => {
            expect(instance.modules).to.have.property("system");
            expect(instance.modules.system).to.be.equal(modules.system);
        });
    });

    describe("calculateFee()", () => {
        let tx : any;
        let sender : any;
        let height : number;

        let data : any;

        beforeEach(() => {
            tx = {};
            sender = {};
            height = 200;

            data = {
                fees : {
                    multisignature : {}
                }
            };

            modules.system.getFees.returns(data);
        });

        it("modules.sytem.getFees() is called", () => {
            instance.calculateFee(tx, sender, height);
            expect(modules.system.getFees.calledOnce).to.be.true;
            expect(modules.system.getFees.firstCall.args.length).to.be.equal(1);
            expect(modules.system.getFees.firstCall.args[0]).to.be.equal(height);
        });

        it("check result", () => {
            let result = instance.calculateFee(tx, sender, height);
            expect(result).to.be.equal(data.fees.multisignature);
        });
    });

    describe("getBytes()", () => {
        it("compare result", () => {
            let tx = {
                asset : {
                    multisignature : {
                        keysgroup : ["0key1","0key2"],
                        min : 1,
                        lifetime : 1
                    }
                }
            };

            let result = instance.getBytes(tx, false, false);

            const keysBuff = Buffer.from(tx.asset.multisignature.keysgroup.join(''), 'utf8');
            const bb       = new ByteBuffer(1 + 1 + keysBuff.length, true);
            bb.writeByte(tx.asset.multisignature.min);
            bb.writeByte(tx.asset.multisignature.lifetime);
            for (let i = 0; i < keysBuff.length; i++) {
                bb.writeByte(keysBuff[i]);
            }
            bb.flip();

            expect(result).to.be.deep.equal(bb.toBuffer());
        });
    });

    describe("verify()", () => {
        let tx : any; 
        let sender : any;
        let readyStub : any;

        beforeEach(() => {
            tx = {
                asset : {
                    multisignature : {
                        keysgroup : ["+key1","+key2"],
                        min : constants.multisigConstraints.min.minimum + 1,
                        lifetime : constants.multisigConstraints.lifetime.minimum + 1
                    }
                },
                signatures : ["firstSignature","secondSignature"],
                amount : 0
            };
            sender = {
                publicKey : "publicKey",
                multisignatures : []
            };

            readyStub = sandbox.stub(instance, "ready");
            readyStub.returns(true);
            library.transaction.verifySignature.withArgs(tx, "key1", "firstSignature").returns(true);
            library.transaction.verifySignature.withArgs(tx, "key2", "secondSignature").returns(true);
            library.transaction.verifySignature.returns(false);
            library.schema.validate.returns(true);
        });

        it("throws error; no asset", async () => {
            delete tx.asset;
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid transaction asset");
            }
        });

        it("throws error; no asset.multisignature", async () => {
            delete tx.asset.multisignature;
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid transaction asset");
            }
        });

        it("throws error; multisignature keysgroup is not an array", async () => {
            tx.asset.multisignature.keysgroup = undefined;
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid multisignature keysgroup. Must be an array");
            }
        });

        it("throws error; multisignature keysgroup is empty", async () => {
            tx.asset.multisignature.keysgroup = [];
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid multisignature keysgroup. Must not be empty");
            }
        });

        it("throws error; multisignature min grater than max", async () => {
            let error : string = "";
            error += "Invalid multisignature min. Must be between ";
            error += constants.multisigConstraints.min.minimum;
            error += " and ";
            error += constants.multisigConstraints.min.maximum;

            tx.asset.multisignature.min = constants.multisigConstraints.min.maximum + 1;
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal(error);
            }
        });

        it("throws error; multisignature min less than min", async () => {
            let error : string = "";
            error += "Invalid multisignature min. Must be between ";
            error += constants.multisigConstraints.min.minimum;
            error += " and ";
            error += constants.multisigConstraints.min.maximum;

            tx.asset.multisignature.min = constants.multisigConstraints.min.minimum - 1;
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal(error);
            }
        });

        it("throws error; multisignature min grater than keysgroup.length", async () => {
            tx.asset.multisignature.min = tx.asset.multisignature.keysgroup.length + 1;
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid multisignature min. Must be less than or equal to keysgroup size");
            }
        });

        it("throws error; multisignature lifetime grater than max", async () => {
            let error : string = "";
            error += "Invalid multisignature lifetime. Must be between ";
            error += constants.multisigConstraints.lifetime.minimum;
            error += " and ";
            error += constants.multisigConstraints.lifetime.maximum;

            tx.asset.multisignature.lifetime = constants.multisigConstraints.lifetime.maximum + 1;
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal(error);
            }
        });

        it("throws error; multisignature lifetime less than min", async () => {
            let error : string = "";
            error += "Invalid multisignature lifetime. Must be between ";
            error += constants.multisigConstraints.lifetime.minimum;
            error += " and ";
            error += constants.multisigConstraints.lifetime.maximum;

            tx.asset.multisignature.lifetime = constants.multisigConstraints.lifetime.minimum - 1;
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal(error);
            }
        });

        it("throws error; sender already has multisignature", async () => {
            sender.multisignatures = ["123","234"];
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Account already has multisignatures enabled");
            }
        });

        it("throws error; invalid recipient id", async () => {
            tx.recipientId = true;
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid recipient");
            }
        });

        it("throws error; invalid tx amount", async () => {
            tx.amount = 1;
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid transaction amount");
            }
        });

        it("throws error; failed to verify multisignature", async () => {
            library.transaction.verifySignature.withArgs(tx, "key1", "firstSignature").returns(false);
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Failed to verify signature in multisgnature keysgroup");
            }
        });

        it("throws error; invalid math operator", async () => {
            tx.asset.multisignature.keysgroup[0] = "-key1";
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid math operator in multisignature keysgroup");
            }
        });

        it("schema validate is called", async () => {
            await instance.verify(tx, sender);

            expect(library.schema.validate.callCount).to.be.equal(tx.asset.multisignature.keysgroup.length);
            tx.asset.multisignature.keysgroup.forEach((key, index) => {
                expect(library.schema.validate.getCall(index).args.length).to.be.equal(2);
                expect(library.schema.validate.getCall(index).args[0]).to.be.equal(key.substring(1));
                expect(library.schema.validate.getCall(index).args[1]).to.be.deep.equal({ format : "publicKey" });
            });
        });

        it("throws error; invalid public key", async () => {
            library.schema.validate.returns(false);
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Invalid publicKey in multisignature keysgroup");
            }
        });

        it("throws error; duplicate key in keysgroup", async () => {
            tx.asset.multisignature.keysgroup.push("+key1");
            try {
                await instance.verify(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Encountered duplicate public key in multisignature keysgroup");
            }
        });

        it("no errors has been thrown", async () => {
            await instance.verify(tx, sender);
        });
    });

    describe("apply()", () => {
        let tx;
        let block;
        let sender;

        beforeEach(() => {
            tx = {
                asset : {
                    multisignature : {
                        lifetime : "",
                        min : "",
                        keysgroup : ["+key1","+key2"]
                    }
                }
            };
            block = {
                id : "id",
                height : 200
            };
            sender = {
                address : "123abc"
            };

            modules.rounds.calcRound.returns("round");
            library.account.merge.resolves();
            library.account.generateAddressByPublicKey.returns("address");
            modules.accounts.setAccountAndGet.resolves();
        });

        it("unconfirmedSignatures with sender.address is deleted", async () => {
            instance.unconfirmedSignatures[sender.address] = true;
            expect(instance.unconfirmedSignatures[sender.address]).to.be.true;
            await instance.apply(tx, block, sender);
            expect(instance.unconfirmedSignatures[sender.address]).to.be.undefined;
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
                blockId        : block.id,
                multilifetime  : tx.asset.multisignature.lifetime,
                multimin       : tx.asset.multisignature.min,
                multisignatures: tx.asset.multisignature.keysgroup,
                round          : "round"
            });
            expect(library.account.merge.firstCall.args[2]).to.be.a("function");
        });

        it("library.account.generateAddressByPublicKey is called", async () => {
            const stub = library.account.generateAddressByPublicKey;
            await instance.apply(tx, block, sender);
        
            expect(stub.callCount).to.be.equal(tx.asset.multisignature.keysgroup.length);
            tx.asset.multisignature.keysgroup.forEach((key, index) => {
                expect(stub.getCall(index).args.length).to.be.equal(1);
                expect(stub.getCall(index).args[0]).to.be.equal(key.substr(1));
            });
        });

        it("modules.accounts.setAccountAndGet is called", async () => {
            const stub = modules.accounts.setAccountAndGet;
            await instance.apply(tx, block, sender);
        
            expect(stub.callCount).to.be.equal(tx.asset.multisignature.keysgroup.length);
            tx.asset.multisignature.keysgroup.forEach((key, index) => {
                expect(stub.getCall(index).args.length).to.be.equal(1);
                expect(stub.getCall(index).args[0]).to.be.deep.equal({
                    address : "address",
                    publicKey : key.substring(1)
                });
            });
        });

        it("no errors is thrown", async () => {
            await instance.apply(tx, block, sender);
        });
    });

    describe("undo()", () => {
        let tx;
        let block;
        let sender;

        beforeEach(() => {
            tx = {
                asset : {
                    multisignature : {
                        lifetime : 123,
                        min : 123,
                        keysgroup : ["+key1","+key2"]
                    }
                }
            };
            block = {
                id : "id",
                height : 200
            };
            sender = {
                address : "123abc"
            };

            modules.rounds.calcRound.returns("round");
            library.account.merge.resolves();
        });

        it("unconfirmedSignatures with sender.address is added", async () => {
            expect(instance.unconfirmedSignatures[sender.address]).to.be.undefined;
            await instance.undo(tx, block, sender);
            expect(instance.unconfirmedSignatures[sender.address]).to.be.true;
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
                blockId        : block.id,
                multilifetime  : -tx.asset.multisignature.lifetime,
                multimin       : -tx.asset.multisignature.min,
                multisignatures: Diff.reverse(tx.asset.multisignature.keysgroup),
                round          : "round"
            });
            expect(library.account.merge.firstCall.args[2]).to.be.a("function");
        });

        it("no errors is thrown", async () => {
            await instance.undo(tx, block, sender);
        });
    });

    describe("applyUnconfirmed()", () => {
        let tx;
        let block;
        let sender;

        beforeEach(() => {
            tx = {
                asset : {
                    multisignature : {
                        lifetime : 123,
                        min : 123,
                        keysgroup : ["+key1","+key2"]
                    }
                }
            };
            block = {
                id : "id",
                height : 200
            };
            sender = {
                address : "123abc"
            };

            modules.rounds.calcRound.returns("round");
            library.account.merge.resolves();
        });

        it("error is thrown when address exists", async () => {
            instance.unconfirmedSignatures[sender.address] = true;
            try {
                await instance.applyUnconfirmed(tx, sender);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Signature on this account is pending confirmation");
            }
        });

        it("unconfirmedSignatures with sender.address is added", async () => {
            expect(instance.unconfirmedSignatures[sender.address]).to.be.undefined;
            await instance.applyUnconfirmed(tx, sender);
            expect(instance.unconfirmedSignatures[sender.address]).to.be.true;
        });

        it("library.account.merge is called", async () => {
            await instance.applyUnconfirmed(tx, sender);

            expect(library.account.merge.calledOnce).to.be.true;
            expect(library.account.merge.firstCall.args.length).to.be.equal(3);
            expect(library.account.merge.firstCall.args[0]).to.be.equal(sender.address);
            expect(library.account.merge.firstCall.args[1]).to.be.deep.equal({
                u_multilifetime  : tx.asset.multisignature.lifetime,
                u_multimin       : tx.asset.multisignature.min,
                u_multisignatures: tx.asset.multisignature.keysgroup
            });
            expect(library.account.merge.firstCall.args[2]).to.be.a("function");
        });

        it("no errors is thrown", async () => {
            await instance.applyUnconfirmed(tx, sender);
        });
    });

    describe("undoUnconfirmed()", () => {
        let tx;
        let block;
        let sender;

        beforeEach(() => {
            tx = {
                asset : {
                    multisignature : {
                        lifetime : 123,
                        min : 123,
                        keysgroup : ["+key1","+key2"]
                    }
                }
            };
            block = {
                id : "id",
                height : 200
            };
            sender = {
                address : "123abc"
            };

            modules.rounds.calcRound.returns("round");
            library.account.merge.resolves();
        });

        it("unconfirmedSignatures with sender.address is deleted", async () => {
            instance.unconfirmedSignatures[sender.address] = true;
            expect(instance.unconfirmedSignatures[sender.address]).to.be.true;
            await instance.undoUnconfirmed(tx, sender);
            expect(instance.unconfirmedSignatures[sender.address]).to.be.undefined;
        });

        it("library.account.merge is called", async () => {
            await instance.undoUnconfirmed(tx, sender);

            expect(library.account.merge.calledOnce).to.be.true;
            expect(library.account.merge.firstCall.args.length).to.be.equal(3);
            expect(library.account.merge.firstCall.args[0]).to.be.equal(sender.address);
            expect(library.account.merge.firstCall.args[1]).to.be.deep.equal({
                u_multilifetime  : -tx.asset.multisignature.lifetime,
                u_multimin       : -tx.asset.multisignature.min,
                u_multisignatures: Diff.reverse(tx.asset.multisignature.keysgroup)
            });
            expect(library.account.merge.firstCall.args[2]).to.be.a("function");
        });

        it("no errors is thrown", async () => {
            await instance.undoUnconfirmed(tx, sender);
        });
    });

    describe("objectNormalize()", () => {
        let tx;
        let errors;

        beforeEach(() => {
            tx = {
                asset : {
                    multisignature : {}
                }
            };
            errors = [new Error("first"),new Error("second")];

            library.schema.validate.returns(true);
            library.schema.getLastErrors.returns(errors);
        });

        it("library.schema.validate is called", () => {
            instance.objectNormalize(tx);

            expect(library.schema.validate.calledOnce).to.be.true;
            expect(library.schema.validate.firstCall.args.length).to.be.equal(2);
            expect(library.schema.validate.firstCall.args[0]).to.be.equal(tx.asset.multisignature);
            expect(library.schema.validate.firstCall.args[1]).to.be.equal(multiSigSchema);
        });

        it("error is thrown; getLastErrors is called", () => {
            library.schema.validate.returns(false);
            try {
                instance.objectNormalize(tx);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(library.schema.getLastErrors.calledOnce).to.be.true;
                expect(library.schema.getLastErrors.firstCall.args.length).to.be.equal(0);
            }
        });

        it("error is thrown; check error", () => {
            library.schema.validate.returns(false);
            try {
                instance.objectNormalize(tx);
                throw new Error("Error should be thrown");
            } catch(e) {
                expect(e).to.be.instanceof(Error);
                expect(e.message).to.be.equal("Failed to validate multisignature schema: first, second");
            }
        });

        it("compare result", () => {
            const result = instance.objectNormalize(tx);
            expect(result).to.be.equal(tx);
        });
    });

    describe("dbRead()", () => {
        let raw : any;

        beforeEach(() => {
            raw = {
                m_lifetime : 1,
                m_min : 2,
                m_keysgroup : "keys1,key2"
            };
        });

        it("null is returned if no keysgroup", () => {
            delete raw.m_keysgroup;
            const result = instance.dbRead(raw);
            expect(result).to.be.null;
        });

        it("compare result", () => {
            const result = instance.dbRead(raw);
            expect(result).to.be.deep.equal({
                multisignature : {
                    keysgroup: raw.m_keysgroup.split(','),
                    lifetime : raw.m_lifetime,
                    min      : raw.m_min,
                } 
            });
        });
    });

    describe("dbSave()", () => {
        it("compare result", () => {
            const tx = {
                id : "id",
                asset : {
                    multisignature : {
                        min : 1,
                        lifetime : 2,
                        keysgroup : ["key1","key2"]
                    }
                }
            };
            const result = instance.dbSave(tx);
            expect(result).to.be.deep.equal({
                table : instance.dbTable,
                fields: instance.dbFields,
                values: {
                    min          : tx.asset.multisignature.min,
                    lifetime     : tx.asset.multisignature.lifetime,
                    keysgroup    : tx.asset.multisignature.keysgroup.join(','),
                    transactionId: tx.id,
                }
            });
        });
    });

    describe("afterSave()", () => {
        it("scoket.emit is called", async () => {
            const tx = {};
            await instance.afterSave(tx);
            expect(library.network.io.sockets.emit.calledOnce).to.be.true;
            expect(library.network.io.sockets.emit.firstCall.args.length).to.be.equal(2);
            expect(library.network.io.sockets.emit.firstCall.args[0]).to.be.equal("multisignatures/change");
            expect(library.network.io.sockets.emit.firstCall.args[1]).to.be.equal(tx);
        });
    });

    describe("ready()", () => {
        let tx;
        let sender;

        beforeEach(() => {
            tx = {
                signatures : ["key1","key2"],
                asset : {
                    multisignature : {
                        keysgroup : ["key1","key2"]
                    }
                }
            };
            sender = {
                multisignatures : ["sig1","sig2"],
                multimin : 2
            };
        });

        it("tx.signatures are not an array", () => {
            delete tx.signatures;
            const result = instance.ready(tx, sender);
            expect(result).to.be.false;
        });

        it("sender without multisignature; same keysgroup length", () => {
            delete sender.multisignatures;
            const result = instance.ready(tx, sender);
            expect(result).to.be.true;
        });

        it("sender without multisignature; not same keysgroup length", () => {
            delete sender.multisignatures;
            tx.signatures.push("key3");
            const result = instance.ready(tx, sender);
            expect(result).to.be.false;
        });

        it("sender with multisignature; same length", () => {
            const result = instance.ready(tx, sender);
            expect(result).to.be.true;
        });

        it("sender with multisignature; not same length", () => {
            sender.multimin = 3;
            const result = instance.ready(tx, sender);
            expect(result).to.be.false;
        });
    });
});
