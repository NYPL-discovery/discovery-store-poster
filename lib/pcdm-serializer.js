'use strict'

const _ = require('highland')

const FieldMapping = require('./field-mapping').FieldMapping
const MarcMapping = require('./field-mapping').MarcMapping
const db = require('./db')
const Lookup = require('./lookup')

const utils = require('./utils')

const log = require('loglevel')

var sourcePrefix = (object) => {
  return object.nyplSource && object.nyplSource.match(/recap-[PC]/) ? object.nyplSource.substring(6, 7).toLowerCase() : ''
}

class PcdmSerializer {

  constructor (obj) {
    this.statements = {}
    this.uri = null

    // not sure we need these?
    // this.allAgents = []
    // this.allTerms = []

    this.object = obj

    // this.addStatement('dc:title
  }

  addStatement (predicate, object, provo) {
    var statement = this.buildObject(object, provo)

    if (!this.statements[predicate]) this.statements[predicate] = []
    this.statements[predicate].push(statement)
    return this
  }

  buildObject (object, provo) {
    provo = provo || {}
    provo = Object.assign({
      creator: 'RI',
      created: new Date(),
      source: 'data:10002',
      recordIdentifier: null
    }, provo)

    var statement = (typeof object === 'string') ? object : Object.assign({
      objectUri: null,
      objectLiteral: null,
      objectLiteralType: null,
      label: null,
      provo: [provo]
    }, object)

    return statement
  }
}

PcdmSerializer.mergeStatements = (statements) => {
  var merged = Object.assign.apply(null, statements)
  return merged
}

PcdmSerializer.sortStatements = (statements) => {
  return Object.keys(statements).sort().reduce((r, k) => (r[k] = statements[k], r), {})
}

/* class PcdmLocationSerializer extends PcdmSerializer {
  serialize () {
    return FieldMapping.initialize('locations').then((fieldMapper) => {
      try {
        this.statements['uri'] = this.object['skos:notation']
        this.statements['rdf:type'] = this.object['@type']
        if (this.object['dcterms:isPartOf']) {
          this.addStatement('dcterms:isPartOf', { objectUri: this.object['dcterms:isPartOf']['@id'] })
        }
        ; ['nypl:actualLocation', 'nypl:locationType', 'skos:notation'].forEach((pred) => {
          if (this.object[pred]) this.addStatement(pred, { objectLiteral: this.object[pred] })
        })
        if (this.object['skos:prefLabel']) this.addStatement('skos:prefLabel', { objectLiteral: this.object['skos:prefLabel'] })

        return Promise.resolve(this.statements)
      } catch (e) {
        return Promise.reject(e)
      }
    })
  }
}
PcdmLocationSerializer.serialize = (obj) => {
  return (new PcdmLocationSerializer(obj)).serialize()
}

*/

class PcdmEntitySerializer extends PcdmSerializer {
  serialize () {
    return FieldMapping.initialize('locations').then((fieldMapper) => {
      try {
        this.statements['uri'] = this.object['@id'].split(':')[1]
        this.statements['rdf:type'] = this.object['@type']

        Object.keys(this.object).filter((key) => !key.match(/^@/)).forEach((pred) => {
          if (this.object[pred]['@id']) {
            this.addStatement(pred, { objectUri: this.object[pred]['@id'] })
          } else {
            this.addStatement(pred, { objectLiteral: this.object[pred] })
          }
        })

        return Promise.resolve(this.statements)
      } catch (e) {
        return Promise.reject(e)
      }
    })
  }
}

PcdmEntitySerializer.serialize = (obj) => {
  return (new PcdmEntitySerializer(obj)).serialize()
}

class PcdmOrganizationSerializer extends PcdmSerializer {
  serialize () {
    return FieldMapping.initialize('organizations').then((fieldMapper) => {
      this.statements['uri'] = this.object.id
      this.statements['rdf:type'] = this.object.type

      var provo = { source: 'data:1002', recordIdentifier: this.object.code }

      var predicate = null

      predicate = fieldMapper.predicateFor('Code')
      this.addStatement(predicate, { objectLiteral: this.object.code }, provo)

      predicate = fieldMapper.predicateFor('Full name')
      this.addStatement(predicate, { objectLiteral: this.object.label }, provo)

      predicate = fieldMapper.predicateFor('Short name')
      this.addStatement(predicate, { objectLiteral: this.object.altLabel }, provo)

      if (this.object.unitOf) {
        predicate = fieldMapper.predicateFor('Member of')
        this.addStatement(predicate, { objectUri: this.object.unitOf }, provo)
      }

      return PcdmSerializer.sortStatements(this.statements)
    })
  }
}

PcdmOrganizationSerializer.serialize = (obj) => {
  return (new PcdmOrganizationSerializer(obj)).serialize()
}

class PcdmItemSerializer extends PcdmSerializer {
  serialize () {
    return FieldMapping.initialize('resources').then((fieldMapper) => {
      try {
        log.debug('Item: ', JSON.stringify(this.object, null, 2))

        this.statements['rdf:type'] = 'nypl:Item'

        // TODO: implement minting ids?
        this.statements['uri'] = `${sourcePrefix(this.object)}i${this.object.id}`

        var provo = { source: 'data:1002', recordIdentifier: this.object.id }

        // Bnumber identifier(s)
        _([this.object.bibIds]).flatten().compact().each((bibId) => {
          this.addStatement(fieldMapper.predicateFor('Identifier'), { objectUri: `urn:bnum:${sourcePrefix(this.object)}b${bibId}` }, provo)
        })

        // Hack: If we're serliazing an extracted electronic item, look for this property:
        if (this.object.electronicResources) {
          this.object.electronicResources.forEach((r) => {
            this.addStatement('nypl:electronicLocator', { objectLiteral: r.url, label: r.label })
          })
        }

        // Item Type
        var itemType = (this.object.fixed('Item Type'))
        var branchOrResearch = itemType && itemType.match(/^\d+$/) && parseInt(itemType) > 100 ? 'branch' : 'research'
        this.addStatement('nypl:itemType', { objectUri: `urn:itemtype:${branchOrResearch}` })
        if (branchOrResearch === 'branch') {
          log.info('Skipping branch item')
          return Promise.resolve(this.statements)
        }

        var barcode = null
        if (this.object.barcode) barcode = this.object.barcode
        else if (this.object.varField('876', ['p'])) barcode = this.object.varField('876', ['p'])[0]
        if (barcode) this.addStatement(fieldMapper.predicateFor('Identifier'), { objectUri: `urn:barcode:${barcode}` }, provo)

        // Callnum
        var callnum = null
        log.info('Call num: ', this.object.callNumber, this.object.varField('852', ['h']))
        if (this.object.varField('852', ['h'])) callnum = this.object.varField('852', ['h'])[0]
        if (!callnum) callnum = this.object.callNumber
        if (callnum) this.addStatement(fieldMapper.predicateFor('Call number'), { objectLiteral: callnum }, provo)

        // Even though the above require no lookups, make them a promise so they can be merged w/lookups below
        var promises = [Promise.resolve(this.statements)]

        // Availability
        // TODO: temp predicate?

        var statusMatch = null
        if (this.object.status) {
          if (this.object.status.code === '-') {
            // Code '-' matches both Available and Loaned (!!!) so, check dueDate
            statusMatch = { uri: this.object.status.dueDate ? 'co' : 'a' }
          } else {
            statusMatch = { 'skos:notation.objectLiteral': this.object.status.code }
          }
        } else if (this.object.varField('876', ['j'])) {
          // Mainly serving recap, mapp string statuses:
          var status = this.object.varField('876', ['j'])[0].toLowerCase()
          switch (status) {
            case 'available': statusMatch = { uri: 'a' }; break
            case 'not available': statusMatch = { uri: 'na' }; break
            case 'loaned': statusMatch = { uri: 'r' }; break
          }
        }
        if (statusMatch) {
          promises.push(db.statuses.findOne(statusMatch).then((status) => {
            this.addStatement('bf:status', { objectUri: `status:${status.uri}`, label: status['skos:prefLabel'][0].objectLiteral }, provo)
          }))
        }

        // Location
        var location = null
        if (this.object.location) location = this.object.location.code
        else if (this.object.varField('852', ['b'])) location = this.object.varField('852', ['b'])[0]
        if (location) {
          promises.push(
            db.locations.findOne({ uri: location })
              .then((rec) => {
                if (rec) {
                  var statement = this.buildObject({ objectUri: `loc:${rec.uri}`, label: rec['skos:prefLabel'][0].objectLiteral })
                  this.addStatement(fieldMapper.predicateFor('Location'), statement, provo)
                }
              })
          )
        }

        if (this.object.nyplSource && this.object.nyplSource.match(/recap-[PC]/)) {
          var code = this.object.nyplSource.replace('recap-', '')
          // console.log('got recap item: ', this.object.nyplSource, code)
          promises.push(
            db.organizations.findOne({ 'skos:notation.objectLiteral': code }).then((org) => {
              if (org) {
                this.addStatement(fieldMapper.predicateFor('Content owner'), { objectUri: `orgs:${org.uri}`, label: org['skos:prefLabel'][0].objectLiteral }, provo)
              } else {
                log.error('could not find org: ', code)
              }
            })
          )
        } else if (location) {
          // Look up org by location
          promises.push(
            Lookup.initialize('location-code-to-org-id').then((lookup) => {
              var orgId = lookup.lookup(location)
              return db.organizations.findOne({ uri: orgId }).then((org) => {
                if (org) {
                  this.addStatement(fieldMapper.predicateFor('Content owner'), { objectUri: `orgs:${org.uri}`, label: org['skos:prefLabel'][0].objectLiteral }, provo)
                } else {
                  log.warn('Could not find org by location', location)
                }
              })
            })
          )
        }

        // Await all resolution promises:
        return Promise.all(promises).then((statements) => {
          return PcdmSerializer.sortStatements(this.statements)
        })
      } catch (e) {
        return Promise.reject(e)
      }
    })
  }
}

class PcdmBibSerializer extends PcdmSerializer {
  serialize () {
    return FieldMapping.initialize('resources').then((fieldMapper) => {
      try {
        this.statements['rdf:type'] = 'nypl:Bib'

        this.statements['uri'] = `${sourcePrefix(this.object)}b${this.object.id}`

        var provo = { source: 'data:1002', recordIdentifier: this.object.id }

        // Bnumber identifier
        this.addStatement(fieldMapper.predicateFor('Identifier'), { objectUri: `urn:bnum:${this.object.id}` }, provo)

        // Title FIXME why is this commented out?
        // this.addStatement(fieldMapper.predicateFor('Title'), { objectLiteral: this.object.title, objectLiteralType: 'xsd:string' }, provo)

        // Suppressed
        this.addStatement(fieldMapper.predicateFor('Suppressed'), { objectLiteral: this.object.suppressed, objectLiteralType: 'xsd:boolean' }, provo)

        // Even though the above require no lookups, make them a promise so they can be merged w/lookups below
        var promises = [Promise.resolve(this.statements)]

        // Language
        var langCodes = []
        // Given that records tend to have 008s now, let's just use those
        // if (false && this.object.lang) {
          // langCodes = utils.flattenArray([this.object.lang]).map((lang) => lang.code.length === 3 ? lang.code : lang.name).filter((code) => code.length === 3)
          // console.log('lang: ', this.object.lang)
        // } else {
        var lang = this.object.varFieldSegment('008', [35, 37])
        if (!lang) lang = this.object.varField('041', ['f'])
        if (lang) langCodes = utils.flattenArray([lang])
        // }
        if (langCodes) {
          promises.push(Lookup.initialize('language-code-to-label').then((lookup) => {
            langCodes.forEach((lang) => {
              this.addStatement(fieldMapper.predicateFor('Language'), { objectUri: `lang:${lang}`, label: lookup.lookup(lang) }, provo)
            })
          }))
        }

        promises.push(PcdmBibSerializer.parseElectronicResources(this.object).then((resources) => {
          if (!resources) return Promise.resolve()

          // If none of the electronic resources are deemed ER (i.e. they're appendices/TOC, etc), don't create item
          resources = resources.filter((r) => r.type === 'Appendix')
          if (resources.length === 0) return Promise.resolve()

          resources.forEach((resource) => {
            this.addStatement('bf:supplementaryContent', { objectLiteral: resource.url, label: resource.label })
          })
        }))

        // Contributors
        if (this.object.author) {
          _([this.object.author]).flatten().each((author) => {
            this.addStatement(fieldMapper.predicateFor('Contributor literal'), { objectLiteral: author, objectLiteralType: 'xsd:string' }, provo)
          })
        }

        // Date start
        var dateStart = null
        if (this.object.publishYear) dateStart = this.object.publishYear
        else dateStart = parseInt(this.object.varFieldSegment('008', [7, 10]))
        if (dateStart) {
          ; ['Date start', 'Date created', 'Date'].forEach((relationship) => {
            this.addStatement(fieldMapper.predicateFor(relationship), { objectLiteral: dateStart, objectLiteralType: 'xsd:integer' }, provo)
          })
        }

        // Genres? No mapping yet, but let's collect anway
        var genres = this.object.varFieldSegment('008', [24, 27])
        if (genres) genres = genres.split('').filter((code) => code !== ' ')
        if (genres && genres.length > 0) {
          promises.push(Lookup.initialize('genre-code-to-label').then((lookup) => {
            genres.forEach((genre) => {
              if (lookup.lookup(genre)) {
                this.addStatement('nypl:genre', { objectUri: `genre:${genre}`, label: lookup.lookup(genre) }, provo)
              }
            })
          }))
        }

        // Date end
        var dateEnd = parseInt(this.object.varFieldSegment('008', [11, 14]))
        if (dateEnd) {
          ; ['Date end'].forEach((relationship) => {
            this.addStatement(fieldMapper.predicateFor(relationship), { objectLiteral: dateEnd, objectLiteralType: 'xsd:integer' }, provo)
          })
        }
        // console.log('title: ', this.object.varField('245'))

        // Parse var fields
        promises.push(MarcMapping.initialize().then((marcMapper) => {
          marcMapper.allMappings(this.object.nyplSource).filter((mapping) => {
            // Don't pull these from marc cause we already have them (or handled below)
            // TODO fix 'Contributor by role', 'Contributor literal by role', whose predicate is conditional based on content
            // TODO Media type has two very diff mappings, so must parse manually
            return ['Contributor by role', 'Contributor literal by role', 'Media type', 'Subject', 'Subject literal', 'Carrier type', 'Type', 'Availability', 'Barcode', 'Call number', 'Date', 'Date created', 'Date start', 'Date end', 'Language'].indexOf(mapping.name) < 0
          }).map((mapping) => {
            // Override: Subjects coming out of Sierra are actually just literals
            if (mapping.name === 'Contributor') mapping.predicate = 'dc:contributor'
            if (mapping.name === 'Publisher') mapping.predicate = 'nypl:role-publisher'
            return mapping
          }).forEach((mapping) => {
            mapping.marcs.forEach((marc) => {
              var values = null
              values = this.object.varField(marc.marc, marc.subfields)
              // If recap, check additional marc mapping:
              if (this.object.nyplSource !== 'nypl-sierra' && (!values || values.length === 0)) values = this.object.varField(marc.recapMarc, marc.subfields)

              // if (values && values.length) console.log('matched: ', values, marc)
              if (values && values.length) values.forEach((value) => this.addStatement(mapping.predicate, { objectLiteral: value, label: marc.description }), provo)
            })
          })

          ; ['600', '610', '611', '630', '648', '650', '651', '653', '655'].forEach((marc) => {
            var vals = this.object.varField(marc, null, { subfieldJoiner: ' -- ' })
            if (vals) {
              var predicate = 'dc:subject'
              ; vals.forEach((val) => this.addStatement(predicate, { objectLiteral: val }))
            }
          })

          var values = null
          var mapping = null

          // Carrier type
          if (this.object.varField(338, ['b', 'a'])) {
            values = this.object.varField('338', ['b', 'a'], { tagSubfields: true })
            mapping = marcMapper.specFor('Carrier type')
            // console.log('carrier: ', values)
            if (mapping) {
              values.forEach((val) => {
                this.addStatement(mapping.predicate, { objectUri: `carriertypes:${val.b}`, label: val.a }, provo)
              })
            }
          }

          // Media type
          if (this.object.varField(337, ['b', 'a'])) {
            values = this.object.varField('337', ['b', 'a'], { tagSubfields: true })
            // mapping = marcMapper.specFor('Media type')
            // if (mapping) {
            // TODO matches multiple, so currently failing..
            values.forEach((val) => {
              this.addStatement('bf:media', { objectUri: `mediatypes:${val.b}`, label: val.a }, provo)
            })
            // }
          }
        }))

        // Fixed fields
        // Material type
        // if (this.object.fixed('Material Type')) {
          // NOTE Redundant, cause pulling it from ldr below
          // this.addStatement(fieldMapper.predicateFor('Resource type'), { objectUri: `urn:resourcetypes:${this.object.fixed('Material Type')}` })
        // }

        // LDR fields
        if (this.object.ldr()) {
          if (this.object.ldr().bibLevel) {
            promises.push(Lookup.initialize('bib-levels').then((lookup) => {
              var bibLevel = this.object.ldr().bibLevel
              this.addStatement(fieldMapper.predicateFor('Issuance'), { objectUri: `urn:biblevel:${bibLevel}`, label: lookup.lookup(bibLevel) }, provo)
            }))
          }
          // Rec type
          // TODO: what's the interplay btw rectype (from ldr) and resource type (from fixed fields)
          if (this.object.ldr().recType) {
            promises.push(Lookup.initialize('rectypes-to-resource-types').then((lookup) => {
              var recType = this.object.ldr().recType
              var dcterm = lookup.lookup(recType)
              if (!dcterm) return Promise.resolve(null)

              return Lookup.initialize('resource-types').then((lookup) => {
                var label = lookup.lookup(dcterm)
                this.addStatement(fieldMapper.predicateFor('Resource type'), { objectUri: `resourcetypes:${dcterm}`, label: label }, provo)
              })
            }))
          }
        }

        // TODO re-add images at some point. right now they're dragging things down
        // should really be a separate process that crawls bnums once and then again as needed for link-rot
        /*
        var urls = [`http://s3.amazonaws.com/data.nypl.org/bookcovers/${this.object.id}.jpg`, `http://s3.amazonaws.com/data.nypl.org/bookcovers/${this.object.id}_ol.jpg`]
        promises.push(utils.biggestImage(urls).then((best) => {
          if (best) {
            log.info('Saving biggest image: ', best.url)
            var url = best.url
            this.addStatement(fieldMapper.predicateFor('Cover image'), { objectLiteral: url }, provo)
          }
        }))
        */

        // Await all resolution promises:
        return Promise.all(promises).then(() => {
          return PcdmSerializer.sortStatements(this.statements)
        })
      } catch (e) {
        return Promise.reject(e)
      }
    })
  }
}

PcdmBibSerializer.parseElectronicResources = (bib) => {
  var electronicStuff = bib.varField(856, ['3', 'u', 'z'], { tagSubfields: true })
  if (electronicStuff && electronicStuff.length > 0) {
    // console.log('Create item for ', electronicStuff)
    var eResources = electronicStuff.map((r) => {
      return {
        url: r.u,
        label: r['3'] || r.z
      }
    })

    // Load lookup file mapping common ER labels to 'ER'/'Appendix'
    return Lookup.initialize('856-label-to-resource-class').then((lookup) => {
      // Only keep resources whose label we know means they're a legit ER
      eResources = eResources.map((r) => {
        r.type = lookup.lookup(r.label)
        return r
      })

      return Promise.resolve(eResources)
    })
  }
  return Promise.resolve(null)
}

PcdmBibSerializer.serialize = (obj) => {
  return (new PcdmBibSerializer(obj)).serialize()
}

PcdmItemSerializer.serialize = (obj) => {
  return (new PcdmItemSerializer(obj)).serialize()
}

module.exports = { PcdmBibSerializer, PcdmItemSerializer, PcdmEntitySerializer, PcdmOrganizationSerializer }
