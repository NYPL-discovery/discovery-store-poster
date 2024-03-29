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
 *  Returns true if the given object appears to have a valid object.literal
 */
const hasValidObjectLiteral = (object) => {
  // Must have a truthy literal:
  return object.literal ||
    // OR, may have a falsey literal if it's declared a boolean:
    object.type === 'xsd:boolean' ||
    // OR, may have a falsey literal if it's an empty string (for padding parallel arrays)
    typeof object.literal === 'string'
}
/**
 * A statement builder is an object initialized with a fixed creator_id and
 * base_source_hash, which ensures that an `add` (or `addBlankNode`) calls
 * made upon it use that baseline provenance info in generated statements.
 */
Statement.builder = (subjectId, creatorId, baseSourceHash) => {
  if (!baseSourceHash.id) throw new Error(subjectId + ': no source_id given')
  if (!creatorId) throw new Error(subjectId + ': no creatord_id given')

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
    this.add = (predicate, object, index, sourceHash) => {
      sourceHash = Object.assign({}, baseSourceHash, sourceHash)

      if (index === null || (typeof index) !== 'number') {
        var matching = (this.getAll(predicate) || []).filter((s) => {
          if (object.literal) return object.literal === s.object_literal
          else return object.id === s.objectId
        })[0]
        if (matching) index = matching.index
        else index = (this.getAll(predicate) || []).length
      }

      if ((typeof index) !== 'number') throw new Error(predicate + ': no index given')
      if (!object.id && !hasValidObjectLiteral(object)) throw new Error(subjectId + ' > ' + predicate + ': invalid object: ' + JSON.stringify(object, null, 2))
      if (!sourceHash || !sourceHash.record_id) throw new Error(predicate + ': no record_id given')

      this._addStatement(subjectId, predicate, object, index, sourceHash)
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
    this.addBlankNode = (predicate, blankNode, index, sourceHash) => {
      sourceHash = Object.assign({}, baseSourceHash, sourceHash)

      // Generate locally unique id
      const suffix = utils.lpad(String(blankNodeCount), 4, '0')
      const blankNodeId = `${subjectId}#${creatorId}.${suffix}`

      // Link main record to blank node:
      this.add(predicate, { id: blankNodeId }, index, sourceHash)

      Object.keys(blankNode).forEach((predicate) => {
        // Add blank node statements:
        this._addStatement(blankNodeId, predicate, blankNode[predicate], index, sourceHash)
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
    this._addStatement = (subjectId, predicate, object, index, sourceHash) => {
      var props = {
        subject_id: subjectId,
        predicate,
        source_id: sourceHash.id,
        source_record_id: sourceHash.record_id,
        creator_id: creatorId,
        index
      }

      if (object.id) props.object_id = object.id
      if (object.label) props.object_label = object.label
      if (hasValidObjectLiteral(object)) props.object_literal = object.literal
      if (object.type) props.object_type = object.type
      // Should come up with a more compact representation, perhaps, because
      // we have to truncate in some cases:
      if (sourceHash.path) props.source_record_path = utils.truncate(sourceHash.path, 50, '..')

      var statement = new Statement(props)
      this.statements.push(statement)
    }

    this.getAll = (pred) => this.statements.filter((s) => s.predicate === pred)
    this.get = (pred) => this.getAll(pred)[0]
  }()
}

module.exports = Statement
