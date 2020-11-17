/* global describe it before after */

const sinon = require('sinon')

const assert = require('assert')
const ItemsUpdater = require('./../lib/items-updater')
const db = require('./../lib/db')
const ItemSierraRecord = require('./../lib/models/item-sierra-record')

describe('Items Updater', function () {
  describe('_getBibIdsForItemStatements', function () {
    before(() => {
      sinon.stub(db, 'getStatement').callsFake((type, subjectId, predicate) => {
        // Mocked for single test lookup:
        return Promise.resolve({
          subject_id: 'ci5651186',
          predicate: 'nypl:bnum',
          object_id: 'urn:bnum:cb4194299'
        })
      })
    })

    after(() => {
      db.getStatement.restore()
    })

    it('should derive bibId from statements if given', function () {
      const itemRecord = ItemSierraRecord.from({
        id: '5651186',
        nyplSource: 'recap-cul',
        nyplType: 'item',
        bibIds: ['1234-bib-id-given-in-record']
      })
      // First run this record through the serializer to extract item statements
      return ItemsUpdater.prototype.extractStatements(itemRecord)
        .then((statements) => {
          // Now run those statements through this utility function that
          // identifies the bibIds that need to be reindexed based on the
          // item statements:
          return ItemsUpdater.prototype._getBibIdsForItemStatements(statements)
            .then((bibIdsToReindex) => {
              // We expect a single bibId to be extracted matching the value
              // in the moch marc-json (with 'cb' prefix):
              assert.strictEqual(bibIdsToReindex.length, 1)
              assert.strictEqual(bibIdsToReindex[0], 'cb1234-bib-id-given-in-record')
            })
        })
    })

    it('should lookup bibIds if missing', function () {
      // This is what a item marc json record looks like when it's deleted:
      const itemRecord = ItemSierraRecord.from({
        id: '5651186',
        nyplSource: 'recap-cul',
        nyplType: 'item',
        deletedDate: '2011-02-28',
        deleted: true
      })
      // First run this record through the serializer to extract item statements
      return ItemsUpdater.prototype.extractStatements(itemRecord)
        .then((statements) => {
          // Now run those statements through this utility function that
          // identifies the bibIds that need to be reindexed based on the
          // item statements:
          return ItemsUpdater.prototype._getBibIdsForItemStatements(statements)
            .then((bibIdsToReindex) => {
              // We expect a single bibId derived from db (stubbed with
              // mocked response above):
              assert.strictEqual(bibIdsToReindex.length, 1)
              assert.strictEqual(bibIdsToReindex[0], 'cb4194299')
            })
        })
    })
  })
})
