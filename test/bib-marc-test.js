/* global describe it */

const assert = require('assert')
const expect = require('chai').expect
const buildMapper = require('./../lib/field-mapper')
const bibSerializer = require('./../lib/serializers/bib')
const BibSierraRecord = require('./../lib/models/bib-sierra-record')
const Bib = require('./../lib/models/bib')

describe('Bib Marc Mapping', function () {
  this.timeout(1000)

  describe('Parse', function () {
    it('should parse marc mapping', function () {
      var mapping = buildMapper('bib', 'sierra-nypl')

      var altTitleMapping = mapping.getMapping('Alternative title')
      // right number of alt title mappings:
      assert.equal(altTitleMapping.paths.length, 5)

      var contribLIteralMapping = mapping.getMapping('Contributor literal')
      assert.equal(contribLIteralMapping.paths.length, 4)
    })

    it('should identify var field', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10001936.json'))

      var val = bib.varField('856', null, { tagSubfields: true })
      assert.equal(val[0].u, 'http://hdl.handle.net/2027/nyp.33433001892276')
      assert.equal(val[0].z, 'Full text available via HathiTrust')
    })

    it('should parse single parallel field', function () {
      var bib = BibSierraRecord.from(require('./data/bib-11012182.json'))

      var val = bib.parallel('245', ['a', 'b'])
      assert.equal(val[0], '\u200Fהרבי, שלושים שנות נשיאות /')
    })

    it('should parse parallel fields from bib with multiple 880s', function () {
      var bib = BibSierraRecord.from(require('./data/bib-11009512.json'))

      const parallelTitle = bib.parallel('245', ['a', 'b'])
      assert.equal(parallelTitle[0], '李鸿章历聘欧美记 /')

      const parallelTitleDisplay = bib.parallel('245', ['a', 'b', 'c', 'f', 'g', 'h', 'k', 'n', 'p', 's'])
      assert.equal(parallelTitleDisplay[0], '李鸿章历聘欧美记 / 蔡尔康, 林乐知编译 ; 张英宇点 ; 张玄浩校.')

      const parallelSeriesStatement = bib.parallel('440', ['3', 'a', 'x', 'v', 'l'])
      assert.equal(parallelSeriesStatement[0], '走向世界叢書')
    })

    it('should extract e-item', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10001936.json'))

      let resources = bibSerializer.extractElectronicResourcesFromBibMarc(bib, 'ER')
      assert.equal(resources[0].url, 'http://hdl.handle.net/2027/nyp.33433001892276')
      assert.equal(resources[0].label, 'Full text available via HathiTrust')
      assert.equal(resources[0].path, '856')
    })

    it('should serialize deleted bibs as suppressed', function () {
      let bib = BibSierraRecord.from(require('./data/bib-20827868-deleted.json'))
      assert(bib.deleted, true)
      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('nypl:suppressed'), true)
        })
    })

    it('should extract supplementalContent with no labels', function () {
      var bib = BibSierraRecord.from(require('./data/bib-12082323.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert(bib.statement('bf:supplementaryContent'))
          assert.equal(bib.literals('bf:supplementaryContent')[1], 'http://www.ThereIsNoLabelSubfieldInThis856-42-supplementary.com/')
          assert.equal(bib.literals('bf:supplementaryContent')[2], 'http://www.ThereIsNoLabelSubfieldInThis856-4b-supplementary.com/')
        })
    })

    it('should extract supplementalContent electronic resource', function () {
      var bib = BibSierraRecord.from(require('./data/bib-16099314.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert(bib.statement('bf:supplementaryContent'))
          assert.equal(bib.literal('bf:supplementaryContent'), 'http://www.nypl.org/archives/789')
          assert.equal(bib.statement('bf:supplementaryContent').object_label, 'Finding Aid')
        })
    })

    it('should extract electronic resource with mult urls', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10011374.json'))

      let resources = bibSerializer.extractElectronicResourcesFromBibMarc(bib, 'ER')
      assert.equal(resources.length, 4)

      assert.equal(resources[0].url, 'http://hdl.handle.net/2027/nyp.33433057532081')
      assert.equal(resources[0].label, 'Full text available via HathiTrust--v. 1')
      assert.equal(resources[0].path, '856')

      assert.equal(resources[1].url, 'http://hdl.handle.net/2027/nyp.33433057532339')
      assert.equal(resources[1].label, 'Full text available via HathiTrust--v. 2')
      assert.equal(resources[1].path, '856')
    })

    it('should extract electronic resources with no label', function () {
      const bib = BibSierraRecord.from(require('./data/bib-12082323.json'))

      let resources = bibSerializer.extractElectronicResourcesFromBibMarc(bib, 'ER')
      assert.equal(resources.length, 4)

      assert.equal(resources[2].url, 'http://www.ThereIsNoLabelSubfieldInThis856-40-fulltext.com/')
      assert.equal(resources[2].label, undefined)

      assert.equal(resources[3].url, 'http://www.ThereIsNoLabelSubfieldInThis856-41-fulltext.com/')
      assert.equal(resources[3].label, undefined)
    })

    it('should extract many core properties from a MICROFORM', function () {
      var bib = BibSierraRecord.from(require('./data/bib-19995767.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.objectId('rdfs:type'), 'nypl:Item')
          assert.equal(bib.objectId('dcterms:type'), 'resourcetypes:txt')

          assert.equal(bib.objectId('bf:issuance'), 'urn:biblevel:m')
          assert.equal(bib.statement('bf:issuance').object_label, 'monograph/item')

          assert.equal(bib.objectId('bf:media'), 'mediatypes:h')
          assert.equal(bib.statement('bf:media').object_label, 'microform')

          // Material Type is 'h' and 007/00-01 == he, so:
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:he')
          assert.equal(bib.statement('bf:carrier').object_label, 'microfiche')

          assert.equal(bib.literal('dc:subject'), 'Board of Governors of the Federal Reserve System (U.S.)')
          assert.equal(bib.literals('dc:subject')[0], 'Board of Governors of the Federal Reserve System (U.S.)')
          assert.equal(bib.literals('dc:subject')[1], 'Dollar, American.')
          assert.equal(bib.literals('dc:subject')[2], 'Monetary policy -- United States.')

          // Creator literal:
          assert.equal(bib.literals('dc:creator')[0], 'United States. Congress. Joint Economic Committee, author.')
        })
    })

    it('should extract subjects specific subfields', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10172462.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // This fixture was modified to include a $f subfield excluded from the mapping.
          // This test confirms it is not pulled in:
          assert.equal(bib.literal('dc:subject'), 'Albert II, Holy Roman Emperor, 1397-1439.')
          assert.equal(bib.literals('dc:subject')[1], 'László V, King of Hungary and Bohemia, 1440-1457.')
          assert.equal(bib.literals('dc:subject')[2], 'Holy Crown of Hungary.')
        })
    })

    it('should extract many core properties (2)', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10011374.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literals('nypl:shelfMark')[0], 'JFE 86-498')
        })
    })

    describe('Alternative title (titleAlt)', function () {
      it('should extract alt title', function () {
        var bib = BibSierraRecord.from(require('./data/bib-10011745.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            assert(bib.literals('dcterms:alternative').indexOf('IJBD') >= 0)
            assert(bib.literals('dcterms:alternative').indexOf('Int. j. behav. dev.') >= 0)
            assert(bib.literals('dcterms:alternative').indexOf('International journal of behavioral development') >= 0)
          })
      })

      it('should extract alt title from 740', function () {
        var bib = BibSierraRecord.from(require('./data/bib-11253008.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            assert.equal(bib.literals('dcterms:alternative').length, 1)
            assert.equal(bib.literal('dcterms:alternative'), 'Interview with Geoffrey Holder.')
          })
      })
    })

    describe('Former title (formerTitle)', function () {
      it('should extract formerTitle from 247', function () {
        var bib = BibSierraRecord.from(require('./data/bib-11076048.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            /*
            * This has the following 247s:
            *  - Twilight 1941
            *  - Nine-nineteen 1942
            *  - Arctic advance 1943
            *  - Fort George 1944
            *  - What price rats? 1945
            *  - Fog, ice and sunshine 1946
            *  - Maiden voyage Oct. 1950
            */
            assert.equal(bib.literals('nypl:formerTitle').length, 7)
            assert.equal(bib.literals('nypl:formerTitle')[0], 'Twilight 1941')
            assert.equal(bib.literals('nypl:formerTitle')[1], 'Nine-nineteen 1942')
            assert.equal(bib.literals('nypl:formerTitle')[2], 'Arctic advance 1943')
            assert.equal(bib.literals('nypl:formerTitle')[3], 'Fort George 1944')
            assert.equal(bib.literals('nypl:formerTitle')[4], 'What price rats? 1945')
            assert.equal(bib.literals('nypl:formerTitle')[5], 'Fog, ice and sunshine 1946')
            assert.equal(bib.literals('nypl:formerTitle')[6], 'Maiden voyage Oct. 1950')
          })
      })
    })

    describe('Contributor', function () {
      it('should extract contributor (710, ..)', function () {
        var bib = BibSierraRecord.from(require('./data/bib-10011745.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            // Note this is the pred for contributorLiteral:
            assert.equal(bib.literal('dc:contributor'), 'International Society for the Study of Behavioral Development.')
          })
      })

      it('should extract contributor from 720', function () {
        var bib = BibSierraRecord.from(require('./data/bib-16415030.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            // Note comes from 710:
            assert.equal(bib.literals('dc:contributor')[0], 'Institution of Chemical Engineers (Great Britain)')
            // Note comes from 720:
            assert.equal(bib.literals('dc:contributor')[1], 'Institution of Chemical Engineers (Great Britain). North Western Branch.')
          })
      })
    })

    it('should extract contributor from 720', function () {
      var bib = BibSierraRecord.from(require('./data/bib-16415030.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Note this is the pred for contributorLiteral:
          assert.equal(bib.literal('dc:contributor'), 'Institution of Chemical Engineers (Great Britain)')
        })
    })

    it('should extract ISBN', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10392955.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.objectIds('dcterms:identifier')[0], '10392955')
          assert.equal(bib.statements('dcterms:identifier')[0].object_type, 'nypl:Bnumber')
          assert.equal(bib.objectIds('dcterms:identifier')[1], '0192113860 :')
          assert.equal(bib.statements('dcterms:identifier')[1].object_type, 'bf:Isbn')
        })
    })

    it('should extract ISSN', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10011745.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.statements('dcterms:identifier')[0].object_id, '10011745')
          assert.equal(bib.statements('dcterms:identifier')[0].object_type, 'nypl:Bnumber')
          assert.equal(bib.statements('dcterms:identifier')[1].object_id, '0165-0254')
          assert.equal(bib.statements('dcterms:identifier')[1].object_type, 'bf:Issn')
        })
    })

    it('should extract contributor role', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10392955.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('role:trl'), 'Fry, Christopher, 1907-2005,')
        })
    })

    it('should extract contributor role (2)', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10681848.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('role:win'), 'Bowness, Alan,')
          assert.equal(bib.literals('role:win')[1], 'Lambertini, Luigi,')
        })
    })

    it('should identify serial', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10019099.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Confirm issuance marks it as a serial:
          assert.equal(bib.objectId('bf:issuance'), 'urn:biblevel:s')

          // Serials are rdfs:type Collection:
          assert.equal(bib.objectId('rdfs:type'), 'nypl:Collection')
        })
    })

    it('should identify collection', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10737605.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Confirm issuance marks it as a collection:
          assert.equal(bib.objectId('bf:issuance'), 'urn:biblevel:c')

          // Serials are rdfs:type Collection:
          assert.equal(bib.objectId('rdfs:type'), 'nypl:Collection')

          // Material Type is 'h' and has 007/00-01 == hd, so so carrier type should be hd
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:hd')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:h')
          assert.equal(bib.statement('bf:carrier').object_label, 'microfilm reel')
        })
    })

    it('should map carrier type, dimensions, extent, alt title, display title', function () {
      var bib = BibSierraRecord.from(require('./data/bib-18501478.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'n', so carrier type should be cr (note that 007/00-01 == cr anyway)
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:cr')
          assert.equal(bib.statement('bf:carrier').object_label, 'online resource')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:c')

          assert.equal(bib.literal('bf:dimensions'), '24 cm.')
          assert.equal(bib.literal('nypl:extent'), 'v. ;')

          assert.equal(bib.literal('dcterms:alternative'), 'Cobbett\'s annual register')
          assert.equal(
            bib.literal('nypl:titleDisplay'), 'Cobbett\'s weekly political register [electronic resource].'
          )
        })
    })

    it('should map vhs carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-20169090.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 's' (VHS), so carrier type should be vf
          assert.equal(bib.objectId('bf:media'), 'mediatypes:v')
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:vf')
          assert.equal(bib.statement('bf:carrier').object_label, 'videocassette')
        })
    })

    it('should map teacher set carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-19818041.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is '-', so carrier type should be zu
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:zu')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:z')
          assert.equal(bib.statement('bf:carrier').object_label, 'unspecified')
        })
    })

    it('should map DVD carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-12157346.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'v' (DVD), so carrier type should be vd
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:vd')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:v')
          assert.equal(bib.statement('bf:carrier').object_label, 'videodisc')
        })
    })

    it('should map BLU-RAY carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-20289329.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'b' (blu-ray), so carrier type should be vd
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:vd')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:v')
          assert.equal(bib.statement('bf:carrier').object_label, 'videodisc')
        })
    })

    it('should map MUSIC NON-CD carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-11070917.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'j' (music non-cd) and 007/00-01 == 'sd', so carrier type should be:
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:sd')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:s')
          assert.equal(bib.statement('bf:carrier').object_label, 'audio disc')
        })
    })

    it('should map SPOKEN WORD carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-11079574.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'i' (spoken word) and no 007, so default 'sz'
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:sz')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:s')
          assert.equal(bib.statement('bf:carrier').object_label, 'other audio carrier')
        })
    })

    it('should map FILM, SLIDE, ETC. carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-11253008.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'g' (film / slide) and 007/00-01 == vf so:
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:vf')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:v')
          assert.equal(bib.statement('bf:carrier').object_label, 'videocassette')
        })
    })

    it('should map COMPUTER FILE (cd) carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-13706421.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'm' (computer file) and 007/01 == o so cd:
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:cd')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:c')
          assert.equal(bib.statement('bf:carrier').object_label, 'computer disc')
        })
    })

    it('should map MANUSCRIPT carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-20827868.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 't' (manuscript) and 338b === nc (which is fallback anyway) so:
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:nc')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:n')
          assert.equal(bib.statement('bf:carrier').object_label, 'volume')
        })
    })

    it('should identify bib carrier type', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10001936.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Material Type is 'a' and no 007 or 338, so carrier type should be nc
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:nc')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:n')
          assert.equal(bib.statement('bf:carrier').object_label, 'volume')
        })
    })

    it('should serialize notes', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10537687.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Notes for this bib:
          //  * 'Translation of La vie quotidienne dans l\'Empire carolingien.'
          //  * 'Includes bibliographical references and index.'
          //  * 'Purchased from the Carl B. and Marjorie N. Boyer Fund' (541 $a with ind1 '0', so suppress)

          // There is one note in 505 $a
          assert.equal(bib.blankNodes('bf:note')[0].literal('rdfs:label'), 'Translation of La vie quotidienne dans l\'Empire carolingien.')

          // Another note in 504 $a:
          assert.equal(bib.blankNodes('bf:note')[1].literal('rdfs:label'), 'Includes bibliographical references and index.')

          // There's another note in 541 but ind1 === '0', so above should be all we get:
          assert.equal(bib.blankNodes('bf:note').length, 2)
        })
    })

    it('should not serialize hidden notes', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10070948.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // This bib has one note in 505, but ind1 === 0, so it should be suppressed
          // which means it has NO notes.
          assert.equal(bib.literals('bf:note').length, 0)
        })
    })

    it('should assign correct PUL fields', function () {
      var bib = BibSierraRecord.from(require('./data/bib-pul-176961.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.id, 'pb176961')
          // TODO need to check a whole bunch more fields...
          assert.equal(bib.objectId('rdfs:type'), 'nypl:Item')
          assert.equal(bib.objectId('bf:media'), 'mediatypes:n')
          assert.equal(bib.objectId('bf:carrier'), 'carriertypes:nc')
          // Extracted ISBN?
          assert(bib.statements('dcterms:identifier').filter((ident) => ident.object_id === '3871185949' && ident.object_type === 'bf:Isbn').length >= 0)
        })
    })

    describe('Uniform title', function () {
      it('should parse Uniform title from 240', function () {
        var bib = BibSierraRecord.from(require('./data/bib-11070917.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            assert.equal(bib.id, 'b11070917')
            assert.equal(bib.literal('nypl:uniformTitle'), 'Works. Selections; arranged.')
          })
      })

      it('should parse Uniform title from 130', function () {
        var bib = BibSierraRecord.from(require('./data/bib-20169090.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            assert.equal(bib.id, 'b20169090')
            assert.equal(bib.literal('nypl:uniformTitle'), 'Positively black (Television program)')
          })
      })

      it('should parse Uniform title from 730', function () {
        var bib = BibSierraRecord.from(require('./data/bib-12157346.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            assert.equal(bib.id, 'b12157346')
            /*
             * This one has four 730s!:
             *   'Bayadère (Choreographic work : Makarova after Petipa, M)'
             *   'Pas de Duke (Choreographic work : Ailey)'
             *   'Push comes to shove (Choreographic work : Tharp)'
             *   'Romeo and Juliet (Choreographic work : MacMillan)'
             */
            assert.equal(bib.literals('nypl:uniformTitle').length, 4)
            assert.equal(bib.literals('nypl:uniformTitle')[0], 'Bayadère (Choreographic work : Makarova after Petipa, M)')
            assert.equal(bib.literals('nypl:uniformTitle')[1], 'Pas de Duke (Choreographic work : Ailey)')
            assert.equal(bib.literals('nypl:uniformTitle')[2], 'Push comes to shove (Choreographic work : Tharp)')
            assert.equal(bib.literals('nypl:uniformTitle')[3], 'Romeo and Juliet (Choreographic work : MacMillan)')
          })
      })

      it('should parse Uniform title from 830', function () {
        var bib = BibSierraRecord.from(require('./data/bib-15287586.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            assert.equal(bib.id, 'b15287586')
            assert.equal(bib.literals('nypl:uniformTitle').length, 1)
            assert.equal(bib.literal('nypl:uniformTitle'), 'Transaction (Indian Institute of World Culture) ; no. 75.')
          })
      })
    })

    describe('Series Statement', function () {
      it('should parse Series statement from 490', function () {
        var bib = BibSierraRecord.from(require('./data/bib-15287586.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            assert.equal(bib.id, 'b15287586')
            assert.equal(bib.literal('bf:seriesStatement'), 'Transaction ; no. 75')
          })
      })

      it('should parse Series statement from 800', function () {
        var bib = BibSierraRecord.from(require('./data/bib-10762541.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            assert.equal(bib.id, 'b10762541')

            // There are actually two seriesStatements in this bib:
            assert.equal(bib.literals('bf:seriesStatement').length, 2)
            // One from 490:
            assert.equal(bib.literals('bf:seriesStatement')[0], 'Schriften, Tagebücher, Briefe. Kritische Ausg. / Franz Kafka')
            // The other from 800:
            assert.equal(bib.literals('bf:seriesStatement')[1], 'Kafka, Franz, 1883-1924. Works. 1982.')
          })
      })

      it('should parse Series statement from 810', function () {
        var bib = BibSierraRecord.from(require('./data/bib-19995767.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            assert.equal(bib.id, 'b19995767')

            // There are two seriesStatements in this bib:
            assert.equal(bib.literals('bf:seriesStatement').length, 2)
            // One from 490:
            assert.equal(bib.literals('bf:seriesStatement')[0], 'S. hrg. ; 113-30')
            // The other from 810:
            assert.equal(bib.literals('bf:seriesStatement')[1], 'United States. Congress. Senate. S. hrg. ; 113-30.')
          })
      })

      it('should parse Series statement from 811', function () {
        var bib = BibSierraRecord.from(require('./data/bib-10794947.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            assert.equal(bib.id, 'b10794947')

            // There are two seriesStatements in this bib:
            assert.equal(bib.literals('bf:seriesStatement').length, 2)
            // One from 490:
            assert.equal(bib.literals('bf:seriesStatement')[0], 'Report / International Labour Conference, 67th session, 1981 ; 3, pt. 2')
            // The other from 811:
            assert.equal(bib.literals('bf:seriesStatement')[1], 'International Labour Conference (67th : 1981 : Geneva, Switzerland) Report ; \\3, pt. 2.')
          })
      })
    })

    it('should parse LCCN', function () {
      var bib = BibSierraRecord.from(require('./data/bib-11070917.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.id, 'b11070917')
          assert(bib.statements('dcterms:identifier').filter((ident) => ident.object_id === 'r  59001818' && ident.object_type === 'bf:Lccn').length >= 0)
        })
    })

    it('should parse LCC classification', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10681848.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.id, 'b10681848')
          assert.equal(bib.literal('nypl:lccClassification'), 'N6797.P3 A4 1980')
        })
    })

    it('should parse description', function () {
      var bib = BibSierraRecord.from(require('./data/bib-11253008.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.id, 'b11253008')
          assert.equal(bib.literal('dcterms:description'), 'Geoffrey Holder discusses his work in the Broadway production of Timbuktu where he is the director, choreographer, and costume designer.  He also discusses the influence his family and his birthplace, Trinidad, has on his work.  Holder stresses the need for fantasy and splendor in his work and in the world.')
        })
    })

    it('should parse dates', function () {
      var bib = BibSierraRecord.from(require('./data/bib-11253008.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.id, 'b11253008')
          assert.equal(bib.literal('dbo:startDate'), 1978)
          assert.equal(bib.literal('dcterms:created'), 1978)
          assert.equal(bib.literal('dc:date'), 1978)
        })
    })

    it('should parse language', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10392955.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.objectId('dcterms:language'), 'lang:eng')
        })
    })

    it('should parse publisher literal from marc 260$b subfield', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10001936.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('nypl:role-publisher'), 'Tparan Hovhannu Tēr-Abrahamian,')
        })
    })

    it('should parse publisher literal from marc 264$b subfield', function () {
      var bib = BibSierraRecord.from(require('./data/bib-20549111.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('nypl:role-publisher'), 'Edizioni Edicampus,')
        })
    })

    it('should parse publisher literal from both marc 260 & 264 fields', function () {
      var bibRecord = BibSierraRecord.from(require('./data/bib-16734592.json'))

      return bibSerializer.fromMarcJson(bibRecord)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          let placeOfPublications = bib.literals('nypl:role-publisher')

          assert(placeOfPublications.indexOf('Crystal Records,') !== -1)
          assert(placeOfPublications.indexOf('Test Placeholder Records,') !== -1)
        })
    })

    it('should parse place of publication literal from marc 260 field', function () {
      var bibRecord = BibSierraRecord.from(require('./data/bib-10001936.json'))

      return bibSerializer.fromMarcJson(bibRecord)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('nypl:placeOfPublication'), 'Ṛostov (Doni Vra) :')
        })
    })

    it('should parse place of publication literal from marc 264 field', function () {
      var bibRecord = BibSierraRecord.from(require('./data/bib-20549111.json'))

      return bibSerializer.fromMarcJson(bibRecord)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('nypl:placeOfPublication'), 'Roma :')
        })
    })

    it('should parse place of publication literal from both marc 260 & 264 fields', function () {
      var bibRecord = BibSierraRecord.from(require('./data/bib-16734592.json'))

      return bibSerializer.fromMarcJson(bibRecord)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          let placeOfPublications = bib.literals('nypl:placeOfPublication')

          assert(placeOfPublications.indexOf('Camas, WA :') !== -1)
          assert(placeOfPublications.indexOf('℗2007') !== -1)
        })
    })

    it('should parse Part of literal', function () {
      var bib = BibSierraRecord.from(require('./data/bib-12155601.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('nypl:partOf'), 'New York (City) Museum of Modern Art. Photographs: Ballet, ca. 1900-1950. v. 38, no. 3318')
        })
    })

    it('should identify bibs with rectype g as resourcetype mov', function () {
      var bib = BibSierraRecord.from(require('./data/bib-18064236.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.objectId('dcterms:type'), 'resourcetypes:mov')
        })
    })

    it('should format Subject Literal from 650 correctly', function () {
      var bib = BibSierraRecord.from(require('./data/bib-17295111.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert(bib.literals('dc:subject'))
          assert.equal(bib.literals('dc:subject').length, 1)
          assert.equal(bib.literals('dc:subject')[0], 'Napoleonic Wars, 1800-1815 Emperor of the French, 1769-1821 -- Campaigns -- Russia -- Fiction.')
        })
    })

    it('should parse Creator once without duplicating to Contributor', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10602209.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          let creators = bib.literals('dc:creator')

          assert.equal(creators.length, 1)
          assert.equal(creators[0], 'Concha, Jaime.')

          let contributors = bib.literals('dc:contributor')
          assert.equal(contributors.length, 0)
        })
    })

    it('should parse Genre/Form literal correctly', function () {
      var bib = BibSierraRecord.from(require('./data/bib-17678033.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('nypl:genreForm'), 'Graphic novels.')
          let subjects = bib.literals('dc:subject')
          let graphicNovelSubject = subjects.filter((subject) => subject === 'Graphic novels.')
          assert.equal(graphicNovelSubject.length, 0)
        })
    })

    it('should parse parallel title', function () {
      var bib = BibSierraRecord.from(require('./data/bib-11012182.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('nypl:parallelTitle'), '\u200Fהרבי, שלושים שנות נשיאות /')
          assert.equal(bib.literal('nypl:parallelTitleDisplay'), '\u200Fהרבי, שלושים שנות נשיאות / [ערוכה, חנוך גליצנשטיין, עדין שטיינזלץ ; איסוף חומר, חנוך גליצנשטיין, ברקה וולף].')
        })
    })

    it('should parse mapped parallel fields from bib with multiple 880s', function () {
      var bib = BibSierraRecord.from(require('./data/bib-11009512.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('nypl:parallelTitle'), '李鸿章历聘欧美记 /')
          assert.equal(bib.literal('nypl:parallelTitleDisplay'), '李鸿章历聘欧美记 / 蔡尔康, 林乐知编译 ; 张英宇点 ; 张玄浩校.')
          assert.equal(bib.literal('nypl:parallelSeriesStatement'), '走向世界叢書')
        })
    })

    it('should parse mapped parallelSeriesStatement via linked 490', function () {
      var bib = BibSierraRecord.from(require('./data/bib-19683865.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // Arabic is challenging to write expectations around for one not
          // fluent in arabic. Resorting to \u representation:
          // Include '\u200F' control character indicating RTL
          const expectedParallelTitleDisplay = '\u200F' + [
            // Subfield a:
            '\u0643\u062A\u0627\u0628 \u0627\u0644\u0627\u0635\u0646\u0627\u0645 /',
            // Subfield c:
            '\u0639\u0646 \u0627\u0628\u064A \u0627\u0644\u0645\u0646\u0630\u0631 \u0647\u0634\u0627\u0645 \u0628\u0646 \u0645\u062D\u0645\u062F \u0628\u0646 \u0627\u0644\u0633\u0627\u064A\u0628 \u0627\u0644\u0643\u0644\u0628\u064A, \u0637\u0628\u0642\u0627 \u0644\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0648\u062D\u064A\u062F\u0629 \u0627\u0644\u0645\u062D\u0641\u0648\u0638\u0629 \u0628\u0627\u0644\u062E\u0632\u0627\u0646\u0629 \u0627\u0644\u0632\u0643\u064A\u0629 \u061B \u0628\u062A\u062D\u0642\u064A\u0642 \u0627\u062D\u0645\u062F \u0632\u0643\u064A.'
          ].join(' ')
          assert.equal(bib.literal('nypl:parallelTitleDisplay'), expectedParallelTitleDisplay)

          // Join subfields "3","a","x","v","l":
          const expectedParallelSeriesStatement = '\u200F' + [
            // Subfield a:
            '\u0645\u0643\u062A\u0628\u0629 \u0627\u0644\u0639\u0631\u0628\u064A\u0629 \u061B',
            // Subfield v:
            '21.',
            // Subfield a
            '\u062A\u062D\u0642\u064A\u0642 \u0627\u0644\u062A\u0631\u0627\u062B \u0627\u0644\u0639\u0631\u0628\u064A \u061B',
            // Subfield v
            '7.',
            // Subfield a
            '\u0627\u062F\u0628 \u061B',
            // Subfield v
            '12'
          ].join(' ')
          assert.equal(bib.literal('nypl:parallelSeriesStatement'), expectedParallelSeriesStatement)
        })
    })

    it('should parse Notes blank nodes correctly', function () {
      var bib = BibSierraRecord.from(require('./data/bib-18064236.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.statements('bf:note').length, 9)

          // Among those 9 notes, grab the one with noteType "Source":
          let blankNode = bib.blankNodes('bf:note')
            .filter((node) => node.literal('bf:noteType') === 'Source')
            .pop()
          assert.equal(blankNode.statements().length, 3)
          assert.equal(blankNode.objectId('rdf:type'), 'bf:Note')
          assert.equal(blankNode.literal('bf:noteType'), 'Source')
          assert.equal(blankNode.literal('rdfs:label'), 'American Masters, Thirteen/WNET.')
        })
    })

    describe('Contents', function () {
      it('should parse basic (ind2 " ") Contents (dcterms:tableOfContents) correctly', function () {
        var bib = BibSierraRecord.from(require('./data/bib-18064236.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            assert.equal(bib.literal('dcterms:tableOfContents'), 'Jerome Rabinowitz -- Life-changing revelations -- Camp Tamiment -- Ballet Theatre -- Fancy free -- On the town -- The playful side and the darker side -- Love and loss -- Autobiographical material -- Broadway\'s rising star -- Balanchine and the New York City Ballet -- The king and I -- The House Un-American Activities Committee -- Robbins\' muse, Tanaquil Le Clercq -- Peter Pan -- West side story -- Ballets U.S.A. -- Gypsy -- Challenges and fixes -- Fiddler on the roof -- Les noces -- Dances at a gathering -- The Goldberg variations -- Watermill -- Robbins and Balanchine -- Dybbuk -- Other dances -- Glass pieces and Antique epigraphs -- In memory of... -- Jerome Robbins\' Broadway -- Dancing until the end.')
          })
      })

      it('should parse enhanced (ind2 "0") Contents (dcterms:tableOfContents) (and nypl:contentsTitle)', function () {
        var bib = BibSierraRecord.from(require('./data/bib-11055155.json'))

        return bibSerializer.fromMarcJson(bib)
          .then((statements) => new Bib(statements))
          .then((bib) => {
            assert.equal(bib.literals('dcterms:tableOfContents').length, 8)
            assert.equal(bib.literal('dcterms:tableOfContents'), '[v. ] 1 The Theban necropolis.')
            assert.equal(bib.literals('dcterms:tableOfContents')[1], '[v. ] 2. Theban temples.')
            assert.equal(bib.literals('dcterms:tableOfContents')[7], '[v. ] 8. Objects of provenance not known. pt. 1. Royal Statues. private Statues (Predynastic to Dynasty XVII) -- pt. 2. Private Statues (Dynasty XVIII to the Roman Periiod). Statues of Deities -- [pt. 3] Indices to parts 1 and 2, Statues -- pt. 4. Stelae (Dynasty XVIII to the Roman Period) 803-044-050 to 803-099-990 / by Jaromir Malek, assisted by Diana Magee and Elizabeth Miles.')

            assert.equal(bib.literals('nypl:contentsTitle').length, 8)
            assert.equal(bib.literal('nypl:contentsTitle'), 'The Theban necropolis.')
            assert.equal(bib.literals('nypl:contentsTitle')[1], 'Theban temples.')
            assert.equal(bib.literals('nypl:contentsTitle')[7], 'Objects of provenance not known. Royal Statues. private Statues (Predynastic to Dynasty XVII) -- Private Statues (Dynasty XVIII to the Roman Periiod). Statues of Deities -- Indices to parts 1 and 2, Statues -- Stelae (Dynasty XVIII to the Roman Period) 803-044-050 to 803-099-990 /')
          })
      })
    })

    it('should parse publicationStatement correctly', function () {
      var bib = BibSierraRecord.from(require('./data/bib-20972964.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('nypl:publicationStatement'), '[Chilpancingo de los Bravo, México] : Guerrero, Gobierno del Estado Libre y Soberano, Secretaría de Cultura ; México, D.F. : CONACULTA : Editorial Praxis, 2015.')
        })
    })

    it('should parse serialPublicationDates', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10011750.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert.equal(bib.literal('nypl:serialPublicationDates'), 'no 1-29.')
        })
    })

    it('should parse "Catalog bib location code" (nypl:catalogBibLocation)', function () {
      var bib = BibSierraRecord.from(require('./data/bib-16369525.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          assert(bib.statement('nypl:catalogBibLocation'))
          assert.equal(bib.objectId('nypl:catalogBibLocation'), 'loc:ia')
          assert.equal(bib.statement('nypl:catalogBibLocation').object_label, 'Electronic Material for Adults')
          assert.equal(bib.statements('nypl:catalogBibLocation').length, 1)
        })
    })
  })

  describe('Parallel field extraction', function () {
    it('should skip over malformed 880s', function () {
      var bib = BibSierraRecord.from(require('./data/bib-21581489.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          // This is an odd record.

          // We have one 245 with $6=880-01
          // The first 880 has a valid reverse link in $6
          // but does not define any other subfields, so no valid value:
          assert(!bib.statement('nypl:parallelTitle'))

          // There are also two 246s (dcterms:alternative).
          // The first has a $6 link (880-02), but no other subfields.
          // The linked 880 has a $6 linking to 246-02 (which has no $6)
          // So that link is also broken, although we're not currently mapping any parallels for 246
        })
    })
  })

  describe('Canceled/Invalid identifier extraction', function () {
    it('should extract Canceled ISBNs', function () {
      var bib = BibSierraRecord.from(require('./data/bib-12082323.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          const identifierBlankNodes = bib.blankNodes('dcterms:identifier')
          assert(identifierBlankNodes.length)
          assert.equal(identifierBlankNodes.length, 1)

          const isbnNodes = identifierBlankNodes
            .filter((node) => {
              return node.objectId('rdf:type') === 'bf:Isbn' &&
                node.literal('bf:identifierStatus') === 'canceled/invalid'
            })

          assert.equal(isbnNodes.length, 1)
          assert.equal(isbnNodes[0].literal('value', 'ISBN -- 020 $z'))
        })
    })

    it('should extract ISSN (Incorrect)', function () {
      var bib = BibSierraRecord.from(require('./data/bib-10384239.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          const identifierBlankNodes = bib.blankNodes('dcterms:identifier')
          assert(identifierBlankNodes.length)
          assert.equal(identifierBlankNodes.length, 2)

          const isbnNodes = identifierBlankNodes
            .filter((node) => {
              return node.objectId('rdf:type') === 'bf:Issn' &&
                node.literal('bf:identifierStatus') === 'incorrect'
            })

          assert.equal(isbnNodes.length, 1)
          assert.equal(isbnNodes[0].literal('value', '0018-4365'))
        })
    })
  })

  describe('Generic Identifier extraction', function () {
    it('should extract generic typed identifiers', function () {
      var bib = BibSierraRecord.from(require('./data/bib-12082323.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          const identifierStatements = bib.statements('dcterms:identifier')
          assert(identifierStatements.length)
          assert.equal(identifierStatements.length, 17)

          const genericIdentifiers = identifierStatements
            .filter((statement) => statement.object_type === 'bf:Identifier')
            .map((statement) => statement.object_id)

          assert.equal(genericIdentifiers.length, 5)

          ; [
            'GPO Item number. -- 074',
            'Sudoc no.  -- 086',
            'Standard number (old RLIN, etc.) -- 035',
            'Publisher no. -- 028 02  ',
            'Report number. -- 027'
          ].forEach((identifier) => {
            assert(genericIdentifiers.indexOf(identifier) >= 0)
          })
        })
    })

    it('should save repeating canceled identifiers as individual statements', function () {
      var bib = BibSierraRecord.from(require('./data/bib-19940200.json'))

      return bibSerializer.fromMarcJson(bib)
        .then((statements) => new Bib(statements))
        .then((bib) => {
          const identifierStatements = bib.blankNodes('dcterms:identifier')
          const canceledIdentifierStatements = identifierStatements
            .filter((ident) => ident.literal('bf:identifierStatus') === 'canceled')
            .map((ident) => ident.literal('rdf:value'))

          expect(canceledIdentifierStatements).to.have.lengthOf(44)
          expect(canceledIdentifierStatements).to.include.members(['(OCoLC)671656697', '(OCoLC)1040025891', '(OCoLC)1044717955'])
        })
    })
  })
})
