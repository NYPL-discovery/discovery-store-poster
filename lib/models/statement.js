const utils = require('../utils')

class Statement {
  constructor (props) {
    for (var k in props) {
      this[k] = props[k]
    }
    if (!this.subject_id) throw new Error('subject_id missing')
    if (!this.predicate) throw new Error('pred missing')
    if (!this.object_id && this.object_literal === null) throw new Error(this.predicate + ': no object given')
  }
}

/**
 * A statement builder is an object initialized with a fixed creator_id and
 * base_source_hash, which ensures that an `add` (or `addBlankNode`) calls
 * made upon it use that baseline provenance info in generated statements.
 */
Statement.builder = (subject_id, creator_id, base_source_hash) => {
  if (!base_source_hash.id) throw new Error(subject_id + ': no source_id given')
  if (!creator_id) throw new Error(subject_id + ': no creatord_id given')

  let blankNodeCount = 0

  return new function () {
    this.statements = []

    /**
     *  For adding a single statmement
     *
     *  @example
     *  // This sets title 0 for subject 's1', recording the source marc "path":
     *  builder.add('dcterms:title', { literal: 'Title of obj' }, 0, { path: '245 $a $b' })
     */
    this.add = (predicate, object, index, source_hash) => {
      source_hash = Object.assign({}, base_source_hash, source_hash)

      if (index === null || (typeof index) !== 'number') {
        var matching = (this.getAll(predicate) || []).filter((s) => {
          if (object.literal) return object.literal === s.object_literal
          else return object.id === s.object_id
        })[0]
        if (matching) index = matching.index
        else index = (this.getAll(predicate) || []).length
      }

      if ((typeof index) !== 'number') throw new Error(predicate + ': no index given')
      if (!object || (!object.id && !object.literal && object.type !== 'xsd:boolean')) throw new Error(subject_id + ' > ' + predicate + ': invalid object: ' + JSON.stringify(object, null, 2))
      if (!source_hash || !source_hash.record_id) throw new Error(predicate + ': no record_id given')

      this._addStatement(subject_id, predicate, object, index, source_hash)
    }

    /**
     *  For adding a blank node.
     *
     *  Blank nodes are implemented as:
     *   - one statement linking the primary subject to the blank node by id
     *   - any number of statements about the blank node itself
     *
     *  Blank node ids are built using: [primary subject id]#[creator id].[padded index]
     *
     *  @example
     *  // This adds a blank node for subject 's1' representing a Note.
     *  let blankNode = {
     *    'rdfs:type': { id: 'bf:Note' },
     *    'bf:noteType': { literal: 'General Note' },
     *    'rdfs:label': { literal: 'American Masters, Thirteen/WNET.' }
     *  }
     *  builder.addBlankNode('skos:note', blankNode, 0, { path: '500 $a'})
     *
     *  For primary subject 's1', the records generated above might be:
     *   - subject_id: 's1', predicate: 'skos:note', object_id: 's1#1.0000', ...
     *   - subject_id: 's1#1.0000', predicate: 'rdfs:type', object_id: 'bf:Note', ...
     *   - subject_id: 's1#1.0000', predicate: 'bf:noteType', object_literal: 'General Note', ...
     *   - subject_id: 's1#1.0000', predicate: 'rdfs:label', object_literal: 'American Masters, Thirteen/WNET.', ...
     */
    this.addBlankNode = (predicate, blankNode, index, source_hash) => {
      source_hash = Object.assign({}, base_source_hash, source_hash)

      // Generate locally unique id
      const suffix = utils.lpad(String(blankNodeCount), 4, '0')
      const blankNodeId = `${subject_id}#${creator_id}.${suffix}`

      // Link main record to blank node:
      this.add(predicate, { id: blankNodeId }, index, source_hash)

      Object.keys(blankNode).forEach((predicate) => {
        // Add blank node statements:
        this._addStatement(blankNodeId, predicate, blankNode[predicate], index, source_hash)
      })

      blankNodeCount += 1
    }

    /**
     *  For adding a single statmement (internal use)
     *
     *  @example
     *  // This sets title 0 for subject 's1':
     *  builder._addStatement('s1', 'dcterms:title', { literal: 'Title of obj' }, 0, { id: 'sourcedbid', record_id: 'sourcerecordid' })
     */
    this._addStatement = (subject_id, predicate, object, index, source_hash) => {
      var props = {
        subject_id,
        predicate,
        source_id: source_hash.id,
        source_record_id: source_hash.record_id,
        creator_id,
        index
      }
      if (object.id) props.object_id = object.id
      if (object.label) props.object_label = object.label
      if (object.literal || object.type === 'xsd:boolean') props.object_literal = object.literal
      if (object.type) props.object_type = object.type
      if (source_hash.path) props.source_record_path = source_hash.path

      var statement = new Statement(props)
      this.statements.push(statement)
    }

    this.getAll = (pred) => this.statements.filter((s) => s.predicate === pred)
    this.get = (pred) => this.getAll(pred)[0]
  }
}

module.exports = Statement
