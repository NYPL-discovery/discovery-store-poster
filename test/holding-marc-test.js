/* global describe it */

const expect = require('chai').expect
const assert = require('assert')
const holdingSerializer = require('./../lib/serializers/holding')
const HoldingSierraRecord = require('./../lib/models/holding-sierra-record')
const Holding = require('./../lib/models/holding')
const buildMapper = require('./../lib/field-mapper')

describe('Holding Marc Mapping', () => {
  describe('Parse', function () {
    it('parses suppressed/deleted as suppressed', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1080389-deleted.json'))
      assert(holding.suppressed, true)
      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.strictEqual(holding.literal('nypl:suppressed'), true)
        })
    })

    it('should parse marc mapping', () => {
      const mapper = buildMapper('holding', null)

      const mapping = mapper.getMapping('Holding Statement')
      assert.strictEqual(mapping.paths.length, 5)
      assert.strictEqual(mapping.paths[0].marc, '866')
      assert.strictEqual(mapping.paths[2].marc, '863')
    })

    it('should extract certain basic holding props', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1082762.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.strictEqual(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.strictEqual(holding.objectId('nypl:bnum'), 'urn:bnum:b14630864')
          assert.strictEqual(holding.objectId('nypl:holdingLocation'), 'loc:mal')
          assert.strictEqual(holding.literal('nypl:shelfMark'), 'JBM 00-489')
        })
    })

    it('should extract format statements from legacy i fieldTag', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1082762.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.strictEqual(holding.literal('dcterms:format'), 'PRINT')
        })
    })

    it('should create multiple shelfMarks that include prefixes and suffixes', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1089484.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.strictEqual(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.strictEqual(holding.objectId('nypl:bnum'), 'urn:bnum:b16543663')
          assert.strictEqual(holding.literals('nypl:shelfMark')[0], '*R-SIBL NK9509 .T722 Latest ed.')
          assert.strictEqual(holding.literals('nypl:shelfMark')[1], 'JBM 07-158 Bound vols.')
        })
    })

    it('should create multiple holdings statements for all supplied fields', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1089484.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.strictEqual(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.strictEqual(holding.objectId('nypl:bnum'), 'urn:bnum:b16543663')
          assert.strictEqual(holding.literals('dcterms:coverage')[0], '[Bound vols.-SIBL Delivery Desk] ed. 14 (2007)-ed. 19 (2013),')
          assert.strictEqual(holding.literals('dcterms:coverage')[1], 'ed.  20 (2015)')
        })
    })

    it('should create blank nodes for all supplied check in boxes', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1089484.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.strictEqual(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.strictEqual(holding.objectId('nypl:bnum'), 'urn:bnum:b16543663')

          const checkInBox1 = holding.blankNodes('dcterms:hasPart')[0]
          assert.strictEqual(checkInBox1.objectId('rdf:type'), 'nypl:CheckInBox')
          assert.strictEqual(checkInBox1.literal('dcterms:coverage'), '20 (--)')
          assert.strictEqual(checkInBox1.literal('bf:status'), 'Bound')
          assert.strictEqual(checkInBox1.literal('bf:count'), undefined)
          assert.strictEqual(checkInBox1.literal('bf:part'), 1)

          const checkInBox2 = holding.blankNodes('dcterms:hasPart')[1]
          assert.strictEqual(checkInBox2.objectId('rdf:type'), 'nypl:CheckInBox')
          assert.strictEqual(checkInBox2.literal('dcterms:coverage'), '21 (--)')
          assert.strictEqual(checkInBox2.literal('bf:status'), 'Expected')
          assert.strictEqual(checkInBox2.literal('bf:count'), undefined)
          assert.strictEqual(checkInBox2.literal('bf:part'), 2)
        })
    })

    it('should create item statements for each checkin card box', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1089484.json'))
      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => {
          // assert that both checkin cards got processed
          assert(statements.some((statement) => statement.subject_id.includes('-0')))
          assert(statements.some((statement) => statement.subject_id.includes('-1')))
          // assert that all statements were added
          assert(statements.some((statement) => statement.predicate.includes('volumeRaw')))

          // Assert that this fixture has no parsable dates because it has
          // start_date '--' and end_date null
          assert(!statements.some((statement) => statement.predicate.includes('dateRange')))

          assert(statements.some((statement) => statement.predicate.includes('status')))
          assert(statements.some((statement) => statement.predicate.includes('shelfMark')))
          assert(statements.some((statement) => statement.predicate.includes('format')))
          assert(statements.some((statement) => statement.predicate.includes('accessMessage')))
          assert(statements.some((statement) => statement.predicate.includes('enumerationAndChronology')))
        })
    })

    it('should create multiple note statements', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1066022.json'))

      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => new Holding(statements))
        .then((holding) => {
          assert.strictEqual(holding.objectId('rdfs:type'), 'nypl:Holding')
          assert.strictEqual(holding.objectId('nypl:bnum'), 'urn:bnum:b11929657')
          assert.strictEqual(holding.literals('bf:note')[0], 'Checkin **EDITION SPECIALE** here.')
          assert.strictEqual(holding.literals('bf:note')[1], 'IRREGULAR')
        })
    })

    it('should create item statement for volume range', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-with-volume-range.json'))
      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => {
          // Group by subject (i.e. item) id:
          const statementsBySubjectId = statements.reduce((h, s) => {
            if (!h[s.subject_id]) h[s.subject_id] = []
            h[s.subject_id].push(s)
            return h
          }, {})
          expect(statementsBySubjectId['i-h1089484-0'].filter((s) => s.predicate === 'nypl:volumeRange')[0].object_literal)
            .to.deep.equal([21, 26])
          expect(statementsBySubjectId['i-h1089484-1'].filter((s) => s.predicate === 'nypl:volumeRange')[0].object_literal)
            .to.deep.equal([21, 21])
          expect(statementsBySubjectId['i-h1089484-1'].filter((s) => s.predicate === 'nypl:holdingLocation')[0].object_id)
            .to.deep.equal('loc:slrb1')
        })
    })
    it('should create item statements with parsed date ranges for each checkin card box', () => {
      const holding = HoldingSierraRecord.from(require('./data/holding-1032862.json'))
      return holdingSerializer.fromMarcJson(holding)
        .then((statements) => {
          // Group by subject (i.e. item) id:
          const statementsBySubjectId = statements.reduce((h, s) => {
            if (!h[s.subject_id]) h[s.subject_id] = []
            h[s.subject_id].push(s)
            return h
          }, {})

          expect(statementsBySubjectId['i-h1032862-0'].filter((s) => s.predicate === 'nypl:dateRange')[0].object_literal)
            .to.deep.equal(['2012-01-01', '2012-01-01'])
          expect(statementsBySubjectId['i-h1032862-0'].filter((s) => s.predicate === 'bf:enumerationAndChronology')[0].object_literal)
            .to.equal('Jan. 2012')
          expect(statementsBySubjectId['i-h1032862-1'].filter((s) => s.predicate === 'nypl:dateRange')[0].object_literal)
            .to.deep.equal(['2012-03-01', '2012-03-01'])
          expect(statementsBySubjectId['i-h1032862-1'].filter((s) => s.predicate === 'bf:enumerationAndChronology')[0].object_literal)
            .to.equal('Mar. 2012')

          expect(statementsBySubjectId['i-h1032862-2'].filter((s) => s.predicate === 'nypl:dateRange')[0].object_literal)
            .to.deep.equal(['2012-05-01', '2012-05-01'])
          expect(statementsBySubjectId['i-h1032862-2'].filter((s) => s.predicate === 'bf:enumerationAndChronology')[0].object_literal)
            .to.equal('May. 2012')
          expect(statementsBySubjectId['i-h1032862-2'].filter((s) => s.predicate === 'nypl:holdingLocation')[0].object_id)
            .to.equal('loc:scf')
        })
    })
  })
})
