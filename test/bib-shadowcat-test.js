/* global describe it */

// var request = require('request')
const assert = require('assert')
const shadowcatRemediator = require('./../lib/shadowcat-remediator')
const BibSierraRecord = require('./../lib/models/bib-sierra-record')

describe('Bib Shadowcat', function () {
  this.timeout(1000)

  describe('shadowcat', function () {
    it('should pull shadowcat fields', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10011374.json'))

      return shadowcatRemediator.fromMarcJson(bib)
        .then((statements) => {
          // console.log('got statements: ', statements)
          var workIdStatements = statements.filter((s) => s.predicate === 'nypl:workId')
          assert(workIdStatements)
          assert.equal(workIdStatements.length, 1)
          assert.equal(workIdStatements[0].object_id, 'urn:owi:2260899506')
/*
  Statement {
    subject_id: 'b10011374',
    predicate: 'dcterms:identifier',
    source_id: 10000,
    source_record_id: '10011374',
    creator_id: 2,
    index: 0,
    object_id: 'urn:oclc:10310322',
    source_record_path: 'classify:oclc' },
  Statement {
    subject_id: 'b10011374',
    predicate: 'dcterms:identifier',
    source_id: 10000,
    source_record_id: '10011374',
    creator_id: 2,
    index: 1,
    object_id: 'urn:lcc:DA110',
    source_record_path: 'classify:lcc' },
  Statement {
    subject_id: 'b10011374',
    predicate: 'dcterms:identifier',
    source_id: 10000,
    source_record_id: '10011374',
    creator_id: 2,
    index: 2,
    object_id: 'urn:lccCoarse:DA90-125',
    source_record_path: 'sc:lccCoarse' } ]
*/
          var identifierStatements = statements.filter((s) => s.predicate === 'dcterms:identifier')
          assert(identifierStatements)
          assert.equal(identifierStatements.length, 3)
          assert.equal(identifierStatements[0].object_id, 'urn:oclc:10310322')
          assert.equal(identifierStatements[1].object_id, 'urn:lcc:DA110')
          assert.equal(identifierStatements[2].object_id, 'urn:lccCoarse:DA90-125')

          // assert.equal(resources[0].url, 'http://hdl.handle.net/2027/nyp.33433001892276')
        })
    })
  })
})
