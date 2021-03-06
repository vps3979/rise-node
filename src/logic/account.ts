import * as crypto from 'crypto';
import { inject, injectable } from 'inversify';
import * as jsonSqlCreator from 'json-sql';
import * as path from 'path';
import * as pgp from 'pg-promise';
import { IDatabase } from 'pg-promise';
import * as z_schema from 'z-schema';
import { BigNum, catchToLoggerAndRemapError, cback, emptyCB, ILogger, promiseToCB } from '../helpers/';
import { IAccountLogic } from '../ioc/interfaces/';
import { Symbols } from '../ioc/symbols';
import { accountsModelCreator } from './models/account';
import { IModelField, IModelFilter } from './models/modelField';

const jsonSql = jsonSqlCreator();

jsonSql.setDialect('postgresql');

// tslint:disable-next-line
export type OptionalsMemAccounts = {
  username?: string;
  isDelegate?: number;
  u_isDelegate?: number;
  secondSignature?: number;
  u_secondSignature?: number;
  u_username?: string;
  address?: string;
  publicKey?: string;
  secondPublicKey?: string;
  balance?: number;
  u_balance?: number;
  vote?: number;
  rate?: number;
  delegates?: string;
  u_delegates?: string;
  multisignatures?: string[];
  u_multisignatures?: string[];
  multimin?: number;
  u_multimin?: number;
  multilifetime?: number;
  u_multilifetime?: number;
  blockId?: string;
  nameexist?: number;
  u_nameexist?: number;
  producedblocks?: number;
  missedblocks?: number;
  fees?: number;
  rewards?: number;
  virgin?: number;
};
// tslint:disable-next-line
export type MemAccountsData = OptionalsMemAccounts & {
  username: string;
  isDelegate: number;
  u_isDelegate: number;
  secondSignature: number;
  u_secondSignature: number;
  u_username: string;
  address: string;
  publicKey: string;
  secondPublicKey: string;
  balance: number;
  u_balance: number;
  vote: number;
  rate: number;
  delegates: string;
  u_delegates: string;
  multisignatures: string[];
  u_multisignatures: string[];
  multimin: number;
  u_multimin: number;
  multilifetime: number;
  u_multilifetime: number;
  blockId: string;
  nameexist: number;
  u_nameexist: number;
  producedblocks: number;
  missedblocks: number;
  fees: number;
  rewards: number;
  virgin: number;
};

// tslint:disable-next-line
export type AccountFilterData = {
  isDelegate?: 1 | 0;
  username?: string;
  address?: string | { $in: string[] };
  publicKey?: string;
  limit?: number;
  offset?: number;
  sort?: string | { [k: string]: -1 | 1 }
};

@injectable()
export class AccountLogic implements IAccountLogic {
  private table = 'mem_accounts';

  /**
   * All fields
   */
  private fields: Array<{ alias: string, field?: string, expression?: string }> = [];
  /**
   * Binary fields
   */
  private binary: string[];

  /**
   * Filters by field
   */
  private filter: { [fieldName: string]: IModelFilter } = {};

  /**
   * Conversions by fieldName
   */
  private conv: { [fieldName: string]: any } = {};

  private model: IModelField[];

  /**
   * List of editable fields.
   */
  private editable: string[];

  @inject(Symbols.generic.db)
  private db: IDatabase<any>;

  @inject(Symbols.generic.zschema)
  private schema: z_schema;

  @inject(Symbols.helpers.logger)
  private logger: ILogger;

  constructor() {
    this.model = accountsModelCreator(this.table);

    this.fields = this.model.map((field) => {
      const tmp: any = {};
      if (field.expression) {
        tmp.expression = field.expression;
      } else {
        if (field.mod) {
          tmp.expression = field.mod;
        }
        tmp.field = field.name;
      }
      if (tmp.expression || field.alias) {
        tmp.alias = field.alias || field.name;
      }
      return tmp;
    });

    // binary fields
    this.binary = this.model
      .filter((f) => f.type === 'Binary')
      .map((f) => f.name);

    // filters
    this.model.forEach((field) => this.filter[field.name] = field.filter);

    // conversions
    this.model.forEach((field) => this.conv[field.name] = field.conv);

    // build editable fields
    this.editable = this.model
      .filter((field) => !field.immutable)
      .map((field) => field.name);

  }

  /**
   * Creates memory tables related to accounts!
   */
  public createTables(): Promise<void> {
    const sql = new pgp.QueryFile(path.join(process.cwd(), 'sql', 'memoryTables.sql'), { minify: true });
    return this.db.query(sql)
      .catch(catchToLoggerAndRemapError('Account#createTables error', this.logger));
  }

  /**
   * Deletes the content of memory tables
   * - mem_round
   * - mem_accounts2delegates
   * - mem_accounts2u_delegates
   * - mem_accounts2multisignatures
   * - mem_accounts2u_multisignatures
   * @param cb
   * @returns {Promise<void>}
   */
  public removeTables(): Promise<void> {
    const fullQuery = [
      this.table,
      'mem_round',
      'mem_accounts2delegates',
      'mem_accounts2u_delegates',
      'mem_accounts2multisignatures',
      'mem_accounts2u_multisignatures',
    ].map((table) => jsonSql
      .build({
        table,
        type: 'remove',
      })
      .query
    )
      .join('');

    return this.db.query(fullQuery)
      .catch(catchToLoggerAndRemapError('Account#removeTables error', this.logger));
  }

  /**
   * Runs the account through schema validation and eventually throw if not valid
   * @param account
   * TODO: Describe account
   */
  public objectNormalize(account: any) {
    const report: boolean = this.schema.validate(account, {
      id        : 'Account',
      object    : true,
      properties: this.filter,
    });

    if (!report) {
      throw new Error(`Failed to validate account schema: ${this.schema.getLastErrors()
        .map((err) => err.message).join(', ')}`);
    }
    return account;
  }

  /**
   * Verifies validity of public Key
   * @param {string} publicKey
   */
  public assertPublicKey(publicKey: string, allowUndefined: boolean = true) {
    if (typeof(publicKey) !== 'undefined') {
      if (typeof(publicKey) !== 'string') {
        throw new Error('Invalid public key, must be a string');
      }
      if (publicKey.length !== 64) {
        throw new Error('Invalid public key, must be 64 characters long');
      }

      if (!this.schema.validate(publicKey, { format: 'hex' })) {
        throw new Error('Invalid public key, must be a hex string');
      }
    } else if (!allowUndefined) {
      throw new Error('Public Key is undefined');
    }
  }

  /**
   * Normalize address and creates binary buffers to insert.
   * @param raw
   * @returns {any}
   */
  public toDB(raw: any) {
    this.binary.forEach((field) => {
      if (raw[field]) {
        raw[field] = Buffer.from(raw[field], 'hex');
      }
    });
    raw.address = String(raw.address).toUpperCase();
    return raw;
  }

  /**
   * Get account information for specific fields and filtering criteria
   */
  // tslint:disable-next-line max-line-length
  public get(filter: AccountFilterData, fields: Array<(keyof MemAccountsData)> = this.fields.map((field) => field.alias || field.field) as any): Promise<MemAccountsData> {
    return this.getAll(filter, fields)
      .then((res) => res[0]);
  }

  /**
   * Get accountS information for specific fields and filtering criteria.
   */
  public getAll(filter: AccountFilterData, fields?: Array<(keyof MemAccountsData)>): Promise<MemAccountsData[]> {
    if (!Array.isArray(fields)) {
      fields = this.fields.map((field) => field.alias || field.field) as any;
    }

    const theFields = fields as string[]; // Ts fuck

    const realFields = this.fields.filter((field) => theFields.indexOf(field.alias || field.field) !== -1);

    const realConv = {};
    Object.keys(this.conv)
      .filter((key) => theFields.indexOf(key) !== -1)
      .forEach((key) => realConv[key] = this.conv[key]);

    const limit: number  = filter.limit > 0 ? filter.limit : undefined;
    const offset: number = filter.offset > 0 ? filter.offset : undefined;
    const sort: any      = filter.sort ? filter.sort : undefined;

    const condition: any = { ...filter, ...{ limit: undefined, offset: undefined, sort: undefined } };
    if (typeof(filter.address) === 'string') {
      condition.address = {
        $upper: ['address', filter.address],
      };
    }
    // Remove fields = undefined (such as limit, offset and sort)
    Object.keys(condition).forEach((k) => {
      if (typeof(condition[k]) === 'undefined') {
        delete condition[k];
      }
    });

    const sql = jsonSql.build({
      alias : 'a',
      condition,
      fields: realFields,
      limit,
      offset,
      sort,
      table : this.table,
      type  : 'select',
    });

    return this.db.query(sql.query, sql.values)
      .catch(catchToLoggerAndRemapError('Account#getAll error', this.logger));
  }

  /**
   * Sets fields for specific address in mem_accounts table
   * @param {string} address
   * @param fields
   * @param {cback<any>} cb
   */
  public set(address: string, fields: { [k: string]: any }, cb?: cback<any>) {
    return promiseToCB((async () => {
        this.assertPublicKey(fields.publicKey);
        address        = String(address).toUpperCase();
        fields.address = address;
        const sql      = jsonSql.build({
          conflictFields: ['address'],
          modifier      : this.toDB(fields),
          table         : this.table,
          type          : 'insertorupdate',
          values        : this.toDB(fields),
        });

        return this.db.none(sql.query, sql.values)
          .catch(catchToLoggerAndRemapError('Account#set error', this.logger));
      })(),
      cb
    );
  }

  /**
   * Updates account from mem_account with diff data belongings to an editable field
   * Inserts into mem_round "address", "amount", "delegate", "blockId", "round"
   * based on field balance or delegates.
   * @param {string} address
   * @param {MemAccountsData} diff
   * @param {cback<any>} cb
   * @returns {Promise<any>}
   */
  public merge(address: string, diff: any): string;
  public merge(address: string, diff: any, cb: cback<any>): Promise<any>;
  public merge(address: string, diff: any, cb?: cback<any>) {
    const update: any       = {};
    const remove: any       = {};
    const insert: any       = {};
    const insertObject: any = {};
    const removeObject: any = {};
    const round: any        = [];

    address = address.toUpperCase();
    this.assertPublicKey(diff.publicKey);
    for (const fieldName of this.editable) {
      if (typeof(diff[fieldName]) === 'undefined') {
        continue;
      }
      const trueValue = diff[fieldName];
      switch (this.conv[fieldName]) {
        case String:
          update[fieldName] = trueValue;
          break;
        case Number:
          if (isNaN(trueValue) || trueValue === Infinity) {
            return promiseToCB(Promise.reject(`Encountered insane number: ${trueValue}`), cb);
          }
          if (Math.abs(trueValue) === trueValue && trueValue !== 0) {
            update.$inc            = update.$inc || {};
            update.$inc[fieldName] = Math.floor(trueValue);
            if (fieldName === 'balance') {
              round.push({
                // tslint:disable-next-line
                query : 'INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT ${address}, (${amount})::bigint, "dependentId", ${blockId}, ${round} FROM mem_accounts2delegates WHERE "accountId" = ${address};',
                values: {
                  address,
                  amount : trueValue,
                  blockId: diff.blockId,
                  round  : diff.round,
                },
              });
            }
          } else if (trueValue < 0) {
            update.$dec            = update.$dec || {};
            update.$dec[fieldName] = Math.floor(Math.abs(trueValue));
            // If decrementing u_balance on account
            if (update.$dec.u_balance) {
              // Remove virginity and ensure marked columns become immutable
              update.virgin = 0;
            }
            if (fieldName === 'balance') {
              round.push({
                // tslint:disable-next-line
                query : 'INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT ${address}, (${amount})::bigint, "dependentId", ${blockId}, ${round} FROM mem_accounts2delegates WHERE "accountId" = ${address};',
                values: {
                  address,
                  amount : trueValue,
                  blockId: diff.blockId,
                  round  : diff.round,
                },
              });
            }
          }
          break;
        case Array:
          if (Object.prototype.toString.call(trueValue[0]) === '[object Object]') {

            for (const val of (trueValue as Array<{ action?: '-' | '+' } & any>)) {
              if (val.action === '-') {
                delete val.action;
                removeObject[fieldName]           = removeObject[fieldName] || [];
                removeObject[fieldName].accountId = address;
                removeObject[fieldName].push(val);
              } else {
                delete val.action;
                insertObject[fieldName]           = insertObject[fieldName] || [];
                insertObject[fieldName].accountId = address;
                insertObject[fieldName].push(val);
              }
            }
          } else {
            for (const val of (trueValue as string[])) {
              const sign: string = val[0];
              if (sign !== '-') {
                const theVal      = sign === '+' ? val.slice(1) : val;
                insert[fieldName] = insert[fieldName] || [];
                insert[fieldName].push(theVal);
                if (fieldName === 'delegates') {
                  round.push({
                    // tslint:disable-next-line
                    query : 'INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT ${address}, (balance)::bigint, ${delegate}, ${blockId}, ${round} FROM mem_accounts WHERE address = ${address};',
                    values: {
                      address,
                      blockId : diff.blockId,
                      delegate: theVal,
                      round   : diff.round,
                    },
                  });
                }
              } else {
                const theVal      = val.slice(1);
                remove[fieldName] = remove[fieldName] || [];
                remove[fieldName].push(theVal);
                if (fieldName === 'delegates') {
                  round.push({
                    // tslint:disable-next-line
                    query : 'INSERT INTO mem_round ("address", "amount", "delegate", "blockId", "round") SELECT ${address}, (-balance)::bigint, ${delegate}, ${blockId}, ${round} FROM mem_accounts WHERE address = ${address};',
                    values: {
                      address,
                      blockId : diff.blockId,
                      delegate: theVal,
                      round   : diff.round,
                    },
                  });
                }
              }
            }
          }
          break;
      }

    }

    const sqles = Object.keys(remove)

    // All remove
      .map((el) => jsonSql.build({
        condition: {
          dependentId: { $in: remove[el] },
          // tslint:disable-next-line
          accountId  : address,
        },
        table    : `${this.table}2${el}`,
        type     : 'remove',
      }))

      // Lets do all inserts
      .concat(Object.keys(insert)
        .map((el) => insert[el]
          .map((dependentId) => jsonSql.build({
            table : `${this.table}2${el}`,
            type  : 'insert',
            values: {
              accountId: address,
              dependentId,
            },
          }))
        ).reduce((a, b) => a.concat(b), [])
      )

      // All remove objects
      .concat(Object.keys(removeObject)
        .map((el) => jsonSql.build({
          condition: removeObject[el],
          table    : `${this.table}2${el}`,
          type     : 'remove',
        })))

      // All inserts - TODO: Check code logically differs here from original implementation
      .concat(Object.keys(insertObject)
        .map((el) => jsonSql.build({
          table : `${this.table}2${el}`,
          type  : 'insert',
          values: insertObject[el],
        })));

    if (Object.keys(update).length > 0) {
      sqles.push(jsonSql.build({
        condition: { address },
        modifier : update,
        table    : this.table,
        type     : 'update',
      }));
    }

    const sqlQuery: string = sqles.concat(round)
      .map((sql) => pgp.as.format(sql.query, sql.values))
      .join('');

    // If callback is not given then return the built query.
    // TODO: this is not a good coding practice but third party code relies on this.
    if (!cb) {
      return sqlQuery;
    }

    if (sqlQuery.length === 0) {
      // Nothing to run return account
      return this.get({ address });
    }

    return promiseToCB(
      this.db.none(sqlQuery)
        .then(() => this.get({ address }))
        .catch((err) => {
          this.logger.error(err.stack);
          return Promise.reject('Account#merge error');
        }),
      cb
    );
  }

  /**
   * Removes an account from mem_account table based on address.
   * @param {string} address
   * @param {cback<string>} cb
   * @returns {Promise<string>}
   */
  public remove(address: string, cb: cback<string>): Promise<string> {
    const sql = jsonSql.build({
      condition: { address },
      table    : this.table,
      type     : 'remove',
    });
    return promiseToCB(
      this.db.none(sql.query, sql.values)
        .then(() => address)
        .catch(catchToLoggerAndRemapError('Account#remove error', this.logger)),
      cb
    );
  }

  public generateAddressByPublicKey(publicKey: string): string {
    this.assertPublicKey(publicKey, false);

    const hash = crypto.createHash('sha256')
      .update(new Buffer(publicKey, 'hex'))
      .digest();

    const tmp = Buffer.alloc(8);
    for (let i = 0; i < 8; i++) {
      tmp[i] = hash[7 - i];
    }
    return `${BigNum.fromBuffer(tmp).toString()}R`;
  }
}
