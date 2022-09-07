/* global describe it before after */

const sinon = require('sinon')

const assert = require('assert')
const BibsUpdater = require('./../lib/bibs-updater')
const ItemsUpdater = require('./../lib/items-updater')
const db = require('./../lib/db')
const BibSierraRecord = require('./../lib/models/bib-sierra-record')
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

  describe('item fromMarcJson', function () {
    it('should use bib data as fallback when necessary', function () {
      const bibData = require('./data/bib-15083136.json')
      const bib = new BibSierraRecord(bibData)
      const statementExtractors = [
        (new BibsUpdater()).extractStatements(bib)
      ].concat(bibData.items.map((item) => (new ItemsUpdater()).extractStatements(new ItemSierraRecord(item), bib)))

      return Promise.all(statementExtractors).then((statements) => {
        const flatStatements = statements.reduce((acc, el) => acc.concat(el), [])
        const nyplShelfMarkStatements = flatStatements
          .filter((statement) => statement.predicate === 'nypl:shelfMark')
          .map((statement) => statement.object_literal)
          .sort()

        const expectedShelMarkStatements = [
          'QKG (Mosquito news)',
          'QKG (Mosquito news) v. 1-2 (Dec. 1942)',
          'QKG (Mosquito news) v. 12-13 (1952-53)',
          'QKG (Mosquito news) v. 14-15 (1954-55)',
          'QKG (Mosquito news) v. 16-17 (1956-57)',
          'QKG (Mosquito news) v. 18-19 (1958-59)',
          'QKG (Mosquito news) v. 20-21 (1960-61)',
          'QKG (Mosquito news) v. 22-23 (1962-63)',
          'QKG (Mosquito news) v. 24-25 (1964-65)',
          'QKG (Mosquito news) v. 26 (1966)',
          'QKG (Mosquito news) v. 27 (1967)',
          'QKG (Mosquito news) v. 28 (1968)',
          'QKG (Mosquito news) v. 29 (1969)',
          'QKG (Mosquito news) v. 3-4 (June 1943-Dec. 1944)',
          'QKG (Mosquito news) v. 30 (1970)',
          'QKG (Mosquito news) v. 31 (1971)',
          'QKG (Mosquito news) v. 5-6 (1945-46)',
          'QKG (Mosquito news) v. 7-9 (1947-49)'
        ]
        assert.deepStrictEqual(nyplShelfMarkStatements, expectedShelMarkStatements)
      })
    })
  })
})
